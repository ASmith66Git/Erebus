import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textSecondary,
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: 6,
            paddingTop: 6,
            height: 60,
            justifyContent: 'space-around',
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
            title: 'Home',
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="dive-logs"
          options={{
            title: 'Dive Logs',
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'journal' : 'journal-outline'} size={22} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="photos"
          options={{
            title: 'Photos',
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'images' : 'images-outline'} size={22} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
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
      </Tabs>
    </View>
  );
}
