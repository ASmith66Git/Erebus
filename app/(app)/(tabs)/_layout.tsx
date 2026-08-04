import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textSecondary,
          headerShown: false,
          tabBarStyle: {
            display: 'none',
          },
          tabBarItemStyle: {
            flex: 1,
            paddingVertical: 4,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '500',
            marginTop: 2,
          },
          tabBarIconStyle: {
            marginBottom: 0,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('nav.home'),
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="dive-logs"
          options={{
            title: t('nav.diveLogs'),
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'journal' : 'journal-outline'} size={22} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="photos"
          options={{
            title: t('nav.photos'),
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'images' : 'images-outline'} size={22} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('nav.profile'),
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="dive-sites"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="dev-log"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="certifications"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="dive-buddies"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="dive-planning"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="dive-trips"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="gas-calculator"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="gear-profiles"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="compressors"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="cylinders"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="import-dive-log"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="manual-dive-entry"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="debug-log"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="admin-db"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </View>
  );
}
