// ============================================================
// PROTECTED FILE — DO NOT OVERWRITE OR REWRITE
// Native bridge to the libdivecomputer module on iOS (DiveComputerKit
// Swift package) and Android (JNI/C++). Maintained by the user on
// their Mac. See replit.md "Protected Files" section.
// Any changes must be pushed from the user's Mac via git, not
// edited here in Replit.
// ============================================================
import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import type { EmitterSubscription } from 'react-native';
import type { RawDiveData, RawSample } from './protocols/baseProtocol';

export interface DownloadProgress {
  current: number;
  total: number;
  percentage: number;
  status: 'scanning' | 'connecting' | 'downloading' | 'parsing' | 'complete' | 'error';
  message: string;
}

// Shape of one dive as returned by the native DiveComputer module - see
// modules/dive-computer/src/index.ts (DiveRecord) for the full contract.
type NativeDiveRecord = {
  number: number;
  datetime: string;
  endDatetime: string;
  diveTimeSeconds: number;
  maxDepthMeters: number;
  avgDepthMeters: number;
  minTemperatureCelsius?: number;
  maxTemperatureCelsius?: number;
  avgTemperatureCelsius?: number;
  surfaceTemperatureCelsius?: number;
  atmosphericPressureBar?: number;
  salinityDensityKgPerLiter?: number;
  diveMode?: string;
  gasMixOxygenPercent?: number;
  fingerprint: string;
  samples: { timeSeconds: number; depthMeters: number; temperatureCelsius?: number }[];
  rawDataHex: string;
};

export interface NativeBleDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

/**
 * A dive the app already has. The native download compares each fetched
 * dive's start time + duration against these and stops at the first match -
 * dives arrive newest-first, so everything past a match is already imported.
 */
export interface KnownDive {
  dateTimeEpochMs: number;
  durationSeconds: number;
}

type BluetoothState =
  | 'poweredOn'
  | 'poweredOff'
  | 'unauthorized'
  | 'unsupported'
  | 'resetting'
  | 'unknown';

/**
 * Wrapper around the native `DiveComputer` bridge - on iOS
 * ios/Erebus/DiveComputerBridge.m -> DiveComputerKit Swift package, on
 * Android android/app/src/main/java/com/erebus/diveapp/divecomputer ->
 * libdivecomputer via JNI (android/app/src/main/cpp). Both platforms expose
 * the exact same method/event surface, so all BLE + libdivecomputer work
 * (scan, connect, download, parse, disconnect) happens natively; this just
 * adapts the promise/event surface to the shapes the ble-connect screen
 * uses (RawDiveData / DownloadProgress).
 */
class DiveComputerNativeService {
  private emitter: NativeEventEmitter | null = null;
  private deviceFoundSub: EmitterSubscription | null = null;
  private progressSub: EmitterSubscription | null = null;

  isSupported(): boolean {
    return (Platform.OS === 'ios' || Platform.OS === 'android') && NativeModules.DiveComputer != null;
  }

  private get module() {
    const module = NativeModules.DiveComputer;
    if (!module) {
      throw new Error(
        "Native module 'DiveComputer' is not linked. Rebuild the app (iOS: the DiveComputerKit Swift package compiles into the app binary; Android: the divecomputer Kotlin/JNI sources compile into the app via android/app)."
      );
    }
    return module;
  }

  private getEmitter(): NativeEventEmitter {
    if (!this.emitter) {
      this.emitter = new NativeEventEmitter(this.module);
    }
    return this.emitter;
  }

