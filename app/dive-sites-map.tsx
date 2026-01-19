import { Platform } from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getApiUrl } from '@/utils/apiConfig';
import Constants from 'expo-constants';

interface DiveSite {
  id: number;
  name: string;
  location?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  site_type?: string;
  max_depth?: number;
  difficulty?: string;
}

export default function DiveSitesMap() {
  const router = useRouter();
  const { token } = useAuth();
  const { colors } = useTheme();
  const [sites, setSites] = useState<DiveSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<DiveSite | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

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
      // Convert latitude/longitude from PostgreSQL numeric strings to numbers
      const parsedSites = allSites.map((s: any) => ({
        ...s,
        latitude: s.latitude != null ? parseFloat(s.latitude) : null,
        longitude: s.longitude != null ? parseFloat(s.longitude) : null,
      }));
      const sitesWithCoords = parsedSites.filter((s: DiveSite) => s.latitude != null && s.longitude != null);
      setSites(sitesWithCoords);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || loading || sites.length === 0) return;
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
          if (site.latitude != null && site.longitude != null) {
            bounds.extend({ lat: site.latitude, lng: site.longitude });
          }
        });

        const map = new google.maps.Map(mapElement, {
          center: bounds.getCenter(),
          zoom: 4,
          mapTypeId: 'terrain',
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
            { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] },
          ],
        });

        googleMapRef.current = map;
        map.fitBounds(bounds, 50);

        const infoWindow = new google.maps.InfoWindow();

        sites.forEach(site => {
          if (site.latitude == null || site.longitude == null) return;

          const marker = new google.maps.Marker({
            position: { lat: site.latitude, lng: site.longitude },
            map,
            title: site.name,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: colors.primary,
              fillOpacity: 0.9,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            },
          });

          marker.addListener('click', () => {
            setSelectedSite(site);
            const content = `
              <div style="padding: 8px; min-width: 200px;">
                <div style="font-weight: 600; font-size: 14px; color: #1a1a1a; margin-bottom: 4px;">
                  ${site.name}
                </div>
                ${site.site_type ? `
                  <div style="font-size: 12px; color: #666; margin-bottom: 2px;">
                    ${site.site_type}
                  </div>
                ` : ''}
                ${site.location || site.region || site.country ? `
                  <div style="font-size: 12px; color: #888;">
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

  if (Platform.OS !== 'web') {
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
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.nativeMapPlaceholder}>
          <Feather name="map" size={48} color={colors.textSecondary} />
          <Text style={[styles.placeholderText, { color: colors.text }]}>
            Map view requires EAS Build
          </Text>
          <Text style={[styles.placeholderSubtext, { color: colors.textSecondary }]}>
            Use Expo Go on a device or build with EAS for native map support
          </Text>
        </View>
      </View>
    );
  }

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
              opacity: mapLoaded ? 1 : 0,
            }} 
          />
          {selectedSite && (
            <Pressable 
              style={[styles.selectedCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
              onPress={handleSitePress}
            >
              <View style={styles.selectedCardContent}>
                <View style={[styles.siteIcon, { backgroundColor: colors.primary + '20' }]}>
                  <Feather name="anchor" size={20} color={colors.primary} />
                </View>
                <View style={styles.selectedCardText}>
                  <Text style={[styles.selectedCardTitle, { color: colors.text }]} numberOfLines={1}>
                    {selectedSite.name}
                  </Text>
                  <Text style={[styles.selectedCardSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[selectedSite.site_type, selectedSite.region, selectedSite.country].filter(Boolean).join(' • ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            </Pressable>
          )}
        </View>
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
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  siteCount: {
    width: 60,
    alignItems: 'flex-end',
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
  nativeMapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  placeholderSubtext: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
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
