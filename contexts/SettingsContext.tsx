import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/services/i18n';

type UnitSystem = 'metric' | 'imperial';
type DateFormat = 'YMD' | 'DMY' | 'MDY';
type Language = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'nl' | 'ja' | 'zh';
type ThemeColor = string;

interface QuickActionOption {
  id: string;
  icon: string;
  label: string;
  route: string;
}

const QUICK_ACTION_OPTIONS: QuickActionOption[] = [
  { id: 'home', icon: 'home', label: 'Home', route: '/(app)/(tabs)' },
  { id: 'dive-logs', icon: 'journal', label: 'Dive Logs', route: '/(app)/(tabs)/dive-logs' },
  { id: 'dive-sites', icon: 'location', label: 'Dive Sites', route: '/(app)/(tabs)/dive-sites' },
  { id: 'gear-profiles', icon: 'build', label: 'Gear Profiles', route: '/(app)/(tabs)/gear-profiles' },
  { id: 'dive-buddies', icon: 'people', label: 'Dive Buddies', route: '/(app)/(tabs)/dive-buddies' },
  { id: 'dive-planning', icon: 'analytics', label: 'Dive Planning', route: '/(app)/(tabs)/dive-planning' },
  { id: 'gas-calculator', icon: 'flask', label: 'Gas', route: '/(app)/(tabs)/gas-calculator' },
  { id: 'photos', icon: 'images', label: 'Photos', route: '/(app)/(tabs)/photos' },
  { id: 'certifications', icon: 'ribbon', label: 'Certifications', route: '/(app)/(tabs)/certifications' },
  { id: 'dive-trips', icon: 'airplane', label: 'Dive Trips', route: '/(app)/(tabs)/dive-trips' },
  { id: 'profile', icon: 'person', label: 'Profile', route: '/(app)/(tabs)/profile' },
  { id: 'explore', icon: 'compass', label: 'Explore Sites', route: '/(app)/(tabs)/explore' },
  { id: 'manual-dive', icon: 'add-circle', label: 'Log Dive', route: '/(app)/(tabs)/manual-dive-entry' },
];

const DEFAULT_QUICK_ACTIONS = ['manual-dive', 'explore', 'dive-trips'];

interface SettingsContextType {
  units: UnitSystem;
  setUnits: (units: UnitSystem) => void;
  dateFormat: DateFormat;
  setDateFormat: (format: DateFormat) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
  quickActions: string[];
  setQuickActions: (actions: string[]) => void;
  getQuickActionOptions: () => QuickActionOption[];
  getSelectedQuickActions: () => QuickActionOption[];
  formatDepth: (meters: number | null) => string;
  formatTemperature: (celsius: number | null) => string;
  formatDate: (date: Date | string) => string;
  formatWeight: (kg: number | null) => string;
  formatVolume: (liters: number | null) => string;
  formatPressure: (bar: number | null) => string;
  getWeightUnit: () => string;
  getVolumeUnit: () => string;
  getPressureUnit: () => string;
  getDepthUnit: () => string;
  convertWeightToMetric: (value: number) => number;
  convertWeightFromMetric: (kg: number) => number;
  convertVolumeToMetric: (value: number) => number;
  convertVolumeFromMetric: (liters: number) => number;
  convertDepthToMetric: (value: number) => number;
  convertDepthFromMetric: (meters: number) => number;
}

const STORAGE_KEY = 'erebus_settings';

const languageOptions: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
];

const themeColorOptions: { value: ThemeColor; label: string }[] = [
  { value: '#D22F00', label: 'Red' },
  { value: '#2563EB', label: 'Blue' },
  { value: '#059669', label: 'Green' },
  { value: '#7C3AED', label: 'Purple' },
  { value: '#D97706', label: 'Orange' },
  { value: '#DB2777', label: 'Pink' },
  { value: '#0891B2', label: 'Teal' },
  { value: '#4F46E5', label: 'Indigo' },
];

const DEFAULT_THEME_COLOR = '#D22F00';

