import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings, languageOptions, themeColorOptions, UnitSystem, DateFormat, Language } from '@/contexts/SettingsContext';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

const dateFormatOptions: { value: DateFormat; label: string; example: string }[] = [
  { value: 'DMY', label: 'Day / Month / Year', example: '25/12/2024' },
  { value: 'MDY', label: 'Month / Day / Year', example: '12/25/2024' },
  { value: 'YMD', label: 'Year - Month - Day', example: '2024-12-25' },
];

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { units, setUnits, dateFormat, setDateFormat, language, setLanguage, themeColor, setThemeColor } = useSettings();
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  const selectedLanguage = languageOptions.find(l => l.value === language);

  return (
    <ThemedBackground>
      <PageHeader title="Settings" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Units</Text>
          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            Choose your preferred measurement system
          </Text>
          <View style={styles.optionGroup}>
            <Pressable
              style={[
                styles.optionButton,
                { borderColor: colors.border },
                units === 'metric' && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setUnits('metric')}
            >
              <Text style={[styles.optionText, { color: units === 'metric' ? '#FFF' : colors.text }]}>
                Metric
              </Text>
              <Text style={[styles.optionSubtext, { color: units === 'metric' ? '#FFF' : colors.textSecondary }]}>
                meters, °C, bar
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.optionButton,
                { borderColor: colors.border },
                units === 'imperial' && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setUnits('imperial')}
            >
              <Text style={[styles.optionText, { color: units === 'imperial' ? '#FFF' : colors.text }]}>
                Imperial
              </Text>
              <Text style={[styles.optionSubtext, { color: units === 'imperial' ? '#FFF' : colors.textSecondary }]}>
                feet, °F, PSI
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Date Format</Text>
          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            Choose how dates are displayed
          </Text>
          <View style={styles.dateOptions}>
            {dateFormatOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.dateOption,
                  { borderColor: colors.border },
                  dateFormat === option.value && { backgroundColor: colors.primary + '20', borderColor: colors.primary },
                ]}
                onPress={() => setDateFormat(option.value)}
              >
                <View style={styles.dateOptionContent}>
                  <View style={styles.radioOuter}>
                    {dateFormat === option.value && (
                      <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <View style={styles.dateOptionText}>
                    <Text style={[styles.dateOptionLabel, { color: colors.text }]}>{option.label}</Text>
                    <Text style={[styles.dateOptionExample, { color: colors.textSecondary }]}>{option.example}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Language</Text>
          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            Select your preferred language
          </Text>
          <Pressable
            style={[styles.languageSelector, { borderColor: colors.border }]}
            onPress={() => setShowLanguagePicker(true)}
          >
            <Text style={[styles.languageText, { color: colors.text }]}>
              {selectedLanguage?.label || 'English'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Theme Color</Text>
          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            Choose your accent color
          </Text>
          <View style={styles.colorGrid}>
            {themeColorOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.colorOption,
                  { backgroundColor: option.value },
                  themeColor === option.value && styles.colorOptionSelected,
                ]}
                onPress={() => setThemeColor(option.value)}
              >
                {themeColor === option.value && (
                  <Ionicons name="checkmark" size={24} color="#FFF" />
                )}
              </Pressable>
            ))}
          </View>
          <Text style={[styles.colorLabel, { color: colors.textSecondary }]}>
            {themeColorOptions.find(c => c.value === themeColor)?.label || 'Red'}
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showLanguagePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLanguagePicker(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Language</Text>
              <Pressable onPress={() => setShowLanguagePicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <FlatList
              data={languageOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.languageOption,
                    { borderBottomColor: colors.border },
                    language === item.value && { backgroundColor: colors.primary + '20' },
                  ]}
                  onPress={() => {
                    setLanguage(item.value);
                    setShowLanguagePicker(false);
                  }}
                >
                  <Text style={[styles.languageOptionText, { color: colors.text }]}>{item.label}</Text>
                  {language === item.value && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 16,
  },
  optionGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  optionSubtext: {
    fontSize: 12,
  },
  dateOptions: {
    gap: 8,
  },
  dateOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  dateOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#888',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dateOptionText: {
    flex: 1,
  },
  dateOptionLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  dateOptionExample: {
    fontSize: 12,
    marginTop: 2,
  },
  languageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  languageText: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  languageOptionText: {
    fontSize: 16,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  colorLabel: {
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
});
