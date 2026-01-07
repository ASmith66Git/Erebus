const primaryColor = '#0077B6';
const primaryDark = '#00B4D8';
const accentColor = '#00D9FF';

export const Colors = {
  light: {
    text: '#1A1A2E',
    textSecondary: '#4A4A6A',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    primary: primaryColor,
    accent: accentColor,
    tint: primaryColor,
    icon: '#5A6268',
    tabIconDefault: '#5A6268',
    tabIconSelected: primaryColor,
    border: '#E0E0E0',
    error: '#DC3545',
    success: '#28A745',
    headerBackground: '#FFFFFF',
    cardBackground: '#FFFFFF',
  },
  dark: {
    text: '#E8E8E8',
    textSecondary: '#A0A0A0',
    background: '#0D1B2A',
    surface: '#1B2838',
    primary: primaryDark,
    accent: accentColor,
    tint: primaryDark,
    icon: '#8B9298',
    tabIconDefault: '#8B9298',
    tabIconSelected: primaryDark,
    border: '#2D3E50',
    error: '#FF6B6B',
    success: '#4CAF50',
    headerBackground: '#1B2838',
    cardBackground: '#1B2838',
  },
};

export type ColorScheme = 'light' | 'dark';
export type ThemeColors = typeof Colors.light;
