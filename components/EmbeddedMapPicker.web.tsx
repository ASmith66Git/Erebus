import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
      
      if (googleMapRef.current) {
        googleMapRef.current.setCenter({ lat, lng });
        if (markerRef.current) {
          markerRef.current.setPosition({ lat, lng });
        }
      }
    } catch (error) {
      console.error('Error getting location:', error);
    } finally {
      setGettingLocation(false);
    }
  };

  useEffect(() => {
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
        
        let loader;
        try {
          loader = await import('@googlemaps/js-api-loader');
        } catch (importError) {
          console.error('Failed to load Google Maps loader:', importError);
          setMapError('Map unavailable on this browser');
          return;
        }
        
        const { setOptions, importLibrary } = loader;
        
        setOptions({
          key: apiKey,
          v: 'weekly',
        });
        
        if (!google || !google.maps) {
          await importLibrary('maps');
          google = (window as any).google;
        }
        
        if (!google?.maps?.places) {
          console.log('Loading Places library...');
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

        if (!document.getElementById('pac-container-styles')) {
          const style = document.createElement('style');
          style.id = 'pac-container-styles';
          style.textContent = `
            .pac-container {
              z-index: 99999 !important;
              background-color: #fff;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.2);
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .pac-item {
              padding: 10px 12px;
              cursor: pointer;
              font-size: 14px;
            }
            .pac-item:hover {
              background-color: #f0f0f0;
            }
            .pac-item-query {
              font-weight: 500;
            }
          `;
          document.head.appendChild(style);
        }

        setTimeout(() => {
          const searchInput = document.getElementById('map-search-input') as HTMLInputElement;
          const placesGoogle = (window as any).google;
          
          console.log('Setting up Places Autocomplete:', { 
            hasInput: !!searchInput, 
            hasPlaces: !!placesGoogle?.maps?.places,
            hasAutocomplete: !!placesGoogle?.maps?.places?.Autocomplete 
          });
          
          if (searchInput && placesGoogle?.maps?.places?.Autocomplete) {
            try {
              const autocomplete = new placesGoogle.maps.places.Autocomplete(searchInput, {
                types: ['geocode', 'establishment'],
                fields: ['geometry', 'formatted_address', 'name'],
              });
              autocompleteRef.current = autocomplete;
              
              autocomplete.bindTo('bounds', map);
              
              console.log('Places Autocomplete initialized successfully');

              autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                console.log('Place selected:', place);
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
            } catch (e) {
              console.error('Places Autocomplete error:', e);
            }
          } else {
            console.warn('Places Autocomplete not available - check if Places API is enabled in Google Cloud Console');
          }
        }, 500);

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
    if (googleMapRef.current && markerRef.current) {
      const lat = markerPosition.latitude;
      const lng = markerPosition.longitude;
      markerRef.current.setPosition({ lat, lng });
    }
  }, [markerPosition]);

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
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  mapContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
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
    fontFamily: 'monospace',
  },
  helpText: {
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
