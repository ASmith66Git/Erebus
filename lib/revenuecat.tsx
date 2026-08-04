import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useAuth } from "@/contexts/AuthContext";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "premium";

let revenueCatConfigured = false;

function getRevenueCatApiKey(): string {
  if (__DEV__ || Platform.OS === "web" || Constants.executionEnvironment === "storeClient") {
    if (!REVENUECAT_TEST_API_KEY) {
      throw new Error("RevenueCat test API key not found (EXPO_PUBLIC_REVENUECAT_TEST_API_KEY)");
    }
    return REVENUECAT_TEST_API_KEY;
  }

  if (Platform.OS === "ios") {
    if (!REVENUECAT_IOS_API_KEY) {
      throw new Error("RevenueCat iOS API key not found (EXPO_PUBLIC_REVENUECAT_IOS_API_KEY)");
    }
    return REVENUECAT_IOS_API_KEY;
  }

  if (Platform.OS === "android") {
    if (!REVENUECAT_ANDROID_API_KEY) {
      throw new Error("RevenueCat Android API key not found (EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY)");
    }
    return REVENUECAT_ANDROID_API_KEY;
  }

  if (!REVENUECAT_TEST_API_KEY) {
    throw new Error("RevenueCat test API key not found (EXPO_PUBLIC_REVENUECAT_TEST_API_KEY)");
  }
  return REVENUECAT_TEST_API_KEY;
}

export function initializeRevenueCat(): void {
  if (revenueCatConfigured) return;
  const apiKey = getRevenueCatApiKey();
  Purchases.setLogLevel(__DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey });
  revenueCatConfigured = true;
  console.log("Configured RevenueCat");
}

export function isRevenueCatReady(): boolean {
  return revenueCatConfigured;
}

function useSubscriptionContext() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [initialized, setInitialized] = useState(revenueCatConfigured);
  const [initError, setInitError] = useState<string | null>(null);

  const retryInit = useCallback(() => {
    try {
      revenueCatConfigured = false;
      initializeRevenueCat();
      setInitialized(true);
      setInitError(null);
    } catch (err) {
      setInitialized(false);
      setInitError(err instanceof Error ? err.message : "Unknown initialization error");
      console.warn("RevenueCat initialization failed:", err instanceof Error ? err.message : err);
    }
  }, []);

  useEffect(() => {
    if (!revenueCatConfigured) {
      retryInit();
    }
  }, [retryInit]);

  useEffect(() => {
    if (!initialized) return;

    const syncIdentity = async () => {
      try {
        if (isAuthenticated && user?.id) {
          const appUserId = `app_user_${user.id}`;
          await Purchases.logIn(appUserId);
        } else {
          // Only log out if RC has an identified user — calling logOut on an
          // anonymous session throws "LogOut was called but the current user is anonymous"
          const isAnon = await Purchases.isAnonymous();
          if (!isAnon) {
            await Purchases.logOut();
          }
        }
      } catch (err) {
        console.warn("RevenueCat identity sync error:", err instanceof Error ? err.message : err);
      }
      queryClient.invalidateQueries({ queryKey: ["revenuecat"] });
    };

    syncIdentity();
  }, [initialized, isAuthenticated, user?.id, queryClient]);

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info", user?.id ?? "anonymous"],
    queryFn: () => Purchases.getCustomerInfo(),
    staleTime: 60 * 1000,
    enabled: initialized && isAuthenticated,
    retry: 3,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    staleTime: 300 * 1000,
    enabled: initialized,
    retry: 3,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: PurchasesPackage) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return { customerInfo, packageToPurchase };
    },
    onSuccess: ({ packageToPurchase }) => {
      customerInfoQuery.refetch();
      // Meta Ads attribution — fire Subscribe or StartTrial
      try {
        const { MetaAnalytics } = require('@/services/metaAnalytics');
        const price = packageToPurchase.product.price;
        const currency = packageToPurchase.product.currencyCode;
        const hasIntroOffer = !!packageToPurchase.product.introPrice;
        if (hasIntroOffer) {
          MetaAnalytics.logStartTrial(price, currency);
        } else {
          MetaAnalytics.logSubscribe(price, currency);
        }
      } catch { /* ignore */ }
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => Purchases.restorePurchases(),
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const hasEntitlement = customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
  const isSubscribed = initialized && hasEntitlement;

  const hasError = !!initError || customerInfoQuery.isError;
  const isLoading = !initialized ? false : (customerInfoQuery.isLoading || offeringsQuery.isLoading);

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    isLoading,
    hasError,
    initError,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    refetch: customerInfoQuery.refetch,
    retryInit,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
