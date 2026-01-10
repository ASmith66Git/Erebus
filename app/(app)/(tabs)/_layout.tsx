import React from 'react';
import { Tabs, useNavigation } from 'expo-router';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { DrawerActions } from '@react-navigation/native';

function CustomHeader() {
  const { colors, isDark, toggleTheme } = useTheme();
  const navigation = useNavigation();

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  return (
    <SafeAreaView style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
      <Pressable onPress={openDrawer} style={styles.menuButton}>
        <Ionicons name="menu" size={28} color={colors.text} />
      </Pressable>
      <View style={styles.headerCenter}>
        <Ionicons name="water" size={24} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Erebus</Text>
      </View>
      <Pressable onPress={toggleTheme} style={styles.themeButton}>
        <Ionicons name={isDark ? 'sunny' : 'moon'} size={24} color={colors.text} />
      </Pressable>
    </SafeAreaView>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <CustomHeader />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textSecondary,
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: 12,
            paddingTop: 10,
            height: 75,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '500',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'compass' : 'compass-outline'} size={24} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="dive-logs"
          options={{
            title: 'Dive Logs',
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'journal' : 'journal-outline'} size={24} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={colors.primary} />
            ),
          }}
        />
        <Tabs.Screen
          name="dive-sites"
          options={{
            tabBarButton: () => null,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            tabBarButton: () => null,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
    minHeight: 75,
    borderBottomWidth: 1,
  },
  menuButton: {
    padding: 8,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerRight: {
    width: 36,
  },
  themeButton: {
    padding: 8,
  },
});
