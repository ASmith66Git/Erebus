const primaryColor = '#D22F00';
const primaryDark = '#D22F00';
const accentColor = '#E84B1C';

export const Colors = {
  light: {
    text: '#000000',
    textSecondary: '#4A4A4A',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    primary: primaryColor,
    accent: accentColor,
    tint: primaryColor,
    icon: '#333333',
    tabIconDefault: '#666666',
    tabIconSelected: primaryColor,
    border: '#E0E0E0',
    error: '#D22F00',
    success: '#28A745',
    headerBackground: '#FFFFFF',
    cardBackground: '#F8F8F8',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#A0A0A0',
    background: '#000000',
    surface: '#0F0F0F',
    primary: primaryDark,
    accent: accentColor,
    tint: primaryDark,
    icon: '#CCCCCC',
    tabIconDefault: '#888888',
    tabIconSelected: primaryDark,
    border: '#2A2A2A',
    error: '#FF4D6A',
    success: '#4CAF50',
    headerBackground: '#0A0A0A',
    cardBackground: '#0F0F0F',
  },
};

export type ColorScheme = 'light' | 'dark';
export type ThemeColors = typeof Colors.light;
