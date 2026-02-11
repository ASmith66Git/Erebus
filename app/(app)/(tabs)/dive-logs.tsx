import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

interface DiveLog {
  id: number;
  diveSiteId: number | null;
  diveSiteName: string | null;
  diveSiteImageUrl: string | null;
  diveDateTime: string;
  durationSeconds: number | null;
  maxDepthMeters: number | null;
  avgDepthMeters: number | null;
  minTemperatureCelsius: number | null;
  maxTemperatureCelsius: number | null;
  deviceManufacturer: string | null;
  deviceModel: string | null;
  notes: string | null;
  rating: number | null;
  importSource: string;
  createdAt: string;
  photoCount: number;
}

interface DiveStats {
  totalDives: number;
  totalDurationSeconds: number;
  deepestDiveMeters: number | null;
  avgMaxDepthMeters: number | null;
}

interface DiveComputerCapabilities {
  brand: { id: string; name: string } | null;
  model: {
    id: string;
    name: string;
    has_ble: boolean;
    export_formats: string[];
    note?: string;
  } | null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('/objects/')) {
    return `${getApiUrl()}${imageUrl}`;
  }
  return imageUrl;
}

function DiveLogCard({ log, onPress, colors }: { log: DiveLog; onPress: () => void; colors: any }) {
  const { t } = useTranslation();
  const sourceIcons: { [key: string]: string } = {
    uddf: 'download',
    subsurface: 'download',
    csv: 'file-text',
    manual: 'edit-3',
  };
  const sourceIcon = sourceIcons[log.importSource] || 'file';
  const thumbnailUrl = getImageUrl(log.diveSiteImageUrl);

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
    >
      {thumbnailUrl ? (
        <Image 
          source={{ uri: thumbnailUrl }} 
          style={styles.cardThumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.cardIcon, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="journal-outline" size={24} color={colors.primary} />
        </View>
      )}
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardDate, { color: colors.text }]}>
            {formatDate(log.diveDateTime)}
          </Text>
          <Text style={[styles.cardTime, { color: colors.textSecondary }]}>
            {formatTime(log.diveDateTime)}
          </Text>
        </View>
        
        {log.diveSiteName && (
          <View style={styles.siteRow}>
            <Feather name="map-pin" size={12} color={colors.textSecondary} />
            <Text style={[styles.siteName, { color: colors.textSecondary }]} numberOfLines={1}>
              {log.diveSiteName}
            </Text>
          </View>
        )}

        <View style={styles.cardStats}>
          {log.maxDepthMeters && (
            <View style={styles.statItem}>
              <Feather name="arrow-down" size={14} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.text }]}>
                {log.maxDepthMeters.toFixed(1)}m
              </Text>
            </View>
          )}
          <View style={styles.statItem}>
            <Feather name="clock" size={14} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatDuration(log.durationSeconds)}
            </Text>
          </View>
          {log.minTemperatureCelsius && (
            <View style={styles.statItem}>
              <Feather name="thermometer" size={14} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.text }]}>
                {log.minTemperatureCelsius.toFixed(0)}°C
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sourceRow}>
          <Feather name={sourceIcon as any} size={10} color={colors.textSecondary} />
          <Text style={[styles.sourceText, { color: colors.textSecondary }]}>
            {log.importSource === 'manual' ? t('diveLogs.manualEntrySource') : t('diveLogs.importedSource', { format: log.importSource.toUpperCase() })}
          </Text>
          {log.photoCount > 0 && (
            <View style={styles.photoIndicator}>
              <Ionicons name="image" size={12} color={colors.primary} />
              <Text style={[styles.photoCountText, { color: colors.primary }]}>{log.photoCount}</Text>
            </View>
          )}
        </View>
      </View>
      <Feather name="chevron-right" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

