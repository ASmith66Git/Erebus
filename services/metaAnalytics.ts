/**
 * Meta (Facebook) Analytics Service
 *
 * Tracks key conversion events for Meta Ads attribution.
 * All calls are no-ops on web — native (iOS/Android) only.
 *
 * To activate: set FACEBOOK_APP_ID and FACEBOOK_CLIENT_TOKEN in your
 * environment / EAS secrets, then rebuild the native app.
 */

import { Platform } from 'react-native';

let AppEventsLogger: any = null;
let Settings: any = null;

if (Platform.OS !== 'web') {
  try {
    const fbsdk = require('react-native-fbsdk-next');
    AppEventsLogger = fbsdk.AppEventsLogger;
    Settings = fbsdk.Settings;
  } catch {
    // SDK not linked — silently skip
  }
}

export const MetaAnalytics = {
  /**
   * Call once at app launch (after the config plugin has seeded the App ID).
   * The config plugin sets autoInit, so this is a belt-and-suspenders call.
   */
  initialize() {
    if (Platform.OS === 'web' || !Settings) return;
    try {
      Settings.initializeSDK();
    } catch {
      // ignore
    }
  },

  /**
   * Fire when a new user completes account registration.
   * Maps to Meta standard event: CompleteRegistration
   */
  logCompleteRegistration() {
    if (Platform.OS === 'web' || !AppEventsLogger) return;
    try {
      AppEventsLogger.logEvent(AppEventsLogger.AppEvents.COMPLETED_REGISTRATION);
    } catch {
      // ignore
    }
  },

  /**
   * Fire when a user subscribes (paid).
   * Maps to Meta standard event: Subscribe
   * @param price  The product price (e.g. 9.99)
   * @param currency  ISO 4217 currency code (e.g. "GBP")
   */
  logSubscribe(price?: number, currency?: string) {
    if (Platform.OS === 'web' || !AppEventsLogger) return;
    try {
      AppEventsLogger.logEvent(
        AppEventsLogger.AppEvents.SUBSCRIBE,
        price ?? 0,
        { fb_currency: currency ?? 'GBP' },
      );
    } catch {
      // ignore
    }
  },

  /**
   * Fire when a user starts a free trial.
   * Maps to Meta standard event: StartTrial
   * @param price  The product price (e.g. 0)
   * @param currency  ISO 4217 currency code
   */
  logStartTrial(price?: number, currency?: string) {
    if (Platform.OS === 'web' || !AppEventsLogger) return;
    try {
      AppEventsLogger.logEvent(
        AppEventsLogger.AppEvents.START_TRIAL,
        price ?? 0,
        { fb_currency: currency ?? 'GBP' },
      );
    } catch {
      // ignore
    }
  },
};
