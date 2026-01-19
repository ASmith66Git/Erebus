import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface DiveSite {
  id: number;
  name: string;
  latitude?: number;
  longitude?: number;
  site_type?: string;
  region?: string;
  country?: string;
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

export default function NativeMapView({ colors }: NativeMapViewProps) {
  return (
    <View style={[styles.container, { backgroundColor: colors.cardBackground }]}>
      <Feather name="map" size={48} color={colors.textSecondary} />
      <Text style={[styles.text, { color: colors.text }]}>
        Native map not available on web
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    fontSize: 16,
  },
});
