import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { PREMIUM_SERVICES } from '@/constants/services';

const CELL_WIDTH = 80;
const CELL_GAP = 8;
const FADE_WIDTH = 32;

export default function ServicesGrid() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [showRightFade, setShowRightFade] = useState(false);
  const [showLeftFade, setShowLeftFade] = useState(false);

  const layoutWidthRef = useRef(0);
  const contentWidthRef = useRef(0);

  const updateFadeVisibility = useCallback((scrollX: number) => {
    const maxScrollX = contentWidthRef.current - layoutWidthRef.current;
    if (maxScrollX <= 0) {
      setShowLeftFade(false);
      setShowRightFade(false);
      return;
    }
    setShowLeftFade(scrollX > 8);
    setShowRightFade(scrollX < maxScrollX - 8);
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    layoutWidthRef.current = layoutMeasurement.width;
    contentWidthRef.current = contentSize.width;
    updateFadeVisibility(contentOffset.x);
  }, [updateFadeVisibility]);

  const handleContentSizeChange = useCallback((w: number, _h: number) => {
    contentWidthRef.current = w;
    updateFadeVisibility(0);
  }, [updateFadeVisibility]);

  const handleLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    layoutWidthRef.current = e.nativeEvent.layout.width;
    updateFadeVisibility(0);
  }, [updateFadeVisibility]);

  const midpoint = Math.ceil(PREMIUM_SERVICES.length / 2);
  const row1 = PREMIUM_SERVICES.slice(0, midpoint);
  const row2 = PREMIUM_SERVICES.slice(midpoint);

  const fadeColorOpaque = colors.surface || colors.background;
  const fadeColorTransparent = (fadeColorOpaque || '#FFFFFF') + '00';

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
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
      >
        <View style={styles.gridWrapper}>
          {renderRow(row1)}
          {renderRow(row2)}
        </View>
      </ScrollView>

      {showLeftFade && (
        <View style={[styles.fadeLeft, { width: FADE_WIDTH }]} pointerEvents="none">
          <LinearGradient
            colors={[fadeColorOpaque, fadeColorTransparent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      {showRightFade && (
        <View style={[styles.fadeRight, { width: FADE_WIDTH }]} pointerEvents="none">
          <LinearGradient
            colors={[fadeColorTransparent, fadeColorOpaque]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
    position: 'relative',
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
  fadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
  },
  fadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
  },
});