export { languageOptions, themeColorOptions, DEFAULT_THEME_COLOR, QUICK_ACTION_OPTIONS, DEFAULT_QUICK_ACTIONS };
export type { UnitSystem, DateFormat, Language, ThemeColor, QuickActionOption };

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [units, setUnitsState] = useState<UnitSystem>('metric');
  const [dateFormat, setDateFormatState] = useState<DateFormat>('DMY');
  const [language, setLanguageState] = useState<Language>('en');
  const [themeColor, setThemeColorState] = useState<ThemeColor>(DEFAULT_THEME_COLOR);
  const [quickActions, setQuickActionsState] = useState<string[]>(DEFAULT_QUICK_ACTIONS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.units) setUnitsState(settings.units);
        if (settings.dateFormat) setDateFormatState(settings.dateFormat);
        if (settings.language) {
          setLanguageState(settings.language);
          i18n.changeLanguage(settings.language);
        }
        if (settings.themeColor) setThemeColorState(settings.themeColor);
        if (settings.quickActions) setQuickActionsState(settings.quickActions);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const saveSettings = async (newSettings: Partial<{ units: UnitSystem; dateFormat: DateFormat; language: Language; themeColor: ThemeColor; quickActions: string[] }>) => {
    try {
      const current = { units, dateFormat, language, themeColor, quickActions, ...newSettings };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const setUnits = (newUnits: UnitSystem) => {
    setUnitsState(newUnits);
    saveSettings({ units: newUnits });
  };

  const setDateFormat = (newFormat: DateFormat) => {
    setDateFormatState(newFormat);
    saveSettings({ dateFormat: newFormat });
  };

  const setLanguage = (newLang: Language) => {
    setLanguageState(newLang);
    i18n.changeLanguage(newLang);
    saveSettings({ language: newLang });
  };

  const setThemeColor = (newColor: ThemeColor) => {
    setThemeColorState(newColor);
    saveSettings({ themeColor: newColor });
  };

  const setQuickActions = (newActions: string[]) => {
    setQuickActionsState(newActions);
    saveSettings({ quickActions: newActions });
  };

  const getQuickActionOptions = (): QuickActionOption[] => {
    return QUICK_ACTION_OPTIONS;
  };

  const getSelectedQuickActions = (): QuickActionOption[] => {
    return quickActions
      .map(id => QUICK_ACTION_OPTIONS.find(opt => opt.id === id))
      .filter((opt): opt is QuickActionOption => opt !== undefined);
  };

  const formatDepth = (meters: number | null): string => {
    if (meters === null || meters === undefined) return '--';
    if (units === 'imperial') {
      const feet = meters * 3.28084;
      return `${feet.toFixed(1)}ft`;
    }
    return `${meters.toFixed(1)}m`;
  };

  const formatTemperature = (celsius: number | null): string => {
    if (celsius === null || celsius === undefined) return '--';
    if (units === 'imperial') {
      const fahrenheit = (celsius * 9) / 5 + 32;
      return `${fahrenheit.toFixed(0)}°F`;
    }
    return `${celsius.toFixed(0)}°C`;
  };

  const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '--';
    
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();

    switch (dateFormat) {
      case 'YMD':
        return `${year}-${month}-${day}`;
      case 'MDY':
        return `${month}/${day}/${year}`;
      case 'DMY':
      default:
        return `${day}/${month}/${year}`;
    }
  };

  const formatWeight = (kg: number | null): string => {
    if (kg === null || kg === undefined) return '--';
    if (units === 'imperial') {
      const lbs = kg * 2.20462;
      return `${lbs.toFixed(1)} lbs`;
    }
    return `${kg.toFixed(1)} kg`;
  };

  const formatVolume = (liters: number | null): string => {
    if (liters === null || liters === undefined) return '--';
    if (units === 'imperial') {
      const cuft = liters * 0.0353147;
      return `${cuft.toFixed(1)} cuft`;
    }
    return `${liters.toFixed(1)} L`;
  };

  const formatPressure = (bar: number | null): string => {
    if (bar === null || bar === undefined) return '--';
    if (units === 'imperial') {
      const psi = bar * 14.5038;
      return `${psi.toFixed(0)} psi`;
    }
    return `${bar.toFixed(0)} bar`;
  };

  const getWeightUnit = (): string => units === 'imperial' ? 'lbs' : 'kg';
  const getVolumeUnit = (): string => units === 'imperial' ? 'cuft' : 'L';
  const getPressureUnit = (): string => units === 'imperial' ? 'psi' : 'bar';
  const getDepthUnit = (): string => units === 'imperial' ? 'ft' : 'm';

  const convertWeightToMetric = (value: number): number => {
    if (units === 'imperial') {
      return value / 2.20462;
    }
    return value;
  };

  const convertWeightFromMetric = (kg: number): number => {
    if (units === 'imperial') {
      return kg * 2.20462;
    }
    return kg;
  };

  const convertVolumeToMetric = (value: number): number => {
    if (units === 'imperial') {
      return value / 0.0353147;
    }
    return value;
  };

  const convertVolumeFromMetric = (liters: number): number => {
    if (units === 'imperial') {
      return liters * 0.0353147;
    }
    return liters;
  };

  const convertDepthToMetric = (value: number): number => {
    if (units === 'imperial') {
      return value / 3.28084;
    }
    return value;
  };

  const convertDepthFromMetric = (meters: number): number => {
    if (units === 'imperial') {
      return meters * 3.28084;
    }
    return meters;
  };

  return (
    <SettingsContext.Provider
      value={{
        units,
        setUnits,
        dateFormat,
        setDateFormat,
        language,
        setLanguage,
        themeColor,
        setThemeColor,
        quickActions,
        setQuickActions,
        getQuickActionOptions,
        getSelectedQuickActions,
        formatDepth,
        formatTemperature,
        formatDate,
        formatWeight,
        formatVolume,
        formatPressure,
        getWeightUnit,
        getVolumeUnit,
        getPressureUnit,
        getDepthUnit,
        convertWeightToMetric,
        convertWeightFromMetric,
        convertVolumeToMetric,
        convertVolumeFromMetric,
        convertDepthToMetric,
        convertDepthFromMetric,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
