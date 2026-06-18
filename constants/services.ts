import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type ServiceItem = {
  icon: ComponentProps<typeof Ionicons>['name'];
  labelKey: string;
};

export const PREMIUM_SERVICES: ServiceItem[] = [
  { icon: 'water-outline', labelKey: 'services.unlimitedDiveLogs' },
  { icon: 'map-outline', labelKey: 'services.advancedDivePlanning' },
  { icon: 'cloud-upload-outline', labelKey: 'services.cloudBackupSync' },
  { icon: 'analytics-outline', labelKey: 'services.detailedAnalytics' },
  { icon: 'people-outline', labelKey: 'services.buddyConnections' },
  { icon: 'headset-outline', labelKey: 'services.prioritySupport' },
  { icon: 'location-outline', labelKey: 'services.diveSites' },
  { icon: 'calculator-outline', labelKey: 'services.gasCalculator' },
  { icon: 'layers-outline', labelKey: 'services.gearProfiles' },
  { icon: 'flask-outline', labelKey: 'services.cylinderTracking' },
  { icon: 'build-outline', labelKey: 'services.compressorManagement' },
  { icon: 'ribbon-outline', labelKey: 'services.certifications' },
  { icon: 'airplane-outline', labelKey: 'services.diveTrips' },
  { icon: 'camera-outline', labelKey: 'services.photosMedia' },
  { icon: 'download-outline', labelKey: 'services.dataExport' },
  { icon: 'bluetooth-outline', labelKey: 'services.bluetoothSync' },
];
