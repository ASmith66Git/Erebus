import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { getApiUrl } from '@/utils/apiConfig';
import { useFocusEffect } from '@react-navigation/native';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';
import { useTranslation } from 'react-i18next';

interface Cylinder {
  id: number;
  nickname: string;
  cylinderType: string;
  sizeLiters: number | null;
  serialNumber: string | null;
  workingPressure: number | null;
  testingStandard: string;
  isEnrichedGas: boolean;
  status: 'green' | 'amber' | 'red';
  nextVisualDue: string | null;
  nextHydroDue: string | null;
  nextOxygenCleanDue: string | null;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  green: { bg: '#059669', text: '#FFFFFF', label: 'In Test' },
  amber: { bg: '#D97706', text: '#FFFFFF', label: 'Due Soon' },
  red: { bg: '#DC2626', text: '#FFFFFF', label: 'Overdue' },
};

export default function CylindersScreen() {
  const { colors } = useTheme();
  const { token, logout } = useAuth();
  const { formatVolume, formatPressure } = useSettings();
  const router = useRouter();
  const { t } = useTranslation();

  const [cylinders, setCylinders] = useState<Cylinder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'updated'>('updated');

  const fetchCylinders = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/cylinders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        logout();
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setCylinders(data.cylinders || []);
      }
    } catch (error) {
      console.error('Error fetching cylinders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, logout]);

  useFocusEffect(
    useCallback(() => {
      fetchCylinders();
    }, [fetchCylinders])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchCylinders();
  };

  const handleDelete = async (cylinder: Cylinder) => {
    const doDelete = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/cylinders/${cylinder.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          setCylinders(prev => prev.filter(c => c.id !== cylinder.id));
        }
      } catch (error) {
        console.error('Error deleting cylinder:', error);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(t('cylinders.deleteConfirm', { name: cylinder.nickname }))) {
        doDelete();
      }
    } else {
      Alert.alert(
        t('cylinders.deleteCylinder'),
        t('cylinders.deleteConfirm', { name: cylinder.nickname }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.delete'), style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const statusPriority: Record<string, number> = { red: 0, amber: 1, green: 2 };

  const filtered = cylinders
    .filter(c => {
      const matchesSearch = !searchQuery ||
        c.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.serialNumber && c.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesFilter = !filterStatus || c.status === filterStatus;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.nickname.localeCompare(b.nickname);
      if (sortBy === 'status') return (statusPriority[a.status] ?? 2) - (statusPriority[b.status] ?? 2);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const renderStatusBadge = (status: string) => {
    const config = STATUS_COLORS[status] || STATUS_COLORS.green;
    return (
      <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
        <Text style={[styles.statusBadgeText, { color: config.text }]}>
          {t(`cylinders.status_${status}`)}
        </Text>
      </View>
    );
  };

  const renderCylinderCard = (cylinder: Cylinder) => (
    <Pressable
      key={cylinder.id}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => router.push(`/cylinder/${cylinder.id}` as any)}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.cylinderIcon, { backgroundColor: colors.primary + '20' }]}>
          <Feather name="disc" size={24} color={colors.primary} />
        </View>
        <View style={styles.cardTitleSection}>
          <Text style={[styles.cylinderName, { color: colors.text }]}>{cylinder.nickname}</Text>
          <Text style={[styles.cylinderMeta, { color: colors.textSecondary }]}>
            {cylinder.cylinderType.charAt(0).toUpperCase() + cylinder.cylinderType.slice(1)}
            {cylinder.sizeLiters ? ` · ${formatVolume(cylinder.sizeLiters)}` : ''}
          </Text>
        </View>
        {renderStatusBadge(cylinder.status)}
      </View>

      <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

      <View style={styles.cardDetails}>
        <View style={styles.detailRow}>
          <Feather name="flag" size={14} color={colors.textSecondary} />
          <Text style={[styles.detailText, { color: colors.textSecondary }]}>
            {t('cylinders.standard')}: {cylinder.testingStandard}
          </Text>
        </View>
        {cylinder.serialNumber && (
          <View style={styles.detailRow}>
            <Feather name="hash" size={14} color={colors.textSecondary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              {cylinder.serialNumber}
            </Text>
          </View>
        )}
        {cylinder.isEnrichedGas && (
          <View style={styles.detailRow}>
            <Feather name="zap" size={14} color={colors.primary} />
            <Text style={[styles.detailText, { color: colors.primary }]}>
              {t('cylinders.enrichedGas')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.cardActions}>
        <Pressable
          style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
          onPress={(e) => {
            e.stopPropagation();
            handleDelete(cylinder);
          }}
        >
          <Feather name="trash-2" size={16} color={colors.error} />
        </Pressable>
      </View>
    </Pressable>
  );

  return (
    <ThemedBackground>
      <PageHeader title={t('cylinders.title')} />

      <View style={[styles.searchContainer, { borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t('cylinders.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')}>
            <Feather name="x" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {['all', 'green', 'amber', 'red'].map(f => (
          <Pressable
            key={f}
            style={[
              styles.filterChip,
              {
                backgroundColor: (f === 'all' ? !filterStatus : filterStatus === f)
                  ? colors.primary : colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setFilterStatus(f === 'all' ? null : f)}
          >
            <Text style={[
              styles.filterChipText,
              { color: (f === 'all' ? !filterStatus : filterStatus === f) ? '#FFF' : colors.text },
            ]}>
              {f === 'all' ? t('common.all') : t(`cylinders.status_${f}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: colors.textSecondary }]}>{t('cylinders.sortBy')}:</Text>
        {(['updated', 'name', 'status'] as const).map(s => (
          <Pressable
            key={s}
            style={[styles.sortChip, { backgroundColor: sortBy === s ? colors.primary + '20' : 'transparent' }]}
            onPress={() => setSortBy(s)}
          >
            <Text style={[styles.sortChipText, { color: sortBy === s ? colors.primary : colors.textSecondary }]}>
              {t(`cylinders.sort_${s}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => renderCylinderCard(item)}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="disc" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('cylinders.noCylinders')}</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {t('cylinders.emptyDescription')}
              </Text>
              <Pressable
                style={[styles.createButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/cylinder/new' as any)}
              >
                <Feather name="plus" size={18} color="#FFFFFF" />
                <Text style={styles.createButtonText}>{t('cylinders.addCylinder')}</Text>
              </Pressable>
            </View>
          }
        />
      )}

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/cylinder/new' as any)}
      >
        <Feather name="plus" size={24} color="#FFFFFF" />
      </Pressable>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
    gap: 4,
  },
  sortLabel: {
    fontSize: 12,
    marginRight: 4,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: '500',
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cylinderIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleSection: {
    flex: 1,
  },
  cylinderName: {
    fontSize: 16,
    fontWeight: '600',
  },
  cylinderMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    marginVertical: 12,
  },
  cardDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 16,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
