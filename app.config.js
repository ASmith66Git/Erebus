module.exports = {
  expo: {
    name: "Erebus",
    slug: "erebus-dive-app",
    owner: "leviathan-systems-ltd",
    version: "2.0.96",
    runtimeVersion: "1.1.74",
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: "myapp",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.leviathan-sys.erebus",
      buildNumber: "153",
      infoPlist: {
        NSBluetoothAlwaysUsageDescription: "Erebus needs Bluetooth access to connect to your dive computer and download dive logs.",
        NSBluetoothPeripheralUsageDescription: "Erebus needs Bluetooth access to connect to your dive computer.",
        NSCameraUsageDescription: "Allow Erebus to use your camera to take photos, record videos, and scan certification cards.",
        NSMicrophoneUsageDescription: "Allow Erebus to access your microphone to record audio with your dive videos.",
        NSPhotoLibraryUsageDescription: "Allow Erebus to access your photo library to upload and manage dive photos and videos.",
        NSPhotoLibraryAddUsageDescription: "Allow Erebus to save photos and videos to your photo library.",
        NSLocationWhenInUseUsageDescription: "Allow Erebus to access your location to record dive site positions, find nearby dive spots, and provide weather forecasts for dive planning.",
        ITSAppUsesNonExemptEncryption: false
      },
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY || ''
      }
    },
    android: {
      versionCode: 153,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#000000"
      },
      edgeToEdgeEnabled: true,
      package: "com.erebus.diveapp",
      googleServicesFile: "./google-services.json",
      allowBackup: false,
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY || ''
        }
      },
      permissions: [
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE"
      ]
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-image",
      "expo-localization",
      "expo-secure-store",
      "expo-sharing",
      "expo-sqlite",
      "expo-video",
      "expo-web-browser",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#000000"
        }
      ],
      [
        "react-native-ble-plx",
        {
          isBackgroundEnabled: false,
          modes: ["central"],
          bluetoothAlwaysPermission: "Allow Erebus to connect to your dive computer via Bluetooth"
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/notification-icon.png",
          color: "#D22F00"
        }
      ],
      [
        "expo-local-authentication",
        {
          faceIDPermission: "Allow Erebus to use Face ID for quick login."
        }
      ],
      [
        "react-native-document-scanner-plugin",
        {
          cameraPermission: "Allow Erebus to use your camera to take photos, record videos, and scan certification cards."
        }
      ],
      // PROTECTED — native libdivecomputer Expo plugin. Do not remove.
      // Requires the modules/dive-computer directory (also protected).
      "./modules/dive-computer/plugin/withDiveComputerNative.js"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      googleMapsAndroidApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY || '',
      googleMapsIosApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY || '',
      eas: {
        projectId: "13b1ac1e-a5de-4261-aee2-33d925aadefd"
      }
    }
  }
};
