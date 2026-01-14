import React, { useEffect, useRef, useState, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Pressable,
  Linking,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';

// Error boundary to catch crashes in react-native-maps
interface MapErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: Error) => void;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  constructor(props: MapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MapErrorBoundary caught error:', error.message);
    console.error('Component stack:', errorInfo.componentStack);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface StaticMapViewProps {
  latitude: number;
  longitude: number;
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
  };
}

function loadMapsModule() {
  try {
    if (Platform.OS !== 'web') {
      const maps = require('react-native-maps');
      return { MapView: maps.default, Marker: maps.Marker };
    }
  } catch (e) {
    console.log('react-native-maps not available:', e);
  }
  return { MapView: null, Marker: null };
}

export default function StaticMapView({
  latitude,
  longitude,
  colors,
}: StaticMapViewProps) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const webMapRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<any>(null);

  // API key lookup - try multiple sources for production compatibility
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 
    Constants.expoConfig?.extra?.googleMapsApiKey || 
    (Constants as any).manifest?.extra?.googleMapsApiKey ||
    (Constants as any).manifest2?.extra?.expoClient?.extra?.googleMapsApiKey ||
    '';
    
  const androidApiKey = 
    Constants.expoConfig?.extra?.googleMapsAndroidApiKey || 
    (Constants as any).manifest?.extra?.googleMapsAndroidApiKey ||
    (Constants as any).manifest2?.extra?.expoClient?.extra?.googleMapsAndroidApiKey ||
    process.env.GOOGLE_MAPS_ANDROID_API_KEY || 
    '';

  // Load maps module lazily inside the component to catch any initialization errors
  const { MapView, Marker } = useMemo(() => loadMapsModule(), []);

  // For Android native maps, the API key is baked into the build via app.config.js android.config.googleMaps.apiKey
  // We don't need to check for the key at runtime - react-native-maps uses AndroidManifest.xml directly
  // If the key wasn't provided during build, the map will show an error, but won't crash
  const hasValidAndroidKey = true; // Let react-native-maps handle this natively
  
  // Log for debugging in case of issues
  useEffect(() => {
    if (Platform.OS === 'android') {
      console.log('StaticMapView: Android native maps rendering, coordinates:', latitude, longitude);
    }
  }, [latitude, longitude]);

  const openInGoogleMaps = () => {
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    Linking.openURL(url);
  };

  // If no valid Android API key, show fallback button instead of crashing
  if (Platform.OS === 'android' && !hasValidAndroidKey) {
    return (
      <Pressable
        style={[styles.fallbackButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={openInGoogleMaps}
      >
        <Feather name="map" size={18} color={colors.primary} />
        <Text style={[styles.openButtonText, { color: colors.primary }]}>View on Google Maps</Text>
      </Pressable>
    );
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (googleMapRef.current) return;
    if (!apiKey) {
      setMapError('Google Maps API key not configured');
      return;
    }

    const initWebMap = async () => {
      const mapElement = webMapRef.current;
      if (!mapElement) {
        setTimeout(initWebMap, 100);
        return;
      }

      try {
        let google = (window as any).google;
        
        if (!google || !google.maps) {
          const { setOptions, importLibrary } = await import('@googlemaps/js-api-loader');
          
          setOptions({
            key: apiKey,
            v: 'weekly',
          });
          
          await importLibrary('maps');
          
          google = (window as any).google;
        }
        
        if (!google || !google.maps) {
          throw new Error('Google Maps failed to initialize');
        }
        
        const map = new google.maps.Map(mapElement, {
          center: { lat: latitude, lng: longitude },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          scrollwheel: false,
          draggable: false,
          disableDefaultUI: false,
          gestureHandling: 'none',
        });
        googleMapRef.current = map;

        new google.maps.Marker({
          position: { lat: latitude, lng: longitude },
          map: map,
          draggable: false,
        });

        setMapLoaded(true);
      } catch (error: any) {
        console.error('Error loading Google Maps:', error?.message || error?.toString() || 'Unknown error');
        setMapError(error?.message || 'Failed to load map');
      }
    };

    const timer = setTimeout(initWebMap, 50);
    return () => clearTimeout(timer);
  }, [apiKey, latitude, longitude]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={[styles.mapContainer, { borderColor: colors.border }]}>
          {mapError ? (
            <View style={[styles.mapPlaceholder, { backgroundColor: colors.surface }]}>
              <Feather name="alert-circle" size={24} color={colors.textSecondary} />
              <Text style={[styles.mapPlaceholderText, { color: colors.textSecondary }]}>{mapError}</Text>
            </View>
          ) : !mapLoaded ? (
            <View style={[styles.mapPlaceholder, { backgroundColor: colors.surface }]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.mapPlaceholderText, { color: colors.textSecondary }]}>Loading map...</Text>
            </View>
          ) : null}
          <div
            ref={webMapRef as any}
            style={{
              width: '100%',
              height: 200,
              borderRadius: 8,
              display: mapLoaded && !mapError ? 'block' : 'none',
            }}
          />
        </View>
        <Pressable
          style={[styles.openButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={openInGoogleMaps}
        >
          <Feather name="external-link" size={16} color={colors.primary} />
          <Text style={[styles.openButtonText, { color: colors.primary }]}>Open in Google Maps</Text>
        </Pressable>
      </View>
    );
  }

  const fallbackButton = (
    <Pressable
      style={[styles.fallbackButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={openInGoogleMaps}
    >
      <Feather name="map" size={18} color={colors.primary} />
      <Text style={[styles.openButtonText, { color: colors.primary }]}>View on Google Maps</Text>
    </Pressable>
  );

  if (!MapView) {
    return fallbackButton;
  }

  return (
    <View style={styles.container}>
      <MapErrorBoundary
        fallback={fallbackButton}
        onError={(error) => console.error('Map crashed:', error.message)}
      >
        <View style={[styles.mapContainer, { borderColor: colors.border }]}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: latitude,
              longitude: longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <Marker coordinate={{ latitude, longitude }} />
          </MapView>
        </View>
      </MapErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  mapContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  map: {
    width: '100%',
    height: 200,
  },
  mapPlaceholder: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  mapPlaceholderText: {
    fontSize: 14,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 8,
    gap: 6,
  },
  openButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  fallbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    gap: 8,
  },
});
