import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import ThemedBackground from '@/components/ThemedBackground';

const PACKAGE_NAME = 'com.erebus.diveapp';

export default function SubscriptionScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const openSubscriptionSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else if (Platform.OS === 'android') {
      Linking.openURL(`https://play.google.com/store/account/subscriptions?package=${PACKAGE_NAME}`);
    }
  };

  const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';

  return (
    <ThemedBackground>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Subscription</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="diamond-outline" size={48} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Erebus Premium</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Manage your subscription and billing
          </Text>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.infoSection}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Subscription Benefits</Text>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={[styles.benefitText, { color: colors.textSecondary }]}>Unlimited dive log storage</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={[styles.benefitText, { color: colors.textSecondary }]}>Advanced dive planning tools</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={[styles.benefitText, { color: colors.textSecondary }]}>Cloud backup and sync</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={[styles.benefitText, { color: colors.textSecondary }]}>Priority support</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {isNativePlatform ? (
            <>
              <Text style={[styles.manageText, { color: colors.textSecondary }]}>
                Your subscription is managed through the {Platform.OS === 'ios' ? 'App Store' : 'Google Play Store'}. 
                Tap the button below to view, modify, or cancel your subscription.
              </Text>

              <Pressable
                style={[styles.manageButton, { backgroundColor: colors.primary }]}
                onPress={openSubscriptionSettings}
              >
                <Ionicons 
                  name={Platform.OS === 'ios' ? 'logo-apple' : 'logo-google-playstore'} 
                  size={20} 
                  color="#FFFFFF" 
                />
                <Text style={styles.manageButtonText}>
                  Manage in {Platform.OS === 'ios' ? 'App Store' : 'Google Play'}
                </Text>
                <Feather name="external-link" size={16} color="#FFFFFF" />
              </Pressable>
            </>
          ) : (
            <View style={[styles.webNotice, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
              <Text style={[styles.webNoticeText, { color: colors.textSecondary }]}>
                To manage your subscription, please open the Erebus app on your iOS or Android device 
                and navigate to this screen. Subscriptions are managed through the App Store or Google Play Store.
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.helpCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.helpTitle, { color: colors.text }]}>Need Help?</Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            If you have any questions about your subscription or billing, please contact our support team.
          </Text>
          <Pressable
            style={[styles.helpButton, { borderColor: colors.primary }]}
            onPress={() => Linking.openURL('mailto:support@erebus.app')}
          >
            <Ionicons name="mail-outline" size={18} color={colors.primary} />
            <Text style={[styles.helpButtonText, { color: colors.primary }]}>Contact Support</Text>
          </Pressable>
        </View>
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
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  infoSection: {
    gap: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  benefitText: {
    fontSize: 14,
  },
  manageText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  manageButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  webNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  webNoticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  helpCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  helpButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
