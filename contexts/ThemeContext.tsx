import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, ThemeColors, ColorScheme } from '@/constants/Colors';
import { useSettings, DEFAULT_THEME_COLOR } from '@/contexts/SettingsContext';

interface ThemeContextType {
  colorScheme: ColorScheme;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (scheme: ColorScheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [colorScheme, setColorScheme] = useState<ColorScheme>(systemColorScheme ?? 'light');
  const { themeColor } = useSettings();

  useEffect(() => {
    loadStoredTheme();
  }, []);

  async function loadStoredTheme() {
    try {
      const storedTheme = await AsyncStorage.getItem('theme');
      if (storedTheme === 'light' || storedTheme === 'dark') {
        setColorScheme(storedTheme);
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  }

  async function setTheme(scheme: ColorScheme) {
    try {
      await AsyncStorage.setItem('theme', scheme);
      setColorScheme(scheme);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  }

  function toggleTheme() {
    setTheme(colorScheme === 'light' ? 'dark' : 'light');
  }

  const colors = useMemo(() => {
    const baseColors = Colors[colorScheme];
    const primaryColor = themeColor || DEFAULT_THEME_COLOR;
    return {
      ...baseColors,
      primary: primaryColor,
      tint: primaryColor,
      tabIconSelected: primaryColor,
      accent: primaryColor,
    };
  }, [colorScheme, themeColor]);

  const value: ThemeContextType = {
    colorScheme,
    colors,
    isDark: colorScheme === 'dark',
    toggleTheme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
