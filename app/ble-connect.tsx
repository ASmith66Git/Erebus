import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import bleService from '@/services/bleService';
import diveComputerNative, { KnownDive } from '@/services/diveComputerNative';
import { useTranslation } from 'react-i18next';

// On both iOS and Android the whole pipeline (BLE scan/connect +
// libdivecomputer download and parse) runs natively via the DiveComputer
// bridge (Swift on iOS, Kotlin + NDK on Android). The JS bleService +
// shearwaterProtocol stack remains only as the legacy fallback.
const useNativeDiveComputer = Platform.OS === 'ios' || Platform.OS === 'android';

interface BleDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

interface DownloadProgress {
  current: number;
  total: number;
  percentage: number;
  status: 'scanning' | 'connecting' | 'downloading' | 'parsing' | 'complete' | 'error';
  message: string;
}

// Both download paths return this shape (RawDiveData): diveComputerNative's
// mapping on iOS/Android, the legacy JS shearwaterProtocol otherwise.
interface FetchedDive {
  diveNumber: number;
  datetime: Date;
  duration: number;
  maxDepth: number;
  avgDepth?: number;
  minTemp?: number;
  maxTemp?: number;
  samples: any[];
  gases: any[];
}

// The app stores dive datetimes as WALL-CLOCK time labeled as UTC (XML
// imports keep the file's local time string untouched, and the dive-logs
// screen formats with timeZone:'UTC' to show it back unshifted). To compare
// against those records, parse them as wall time in the phone's own
// timezone: strip the Z/offset suffix so `new Date()` interprets the
// components locally - the same way the device's "2026-06-30T09:41:00"
// string is parsed. Comparing real-UTC instants here instead would be off
// by the phone's whole timezone offset and never match.
function wallTimeToEpochMs(dateStr: string): number {
  const wall = String(dateStr).replace(/(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/, '');
  return new Date(wall).getTime();
}

// Formats a Date's local components as a wall-time string (no timezone
// suffix) - the storage convention the rest of the app uses for dive times.
function toWallTimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Same tolerances as the native matcher (DiveDownloadContext.isKnown):
// device clock and stored record can drift a little, so match on "same
// start time within 2 min and same duration within 1 min". A missing/zero
// stored duration acts as a wildcard - same start time is decisive enough.
function isKnownDive(dive: FetchedDive, known: KnownDive[]): boolean {
  const startMs = new Date(dive.datetime).getTime();
  const duration = dive.duration || 0;
  return known.some(
    (k) =>
      Math.abs(k.dateTimeEpochMs - startMs) <= 120_000 &&
      (k.durationSeconds <= 0 || Math.abs(k.durationSeconds - duration) <= 60)
  );
}

function formatDiveRow(dive: FetchedDive): { title: string; subtitle: string } {
  const date = new Date(dive.datetime);
  const title = `${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}  ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  const minutes = Math.round((dive.duration || 0) / 60);
  const subtitle = `${dive.maxDepth ? dive.maxDepth.toFixed(1) : '--'} m  •  ${minutes} min`;
  return { title, subtitle };
}

export default function BleConnectScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<BleDevice | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [bleAvailable, setBleAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload-selection popup state: dives fetched from the device that are not
  // yet in the app. All deselected by default - the user explicitly picks
  // which ones to upload (selection holds indices into pendingDives).
  const [pendingDives, setPendingDives] = useState<FetchedDive[] | null>(null);
  const [selectedDives, setSelectedDives] = useState<Set<number>>(new Set());
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    checkBleAvailability();
  }, []);

  const checkBleAvailability = async () => {
    if (Platform.OS === 'web') {
      setBleAvailable(false);
      setError(t('ble.bleNotAvailable'));
      return;
    }

    try {
      const initialized = useNativeDiveComputer
        ? await diveComputerNative.initialize()
        : await bleService.initialize();
      setBleAvailable(initialized);

      if (!initialized) {
        setError(t('ble.bleInitFailed'));
      }
    } catch (err) {
      console.error('BLE check error:', err);
      setBleAvailable(false);
      setError(t('ble.bleLibNotAvailable'));
    }
  };

  const stopScanning = useCallback(async () => {
    try {
      if (useNativeDiveComputer) {
        diveComputerNative.stopScanning();
      } else {
        bleService.stopScanning();
      }
    } catch (err) {
      console.error('Stop scanning error:', err);
    }
    setIsScanning(false);
  }, []);

  const runScan = useCallback(async () => {
    const onDeviceFound = (device: BleDevice) => {
      setDevices(prev => {
        const exists = prev.some(d => d.id === device.id);
        if (exists) return prev;
        return [...prev, device];
      });
    };

    if (useNativeDiveComputer) {
      await diveComputerNative.startScanning(onDeviceFound);
    } else {
      await bleService.startScanning(null, onDeviceFound);
    }

    setTimeout(() => {
      stopScanning();
    }, 15000);
  }, [stopScanning]);

  const startScanning = useCallback(async () => {
    if (!bleAvailable) return;

    setDevices([]);
    setError(null);

    try {
      const hasPermission = useNativeDiveComputer
        ? await diveComputerNative.requestPermissions()
        : await bleService.requestPermissions();
      if (!hasPermission) {
        setError(t('ble.permissionsNotGranted'));
        return;
      }

      if (useNativeDiveComputer) {
        const bluetoothOn = await diveComputerNative.ensureBluetoothEnabled();
        if (!bluetoothOn) {
          setError(
            Platform.OS === 'ios' ? t('ble.enableBluetoothIos') : t('ble.enableBluetooth')
          );
          return;
        }
      }

      setIsScanning(true);
      await runScan();
    } catch (err) {
      console.error('Scanning error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start scanning');
      setIsScanning(false);
    }
  }, [bleAvailable, runScan, t]);

  // Dives already in the app, so the download can stop as soon as it reaches
  // a dive the user has imported before (matched on start time + duration).
  const fetchKnownDives = useCallback(async (): Promise<KnownDive[]> => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs?limit=500`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      const known = (data.diveLogs || [])
        .map((log: any) => ({
          dateTimeEpochMs: wallTimeToEpochMs(log.diveDateTime),
          durationSeconds: log.durationSeconds || 0,
        }))
        .filter((k: KnownDive) => Number.isFinite(k.dateTimeEpochMs));

      console.log('\n🟡🟡🟡 ========= KNOWN DIVES (app dive list, used for match-and-stop) ========= 🟡🟡🟡');
      console.log(JSON.stringify(known.map((k: KnownDive) => ({
        ...k,
        asLocalTime: new Date(k.dateTimeEpochMs).toString(),
      })), null, 2));
      console.log('🟡🟡🟡 ========================= END KNOWN DIVES ========================= 🟡🟡🟡\n');
      return known;
    } catch (err) {
      console.error('Failed to fetch existing dive logs for duplicate check:', err);
      return [];
    }
  }, [token]);

  const connectAndDownload = useCallback(async (device: BleDevice) => {
    setSelectedDevice(device);
    setProgress({
      current: 0,
      total: 100,
      percentage: 0,
      status: 'connecting',
      message: t('ble.connectingTo', { name: device.name }),
    });

    try {
      const knownDives = await fetchKnownDives();

      let dives: FetchedDive[];
      if (useNativeDiveComputer) {
        // connect() also opens the libdivecomputer device (BLE handshake
        // included) natively in Swift. The native download stops early at
        // the first dive matching a knownDive.
        await diveComputerNative.connect(device.id);
        dives = await diveComputerNative.downloadDives((prog: DownloadProgress) => {
          setProgress(prog);
        }, knownDives) as FetchedDive[];
      } else {
        const connected = await bleService.connect(device.id);
        if (!connected) {
          throw new Error('Failed to connect to device');
        }

        const shearwaterProtocol = require('@/services/protocols/shearwaterProtocol').default;

        dives = await shearwaterProtocol.downloadDives((prog: DownloadProgress) => {
          setProgress(prog);
        });
      }

      // Dives arrive newest-first, so take dives only until the first one
      // the app already has (matched on date/time + duration) and stop
      // there - the same "return at first match" rule the native iOS
      // download applies on-device. Example: device has dives 1-843, app
      // has 842 -> only 843 is offered; app has 840 -> 841-843; app has
      // 345 and 842 -> only 843 (the scan stops at 842).
      console.log('\n🟣🟣🟣 =============== MATCH DECISIONS (take until first match) =============== 🟣🟣🟣');
      const newDives: FetchedDive[] = [];
      for (const dive of dives) {
        const startMs = new Date(dive.datetime).getTime();
        const closest = knownDives.reduce(
          (best, k) => {
            const deltaMs = Math.abs(k.dateTimeEpochMs - startMs);
            return deltaMs < best.deltaMs
              ? { deltaMs, deltaDurationS: Math.abs(k.durationSeconds - (dive.duration || 0)), known: k }
              : best;
          },
          { deltaMs: Number.POSITIVE_INFINITY, deltaDurationS: Number.POSITIVE_INFINITY, known: null as KnownDive | null }
        );
        const matched = isKnownDive(dive, knownDives);
        console.log(
          `🟣 dive #${dive.diveNumber} ${toWallTimeString(new Date(dive.datetime))} dur=${dive.duration}s -> ` +
          (matched
            ? `MATCH (closest app dive delta: ${Math.round(closest.deltaMs / 1000)}s / ${closest.deltaDurationS}s duration) - STOP HERE`
            : `new (closest app dive delta: ${closest.known ? `${Math.round(closest.deltaMs / 1000)}s / ${closest.deltaDurationS}s duration` : 'no app dives'})`)
        );
        if (matched) break;
        newDives.push(dive);
      }
      console.log(`🟣🟣🟣 ====== ${newDives.length} of ${dives.length} fetched dive(s) are new -> shown in popup ====== 🟣🟣🟣\n`);

      if (newDives.length === 0) {
        setProgress({
          current: 100,
          total: 100,
          percentage: 100,
          status: 'complete',
          message: t('ble.noNewDives'),
        });
        setTimeout(() => {
          router.replace('/(app)/(tabs)/dive-logs' as any);
        }, 2000);
        return;
      }

      // Hand off to the upload-selection popup - nothing is uploaded until
      // the user explicitly selects dives there.
      setProgress(null);
      setSelectedDives(new Set());
      setPendingDives(newDives);
    } catch (err: any) {
      // Log full error details for debugging
      console.error('Download error:', err);
      console.error('Download error details:', {
        message: err?.message,
        reason: err?.reason,
        errorCode: err?.errorCode,
        androidErrorCode: err?.androidErrorCode,
        iosErrorCode: err?.iosErrorCode,
        attErrorCode: err?.attErrorCode,
        name: err?.name,
        stack: err?.stack,
        fullError: JSON.stringify(err, Object.getOwnPropertyNames(err || {}), 2)
      });
      
      // Extract the most useful error message
      let errorMessage = t('ble.downloadFailed');
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err?.reason) {
        errorMessage = `Error: ${err.reason}`;
      } else if (err?.androidErrorCode) {
        errorMessage = `Android error ${err.androidErrorCode}: ${err?.message || t('ble.unknownError')}`;
      }
      
      setProgress({
        current: 0,
        total: 100,
        percentage: 0,
        status: 'error',
        message: errorMessage,
      });
    } finally {
      try {
        if (useNativeDiveComputer) {
          await diveComputerNative.disconnect();
        } else {
          await bleService.disconnect();
        }
      } catch (disconnectErr) {
        console.error('Error disconnecting:', disconnectErr);
      }
    }
  }, [token, router, fetchKnownDives]);

  // Both paths produce the RawDiveData shape (see services/protocols/baseProtocol.ts):
  // diveComputerNative's mapping on iOS/Android, the legacy JS shearwaterProtocol otherwise.
  // The POST body must be camelCase - the server destructures req.body as
  // { diveDateTime, durationSeconds, ... } and 400s without diveDateTime.
  const uploadDives = async (dives: FetchedDive[]): Promise<number> => {
    let uploaded = 0;
    for (const dive of dives) {
      try {
        const response = await fetch(`${getApiUrl()}/api/dive-logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            // Wall-clock string (no timezone suffix) - the app's storage
            // convention. toISOString() here would shift the time by the
            // phone's timezone offset, breaking both the displayed time and
            // the duplicate match on the next download.
            diveDateTime: toWallTimeString(new Date(dive.datetime)),
            durationSeconds: dive.duration,
            maxDepthMeters: dive.maxDepth,
            avgDepthMeters: dive.avgDepth ?? null,
            minTemperatureCelsius: dive.minTemp ?? null,
            maxTemperatureCelsius: dive.maxTemp ?? null,
            // The stored samples JSON is read as-is by the dive detail page,
            // which expects the snake_case shape file imports use
            // (time_seconds/depth_meters/... - see interface Sample in
            // app/(app)/dive-log/[id].tsx), not RawSample's short keys.
            samples: dive.samples.map((s: any) => ({
              time_seconds: s.time,
              depth_meters: s.depth,
              ...(s.temperature != null ? { temperature_celsius: s.temperature } : {}),
              ...(s.ndl != null ? { ndl_minutes: s.ndl } : {}),
              ...(s.tts != null ? { tts_minutes: s.tts } : {}),
              ...(s.ceiling != null ? { ceiling_meters: s.ceiling } : {}),
              ...(s.gf99 != null ? { gf99_percent: s.gf99 } : {}),
              ...(s.ppo2 != null ? { ppo2_bar: s.ppo2 } : {}),
              ...(s.cns != null ? { cns_pct: s.cns } : {}),
            })),
            gasMixes: dive.gases,
            deviceManufacturer: 'Shearwater',
            deviceModel: selectedDevice?.name ?? null,
          }),
        });
        if (response.ok) {
          uploaded++;
        } else {
          console.error('Upload rejected for dive:', response.status, await response.text());
        }
      } catch (err) {
        console.error('Upload error for dive:', err);
      }
    }
    return uploaded;
  };

  // --- Upload-selection popup handlers ---

  const toggleDiveSelection = (index: number) => {
    setSelectedDives(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const allDivesSelected = pendingDives != null && selectedDives.size === pendingDives.length;

  const toggleSelectAllDives = () => {
    if (!pendingDives) return;
    setSelectedDives(allDivesSelected ? new Set() : new Set(pendingDives.map((_, i) => i)));
  };

  /** Close (X) / Skip: discard the fetched dives without uploading. */
  const dismissUploadPopup = (goToDiveLogs: boolean) => {
    setPendingDives(null);
    setSelectedDives(new Set());
    setSelectedDevice(null);
    if (goToDiveLogs) {
      router.replace('/(app)/(tabs)/dive-logs' as any);
    }
  };

  const uploadSelectedDives = async () => {
    if (!pendingDives || selectedDives.size === 0) return;
    const chosen = pendingDives.filter((_, i) => selectedDives.has(i));

    setUploading(true);
    try {
      const uploaded = await uploadDives(chosen);
      setPendingDives(null);
      setSelectedDives(new Set());
      if (uploaded === 0) {
        setProgress({
          current: 0,
          total: chosen.length,
          percentage: 0,
          status: 'error',
          message: t('ble.uploadFailed'),
        });
        return;
      }
      setProgress({
        current: uploaded,
        total: chosen.length,
        percentage: 100,
        status: 'complete',
        message: t('ble.uploadedDives', { count: uploaded }),
      });
      setTimeout(() => {
        router.replace('/(app)/(tabs)/dive-logs' as any);
      }, 2000);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const cancelDownload = useCallback(async () => {
    try {
      if (useNativeDiveComputer) {
        diveComputerNative.cancel();
        await diveComputerNative.disconnect();
      } else {
        const shearwaterProtocol = await import('@/services/protocols/shearwaterProtocol');
        shearwaterProtocol.default.cancel();

        const bleService = await import('@/services/bleService');
        await bleService.default.disconnect();
      }
    } catch (err) {
      console.error('Cancel error:', err);
    }
    setProgress(null);
    setSelectedDevice(null);
  }, []);

  // 'signal'/'signal-medium'/'signal-low' are not Feather icons - use a real
  // icon and encode strength in the color instead.
  const getSignalIndicator = (rssi: number | null): { icon: 'wifi' | 'wifi-off'; color: string } => {
    if (rssi === null) return { icon: 'wifi-off', color: colors.textSecondary };
    if (rssi > -50) return { icon: 'wifi', color: '#10B981' };
    if (rssi > -70) return { icon: 'wifi', color: '#F59E0B' };
    return { icon: 'wifi', color: colors.textSecondary };
  };

  if (bleAvailable === false) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Feather name="x-circle" size={64} color={colors.error} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {t('ble.bleNotAvailable')}
          </Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
            {error || t('ble.requiresNativeApp')}
          </Text>
          <Pressable
            style={[styles.backButton, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>{t('ble.goBack')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (progress) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.progressContainer}>
          <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {progress.status === 'complete' ? (
              <View style={[styles.progressIcon, { backgroundColor: '#10B98120' }]}>
                <Feather name="check-circle" size={48} color="#10B981" />
              </View>
            ) : progress.status === 'error' ? (
              <View style={[styles.progressIcon, { backgroundColor: colors.error + '20' }]}>
                <Feather name="alert-circle" size={48} color={colors.error} />
              </View>
            ) : (
              <ActivityIndicator size="large" color={colors.primary} style={styles.progressSpinner} />
            )}
            
            <Text style={[styles.progressTitle, { color: colors.text }]}>
              {selectedDevice?.name || t('ble.diveComputer')}
            </Text>
            
            <Text style={[styles.progressMessage, { color: colors.textSecondary }]}>
              {progress.message}
            </Text>

            {progress.status !== 'complete' && progress.status !== 'error' && (
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
                  <View 
                    style={[
                      styles.progressBarFill, 
                      { backgroundColor: colors.primary, width: `${progress.percentage}%` }
                    ]} 
                  />
                </View>
                <Text style={[styles.progressPercent, { color: colors.textSecondary }]}>
                  {progress.percentage}%
                </Text>
              </View>
            )}

            {progress.status === 'error' && (
              <>
                <Pressable
                  style={[styles.retryButton, { backgroundColor: colors.primary }]}
                  onPress={() => selectedDevice && connectAndDownload(selectedDevice)}
                >
                  <Text style={styles.retryButtonText}>{t('ble.retry')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.diveLogsLink, { borderColor: colors.border }]}
                  onPress={() => router.replace('/(app)/(tabs)/dive-logs' as any)}
                >
                  <Feather name="list" size={16} color={colors.primary} />
                  <Text style={[styles.diveLogsLinkText, { color: colors.primary }]}>
                    {t('ble.viewDiveLogs')}
                  </Text>
                </Pressable>
              </>
            )}

            {progress.status !== 'complete' && (
              <Pressable
                style={[styles.cancelButton, { borderColor: colors.error }]}
                onPress={cancelDownload}
              >
                <Text style={[styles.cancelButtonText, { color: colors.error }]}>{t('ble.cancel')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('ble.connectDiveComputer')}
        </Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {t('ble.instructions')}
        </Text>
      </View>
      
      <View style={[styles.tipBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
        <Feather name="info" size={16} color={colors.primary} />
        <Text style={[styles.tipText, { color: colors.text }]}>
          {t('ble.connectionTip')}
        </Text>
      </View>

      <Pressable
        style={[
          styles.scanButton,
          { backgroundColor: isScanning ? colors.error : colors.primary }
        ]}
        onPress={isScanning ? stopScanning : startScanning}
        disabled={bleAvailable === null}
      >
        {isScanning ? (
          <>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.scanButtonText}>{t('ble.stopScanning')}</Text>
          </>
        ) : (
          <>
            <Feather name="bluetooth" size={20} color="#FFFFFF" />
            <Text style={styles.scanButtonText}>
              {bleAvailable === null ? t('ble.checking') : t('ble.startScanning')}
            </Text>
          </>
        )}
      </Pressable>

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + '20' }]}>
          <Feather name="alert-circle" size={16} color={colors.error} />
          <Text style={[styles.errorBannerText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      <ScrollView style={styles.deviceList}>
        {devices.length === 0 && !isScanning && (
          <View style={styles.emptyState}>
            <Feather name="search" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('ble.noDevicesFoundMessage')}
            </Text>
          </View>
        )}

        {devices.map((device) => (
          <Pressable
            key={device.id}
            style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => connectAndDownload(device)}
          >
            <View style={[styles.deviceIcon, { backgroundColor: colors.primary + '20' }]}>
              <Feather name="bluetooth" size={24} color={colors.primary} />
            </View>
            <View style={styles.deviceInfo}>
              <Text style={[styles.deviceName, { color: colors.text }]}>
                {device.name || t('ble.unknownDevice')}
              </Text>
              <Text style={[styles.deviceId, { color: colors.textSecondary }]}>
                {device.id.substring(0, 17)}...
              </Text>
            </View>
            <Feather
              name={getSignalIndicator(device.rssi).icon}
              size={20}
              color={getSignalIndicator(device.rssi).color}
            />
          </Pressable>
        ))}
      </ScrollView>

      <Modal
        visible={pendingDives != null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => dismissUploadPopup(false)}
      >
        <View
          style={[
            styles.modalScreen,
            {
              backgroundColor: colors.background,
              paddingTop: Math.max(insets.top, 16) + 4,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('ble.uploadToDiveLog')}
              </Text>
              <Pressable
                onPress={() => dismissUploadPopup(false)}
                style={styles.modalCloseButton}
                disabled={uploading}
              >
                <Feather name="x" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              {t('ble.selectDivesToUpload', { count: pendingDives?.length ?? 0 })}
            </Text>

            <Pressable style={styles.selectAllRow} onPress={toggleSelectAllDives} disabled={uploading}>
              <Feather
                name={allDivesSelected ? 'check-square' : 'square'}
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.selectAllText, { color: colors.primary }]}>
                {allDivesSelected ? t('ble.deselectAll') : t('ble.selectAll')}
              </Text>
              <Text style={[styles.selectedCountText, { color: colors.textSecondary }]}>
                {t('ble.selectedCount', { count: selectedDives.size })}
              </Text>
            </Pressable>

            <ScrollView style={styles.diveList}>
              {(pendingDives ?? []).map((dive, index) => {
                const { title, subtitle } = formatDiveRow(dive);
                const selected = selectedDives.has(index);
                return (
                  <Pressable
                    key={index}
                    style={[
                      styles.diveRow,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary + '10' : 'transparent',
                      },
                    ]}
                    onPress={() => toggleDiveSelection(index)}
                    disabled={uploading}
                  >
                    <Feather
                      name={selected ? 'check-square' : 'square'}
                      size={20}
                      color={selected ? colors.primary : colors.textSecondary}
                    />
                    <View style={styles.diveRowInfo}>
                      <Text style={[styles.diveRowTitle, { color: colors.text }]}>{title}</Text>
                      <Text style={[styles.diveRowSubtitle, { color: colors.textSecondary }]}>
                        {subtitle}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                style={[styles.modalCancelButton, { borderColor: colors.border }]}
                onPress={() => dismissUploadPopup(false)}
                disabled={uploading}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                  {t('ble.cancel')}
                </Text>
              </Pressable>
              {selectedDives.size === 0 ? (
                <Pressable
                  style={[styles.modalActionButton, { backgroundColor: colors.border }]}
                  onPress={() => dismissUploadPopup(true)}
                  disabled={uploading}
                >
                  <Text style={[styles.modalActionText, { color: colors.text }]}>
                    {t('ble.skip')}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.modalActionButton, { backgroundColor: colors.primary }]}
                  onPress={uploadSelectedDives}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.modalActionText, { color: '#FFFFFF' }]}>
                      {t('ble.uploadSelected', { count: selectedDives.size })}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 20,
    padding: 12,
    borderRadius: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  deviceList: {
    flex: 1,
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 12,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 30,
  },
  backButton: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  progressCard: {
    width: '100%',
    maxWidth: 340,
    padding: 30,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  progressIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressSpinner: {
    marginBottom: 20,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  progressBarContainer: {
    width: '100%',
    marginBottom: 20,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
  retryButton: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  diveLogsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  diveLogsLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  cancelButton: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  modalScreen: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  modalCloseButton: {
    padding: 4,
    marginLeft: 12,
  },
  modalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 4,
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectedCountText: {
    fontSize: 12,
    marginLeft: 'auto',
  },
  diveList: {
    flex: 1,
    marginBottom: 16,
  },
  diveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  diveRowInfo: {
    flex: 1,
  },
  diveRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  diveRowSubtitle: {
    fontSize: 12,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '500',
  },
  modalActionButton: {
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalActionText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