function StatsCard({ stats, colors }: { stats: DiveStats; colors: any }) {
  const { t } = useTranslation();
  const totalHours = Math.floor(stats.totalDurationSeconds / 3600);
  const totalMins = Math.floor((stats.totalDurationSeconds % 3600) / 60);

  return (
    <View style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={[styles.statBlockValue, { color: colors.primary }]}>{stats.totalDives}</Text>
          <Text style={[styles.statBlockLabel, { color: colors.textSecondary }]}>{t('diveLogs.totalDives')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statBlock}>
          <Text style={[styles.statBlockValue, { color: colors.primary }]}>
            {stats.deepestDiveMeters ? `${stats.deepestDiveMeters.toFixed(1)}m` : '--'}
          </Text>
          <Text style={[styles.statBlockLabel, { color: colors.textSecondary }]}>{t('diveLogs.deepest')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statBlock}>
          <Text style={[styles.statBlockValue, { color: colors.primary }]}>
            {totalHours > 0 ? `${totalHours}h ${totalMins}m` : `${totalMins}m`}
          </Text>
          <Text style={[styles.statBlockLabel, { color: colors.textSecondary }]}>{t('diveLogs.totalTime')}</Text>
        </View>
      </View>
    </View>
  );
}

export default function DiveLogsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [logs, setLogs] = useState<DiveLog[]>([]);
  const [stats, setStats] = useState<DiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [diveComputer, setDiveComputer] = useState<DiveComputerCapabilities | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!token) return;

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`${getApiUrl()}/api/dive-logs?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.diveLogs);
      }
    } catch (error) {
      console.error('Error fetching dive logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, searchQuery]);

  const fetchStats = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching dive stats:', error);
    }
  }, [token]);

  const fetchDiveComputer = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/user/dive-computer`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDiveComputer({
          brand: data.capabilities?.brand || null,
          model: data.capabilities?.model || null,
        });
      }
    } catch (error) {
      console.error('Error fetching dive computer:', error);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && token) {
        fetchLogs();
        fetchStats();
        fetchDiveComputer();
      }
    }, [fetchLogs, fetchStats, fetchDiveComputer, authLoading, token])
  );

  // Retry fetch when token becomes available after initial load
  useEffect(() => {
    if (!authLoading && token && logs.length === 0 && !loading) {
      setLoading(true);
      fetchLogs();
      fetchStats();
      fetchDiveComputer();
    }
  }, [authLoading, token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
    fetchStats();
  };

  const handleLogPress = (log: DiveLog) => {
    router.push(`/dive-log/${log.id}` as any);
  };

  const handleWebFileSelect = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);

      const uploadResponse = await fetch(`${getApiUrl()}/api/dive-logs/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await uploadResponse.json();

      if (uploadResponse.ok) {
        alert(`${t('diveLogs.importSuccessful')}: ${t('diveLogs.importCount', { count: data.dives?.length || 0 })}`);
        onRefresh();
      } else {
        alert(`${t('diveLogs.importFailed')}: ${data.error || t('diveLogs.failedToImport')}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert(`${t('diveLogs.importError')}: ${t('diveLogs.importErrorMessage')}`);
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const handleImport = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.uddf,.xml,.csv,.ssrf,.zip,.log,.txt,application/xml,application/octet-stream';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e) => {
        handleWebFileSelect(e);
        document.body.removeChild(input);
      };
      input.click();
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const file = result.assets[0];
      setImporting(true);

      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        type: file.mimeType || 'application/octet-stream',
        name: file.name,
      } as any);

      const uploadResponse = await fetch(`${getApiUrl()}/api/dive-logs/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await uploadResponse.json();

      if (uploadResponse.ok) {
        Alert.alert(
          t('diveLogs.importSuccessful'),
          data.message || t('diveLogs.importCount', { count: data.dives?.length || 0 }),
          [{ text: 'OK', onPress: onRefresh }]
        );
      } else {
        Alert.alert(t('diveLogs.importFailed'), data.error || t('diveLogs.failedToImport'));
      }
    } catch (error) {
      console.error('Import error:', error);
      Alert.alert(t('diveLogs.importError'), t('diveLogs.importErrorMessage'));
    } finally {
      setImporting(false);
    }
  };

  const handleAddManual = () => {
    router.push('/manual-dive-entry');
  };

  const handleBluetoothConnect = () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        t('importDiveLog.bluetoothSync'),
        t('diveLogs.bluetoothNotAvailable'),
        [{ text: 'OK' }]
      );
      return;
    }
    router.push('/ble-connect' as any);
  };

  const hasBleSupport = diveComputer?.model?.has_ble ?? false;
  const diveComputerName = diveComputer?.brand && diveComputer?.model 
    ? `${diveComputer.brand.name} ${diveComputer.model.name}` 
    : null;

  const getImportGuidance = () => {
    if (!diveComputer?.model) {
      return t('diveLogs.selectDiveComputerGuidance');
    }
    if (hasBleSupport) {
      return t('diveLogs.bleGuidance', { name: diveComputerName });
    }
    return t('diveLogs.fileImportGuidance', { name: diveComputerName, brand: diveComputer.brand?.name });
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Feather name="book" size={64} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('diveLogs.noDiveLogs')}</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        {searchQuery
          ? t('diveLogs.tryAdjustingSearch')
          : t('diveLogs.importFromComputer')}
      </Text>
      {!searchQuery && (
        <>
          <View style={styles.emptyActions}>
            {hasBleSupport && (
              <Pressable
                style={[styles.bleButton, { backgroundColor: '#3B82F6' }]}
                onPress={handleBluetoothConnect}
              >
                <Feather name="bluetooth" size={20} color="#FFFFFF" />
                <Text style={styles.importButtonText}>{t('diveLogs.connectBluetooth')}</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.importButton, { backgroundColor: colors.primary }]}
              onPress={handleImport}
            >
              <Feather name="upload" size={20} color="#FFFFFF" />
              <Text style={styles.importButtonText}>{t('diveLogs.importFromFile')}</Text>
            </Pressable>
            <Pressable
              style={[styles.manualButton, { borderColor: colors.primary }]}
              onPress={handleAddManual}
            >
              <Feather name="plus" size={20} color={colors.primary} />
              <Text style={[styles.manualButtonText, { color: colors.primary }]}>{t('diveLogs.addManualEntry')}</Text>
            </Pressable>
          </View>
          <View style={[styles.guidanceBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="info" size={16} color={colors.textSecondary} />
            <Text style={[styles.guidanceText, { color: colors.textSecondary }]}>
              {getImportGuidance()}
            </Text>
          </View>
        </>
      )}
    </View>
  );

  const renderHeader = () => (
    <>
      {stats && stats.totalDives > 0 && <StatsCard stats={stats} colors={colors} />}
    </>
  );

  return (
    <ThemedBackground style={styles.container}>
      <PageHeader title={t('diveLogs.title')} />
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('diveLogs.searchDiveLogs')}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')}>
              <Feather name="x" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <DiveLogCard log={item} onPress={() => handleLogPress(item)} colors={colors} />
          )}
          contentContainerStyle={logs.length === 0 ? styles.emptyList : styles.list}
          ListEmptyComponent={renderEmptyState}
          ListHeaderComponent={renderHeader}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/import-dive-log')}
      >
        <Feather name="plus" size={24} color="#FFFFFF" />
      </Pressable>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: 48,
  },
  importIconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  separator: {
    height: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardTime: {
    fontSize: 14,
  },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  siteName: {
    fontSize: 13,
    flex: 1,
  },
  cardStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sourceText: {
    fontSize: 11,
  },
  photoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
  },
  photoCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statsCard: {
    marginHorizontal: 0,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statBlock: {
    alignItems: 'center',
    flex: 1,
  },
  statBlockValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statBlockLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyActions: {
    width: '100%',
    gap: 12,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  importButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  manualButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  bleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  guidanceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  guidanceText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
