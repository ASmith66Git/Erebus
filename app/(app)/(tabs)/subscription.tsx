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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useSubscription, REVENUECAT_ENTITLEMENT_IDENTIFIER } from '@/lib/revenuecat';
import ThemedBackground from '@/components/ThemedBackground';
import ServicesGrid from '@/components/ServicesGrid';

const PACKAGE_NAME = 'com.erebus.diveapp';

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isTrialActive, trialDaysRemaining } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { customerInfo, isSubscribed } = useSubscription();

  const activeEntitlement = customerInfo?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER];
  const allEntitlement = customerInfo?.entitlements.all?.[REVENUECAT_ENTITLEMENT_IDENTIFIER];
  const entitlement = activeEntitlement ?? allEntitlement;

  const periodType = entitlement?.periodType;
  const willRenew = entitlement?.willRenew;
  const billingIssueDetectedAt = entitlement?.billingIssueDetectedAt;
  const unsubscribeDetectedAt = entitlement?.unsubscribeDetectedAt;
  const originalPurchaseDate = entitlement?.originalPurchaseDate;
  const latestPurchaseDate = entitlement?.latestPurchaseDate;
  const managementURL = customerInfo?.managementURL;

  const hasBillingIssue = !!billingIssueDetectedAt;
  const isGracePeriod = hasBillingIssue && !!activeEntitlement;
  const isBillingIssueExpired = hasBillingIssue && !activeEntitlement;
  const isTrial = periodType === 'TRIAL' && !!activeEntitlement;
  const isCancelled = !!unsubscribeDetectedAt && !hasBillingIssue;

  const getTrialDaysRemaining = () => {
    if (!activeEntitlement?.expirationDate) return 0;
    const now = new Date();
    const expiry = new Date(activeEntitlement.expirationDate);
    const diffMs = expiry.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  const openSubscriptionSettings = () => {
    if (managementURL) {
      Linking.openURL(managementURL);
      return;
    }
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else if (Platform.OS === 'android') {
      Linking.openURL(`https://play.google.com/store/account/subscriptions?package=${PACKAGE_NAME}`);
    }
  };

  const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  };

  const getPeriodTypeLabel = () => {
    if (isGracePeriod) return t('subscription.periodTypeGrace');
    switch (periodType) {
      case 'TRIAL': return t('subscription.periodTypeTrial');
      case 'INTRO': return t('subscription.periodTypeIntro');
      case 'PREPAID':
      case 'NORMAL':
      default: return t('subscription.periodTypeNormal');
    }
  };

  const renderStatusBadge = () => {
    if (isBillingIssueExpired) {
      return (
        <View style={[styles.statusBadge, { backgroundColor: '#FF3B3020' }]}>
          <Ionicons name="warning" size={20} color="#FF3B30" />
          <Text style={[styles.statusText, { color: '#FF3B30' }]}>{t('subscription.statusBillingIssue')}</Text>
        </View>
      );
    }
    if (isSubscribed && activeEntitlement) {
      if (isGracePeriod) {
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#FF9F0020' }]}>
            <Ionicons name="time-outline" size={20} color="#FF9F00" />
            <Text style={[styles.statusText, { color: '#FF9F00' }]}>{t('subscription.statusGracePeriod')}</Text>
          </View>
        );
      }
      if (isCancelled && activeEntitlement.expirationDate) {
        return (
          <View style={[styles.statusBadge, { backgroundColor: '#FF9F0020' }]}>
            <Ionicons name="close-circle" size={20} color="#FF9F00" />
            <Text style={[styles.statusText, { color: '#FF9F00' }]}>
              {t('subscription.statusCancelledAccess', { date: formatDate(activeEntitlement.expirationDate) })}
            </Text>
          </View>
        );
      }
      if (isTrial) {
        const days = getTrialDaysRemaining();
        return (
          <View style={[styles.statusBadge, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={[styles.statusText, { color: colors.primary }]}>
              {t('subscription.statusTrialDays', { count: days })}
            </Text>
          </View>
        );
      }
      return (
        <View style={[styles.statusBadge, { backgroundColor: '#4CAF5020' }]}>
          <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
          <Text style={[styles.statusText, { color: '#4CAF50' }]}>{t('trial.statusActive')}</Text>
        </View>
      );
    }
    if (isTrialActive) {
      return (
        <View style={[styles.statusBadge, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="time-outline" size={20} color={colors.primary} />
          <Text style={[styles.statusText, { color: colors.primary }]}>
            {t('trial.statusTrial', { count: trialDaysRemaining })}
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor: '#FF9F0020' }]}>
        <Ionicons name="alert-circle" size={20} color="#FF9F00" />
        <Text style={[styles.statusText, { color: '#FF9F00' }]}>{t('trial.statusInactive')}</Text>
      </View>
    );
  };

  const renderWarningBanner = () => {
    if (isBillingIssueExpired) {
      return (
        <View style={[styles.warningBanner, { backgroundColor: '#FF3B3015', borderColor: '#FF3B3040' }]}>
          <Ionicons name="warning" size={22} color="#FF3B30" />
          <Text style={[styles.warningText, { color: '#FF3B30' }]}>
            {t('subscription.billingIssueBanner')}
          </Text>
        </View>
      );
    }

    if (!isSubscribed || !activeEntitlement) return null;

    if (isGracePeriod) {
      return (
        <View style={[styles.warningBanner, { backgroundColor: '#FF9F0015', borderColor: '#FF9F0040' }]}>
          <Ionicons name="alert-circle" size={22} color="#FF9F00" />
          <Text style={[styles.warningText, { color: '#FF9F00' }]}>
            {t('subscription.gracePeriodBanner')}
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <ThemedBackground>
      <View style={[styles.header, Platform.OS === 'ios' && { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace('/(app)/(tabs)/profile'); } }}
          style={styles.backButton}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('subscription.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {renderWarningBanner()}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="diamond-outline" size={48} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{t('subscription.erebusPremium')}</Text>

          {renderStatusBadge()}

          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('subscription.manageSubscription')}
          </Text>

          {entitlement && (isSubscribed || isBillingIssueExpired) && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.detailsSection}>
                {entitlement.expirationDate && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      {willRenew ? t('subscription.renewsLabel') : t('subscription.expiresLabel')}
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatDate(entitlement.expirationDate)}
                    </Text>
                  </View>
                )}
                {entitlement.productIdentifier && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('subscription.planLabel')}</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {entitlement.productIdentifier.includes('annual') ? t('subscription.planAnnual') : t('subscription.planMonthly')}
                    </Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('subscription.periodTypeLabel')}</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {getPeriodTypeLabel()}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('subscription.autoRenewLabel')}</Text>
                  <Text style={[styles.detailValue, { color: willRenew ? '#4CAF50' : '#FF9F00' }]}>
                    {willRenew ? t('subscription.autoRenewOn') : t('subscription.autoRenewOff')}
                  </Text>
                </View>
                {originalPurchaseDate && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('subscription.originalPurchaseLabel')}</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatDate(originalPurchaseDate)}
                    </Text>
                  </View>
                )}
                {latestPurchaseDate && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('subscription.latestPurchaseLabel')}</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatDate(latestPurchaseDate)}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.infoSection}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>{t('subscription.subscriptionBenefits')}</Text>
            <ServicesGrid />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {isNativePlatform && (
            <Pressable
              style={[styles.manageButton, { backgroundColor: colors.primary }]}
              onPress={openSubscriptionSettings}
            >
              {!managementURL && (
                <Ionicons
                  name={Platform.OS === 'ios' ? 'logo-apple' : 'logo-google-playstore'}
                  size={20}
                  color="#FFFFFF"
                />
              )}
              <Text style={styles.manageButtonText}>
                {managementURL
                  ? t('subscription.manageSubscription')
                  : t('subscription.manageInStore', { store: Platform.OS === 'ios' ? t('subscription.appStore') : t('subscription.googlePlay') })}
              </Text>
              <Feather name="external-link" size={16} color="#FFFFFF" />
            </Pressable>
          )}

          {!isNativePlatform && (
            <View style={[styles.webNotice, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
              <Text style={[styles.webNoticeText, { color: colors.textSecondary }]}>
                {t('subscription.webNotice')}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.helpCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.helpTitle, { color: colors.text }]}>{t('subscription.needHelp')}</Text>
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            {t('subscription.helpText')}
          </Text>
          <Pressable
            style={[styles.helpButton, { borderColor: colors.primary }]}
            onPress={() => Linking.openURL('mailto:support@erebus.app')}
          >
            <Ionicons name="mail-outline" size={18} color={colors.primary} />
            <Text style={[styles.helpButtonText, { color: colors.primary }]}>{t('subscription.contactSupport')}</Text>
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
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  detailsSection: {
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoSection: {
    gap: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 12,
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
