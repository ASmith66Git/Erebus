import React, { ReactNode } from 'react';
import { ImageBackground, StyleSheet, View, ViewStyle } from 'react-native';
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
    <ImageBackground
      source={backgroundImage}
      style={[styles.container, style]}
      resizeMode="cover"
    >
      <View style={[styles.overlay, { backgroundColor: colors.background + 'E6' }]}>
        {children}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
});
