import React, { ReactNode } from 'react';
import { Image, StyleSheet, View, ViewStyle, Platform } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

interface ThemedBackgroundProps {
  children: ReactNode;
  style?: ViewStyle;
  showImage?: boolean;
}

export default function ThemedBackground({ 
  children, 
  style,
  showImage = true 
}: ThemedBackgroundProps) {
  const { colors, backgroundImage } = useTheme();

  if (!showImage) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, style]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }, style]}>
      <Image
        source={backgroundImage}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
});
