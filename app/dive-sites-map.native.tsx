import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';

interface DiveSite {
  id: number;
  name: string;
  siteType: string;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  region: string | null;
  difficulty: string;
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

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 60;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

export default function DiveSitesMapScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  
  const [sites, setSites] = useState<DiveSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<DiveSite | null>(null);

  useEffect(() => {
    fetchSites();
  }, []);

  const fetchSites = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${getApiUrl()}/api/dive-sites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch sites');
      const data = await response.json();
      const allSites = data.sites || data;
      const sitesWithCoords = allSites.filter((s: DiveSite) => s.latitude != null && s.longitude != null);
      setSites(sitesWithCoords);

      if (sitesWithCoords.length > 0 && mapRef.current) {
        const coordinates = sitesWithCoords.map((s: DiveSite) => ({
          latitude: s.latitude!,
          longitude: s.longitude!,
        }));
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 150, left: 50 },
          animated: true,
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handleMarkerPress = (site: DiveSite) => {
    setSelectedSite(site);
  };

  const handleSitePress = () => {
    if (selectedSite) {
      router.push(`/dive-site/${selectedSite.id}` as any);
    }
  };

  const initialRegion = {
    latitude: 0,
    longitude: 0,
    latitudeDelta: LATITUDE_DELTA,
    longitudeDelta: LONGITUDE_DELTA,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Ionicons name="map" size={20} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Dive Sites Map</Text>
        </View>
        <View style={styles.siteCount}>
          <Text style={[styles.siteCountText, { color: colors.textSecondary }]}>
            {sites.length} sites
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading dive sites...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
          <Pressable 
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={fetchSites}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : sites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="map-pin" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.text }]}>
            No dive sites with coordinates
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Add coordinates to your dive sites to see them on the map
          </Text>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton
          mapType="standard"
        >
          {sites.map((site) => (
            <Marker
              key={site.id}
              coordinate={{
                latitude: site.latitude!,
                longitude: site.longitude!,
              }}
              title={site.name}
              description={[site.region, site.country].filter(Boolean).join(', ')}
              pinColor={colors.primary}
              onPress={() => handleMarkerPress(site)}
            >
              <Callout onPress={handleSitePress}>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{site.name}</Text>
                  <Text style={styles.calloutSubtitle}>
                    {site.siteType.charAt(0).toUpperCase() + site.siteType.slice(1)}
                  </Text>
                  {(site.country || site.region) && (
                    <Text style={styles.calloutLocation}>
                      {[site.region, site.country].filter(Boolean).join(', ')}
                    </Text>
                  )}
                  <Text style={styles.calloutTap}>Tap to view details</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      )}

      {selectedSite && (
        <Pressable 
          style={[styles.selectedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={handleSitePress}
        >
          <View style={styles.selectedCardContent}>
            <View style={[styles.siteIcon, { backgroundColor: colors.primary + '20' }]}>
              <Feather 
                name={siteTypeIcons[selectedSite.siteType] as any || 'map-pin'} 
                size={20} 
                color={colors.primary} 
              />
            </View>
            <View style={styles.selectedCardText}>
              <Text style={[styles.selectedCardTitle, { color: colors.text }]} numberOfLines={1}>
                {selectedSite.name}
              </Text>
              <Text style={[styles.selectedCardSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {[selectedSite.region, selectedSite.country].filter(Boolean).join(', ') || selectedSite.siteType}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  siteCount: {
    paddingHorizontal: 8,
  },
  siteCountText: {
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  map: {
    flex: 1,
  },
  callout: {
    minWidth: 150,
    padding: 8,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  calloutSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  calloutLocation: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  calloutTap: {
    fontSize: 10,
    color: '#007AFF',
    marginTop: 6,
    fontStyle: 'italic',
  },
  selectedCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  selectedCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  siteIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCardText: {
    flex: 1,
  },
  selectedCardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectedCardSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
});
