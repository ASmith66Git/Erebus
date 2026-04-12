import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { PREMIUM_SERVICES } from '@/constants/services';

const CELL_WIDTH = 80;
const CELL_GAP = 8;

export default function ServicesGrid() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const midpoint = Math.ceil(PREMIUM_SERVICES.length / 2);
  const row1 = PREMIUM_SERVICES.slice(0, midpoint);
  const row2 = PREMIUM_SERVICES.slice(midpoint);

  const renderRow = (items: typeof row1) => (
    <View style={styles.row}>
      {items.map((service, index) => (
        <View key={index} style={styles.cell}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name={service.icon} size={22} color={colors.primary} />
          </View>
          <Text
            style={[styles.label, { color: colors.text }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t(service.labelKey)}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
    >
      <View style={styles.gridWrapper}>
        {renderRow(row1)}
        {renderRow(row2)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  scrollContent: {
    paddingHorizontal: 4,
  },
  gridWrapper: {
    gap: CELL_GAP,
  },
  row: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  cell: {
    width: CELL_WIDTH,
    alignItems: 'center',
    gap: 4,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 14,
  },
});
