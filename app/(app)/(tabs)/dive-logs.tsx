import React, { useState, useCallback, useEffect, useRef } from 'react';
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

// PROTECTED — user's native BLE version: safe NaN/null guard for API
// parseFloat columns (0 is falsy and would break bare `&&` checks).
// Do not remove or replace with a simple truthiness check.
function isFiniteNumber(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}
// END PROTECTED

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
    timeZone: 'UTC',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function getImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('/objects/')) {
    return `${getApiUrl()}${imageUrl}`;
  }
  return imageUrl;
}

// PROTECTED — user's native BLE version: selectionMode/selected props
// drive the multi-select delete feature. Do not collapse back to the
// simple { log, onPress, colors } signature.
function DiveLogCard({
  log,
  onPress,
  colors,
  selectionMode = false,
  selected = false,
}: {
  log: DiveLog;
  onPress: () => void;
  colors: any;
  selectionMode?: boolean;
  selected?: boolean;
}) {
  const { t } = useTranslation();
  const sourceIcons: { [key: string]: string } = {
    uddf: 'download',
    subsurface: 'download',
    csv: 'file-text',
    manual: 'edit-3',
  };
  const sourceIcon = (log.importSource && sourceIcons[log.importSource]) || 'file';
  const thumbnailUrl = getImageUrl(log.diveSiteImageUrl);

  return (
    <Pressable
      style={[
        styles.card,
        {
          backgroundColor: selected ? colors.primary + '10' : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
    >
      {selectionMode && (
        <Feather
          name={selected ? 'check-square' : 'square'}
          size={22}
          color={selected ? colors.primary : colors.textSecondary}
        />
      )}
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
          {/* Explicit null/NaN checks: the API parseFloats these columns, so a
              legitimate 0 (or NaN from a NULL column) must not short-circuit
              into a bare text node - React Native throws "Text strings must
              be rendered within a <Text> component" for `0 && <View/>`. */}
          {isFiniteNumber(log.maxDepthMeters) ? (
            <View style={styles.statItem}>
              <Feather name="arrow-down" size={14} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.text }]}>
                {log.maxDepthMeters!.toFixed(1)}m
              </Text>
            </View>
          ) : null}
          <View style={styles.statItem}>
            <Feather name="clock" size={14} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>
              {formatDuration(log.durationSeconds)}
            </Text>
          </View>
          {isFiniteNumber(log.minTemperatureCelsius) ? (
            <View style={styles.statItem}>
              <Feather name="thermometer" size={14} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.text }]}>
                {log.minTemperatureCelsius!.toFixed(0)}°C
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sourceRow}>
          <Feather name={sourceIcon as any} size={10} color={colors.textSecondary} />
          <Text style={[styles.sourceText, { color: colors.textSecondary }]}>
            {(!log.importSource || log.importSource === 'manual') ? t('diveLogs.manualEntrySource') : t('diveLogs.importedSource', { format: log.importSource.toUpperCase() })}
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

// PROTECTED — user's native BLE version: pagination + race-condition guard.
// PAGE_SIZE, loadingMore, hasMore, fetchIdRef, and the offset-based
// fetchLogs signature must all stay in sync. Do not revert to a single
// unbounded fetch or remove the fetchIdRef stale-response check.
const PAGE_SIZE = 50;

