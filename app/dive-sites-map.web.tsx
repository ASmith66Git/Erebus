import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import Constants from 'expo-constants';

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

export default function DiveSitesMapScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  
  const [sites, setSites] = useState<DiveSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedSite, setSelectedSite] = useState<DiveSite | null>(null);
  
  const webMapRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || Constants.expoConfig?.extra?.googleMapsApiKey || '';

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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loading || sites.length === 0) return;
    if (googleMapRef.current) return;

    const initWebMap = async () => {
      const mapElement = webMapRef.current;
      if (!mapElement) {
        setTimeout(initWebMap, 100);
        return;
      }

      if (!apiKey) {
        setError('Google Maps API key not configured');
        return;
      }

      try {
        let google = (window as any).google;
        
        if (!google || !google.maps) {
          const loader = await import('@googlemaps/js-api-loader');
          const { setOptions, importLibrary } = loader;
          
          setOptions({ key: apiKey, v: 'weekly' });
          await importLibrary('maps');
          await importLibrary('marker');
          
          google = (window as any).google;
        }
        
        if (!google?.maps) throw new Error('Google Maps failed to initialize');

        const bounds = new google.maps.LatLngBounds();
        sites.forEach(site => {
          if (site.latitude && site.longitude) {
            bounds.extend({ lat: site.latitude, lng: site.longitude });
          }
        });

        const map = new google.maps.Map(mapElement, {
          center: bounds.getCenter(),
          zoom: 3,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          styles: [
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1a3c5e' }] },
            { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d8e' }] },
          ],
        });

        map.fitBounds(bounds);
        googleMapRef.current = map;

        const infoWindow = new google.maps.InfoWindow();

        sites.forEach(site => {
          if (!site.latitude || !site.longitude) return;

          const marker = new google.maps.Marker({
            position: { lat: site.latitude, lng: site.longitude },
            map: map,
            title: site.name,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: colors.primary,
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            },
          });

          marker.addListener('click', () => {
            setSelectedSite(site);
            const content = `
              <div style="padding: 8px; max-width: 200px;">
                <strong style="font-size: 14px;">${site.name}</strong>
                <div style="font-size: 12px; color: #666; margin-top: 4px;">
                  ${site.siteType.charAt(0).toUpperCase() + site.siteType.slice(1)}
                </div>
                ${site.country || site.region ? `
                  <div style="font-size: 12px; color: #888; margin-top: 2px;">
                    ${[site.region, site.country].filter(Boolean).join(', ')}
                  </div>
                ` : ''}
              </div>
            `;
            infoWindow.setContent(content);
            infoWindow.open(map, marker);
          });

          markersRef.current.push(marker);
        });

        setMapLoaded(true);
      } catch (err: any) {
        console.error('Map error:', err);
        setError(err.message || 'Failed to load map');
      }
    };

    const timer = setTimeout(initWebMap, 100);
    return () => clearTimeout(timer);
  }, [loading, sites, apiKey, colors.primary]);

  const handleBack = () => {
    router.back();
  };

  const handleSitePress = () => {
    if (selectedSite) {
      router.push(`/dive-site/${selectedSite.id}`);
    }
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
        <View style={styles.mapWrapper}>
          {!mapLoaded && (
            <View style={[styles.mapLoadingOverlay, { backgroundColor: colors.background }]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Loading map...
              </Text>
            </View>
          )}
          <div
            ref={webMapRef as any}
            style={{
              width: '100%',
              height: '100%',
              display: mapLoaded ? 'block' : 'none',
            }}
          />
        </View>
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
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    zIndex: 10,
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
