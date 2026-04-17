import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ImageBackground, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';

const darkCoralBackground = require('@/assets/images/coral-background-dark.jpg');

export default function PrivacyScreen() {
  const { colors } = useTheme();

  return (
    <ImageBackground
      source={darkCoralBackground}
      style={[styles.backgroundImage, Platform.OS === 'web' && styles.webBackground]}
      imageStyle={Platform.OS === 'web' ? styles.webBackgroundImage : undefined}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.headerTitle}>Privacy Policy</Text>
            <View style={styles.placeholder} />
          </View>
          <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.lastUpdated}>
              Last Updated: January 20, 2026
            </Text>

            <Text style={styles.intro}>
              At Erebus, we believe your dive data is personal. Whether it's your bottom time, your gas mixes, or your favorite dive sites, that information belongs to you. This policy outlines how we handle your data with a "user-first" approach.
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.primary }]}>1. Data Ownership & Minimization</Text>
            <Text style={styles.paragraph}>
              You own your data. We follow a strict principle of Data Minimization: we only collect what is strictly necessary to run the app.
            </Text>
            <Text style={styles.bulletPoint}>
              • Logs & Plans: Stored to provide the core service.
            </Text>
            <Text style={styles.bulletPoint}>
              • Location Data: Only used to log dive sites at your request.
            </Text>
            <Text style={styles.bulletPoint}>
              • Health Data: If you sync dive computer data (e.g., heart rate), this is used only for your personal log history and is never shared.
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.primary }]}>2. GDPR (European Union) Compliance</Text>
            <Text style={styles.paragraph}>
              If you are located in the European Economic Area (EEA), the General Data Protection Regulation (GDPR) gives you specific rights:
            </Text>
            <Text style={styles.bulletPoint}>
              • Lawful Basis: We process your data based on Contractual Necessity (to provide the app services you signed up for) and Consent (for optional features like location tracking).
            </Text>
            <Text style={styles.bulletPoint}>
              • Your Rights: You have the right to Access your data, Rectify (fix) errors, Erasure (the right to be forgotten), and Data Portability (exporting your logs in a standard format like CSV or JSON).
            </Text>
            <Text style={styles.bulletPoint}>
              • Data Transfer: Your data is stored on secure servers. If transferred outside the EEA, we ensure it is protected by standard contractual clauses.
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.primary }]}>3. CCPA/CPRA (California, USA) Compliance</Text>
            <Text style={styles.paragraph}>
              If you are a California resident, the California Consumer Privacy Act (including the 2026 CPRA updates) provides you with the following:
            </Text>
            <Text style={styles.bulletPoint}>
              • Right to Know: You can request a disclosure of what personal information we collect and how it is used.
            </Text>
            <Text style={styles.bulletPoint}>
              • No Sale or Sharing: We do not sell or share your personal information with third parties for cross-contextual behavioral advertising.
            </Text>
            <Text style={styles.bulletPoint}>
              • Right to Limit: You have the right to limit the use of "Sensitive Personal Information" (like precise geolocation or health data). Our app defaults to the most restrictive settings.
            </Text>
            <Text style={styles.bulletPoint}>
              • Opt-Out Confirmation: If you choose to opt-out of any non-essential data collection, our app will provide a visible "Opt-Out Honored" signal in your settings.
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.primary }]}>4. Automated Decision-Making (ADMT)</Text>
            <Text style={styles.paragraph}>
              We do not use automated algorithms to make "significant decisions" that affect your legal or financial status. Any decompression calculations or gas planning tools provided are for informational purposes only and are based on standard mathematical models (like Buhlmann ZHL-16C), not opaque AI profiles.
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.primary }]}>5. How to Exercise Your Rights</Text>
            <Text style={styles.paragraph}>
              To request a copy of your data, ask for deletion, or correct an error, please:
            </Text>
            <Text style={styles.bulletPoint}>
              • Go to Settings {'>'} Privacy within the app.
            </Text>
            <Text style={styles.bulletPoint}>
              • Or email us at: privacy@erebusdive.com
            </Text>
            <Text style={styles.paragraph}>
              We will respond to all verified requests within 30 days.
            </Text>

            <Text style={[styles.sectionTitle, { color: colors.primary }]}>6. Data Security</Text>
            <Text style={styles.paragraph}>
              We use industry-standard encryption to protect your dive logs. We do not store your data longer than is necessary to provide the service or until you request its deletion.
            </Text>

            <View style={styles.footer} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
  },
  webBackground: {
    width: '100%',
    height: '100%',
  },
  webBackgroundImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  safeArea: {
    flex: 1,
    ...(Platform.OS === 'web' ? { width: '100%', maxWidth: 560, alignSelf: 'center' as const } : {}),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
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
    color: 'rgba(255,255,255,0.6)',
  },
  intro: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
    color: '#FFFFFF',
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
    color: '#FFFFFF',
  },
  bulletPoint: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
    paddingLeft: 8,
    color: 'rgba(255,255,255,0.8)',
  },
  footer: {
    height: 40,
  },
});
