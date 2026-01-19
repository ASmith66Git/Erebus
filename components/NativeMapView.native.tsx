import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';

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

interface NativeMapViewProps {
  sites: DiveSite[];
  selectedSite: DiveSite | null;
  onMarkerPress: (site: DiveSite) => void;
  onSitePress: () => void;
  onMapReady: () => void;
  colors: {
    primary: string;
    text: string;
    textSecondary: string;
    cardBackground: string;
    border: string;
  };
}

export default function NativeMapView({
  sites,
  selectedSite,
  onMarkerPress,
  onSitePress,
  onMapReady,
  colors,
}: NativeMapViewProps) {
  const getInitialRegion = () => {
    if (sites.length === 0) {
      return {
        latitude: 0,
        longitude: 0,
        latitudeDelta: 100,
        longitudeDelta: 100,
      };
    }

    let minLat = sites[0].latitude!;
    let maxLat = sites[0].latitude!;
    let minLng = sites[0].longitude!;
    let maxLng = sites[0].longitude!;

    sites.forEach(site => {
      if (site.latitude != null && site.longitude != null) {
        minLat = Math.min(minLat, site.latitude);
        maxLat = Math.max(maxLat, site.latitude);
        minLng = Math.min(minLng, site.longitude);
        maxLng = Math.max(maxLng, site.longitude);
      }
    });

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const latDelta = Math.max((maxLat - minLat) * 1.5, 0.5);
    const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.5);

    return {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  };

  return (
    <View style={styles.mapWrapper}>
      <MapView
        style={styles.nativeMap}
        initialRegion={getInitialRegion()}
        mapType="terrain"
        showsUserLocation={true}
        showsMyLocationButton={true}
        onMapReady={onMapReady}
      >
        {sites.map(site => (
          site.latitude != null && site.longitude != null ? (
            <Marker
              key={site.id}
              coordinate={{
                latitude: site.latitude,
                longitude: site.longitude,
              }}
              title={site.name}
              description={[site.site_type, site.region, site.country].filter(Boolean).join(' • ')}
              pinColor={colors.primary}
              onPress={() => onMarkerPress(site)}
              onCalloutPress={onSitePress}
            />
          ) : null
        ))}
      </MapView>
      {selectedSite && (
        <Pressable 
          style={[styles.selectedCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
          onPress={onSitePress}
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
  );
}

const styles = StyleSheet.create({
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  nativeMap: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  selectedCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  selectedCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  siteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 12,
    marginTop: 2,
  },
});
