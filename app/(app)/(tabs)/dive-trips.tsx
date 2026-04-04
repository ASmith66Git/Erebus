import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Image,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getApiUrl } from '@/utils/apiConfig';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';
import { useTranslation } from 'react-i18next';

interface DiveTrip {
  id: number;
  name: string;
  trip_type: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  country: string | null;
  total_dives: number;
  cover_image_key: string | null;
  linked_dives?: number | any[];
  photo_count?: number;
}

const TRIP_TYPES = [
  { value: 'liveaboard', label: 'Liveaboard', icon: 'anchor' },
  { value: 'dive_center', label: 'Dive Center', icon: 'home' },
  { value: 'safari', label: 'Dive Safari', icon: 'truck' },
  { value: 'resort', label: 'Dive Resort', icon: 'sun' },
  { value: 'day_trip', label: 'Day Trip', icon: 'clock' },
  { value: 'other', label: 'Other', icon: 'more-horizontal' },
];

export default function DiveTripsScreen() {
  const { colors } = useTheme();
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [trips, setTrips] = useState<DiveTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrips = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-trips`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTrips(data);
      }
    } catch (error) {
      console.error('Fetch trips error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading && token) {
      fetchTrips();
    }
  }, [authLoading, token, fetchTrips]);

  useFocusEffect(
    useCallback(() => {
      if (token) {
        fetchTrips();
      }
    }, [token, fetchTrips])
  );

  const getCoverImageUrl = (key: string | null) => {
    if (!key) return null;
    if (key.startsWith('/objects/')) {
      return `${getApiUrl()}${key}`;
    }
    if (key.startsWith('/')) {
      return `${getApiUrl()}${key}`;
    }
    return `${getApiUrl()}/objects/${key}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const getTripTypeInfo = (type: string) => {
    return TRIP_TYPES.find((t) => t.value === type) || TRIP_TYPES[5];
  };

  const renderTripCard = (trip: DiveTrip) => {
    const typeInfo = getTripTypeInfo(trip.trip_type);
    const coverUrl = getCoverImageUrl(trip.cover_image_key);
    return (
      <Pressable
        key={trip.id}
        style={[styles.tripCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push(`/dive-trip/${trip.id}` as any)}
      >
        <View style={styles.tripCardRow}>
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={styles.tripCardThumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.tripCardThumbnailPlaceholder, { backgroundColor: colors.primary + '15' }]}>
              <Feather name={typeInfo.icon as any} size={28} color={colors.primary} />
            </View>
          )}
          <View style={styles.tripCardContent}>
            <Text style={[styles.tripName, { color: colors.text }]} numberOfLines={1}>{trip.name}</Text>
            <Text style={[styles.tripType, { color: colors.textSecondary }]}>{typeInfo.label}</Text>
            
            {(trip.start_date || trip.end_date) && (
              <Text style={[styles.tripCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                {formatDate(trip.start_date)}{trip.end_date && ` - ${formatDate(trip.end_date)}`}
              </Text>
            )}
            {trip.location && (
              <Text style={[styles.tripCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                {trip.location}{trip.country ? `, ${trip.country}` : ''}
              </Text>
            )}
            
            <View style={styles.tripCardStats}>
              <View style={styles.tripStatItem}>
                <Ionicons name="water" size={14} color={colors.primary} />
                <Text style={[styles.tripCardDives, { color: colors.primary }]}>
                  {typeof trip.linked_dives === 'number' ? trip.linked_dives : (Array.isArray(trip.linked_dives) ? trip.linked_dives.length : trip.total_dives || 0)}
                </Text>
              </View>
              <View style={styles.tripStatItem}>
                <Ionicons name="image" size={14} color={colors.primary} />
                <Text style={[styles.tripPhotoCount, { color: colors.primary }]}>{trip.photo_count ?? 0}</Text>
              </View>
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
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('diveTrips.loadingTrips')}</Text>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <PageHeader title={t('diveTrips.title')} />

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => renderTripCard(item)}
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, trips.length === 0 && styles.emptyContainer]}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTrips(); }} />
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="navigation" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyStateTitle, { color: colors.text }]}>{t('diveTrips.noTripsYet')}</Text>
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              {t('diveTrips.emptyDescription')}
            </Text>
            <Pressable
              style={[styles.emptyStateBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/dive-trip/new' as any)}
            >
              <Feather name="plus" size={18} color="#FFF" />
              <Text style={styles.emptyStateBtnText}>{t('diveTrips.addTrip')}</Text>
            </Pressable>
          </View>
        }
      />

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/dive-trip/new' as any)}
      >
        <Feather name="plus" size={24} color="#FFF" />
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
  tripCard: { borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  tripCardRow: { flexDirection: 'row' },
  tripCardThumbnail: { width: 80, height: 80 },
  tripCardThumbnailPlaceholder: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
  tripCardContent: { flex: 1, padding: 12 },
  tripName: { fontSize: 16, fontWeight: '600' },
  tripType: { fontSize: 12, marginTop: 2 },
  tripCardMeta: { fontSize: 12, marginTop: 4 },
  tripCardStats: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  tripStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tripCardDives: { fontSize: 13, fontWeight: '500' },
  tripPhotoCount: { fontSize: 13, fontWeight: '500' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
});
