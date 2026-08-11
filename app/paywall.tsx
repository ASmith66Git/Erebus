import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription, REVENUECAT_ENTITLEMENT_IDENTIFIER } from '@/lib/revenuecat';
import { useTranslation } from 'react-i18next';
import ThemedBackground from '@/components/ThemedBackground';
import ServicesGrid from '@/components/ServicesGrid';

export default function PaywallScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { t } = useTranslation();

  const {
    offerings,
    isLoading,
    isSubscribed,
    purchase,
    restore,
    isPurchasing,
    isRestoring,
    hasError,
    initError,
    retryInit,
  } = useSubscription();

  const [selectedPackageIndex, setSelectedPackageIndex] = useState<number>(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const currentOffering = offerings?.current;
  const packages = currentOffering?.availablePackages || [];

  const monthlyPackage = packages.find(
    (p) => p.packageType === 'MONTHLY' || p.identifier === '$rc_monthly'
  );
  const annualPackage = packages.find(
    (p) => p.packageType === 'ANNUAL' || p.identifier === '$rc_annual'
  );

  const sortedPackages = [annualPackage, monthlyPackage].filter(Boolean) as typeof packages;

  const selectedPackage = sortedPackages[selectedPackageIndex] || sortedPackages[0];

  const getMonthlyEquivalent = (pkg: (typeof packages)[0]) => {
    if (!pkg) return null;
    const price = pkg.product.price;
    if (pkg.packageType === 'ANNUAL' || pkg.identifier === '$rc_annual') {
      return (price / 12).toFixed(2);
    }
    return price.toFixed(2);
  };

  const getSavingsPercent = () => {
    if (!monthlyPackage || !annualPackage) return null;
    const monthlyAnnualized = monthlyPackage.product.price * 12;
    const annualPrice = annualPackage.product.price;
    const savings = Math.round(((monthlyAnnualized - annualPrice) / monthlyAnnualized) * 100);
    return savings > 0 ? savings : null;
  };

  const handlePurchase = async () => {
    if (!selectedPackage) return;
    setErrorMessage(null);
    setShowConfirmModal(true);
  };

  const navigateAfterPurchase = async () => {
    const welcomeKey = user?.id ? `welcome_seen_${user.id}` : null;
    const seen = welcomeKey ? await AsyncStorage.getItem(welcomeKey) : 'true';
    router.replace(seen === 'true' ? '/(app)/(tabs)' : '/welcome');
  };

  const confirmPurchase = async () => {
    setShowConfirmModal(false);
    if (!selectedPackage) return;

    // If RC already updated subscription status in the background, skip the
    // purchase call entirely — just navigate. Prevents a hanging StoreKit dialog.
    if (isSubscribed) {
      await navigateAfterPurchase();
      return;
    }

    try {
      await purchase(selectedPackage);
      await navigateAfterPurchase();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'userCancelled' in err && err.userCancelled) return;

      // RC error code for "product already purchased" — user owns it but the
      // local customerInfo hadn't refreshed yet. Restore to sync state, then navigate.
      const rcCode = (err as any)?.code;
      if (rcCode === 'PRODUCT_ALREADY_PURCHASED' || rcCode === 10) {
        try {
          await restore();
          await navigateAfterPurchase();
          return;
        } catch {
          // fall through to generic error
        }
      }

      const message = err instanceof Error ? err.message : 'Purchase failed. Please try again.';
      setErrorMessage(message);
    }
  };

  const handleRestore = async () => {
    setErrorMessage(null);
    try {
      const info = await restore();
      const hasActive =
        info?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
      if (hasActive) {
        const welcomeKey = user?.id ? `welcome_seen_${user.id}` : null;
        const seen = welcomeKey ? await AsyncStorage.getItem(welcomeKey) : 'true';
        router.replace(seen === 'true' ? '/(app)/(tabs)' : '/welcome');
      } else {
        setErrorMessage('No active subscription found to restore.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Restore failed. Please try again.';
      setErrorMessage(message);
    }
  };

  const handleRetry = () => {
    setIsRetrying(true);
    setErrorMessage(null);
    retryInit();
    setIsRetrying(false);
  };

  if (isLoading) {
    return (
      <ThemedBackground>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading plans...
          </Text>
        </View>
      </ThemedBackground>
    );
  }

  if (initError) {
    return (
      <ThemedBackground>
        <View style={styles.loadingContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.title, { color: colors.text, marginTop: 16 }]}>
            Unable to Load Subscriptions
          </Text>
          <Text style={[styles.loadingText, { color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 }]}>
            {initError}
          </Text>
          <Pressable
            style={[styles.subscribeButton, { backgroundColor: colors.primary, marginTop: 24, paddingHorizontal: 32, opacity: isRetrying ? 0.6 : 1 }]}
            onPress={handleRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.subscribeButtonText}>Retry</Text>
            )}
          </Pressable>
        </View>
      </ThemedBackground>
    );
  }

  const savingsPercent = getSavingsPercent();

  return (
    <ThemedBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {isAdmin && (
          <Pressable
            onPress={() => router.back()}
            style={styles.adminBackButton}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        )}

        <View style={styles.headerSection}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="diamond" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{t('trial.paywallTitle')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: 14 }]}>
            {selectedPackage?.product?.priceString
              ? t('trial.paywallSubtitle', {
                  price: selectedPackage.product.priceString,
                  period: (selectedPackage.packageType === 'ANNUAL' || selectedPackage.identifier === '$rc_annual') ? 'year' : 'month',
                })
              : t('trial.paywallSubtitleFallback')}
          </Text>
        </View>

        <ServicesGrid />

        <View style={styles.plansSection}>
          {sortedPackages.map((pkg, index) => {
            const isAnnual = pkg.packageType === 'ANNUAL' || pkg.identifier === '$rc_annual';
            const isSelected = selectedPackageIndex === index;
            const monthlyEquiv = getMonthlyEquivalent(pkg);

            return (
              <Pressable
                key={pkg.identifier}
                style={[
                  styles.planCard,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected
                      ? colors.primary + '10'
                      : colors.cardBackground,
                  },
                  isSelected && { borderWidth: 2 },
                ]}
                onPress={() => setSelectedPackageIndex(index)}
              >
                {isAnnual && savingsPercent && (
                  <View style={[styles.savingsBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.savingsBadgeText}>Save {savingsPercent}%</Text>
                  </View>
                )}

                <View style={styles.planContent}>
                  <View style={styles.radioOuter}>
                    {isSelected && (
                      <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                  <View style={styles.planDetails}>
                    <Text style={[styles.planName, { color: colors.text }]}>
                      {isAnnual ? 'Annual' : 'Monthly'}
                    </Text>
                    <Text style={[styles.planPrice, { color: colors.text }]}>
                      {pkg.product.priceString}
                      <Text style={[styles.planPeriod, { color: colors.textSecondary }]}>
                        {isAnnual ? '/year' : '/month'}
                      </Text>
                    </Text>
                    {isAnnual && monthlyEquiv && (
                      <Text style={[styles.monthlyEquiv, { color: colors.textSecondary }]}>
                        {pkg.product.currencyCode} {monthlyEquiv}/month
                      </Text>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {selectedPackage?.product?.introPrice && (
          <View style={[styles.trialBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
            <Ionicons name="gift-outline" size={20} color={colors.primary} />
            <Text style={[styles.trialText, { color: colors.primary }]}>
              {selectedPackage.product.introPrice.periodNumberOfUnits}-{selectedPackage.product.introPrice.periodUnit.toLowerCase()} free trial included
            </Text>
          </View>
        )}

        {errorMessage && (
          <View style={[styles.errorBanner, { backgroundColor: '#FF3B3020', borderColor: '#FF3B3050' }]}>
            <Ionicons name="alert-circle" size={20} color="#FF3B30" />
            <Text style={[styles.errorText, { color: '#FF3B30' }]}>{errorMessage}</Text>
          </View>
        )}

        <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
          {selectedPackage
            ? (() => {
                const intro = selectedPackage.product.introPrice;
                const isAnnual = selectedPackage.packageType === 'ANNUAL' || selectedPackage.identifier === '$rc_annual';
                const period = isAnnual ? 'year' : 'month';
                const trialLabel = intro
                  ? `${intro.periodNumberOfUnits}-${intro.periodUnit.toLowerCase()}`
                  : '14-day';
                const productTitle = selectedPackage.product.title || 'Erebus Premium';
                const store = Platform.OS === 'ios' ? 'Apple ID' : 'Google Play';
                return `A subscription to '${productTitle}' at ${selectedPackage.product.priceString}/${period} will be charged to your ${store} account at the end of the ${trialLabel} free trial, unless cancelled before the trial ends.`;
              })()
            : `A subscription will be charged to your ${Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'} account at the end of the 14-day free trial, unless cancelled before the trial ends.`
          }{'\n\n'}{Platform.OS === 'ios'
            ? 'Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Manage or cancel your subscription in your Apple ID account settings at any time.'
            : 'Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Manage or cancel your subscription in Google Play at any time.'
          }
        </Text>

        <View style={styles.legalLinks}>
          <Pressable onPress={() => router.push('/privacy' as any)}>
            <Text style={[styles.legalLink, { color: colors.primary }]}>Privacy Policy</Text>
          </Pressable>
          <Text style={[styles.legalSeparator, { color: colors.textSecondary }]}> • </Text>
          <Pressable onPress={() => router.push('/terms' as any)}>
            <Text style={[styles.legalLink, { color: colors.primary }]}>Terms & Conditions</Text>
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.subscribeButton,
            { backgroundColor: colors.primary },
            (isPurchasing || isRestoring) && styles.buttonDisabled,
          ]}
          onPress={handlePurchase}
          disabled={isPurchasing || isRestoring || !selectedPackage}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.subscribeButtonText}>
              {selectedPackage?.product?.priceString
                ? `Subscribe — ${selectedPackage.product.priceString}`
                : 'Subscribe Now'}
            </Text>
          )}
        </Pressable>
        <Text style={[styles.cancelAnytime, { color: colors.textSecondary }]}>
          Cancel anytime
        </Text>

        <Pressable
          style={[styles.restoreButton]}
          onPress={handleRestore}
          disabled={isPurchasing || isRestoring}
        >
          {isRestoring ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={[styles.restoreButtonText, { color: colors.primary }]}>
              Restore Purchases
            </Text>
          )}
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowConfirmModal(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Confirm Purchase
            </Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              Subscribe to{' '}
              {selectedPackage?.packageType === 'ANNUAL' || selectedPackage?.identifier === '$rc_annual'
                ? 'Annual'
                : 'Monthly'}{' '}
              plan for {selectedPackage?.product.priceString}?
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, { borderColor: colors.border }]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={confirmPurchase}
              >
                <Text style={[styles.modalButtonText, { color: '#FFF' }]}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  adminBackButton: {
    position: 'absolute' as const,
    top: 50,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 40,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  plansSection: {
    gap: 12,
    marginBottom: 24,
  },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  savingsBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
  },
  savingsBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  planContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#888',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  planDetails: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '700',
  },
  planPeriod: {
    fontSize: 14,
    fontWeight: '400',
  },
  monthlyEquiv: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  trialText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    flex: 1,
  },
  subscribeButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  restoreButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  cancelAnytime: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
    fontWeight: '500',
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
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  legalLink: {
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 13,
  },
});