export default function DiveLogsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [logs, setLogs] = useState<DiveLog[]>([]);
  const [stats, setStats] = useState<DiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Increments on every fetch so responses that arrive after a newer fetch
  // started (e.g. the search query changed mid-flight) are discarded.
  const fetchIdRef = useRef(0);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [diveComputer, setDiveComputer] = useState<DiveComputerCapabilities | null>(null);

  // PROTECTED — user's native BLE version: multi-select delete state.
  // selectionMode, selectedIds, deleting drive the bulk-delete toolbar.
  // Do not remove — the corresponding UI and server DELETE calls depend on these.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const fetchLogs = useCallback(async (offset = 0) => {
    if (!token) return;

    const fetchId = ++fetchIdRef.current;
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', String(PAGE_SIZE));
      params.append('offset', String(offset));

      const response = await fetch(`${getApiUrl()}/api/dive-logs?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (fetchId !== fetchIdRef.current) return;
        setLogs(prev => {
          if (offset === 0) return data.diveLogs;
          // Dedupe in case rows shifted between pages (e.g. a dive was
          // imported while scrolling).
          const seen = new Set(prev.map(log => log.id));
          return [...prev, ...data.diveLogs.filter((log: DiveLog) => !seen.has(log.id))];
        });
        setHasMore(offset + data.diveLogs.length < data.total);
      }
    } catch (error) {
      console.error('Error fetching dive logs:', error);
    } finally {
      if (fetchId === fetchIdRef.current) {
      setLoading(false);
        setLoadingMore(false);
      setRefreshing(false);
    }
    }
  }, [token, searchQuery]);

  const loadMoreLogs = useCallback(() => {
    if (loading || refreshing || loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchLogs(logs.length);
  }, [loading, refreshing, loadingMore, hasMore, logs.length, fetchLogs]);

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
    if (selectionMode) {
      toggleLogSelection(log.id);
      return;
    }
    router.push(`/dive-log/${log.id}` as any);
  };

  // --- Multi-select delete ---

  const toggleLogSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allSelected = logs.length > 0 && selectedIds.size === logs.length;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(logs.map(log => log.id)));
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      t('diveLogs.deleteDiveLogs'),
      t('diveLogs.deleteConfirmMessage', { count: selectedIds.size }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const results = await Promise.allSettled(
                Array.from(selectedIds).map(id =>
                  fetch(`${getApiUrl()}/api/dive-logs/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                  })
                )
              );
              const failed = results.filter(
                r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)
              ).length;
              if (failed > 0) {
                Alert.alert(t('common.error'), t('diveLogs.deleteFailed', { count: failed }));
              }
            } catch (err) {
              console.error('Delete error:', err);
            } finally {
              setDeleting(false);
              exitSelectionMode();
              onRefresh();
            }
          },
        },
      ]
    );
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
      <PageHeader
        title={t('diveLogs.title')}
        rightAction={
          logs.length > 0 ? (
            selectionMode ? (
              <Pressable onPress={exitSelectionMode} style={styles.headerDeleteButton}>
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            ) : (
              <Pressable onPress={() => setSelectionMode(true)} style={styles.headerDeleteButton}>
                <Feather name="trash-2" size={20} color={colors.error} />
              </Pressable>
            )
          ) : undefined
        }
      />

      {selectionMode && (
        <View style={[styles.selectionToolbar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable style={styles.selectAllButton} onPress={toggleSelectAll}>
            <Feather
              name={allSelected ? 'check-square' : 'square'}
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.selectAllLabel, { color: colors.primary }]}>
              {allSelected ? t('diveLogs.deselectAll') : t('diveLogs.selectAll')}
            </Text>
          </Pressable>
          <Text style={[styles.selectedCount, { color: colors.textSecondary }]}>
            {t('diveLogs.selectedCount', { count: selectedIds.size })}
          </Text>
          <Pressable
            style={[
              styles.deleteSelectedButton,
              { backgroundColor: selectedIds.size > 0 ? colors.error : colors.border },
            ]}
            onPress={deleteSelected}
            disabled={selectedIds.size === 0 || deleting}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="trash-2" size={16} color="#FFFFFF" />
                <Text style={styles.deleteSelectedText}>{t('common.delete')}</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

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
            <DiveLogCard
              log={item}
              onPress={() => handleLogPress(item)}
              colors={colors}
              selectionMode={selectionMode}
              selected={selectedIds.has(item.id)}
            />
          )}
          extraData={[selectionMode, selectedIds]}
          contentContainerStyle={logs.length === 0 ? styles.emptyList : styles.list}
          ListEmptyComponent={renderEmptyState}
          ListHeaderComponent={renderHeader}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={loadMoreLogs}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
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
  footerLoading: {
    paddingVertical: 24,
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
  headerDeleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectAllLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectedCount: {
    fontSize: 12,
    flex: 1,
    textAlign: 'center',
  },
  deleteSelectedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteSelectedText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
