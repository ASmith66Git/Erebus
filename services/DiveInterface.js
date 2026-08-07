// ============================================================
// PROTECTED FILE — DO NOT OVERWRITE OR REWRITE
// Native bridge to the Swift DiveBridge module (libdivecomputer).
// Maintained by the user on their Mac. See replit.md "Protected Files".
// ============================================================
import { NativeModules, Platform } from 'react-native';

// This name MUST match the @objc(DiveBridge) name used in Swift
const { DiveBridge } = NativeModules;

/**
 * Universal Download Trigger
 * @param {string} vendor - e.g., "Suunto"
 * @param {string} model - e.g., "D4i"
 * @param {string} uuid - The unique ID from the BLE scan
 */
export const startDiveDownload = (vendor, model, uuid) => {
  if (Platform.OS === 'ios') {
    if (DiveBridge && DiveBridge.startDownload) {
      // Sends data to dc_descriptor_lookup and dc_device_open in the C library
      DiveBridge.startDownload(vendor, model, uuid);
    } else {
      console.error("Native Module 'DiveBridge' not linked. Ensure the bridge is compiled.");
    }
  } else {
    console.warn("Dive download bridge is currently iOS only.");
  }
};