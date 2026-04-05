import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getApiUrl } from '@/utils/apiConfig';
import { getAllLocalCompressors, upsertLocalCompressor } from '@/services/localDatabase';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';
import { useTranslation } from 'react-i18next';

const isNative = Platform.OS !== 'web';

interface Compressor {
  id: number | string;
  name: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  total_hours: number;
  oil_change_interval_hours: number;
  filter_change_interval_hours: number;
  independent_test_interval_months: number;
  status: string;
  last_oil_change_hours: number | null;
  last_filter_change_hours: number | null;
  last_test_date: string | null;
  next_test_due_date: string | null;
  last_test_result: string | null;
}

type StatusLevel = 'green' | 'amber' | 'red';

function getCompressorStatus(c: Compressor): StatusLevel {
  const totalHours = parseFloat(String(c.total_hours)) || 0;
  let worst: StatusLevel = 'green';

  if (c.oil_change_interval_hours > 0) {
    const lastOilHours = c.last_oil_change_hours ? parseFloat(String(c.last_oil_change_hours)) : 0;
    const hoursSinceOil = totalHours - lastOilHours;
    if (hoursSinceOil >= c.oil_change_interval_hours) worst = 'red';
    else if (hoursSinceOil >= c.oil_change_interval_hours * 0.9) worst = worst === 'red' ? 'red' : 'amber';
  }

  if (c.filter_change_interval_hours > 0) {
    const lastFilterHours = c.last_filter_change_hours ? parseFloat(String(c.last_filter_change_hours)) : 0;
    const hoursSinceFilter = totalHours - lastFilterHours;
    if (hoursSinceFilter >= c.filter_change_interval_hours) worst = 'red';
    else if (hoursSinceFilter >= c.filter_change_interval_hours * 0.9 && worst !== 'red') worst = 'amber';
  }

  let testDueDate: Date | null = null;
  if (c.next_test_due_date) {
    testDueDate = new Date(c.next_test_due_date);
  } else if (c.last_test_date && c.independent_test_interval_months > 0) {
    testDueDate = new Date(c.last_test_date);
    testDueDate.setMonth(testDueDate.getMonth() + c.independent_test_interval_months);
  }
  if (testDueDate) {
    const now = new Date();
    const daysUntilDue = Math.ceil((testDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue <= 0) worst = 'red';
    else if (daysUntilDue <= 30 && worst !== 'red') worst = 'amber';
  }

  return worst;
}

const STATUS_COLORS: Record<StatusLevel, string> = {
  green: '#4CAF50',
  amber: '#FF9800',
  red: '#F44336',
};

export default function CompressorsScreen() {
  const { colors } = useTheme();
  const { token, isLoading: authLoading } = useAuth();
  const { isOnline } = useSync();
  const router = useRouter();
  const { t } = useTranslation();

  const [compressors, setCompressors] = useState<Compressor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOfflineData, setIsOfflineData] = useState(false);

  const loadFromLocalDb = useCallback(async () => {
    if (!isNative) return false;
    try {
      const localCompressors = await getAllLocalCompressors();
      if (localCompressors.length > 0) {
        setCompressors(localCompressors.map(lc => ({
          id: lc.serverId ? lc.serverId : `local_${lc.id}`,
          name: lc.name,
          make: lc.make,
          model: lc.model,
          serial_number: lc.serialNumber,
          total_hours: lc.totalHours,
          oil_change_interval_hours: lc.oilChangeIntervalHours,
          filter_change_interval_hours: lc.filterChangeIntervalHours,
          independent_test_interval_months: lc.independentTestIntervalMonths,
          status: lc.status,
          last_oil_change_hours: null,
          last_filter_change_hours: null,
          last_test_date: null,
          next_test_due_date: null,
          last_test_result: null,
        })));
        setIsOfflineData(true);
        return true;
      }
    } catch (err) {
      console.error('Load from local DB error:', err);
    }
    return false;
  }, []);

  const cacheToLocalDb = useCallback(async (data: Compressor[]) => {
    if (!isNative) return;
    try {
      for (const c of data) {
        await upsertLocalCompressor({
          serverId: c.id,
          name: c.name,
          make: c.make,
          model: c.model,
          serialNumber: c.serial_number,
          totalHours: c.total_hours,
          oilChangeIntervalHours: c.oil_change_interval_hours,
          filterChangeIntervalHours: c.filter_change_interval_hours,
          independentTestIntervalMonths: c.independent_test_interval_months,
          status: c.status,
        });
      }
    } catch (err) {
      console.error('Cache to local DB error:', err);
    }
  }, []);

  const fetchCompressors = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/compressors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCompressors(data);
        setIsOfflineData(false);
        cacheToLocalDb(data);
      } else {
        await loadFromLocalDb();
      }
    } catch (error) {
      console.error('Fetch compressors error:', error);
      await loadFromLocalDb();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, cacheToLocalDb, loadFromLocalDb]);

  useFocusEffect(
    useCallback(() => {
      if (token) {
        fetchCompressors();
      }
    }, [token, fetchCompressors])
  );

  const renderCompressorCard = ({ item }: { item: Compressor }) => {
    const status = getCompressorStatus(item);
    const statusColor = STATUS_COLORS[status];
    const totalHours = parseFloat(String(item.total_hours)) || 0;

    return (
      <Pressable
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push(`/compressor/${item.id}` as Href)}
      >
        <View style={styles.cardRow}>
          <View style={[styles.cardIcon, { backgroundColor: statusColor + '20' }]}>
            <Ionicons name="hardware-chip-outline" size={28} color={statusColor} />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            </View>
            {(item.make || item.model) && (
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                {[item.make, item.model].filter(Boolean).join(' ')}
              </Text>
            )}
            <View style={styles.cardStats}>
              <View style={styles.statItem}>
                <Ionicons name="time-outline" size={14} color={colors.primary} />
                <Text style={[styles.statText, { color: colors.primary }]}>{totalHours.toFixed(1)}h</Text>
              </View>
              {item.status === 'retired' && (
                <View style={[styles.retiredBadge, { backgroundColor: colors.textSecondary + '20' }]}>
                  <Text style={[styles.retiredText, { color: colors.textSecondary }]}>{t('compressors.retired')}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <ThemedBackground style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <PageHeader title={t('compressors.title')} />

      <FlatList
        data={compressors}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderCompressorCard}
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, compressors.length === 0 && styles.emptyContainer]}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCompressors(); }} />
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="hardware-chip-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyStateTitle, { color: colors.text }]}>{t('compressors.noCompressors')}</Text>
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              {t('compressors.emptyDescription')}
            </Text>
            <Pressable
              style={[styles.emptyStateBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/compressor/new' as Href)}
            >
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={styles.emptyStateBtnText}>{t('compressors.addCompressor')}</Text>
            </Pressable>
          </View>
        }
      />

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/compressor/new' as Href)}
      >
        <Ionicons name="add" size={24} color="#FFF" />
      </Pressable>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16 },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: 32 },
  emptyStateTitle: { fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' },
  emptyStateText: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  emptyStateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, marginTop: 20 },
  emptyStateBtnText: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  cardRow: { flexDirection: 'row' },
  cardIcon: { width: 72, height: 72, justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1, padding: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardName: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  cardMeta: { fontSize: 12, marginTop: 2 },
  cardStats: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 13, fontWeight: '500' },
  retiredBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  retiredText: { fontSize: 11, fontWeight: '500' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
});
