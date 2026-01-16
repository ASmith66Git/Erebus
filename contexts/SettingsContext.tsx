import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type UnitSystem = 'metric' | 'imperial';
type DateFormat = 'YMD' | 'DMY' | 'MDY';
type Language = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'nl' | 'ja' | 'zh';

interface SettingsContextType {
  units: UnitSystem;
  setUnits: (units: UnitSystem) => void;
  dateFormat: DateFormat;
  setDateFormat: (format: DateFormat) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  formatDepth: (meters: number | null) => string;
  formatTemperature: (celsius: number | null) => string;
  formatDate: (date: Date | string) => string;
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

export { languageOptions };
export type { UnitSystem, DateFormat, Language };

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [units, setUnitsState] = useState<UnitSystem>('metric');
  const [dateFormat, setDateFormatState] = useState<DateFormat>('DMY');
  const [language, setLanguageState] = useState<Language>('en');
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
        if (settings.language) setLanguageState(settings.language);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const saveSettings = async (newSettings: Partial<{ units: UnitSystem; dateFormat: DateFormat; language: Language }>) => {
    try {
      const current = { units, dateFormat, language, ...newSettings };
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
    saveSettings({ language: newLang });
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

  return (
    <SettingsContext.Provider
      value={{
        units,
        setUnits,
        dateFormat,
        setDateFormat,
        language,
        setLanguage,
        formatDepth,
        formatTemperature,
        formatDate,
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
