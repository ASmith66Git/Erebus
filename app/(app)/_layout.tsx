import React from 'react';
import { Drawer } from 'expo-router/drawer';
import { View, Text, StyleSheet, SafeAreaView, Alert, Pressable } from 'react-native';
import { DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';

function CustomDrawerContent(props: any) {
  const { colors } = useTheme();
  const { user, logout, isAdmin, isLoading } = useAuth();
  const router = useRouter();
  
  // Force component to use current isAdmin value by including it in render key
  const adminKey = `admin-${isAdmin}-${user?.role || 'none'}`;

  const handleLogout = async () => {
    props.navigation.closeDrawer();
    await logout();
  };

  const showComingSoon = (feature: string) => {
    props.navigation.closeDrawer();
    Alert.alert('Coming Soon', `${feature} will be available in a future update.`);
  };

  const handleNavigation = (path: string) => {
    props.navigation.closeDrawer();
    router.push(path as any);
  };

  const menuItems = [
    { icon: 'home', label: 'Home', action: () => handleNavigation('/(app)/(tabs)') },
    { icon: 'book', label: 'Dive Logs', action: () => handleNavigation('/(app)/(tabs)/dive-logs') },
    { icon: 'map-pin', label: 'Dive Sites', action: () => handleNavigation('/(app)/(tabs)/dive-sites') },
    { icon: 'tool', label: 'Gear Profiles', action: () => handleNavigation('/(app)/gear-profiles') },
    { icon: 'users', label: 'Dive Buddies', action: () => handleNavigation('/(app)/dive-buddies') },
    { icon: 'activity', label: 'Dive Planning', action: () => handleNavigation('/(app)/dive-planning') },
    { icon: 'database', label: 'Gas', action: () => handleNavigation('/(app)/gas-calculator') },
    { icon: 'image', label: 'Photos', action: () => handleNavigation('/(app)/(tabs)/photos') },
    { icon: 'award', label: 'Certifications', action: () => handleNavigation('/(app)/certifications') },
    { icon: 'navigation', label: 'Dive Trips', action: () => handleNavigation('/(app)/dive-trips') },
    { icon: 'settings', label: 'Settings', action: () => showComingSoon('Settings') },
  ];

  const adminItems = [
    { icon: 'users', label: 'User Management', action: () => handleNavigation('/(app)/(tabs)/admin') },
    { icon: 'code', label: 'Dev Log', action: () => handleNavigation('/(app)/(tabs)/dev-log') },
    { icon: 'alert-triangle', label: 'Debug Logs', action: () => handleNavigation('/debug-log') },
    { icon: 'sliders', label: 'Other Settings', action: () => showComingSoon('Other Settings') },
  ];

  return (
    <View style={[styles.drawerContainer, { backgroundColor: colors.surface }]}>
      <SafeAreaView style={styles.drawerContent}>
        <View style={styles.drawerHeader}>
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
            <Ionicons name="person" size={32} color="#FFFFFF" />
          </View>
          <Text style={[styles.userName, { color: colors.text }]}>
            {user?.firstName || user?.email?.split('@')[0] || 'Diver'}
          </Text>
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
          {isAdmin && (
            <View style={[styles.adminBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }} key={adminKey}>
          {menuItems.map((item, index) => (
            <DrawerItem
              key={index}
              label={item.label}
              onPress={item.action}
              icon={({ size }) => (
                <Feather name={item.icon as any} size={size} color={colors.primary} />
              )}
              labelStyle={{ color: colors.text }}
              style={styles.drawerItem}
            />
          ))}

          {isAdmin && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: 12 }]} />
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Admin</Text>
              {adminItems.map((item, index) => (
                <DrawerItem
                  key={`admin-${index}`}
                  label={item.label}
                  onPress={item.action}
                  icon={({ size }) => (
                    <Feather name={item.icon as any} size={size} color={colors.primary} />
                  )}
                  labelStyle={{ color: colors.text }}
                  style={styles.drawerItem}
                />
              ))}
            </>
          )}

        </DrawerContentScrollView>

        <Pressable 
          style={[styles.logoutButton, { borderColor: colors.error }]} 
          onPress={handleLogout}
        >
          <Feather name="log-out" size={22} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>Logout</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

export default function AppLayout() {
  const { colors } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerStyle: {
            backgroundColor: colors.surface,
            width: 320,
          },
          swipeEnabled: true,
          swipeEdgeWidth: 100,
        }}
      >
        <Drawer.Screen
          name="(tabs)"
          options={{ drawerItemStyle: { display: 'none' } }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
  },
  drawerContent: {
    flex: 1,
    padding: 16,
  },
  drawerHeader: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
  },
  adminBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
  },
  drawerItem: {
    marginVertical: 0,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 'auto',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
