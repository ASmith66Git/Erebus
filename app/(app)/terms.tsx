import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import ThemedBackground from '@/components/ThemedBackground';

export default function TermsScreen() {
  const { colors } = useTheme();

  const handleBack = () => {
    router.back();
  };

  return (
    <ThemedBackground>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Terms and Conditions</Text>
        <View style={styles.placeholder} />
      </View>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={[styles.lastUpdated, { color: colors.textSecondary }]}>
          Last Updated: January 20, 2026
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>1. Acceptance of Risk</Text>
        <Text style={[styles.paragraph, { color: colors.text }]}>
          Scuba diving, particularly technical diving involving gas blending and decompression planning, is an inherently dangerous activity. By using Leviathan Systems Ltd Erebus Dive Management app (Erebus App), you acknowledge that you are a certified diver and understand the risks of DCI (Decompression Illness), oxygen toxicity, and nitrogen narcosis. Use of this app is at your own sole risk.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>2. No Liability for Calculations</Text>
        <Text style={[styles.paragraph, { color: colors.text }]}>
          The Erebus App provides gas planning and decompression models (e.g., Bühlmann ZHL-16C) for informational and educational purposes only.
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.textSecondary }]}>
          • Strict Liability Waiver: To the maximum extent permitted by law, the Erebus App and its developers shall not be liable for any injury, fatality, or property damage resulting from the use of calculations provided by this app.
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.textSecondary }]}>
          • Math vs. Reality: You acknowledge that mathematical models cannot account for individual physiological variables such as hydration, fatigue, thermal stress, or PFO (Patent Foramen Ovale).
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>3. Requirement for Cross-Verification (Redundancy)</Text>
        <Text style={[styles.paragraph, { color: colors.text }]}>
          This app is not a primary life-support tool.
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.textSecondary }]}>
          • The Rule of Two: You must cross-verify every calculation (MOD, END, Gas Volume, Decompression Stops) against at least one other independent source, such as printed dive tables or a primary dive computer from a different manufacturer.
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.textSecondary }]}>
          • Manual Verification: Users are expected to perform manual "sanity checks" on all gas mixes and planning outputs before entering the water.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>4. Gas Blending & Planning</Text>
        <Text style={[styles.paragraph, { color: colors.text }]}>
          Calculations regarding Nitrox, Trimix, or Heliox are based on ideal gas laws or van der Waals equations.
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.textSecondary }]}>
          • Real-world variables (temperature changes during filling, cylinder impurities, or inaccurate O2/He analyzers) can create discrepancies between the app's plan and your actual gas.
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.textSecondary }]}>
          • Always analyze your gas with a calibrated analyzer. Never dive a gas based solely on an app calculation.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>5. Not a Substitute for Training</Text>
        <Text style={[styles.paragraph, { color: colors.text }]}>
          This app does not grant "certification" or "competency." Using the planning features for dives beyond your current level of training (e.g., using the Trimix planner when only Open Water certified) is a violation of these terms and a life-threatening practice.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.primary }]}>6. "As-Is" Software Warranty</Text>
        <Text style={[styles.paragraph, { color: colors.text }]}>
          We provide this software "as-is." While we strive for 100% mathematical accuracy, we do not warrant that the app will be error-free or that its calculations will prevent decompression sickness. Software bugs, sensor errors, or OS updates can affect app performance.
        </Text>

        <View style={styles.footer} />
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  lastUpdated: {
    fontSize: 14,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
    paddingLeft: 8,
  },
  footer: {
    height: 40,
  },
});
