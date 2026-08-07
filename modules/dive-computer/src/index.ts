import { useEffect } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';

export type DiscoveredDevice = {
  id: string;
  name: string;
  rssi: number;
};

export type DiveSample = {
  timeSeconds: number;
  depthMeters: number;
  temperatureCelsius?: number;
};

export type DiveRecord = {
  number: number;
  /** ISO-8601-ish local timestamp, e.g. "2026-06-30T09:41:00" (no timezone - as reported by the dive computer). */
  datetime: string;
  /** `datetime` + `diveTimeSeconds`, same format. */
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
  /** Opaque hex string used internally for incremental sync; not meaningful to display. */
  fingerprint: string;
  /** Depth/temperature profile, in chronological order. */
  samples: DiveSample[];
  /** Full raw dive buffer, hex-encoded, exactly as returned by the dive computer before any parsing - for debugging/inspection only. */
  rawDataHex: string;
};

export type BluetoothState =
  | 'poweredOn'
  | 'poweredOff'
  | 'unauthorized'
  | 'unsupported'
  | 'resetting'
  | 'unknown';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export type DiveComputerErrorPayload = {
  code: string;
  message: string;
};

/** Error codes thrown by native calls - see DiveModels.swift's DiveComputerException. */
export type DiveComputerErrorCode =
  | 'ERR_BLUETOOTH_UNAVAILABLE'
  | 'ERR_PERMISSION_DENIED'
  | 'ERR_ALREADY_SCANNING'
  | 'ERR_ALREADY_CONNECTED'
  | 'ERR_NOT_CONNECTED'
  | 'ERR_DEVICE_NOT_FOUND'
  | 'ERR_UNSUPPORTED_DEVICE'
  | 'ERR_CONNECTION_TIMEOUT'
  | 'ERR_CONNECTION_FAILED'
  | 'ERR_PERIPHERAL_DISCONNECTED'
  | 'ERR_LIBDIVECOMPUTER'
  | 'ERR_DOWNLOAD_CANCELLED'
  | 'ERR_INVALID_ARGUMENTS';

export type DiveComputerEvents = {
  onDeviceFound: (device: DiscoveredDevice) => void;
  onScanStateChange: (payload: { scanning: boolean }) => void;
  onConnectionStateChange: (payload: { state: ConnectionState }) => void;
  onDownloadProgress: (payload: { current: number; maximum: number }) => void;
  onBluetoothStateChange: (payload: { state: BluetoothState }) => void;
  onError: (payload: DiveComputerErrorPayload) => void;
};

/**
 * A dive the app already has. The native download stops at the first device
 * dive whose start time and duration match one of these (dives arrive
 * newest-first, so everything after a match is already imported).
 */
export type KnownDive = {
  /** Dive start in ms since epoch, as parsed by the app when it was uploaded. */
  dateTimeEpochMs: number;
  durationSeconds: number;
};

type DiveComputerNativeModule = {
  /** Note: unlike Expo Modules' sync Function(), the classic RN bridge (bridgeless-safe) can't return a value synchronously - this is a Promise here, not a direct string return. */
  getBluetoothState(): Promise<BluetoothState>;
  stopScan(): void;
  cancelDownload(): void;
  startScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  downloadDives(knownDives: KnownDive[]): Promise<DiveRecord[]>;
  disconnect(): Promise<void>;
};

const DiveComputerModule = NativeModules.DiveComputer as DiveComputerNativeModule;
const diveComputerEmitter = new NativeEventEmitter(NativeModules.DiveComputer);

export default DiveComputerModule;

/**
 * Subscribes to a single DiveComputer native event for the lifetime of the
 * calling component, re-subscribing if the handler identity changes.
 */
export function useDiveComputerEvent<EventName extends keyof DiveComputerEvents>(
  eventName: EventName,
  handler: DiveComputerEvents[EventName]
) {
  useEffect(() => {
    const subscription = diveComputerEmitter.addListener(eventName, handler as any);
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, handler]);
}

export function isDiveComputerErrorCode(code: string): code is DiveComputerErrorCode {
  return code.startsWith('ERR_');
}
