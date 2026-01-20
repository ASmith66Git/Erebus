import React, { useState, useEffect, useCallback } from 'react';
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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

interface DiveSite {
  id: number;
  name: string;
  description: string | null;
  siteType: string;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  region: string | null;
  waterType: string;
  depthMin: number | null;
  depthMax: number | null;
  imageUrl: string | null;
  ratingAvg: number;
  ratingsCount: number;
}

const siteTypeIcons: { [key: string]: string } = {
  reef: 'sunrise',
  wreck: 'anchor',
  cave: 'moon',
  wall: 'sidebar',
  drift: 'wind',
  shore: 'sun',
  quarry: 'square',
  lake: 'droplet',
  river: 'navigation',
  cenote: 'circle',
  artificial: 'box',
  other: 'map-pin',
};

function getImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('/objects/')) {
    const apiUrl = getApiUrl();
    return `${apiUrl}${imageUrl}`;
  }
  return imageUrl;
}

function DiveSiteCard({ site, onPress, colors }: { site: DiveSite; onPress: () => void; colors: any }) {
  const iconName = siteTypeIcons[site.siteType] || 'map-pin';
  const displayImageUrl = site.imageUrl ? getImageUrl(site.imageUrl) : null;

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={styles.cardImageContainer}>
        {displayImageUrl ? (
          <Image source={{ uri: displayImageUrl }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.border }]}>
            <Feather name={iconName as any} size={32} color={colors.primary} />
          </View>
        )}
      </View>
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {site.name}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: colors.primary + '20' }]}>
            <Feather name={iconName as any} size={12} color={colors.primary} />
            <Text style={[styles.typeBadgeText, { color: colors.primary }]}>
              {site.siteType.charAt(0).toUpperCase() + site.siteType.slice(1)}
            </Text>
          </View>
        </View>

        {(site.country || site.region) && (
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={14} color={colors.textSecondary} />
            <Text style={[styles.locationText, { color: colors.textSecondary }]} numberOfLines={1}>
              {[site.region, site.country].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}

        <View style={styles.cardStats}>
          {site.depthMax && (
            <View style={styles.statItem}>
              <Feather name="arrow-down" size={14} color={colors.textSecondary} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>
                {site.depthMax}m
              </Text>
            </View>
          )}
          {site.ratingAvg > 0 && (
            <View style={styles.statItem}>
              <Feather name="star" size={14} color="#FFC107" />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>
                {site.ratingAvg.toFixed(1)}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Feather name="chevron-right" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

export default function DiveSitesScreen() {
  const { colors } = useTheme();
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [sites, setSites] = useState<DiveSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSites = useCallback(async () => {
    if (!token) return;

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`${getApiUrl()}/api/dive-sites?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSites(data.sites);
      }
    } catch (error) {
      console.error('Error fetching dive sites:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, searchQuery]);

  useEffect(() => {
    if (!authLoading && token) {
      fetchSites();
    }
  }, [fetchSites, authLoading, token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSites();
  };

  const handleSitePress = (site: DiveSite) => {
    router.push(`/dive-site/${site.id}` as any);
  };

  const handleAddSite = () => {
    router.push('/dive-site/new' as any);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Feather name="map-pin" size={64} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No Dive Sites Found</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        {searchQuery
          ? 'Try adjusting your search'
          : 'Add your first dive site to get started'}
      </Text>
      {!searchQuery && (
        <Pressable
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={handleAddSite}
        >
          <Feather name="plus" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Dive Site</Text>
        </Pressable>
      )}
    </View>
  );

  const handleMapPress = () => {
    router.push('/dive-sites-map' as any);
  };

  return (
    <ThemedBackground>
      <PageHeader 
        title="Dive Sites" 
        rightAction={
          <Pressable onPress={handleMapPress} style={styles.mapButton}>
            <Feather name="map" size={22} color={colors.text} />
          </Pressable>
        }
      />
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search dive sites..."
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
          data={sites}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <DiveSiteCard site={item} onPress={() => handleSitePress(item)} colors={colors} />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={renderEmptyState}
        />
      )}

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={handleAddSite}
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
    padding: 16,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: 12,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    flex: 1,
  },
  cardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    marginTop: 24,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
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
  mapButton: {
    padding: 8,
  },
});
