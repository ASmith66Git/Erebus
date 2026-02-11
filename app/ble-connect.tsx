import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import bleService from '@/services/bleService';
import { useTranslation } from 'react-i18next';

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

export default function BleConnectScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<BleDevice | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [bleAvailable, setBleAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const initialized = await bleService.initialize();
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

  const startScanning = useCallback(async () => {
    if (!bleAvailable) return;

    setIsScanning(true);
    setDevices([]);
    setError(null);

    try {
      const hasPermission = await bleService.requestPermissions();
      if (!hasPermission) {
        setError(t('ble.permissionsNotGranted'));
        setIsScanning(false);
        return;
      }

      await bleService.startScanning(null, (device: BleDevice) => {
        setDevices(prev => {
          const exists = prev.some(d => d.id === device.id);
          if (exists) return prev;
          return [...prev, device];
        });
      });

      setTimeout(() => {
        stopScanning();
      }, 15000);
    } catch (err) {
      console.error('Scanning error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start scanning');
      setIsScanning(false);
    }
  }, [bleAvailable]);

  const stopScanning = useCallback(async () => {
    try {
      bleService.stopScanning();
    } catch (err) {
      console.error('Stop scanning error:', err);
    }
    setIsScanning(false);
  }, []);

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
      const connected = await bleService.connect(device.id);
      if (!connected) {
        throw new Error('Failed to connect to device');
      }

      const shearwaterProtocol = require('@/services/protocols/shearwaterProtocol').default;
      
      const dives = await shearwaterProtocol.downloadDives((prog: DownloadProgress) => {
        setProgress(prog);
      });

      if (dives.length > 0) {
        await uploadDives(dives);
      }

      setProgress({
        current: 100,
        total: 100,
        percentage: 100,
        status: 'complete',
        message: t('ble.downloadedDives', { count: dives.length }),
      });

      setTimeout(() => {
        router.replace('/(app)/(tabs)/dive-logs' as any);
      }, 2000);
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
        await bleService.disconnect();
      } catch (disconnectErr) {
        console.error('Error disconnecting:', disconnectErr);
      }
    }
  }, [token, router]);

  const uploadDives = async (dives: any[]) => {
    for (const dive of dives) {
      try {
        await fetch(`${getApiUrl()}/api/dive-logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            dive_datetime: dive.header.timestamp.toISOString(),
            duration_seconds: dive.header.duration,
            max_depth_meters: dive.header.maxDepth,
            samples: dive.samples,
            gas_mixes: dive.gasMixes,
            device_manufacturer: 'Shearwater',
            import_source: 'ble',
          }),
        });
      } catch (err) {
        console.error('Upload error for dive:', err);
      }
    }
  };

  const cancelDownload = useCallback(async () => {
    try {
      const shearwaterProtocol = await import('@/services/protocols/shearwaterProtocol');
      shearwaterProtocol.default.cancel();
      
      const bleService = await import('@/services/bleService');
      await bleService.default.disconnect();
    } catch (err) {
      console.error('Cancel error:', err);
    }
    setProgress(null);
    setSelectedDevice(null);
  }, []);

  const getSignalStrength = (rssi: number | null): string => {
    if (rssi === null) return 'signal-low';
    if (rssi > -50) return 'signal';
    if (rssi > -70) return 'signal-medium';
    return 'signal-low';
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
              name={getSignalStrength(device.rssi) as any} 
              size={20} 
              color={colors.textSecondary} 
            />
          </Pressable>
        ))}
      </ScrollView>
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
});