  async initialize(): Promise<boolean> {
    if (!this.isSupported()) {
      // Most common cause: the app binary on the device predates the native
      // module (JS hot reload / OTA update alone can never add native code).
      console.warn(
        '[DiveComputer] Native module not linked (NativeModules.DiveComputer is null). ' +
          'Rebuild and reinstall the app: npx expo run:android (or cd android && ./gradlew installDebug).'
      );
      return false;
    }
    // On iOS this instantiates the CBCentralManager natively, which also
    // triggers the Bluetooth permission prompt on first use. On Android it
    // just reads the adapter state (runtime permissions are requested in
    // requestPermissions below, before scanning).
    const state = await this.module.getBluetoothState();
    if (state === 'unsupported') {
      // No BLE adapter - expected on Android emulators, which have no
      // (usable) Bluetooth; test on a physical device.
      console.warn(`[DiveComputer] Bluetooth unavailable, native state: ${state}`);
      return false;
    }
    if (state === 'unauthorized' && Platform.OS === 'ios') {
      // iOS: the user denied Bluetooth permission in Settings - fatal.
      // Android 12+ reports 'unauthorized' merely because BLUETOOTH_SCAN/
      // CONNECT haven't been requested yet; requestPermissions() handles
      // that right before scanning, so it must not block initialization.
      console.warn('[DiveComputer] Bluetooth permission denied');
      return false;
    }
    console.log(`[DiveComputer] initialized, bluetooth state: ${state}`);
    return true;
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      // Same permission set the legacy bleService path requests: Android
      // 12+ needs BLUETOOTH_SCAN + BLUETOOTH_CONNECT, older versions need
      // fine location for BLE scan results.
      try {
        const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10);
        if (apiLevel >= 31) {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          return (
            granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
            granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
          );
        }
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.error('DiveComputer permission request failed:', err);
        return false;
      }
    }
    // iOS shows its Bluetooth permission dialog automatically when the
    // central manager starts (NSBluetoothAlwaysUsageDescription).
    const state = await this.module.getBluetoothState();
    return state !== 'unauthorized';
  }

  async getBluetoothState(): Promise<BluetoothState> {
    return this.module.getBluetoothState();
  }

  /**
   * Shows the platform enable-Bluetooth prompt: Android's system
   * ACTION_REQUEST_ENABLE dialog, or iOS's CBCentralManager power alert.
   * Resolves true if Bluetooth is already on (or the user accepted on
   * Android); false if unavailable or declined.
   */
  async requestEnableBluetooth(): Promise<boolean> {
    try {
      return Boolean(await this.module.requestEnableBluetooth());
    } catch (err) {
      console.warn('[DiveComputer] requestEnableBluetooth failed:', err);
      return false;
    }
  }

  /**
   * Ensures Bluetooth is on before scanning. Android shows the in-app system
   * "turn on Bluetooth?" dialog. iOS cannot enable Bluetooth programmatically
   * (Apple only allows a Settings/Close alert) — the alert is shown on every
   * scan attempt while Bluetooth is off.
   */
  async ensureBluetoothEnabled(): Promise<boolean> {
    let state = await this.getBluetoothState();
    if (state === 'poweredOn') return true;
    if (state === 'unsupported' || state === 'unauthorized') return false;

    if (state === 'unknown') {
      await new Promise((resolve) => setTimeout(resolve, 400));
      state = await this.getBluetoothState();
      if (state === 'poweredOn') return true;
      if (state === 'unsupported' || state === 'unauthorized') return false;
    }

    // Show the native prompt every time Bluetooth is still off.
    await this.requestEnableBluetooth();

    if ((await this.getBluetoothState()) === 'poweredOn') return true;

    if (Platform.OS === 'ios') {
      // If the user tapped Close, return quickly so they can tap Start Scan
      // again (which re-shows the alert). Only wait longer if they opened
      // Settings from the alert.
      return this.waitForIosBluetoothAfterPrompt(10_000);
    }

    // Android: user may have accepted — wait briefly for the adapter to turn on.
    return this.waitForBluetoothPoweredOn(10_000);
  }

  /**
   * After the iOS Bluetooth-off alert: return immediately if the user tapped
   * Close; keep waiting (up to timeoutMs) only if they opened Settings.
   */
  private waitForIosBluetoothAfterPrompt(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let finished = false;
      let wentToBackground = false;
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let closeTimerId: ReturnType<typeof setTimeout> | null = null;
      let appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
      let btSub: EmitterSubscription | null = null;
      const started = Date.now();

      const cleanup = () => {
        if (intervalId != null) clearInterval(intervalId);
        if (closeTimerId != null) clearTimeout(closeTimerId);
        appStateSub?.remove();
        btSub?.remove();
      };

      const finish = (enabled: boolean) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(enabled);
      };

      const check = async () => {
        try {
          if ((await this.getBluetoothState()) === 'poweredOn') {
            finish(true);
          }
        } catch {
          // keep waiting
        }
      };

      btSub = this.getEmitter().addListener(
        'onBluetoothStateChange',
        ({ state }: { state: string }) => {
          if (state === 'poweredOn') finish(true);
        }
      );

      appStateSub = AppState.addEventListener('change', (next) => {
        if (next === 'background' || next === 'inactive') {
          wentToBackground = true;
        }
        if (next === 'active') void check();
      });

      // User tapped Close — don't block; they can tap Start Scan again right away.
      closeTimerId = setTimeout(() => {
        if (!wentToBackground) {
          void check().then(() => {
            if (!finished) finish(false);
          });
        }
      }, 600);

      intervalId = setInterval(() => {
        if (!wentToBackground) return;
        void check();
        if (Date.now() - started >= timeoutMs) finish(false);
      }, 500);

      void check();
    });
  }

  /** Poll (and listen for native state events) until Bluetooth is on. */
  private waitForBluetoothPoweredOn(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const started = Date.now();
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
      let btSub: EmitterSubscription | null = null;

      const cleanup = () => {
        if (intervalId != null) clearInterval(intervalId);
        appStateSub?.remove();
        btSub?.remove();
      };

      const finish = (enabled: boolean) => {
        cleanup();
        resolve(enabled);
      };

      const check = async () => {
        try {
          const state = await this.module.getBluetoothState();
          if (state === 'poweredOn') {
            finish(true);
            return;
          }
        } catch {
          // keep waiting
        }
        if (Date.now() - started >= timeoutMs) {
          finish(false);
        }
      };

      btSub = this.getEmitter().addListener(
        'onBluetoothStateChange',
        ({ state }: { state: string }) => {
          if (state === 'poweredOn') finish(true);
        }
      );
      intervalId = setInterval(() => {
        void check();
      }, 500);
      appStateSub = AppState.addEventListener('change', (next) => {
        if (next === 'active') void check();
      });
      void check();
    });
  }

  async startScanning(onDeviceFound: (device: NativeBleDevice) => void): Promise<void> {
    this.deviceFoundSub?.remove();
    this.deviceFoundSub = this.getEmitter().addListener(
      'onDeviceFound',
      (device: { id: string; name: string; rssi: number }) => {
        onDeviceFound({ id: device.id, name: device.name, rssi: device.rssi });
      }
    );
    try {
      await this.module.startScan();
    } catch (err) {
      this.deviceFoundSub?.remove();
      this.deviceFoundSub = null;
      throw err;
    }
  }

  stopScanning(): void {
    this.module.stopScan();
    this.deviceFoundSub?.remove();
    this.deviceFoundSub = null;
  }

  /** Connects AND opens the libdivecomputer device (handshake included). */
  async connect(deviceId: string): Promise<boolean> {
    await this.module.connect(deviceId);
    return true;
  }

  async downloadDives(
    onProgress: (progress: DownloadProgress) => void,
    knownDives: KnownDive[] = []
  ): Promise<RawDiveData[]> {
    this.progressSub?.remove();
    this.progressSub = this.getEmitter().addListener(
      'onDownloadProgress',
      ({ current, maximum }: { current: number; maximum: number }) => {
        const percentage = maximum > 0 ? Math.min(100, Math.round((current / maximum) * 100)) : 0;
        onProgress({
          current,
          total: maximum,
          percentage,
          status: 'downloading',
          message: `Downloading dives... ${percentage}%`,
        });
      }
    );

    try {
      const records: NativeDiveRecord[] = await this.module.downloadDives(knownDives);
      onProgress({
        current: records.length,
        total: records.length,
        percentage: 100,
        status: 'parsing',
        message: 'Processing dive data...',
      });

      console.log('\n🔵🔵🔵 ================================================== 🔵🔵🔵');
      console.log('🔵🔵🔵  DIVE DATA - RAW (unparsed, as returned by native   🔵🔵🔵');
      console.log('🔵🔵🔵  bridge; rawDataHex = untouched device dive buffer) 🔵🔵🔵');
      console.log('🔵🔵🔵 ================================================== 🔵🔵🔵');
      console.log(JSON.stringify(records, null, 2));
      console.log('🔵🔵🔵 ============== END RAW DIVE DATA ================= 🔵🔵🔵\n');

      const parsed = records.map((record) => this.toRawDiveData(record));

      console.log('\n🟢🟢🟢 ================================================== 🟢🟢🟢');
      console.log('🟢🟢🟢  DIVE DATA - PARSED (RawDiveData, what the popup    🟢🟢🟢');
      console.log('🟢🟢🟢  shows and the upload sends)                        🟢🟢🟢');
      console.log('🟢🟢🟢 ================================================== 🟢🟢🟢');
      console.log(JSON.stringify(parsed, null, 2));
      console.log('🟢🟢🟢 ============= END PARSED DIVE DATA =============== 🟢🟢🟢\n');

      return parsed;
    } finally {
      this.progressSub?.remove();
      this.progressSub = null;
    }
  }

  cancel(): void {
    this.module.cancelDownload();
  }

  async disconnect(): Promise<void> {
    await this.module.disconnect();
  }

  private toRawDiveData(record: NativeDiveRecord): RawDiveData {
    const samples: RawSample[] = record.samples.map((sample) => ({
      time: sample.timeSeconds,
      depth: sample.depthMeters,
      temperature: sample.temperatureCelsius,
    }));

    const o2 = record.gasMixOxygenPercent;
    return {
      diveNumber: record.number,
      // The device reports local time with no timezone; parse as-is.
      datetime: new Date(record.datetime),
      duration: record.diveTimeSeconds,
      maxDepth: record.maxDepthMeters,
      avgDepth: record.avgDepthMeters,
      minTemp: record.minTemperatureCelsius,
      maxTemp: record.maxTemperatureCelsius,
      samples,
      gases:
        o2 != null
          ? [{ index: 0, o2, he: 0, n2: 100 - o2, name: o2 === 21 ? 'Air' : `EAN${Math.round(o2)}` }]
          : [],
      events: [],
    };
  }
}

const diveComputerNative = new DiveComputerNativeService();
export default diveComputerNative;
