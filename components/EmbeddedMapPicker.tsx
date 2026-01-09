import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Constants from 'expo-constants';

interface EmbeddedMapPickerProps {
  latitude: number;
  longitude: number;
  onCoordinatesChange: (lat: number, lng: number) => void;
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
  };
}

let MapView: any = null;
let Marker: any = null;

try {
  if (Platform.OS !== 'web') {
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker = maps.Marker;
  }
} catch (e) {
  console.log('react-native-maps not available');
}

export default function EmbeddedMapPicker({
  latitude,
  longitude,
  onCoordinatesChange,
  colors,
}: EmbeddedMapPickerProps) {
  const [searchText, setSearchText] = useState('');
  const [markerPosition, setMarkerPosition] = useState({ latitude, longitude });
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef = useRef<any>(null);
  const webMapRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const autocompleteRef = useRef<any>(null);

  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || Constants.expoConfig?.extra?.googleMapsApiKey || '';

  useEffect(() => {
    setMarkerPosition({ latitude, longitude });
  }, [latitude, longitude]);

  const handleMarkerChange = useCallback((lat: number, lng: number) => {
    setMarkerPosition({ latitude: lat, longitude: lng });
    onCoordinatesChange(lat, lng);
  }, [onCoordinatesChange]);

  const getCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;
      handleMarkerChange(lat, lng);
      
      if (Platform.OS === 'web' && googleMapRef.current) {
        googleMapRef.current.setCenter({ lat, lng });
        if (markerRef.current) {
          markerRef.current.setPosition({ lat, lng });
        }
      } else if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
    } finally {
      setGettingLocation(false);
    }
  };

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
          await importLibrary('places');
          
          google = (window as any).google;
        }
        
        if (!google || !google.maps) {
          throw new Error('Google Maps failed to initialize');
        }
        
        const map = new google.maps.Map(mapElement, {
          center: { lat: latitude || 0, lng: longitude || 0 },
          zoom: latitude && longitude ? 12 : 2,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
        });
        googleMapRef.current = map;

        const marker = new google.maps.Marker({
          position: { lat: latitude || 0, lng: longitude || 0 },
          map: map,
          draggable: true,
        });
        markerRef.current = marker;

        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) {
            handleMarkerChange(pos.lat(), pos.lng());
          }
        });

        map.addListener('click', (e: any) => {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          marker.setPosition({ lat, lng });
          handleMarkerChange(lat, lng);
        });

        setTimeout(() => {
          const searchInput = document.getElementById('map-search-input') as HTMLInputElement;
          if (searchInput) {
            const autocomplete = new google.maps.places.Autocomplete(searchInput, {
              types: ['geocode', 'establishment'],
            });
            autocompleteRef.current = autocomplete;

            autocomplete.addListener('place_changed', () => {
              const place = autocomplete.getPlace();
              if (place.geometry && place.geometry.location) {
                const lat = place.geometry.location.lat();
                const lng = place.geometry.location.lng();
                map.setCenter({ lat, lng });
                map.setZoom(14);
                marker.setPosition({ lat, lng });
                handleMarkerChange(lat, lng);
                setSearchText(place.formatted_address || place.name || '');
              }
            });
          }
        }, 100);

        setMapLoaded(true);
      } catch (error: any) {
        console.error('Error loading Google Maps:', error?.message || error?.toString() || 'Unknown error');
        setMapError(error?.message || 'Failed to load map. Please check your API key.');
      }
    };

    const timer = setTimeout(initWebMap, 50);
    return () => clearTimeout(timer);
  }, [apiKey, latitude, longitude, handleMarkerChange]);

  useEffect(() => {
    if (Platform.OS === 'web' && googleMapRef.current && markerRef.current) {
      const lat = markerPosition.latitude;
      const lng = markerPosition.longitude;
      markerRef.current.setPosition({ lat, lng });
    }
  }, [markerPosition]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.searchRow}>
          <View style={[styles.searchInputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
            <input
              id="map-search-input"
              type="text"
              placeholder="Search for a location..."
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                color: colors.text,
                fontSize: 16,
                padding: '8px 0',
                width: '100%',
              }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </View>
          <Pressable
            style={[styles.locationButton, { backgroundColor: colors.primary }]}
            onPress={getCurrentLocation}
            disabled={gettingLocation}
          >
            {gettingLocation ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="crosshair" size={20} color="#FFFFFF" />
            )}
          </Pressable>
        </View>

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
              height: 300,
              borderRadius: 8,
              display: mapLoaded && !mapError ? 'block' : 'none',
            }}
          />
        </View>

        <View style={styles.coordsRow}>
          <Text style={[styles.coordsLabel, { color: colors.textSecondary }]}>
            Coordinates:
          </Text>
          <Text style={[styles.coordsValue, { color: colors.text }]}>
            {markerPosition.latitude.toFixed(6)}, {markerPosition.longitude.toFixed(6)}
          </Text>
        </View>

        <Text style={[styles.helpText, { color: colors.textSecondary }]}>
          Search for a location, click on the map, or drag the marker to set coordinates
        </Text>
      </View>
    );
  }

  if (!MapView) {
    return (
      <View style={[styles.fallbackContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="map-pin" size={32} color={colors.textSecondary} />
        <Text style={[styles.fallbackText, { color: colors.textSecondary }]}>
          Map not available on this device
        </Text>
        <View style={styles.fallbackInputs}>
          <View style={styles.fallbackInputRow}>
            <Text style={[styles.fallbackInputLabel, { color: colors.text }]}>Lat:</Text>
            <TextInput
              style={[styles.fallbackInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={markerPosition.latitude.toString()}
              onChangeText={(v) => {
                const lat = parseFloat(v);
                if (!isNaN(lat)) handleMarkerChange(lat, markerPosition.longitude);
              }}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.fallbackInputRow}>
            <Text style={[styles.fallbackInputLabel, { color: colors.text }]}>Lng:</Text>
            <TextInput
              style={[styles.fallbackInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={markerPosition.longitude.toString()}
              onChangeText={(v) => {
                const lng = parseFloat(v);
                if (!isNaN(lng)) handleMarkerChange(markerPosition.latitude, lng);
              }}
              keyboardType="numeric"
            />
          </View>
        </View>
        <Pressable
          style={[styles.locationButton, { backgroundColor: colors.primary, marginTop: 12 }]}
          onPress={getCurrentLocation}
          disabled={gettingLocation}
        >
          {gettingLocation ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name="crosshair" size={18} color="#FFFFFF" />
              <Text style={styles.locationButtonText}>Use My Location</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Pressable
          style={[styles.locationButton, { backgroundColor: colors.primary }]}
          onPress={getCurrentLocation}
          disabled={gettingLocation}
        >
          {gettingLocation ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name="crosshair" size={18} color="#FFFFFF" />
              <Text style={styles.locationButtonText}>Use My Location</Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={[styles.mapContainer, { borderColor: colors.border }]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: latitude || 0,
            longitude: longitude || 0,
            latitudeDelta: latitude && longitude ? 0.05 : 50,
            longitudeDelta: longitude && longitude ? 0.05 : 50,
          }}
          onPress={(e: any) => {
            const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
            handleMarkerChange(lat, lng);
          }}
        >
          <Marker
            coordinate={markerPosition}
            draggable
            onDragEnd={(e: any) => {
              const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
              handleMarkerChange(lat, lng);
            }}
          />
        </MapView>
      </View>

      <View style={styles.coordsRow}>
        <Text style={[styles.coordsLabel, { color: colors.textSecondary }]}>
          Coordinates:
        </Text>
        <Text style={[styles.coordsValue, { color: colors.text }]}>
          {markerPosition.latitude.toFixed(6)}, {markerPosition.longitude.toFixed(6)}
        </Text>
      </View>

      <Text style={[styles.helpText, { color: colors.textSecondary }]}>
        Tap on the map or drag the marker to set coordinates
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  locationButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  mapContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  map: {
    width: '100%',
    height: 300,
  },
  mapPlaceholder: {
    width: '100%',
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  mapPlaceholderText: {
    fontSize: 14,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  coordsLabel: {
    fontSize: 14,
  },
  coordsValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  helpText: {
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  fallbackContainer: {
    padding: 20,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
  },
  fallbackText: {
    fontSize: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  fallbackInputs: {
    flexDirection: 'row',
    gap: 16,
  },
  fallbackInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fallbackInputLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  fallbackInput: {
    width: 120,
    height: 40,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
  },
});
