module.exports = {
  expo: {
    name: "Erebus",
    slug: "erebus-dive-app",
    version: "1.1.8",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "myapp",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.erebus.diveapp",
      infoPlist: {
        NSBluetoothAlwaysUsageDescription: "Erebus needs Bluetooth access to connect to your dive computer and download dive logs.",
        NSBluetoothPeripheralUsageDescription: "Erebus needs Bluetooth access to connect to your dive computer."
      }
    },
    android: {
      versionCode: 14,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#000000"
      },
      edgeToEdgeEnabled: true,
      package: "com.erebus.diveapp",
      googleServicesFile: "./google-services.json",
      allowBackup: false,
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
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      eas: {
        projectId: "13b1ac1e-a5de-4261-aee2-33d925aadefd"
      }
    }
  }
};
