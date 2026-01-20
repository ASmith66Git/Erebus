import React from 'react';
import { Drawer } from 'expo-router/drawer';
import { View, Text, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
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
    { icon: 'home-outline', label: 'Home', action: () => handleNavigation('/(app)/(tabs)') },
    { icon: 'journal-outline', label: 'Dive Logs', action: () => handleNavigation('/(app)/(tabs)/dive-logs') },
    { icon: 'location-outline', label: 'Dive Sites', action: () => handleNavigation('/(app)/(tabs)/dive-sites') },
    { icon: 'build-outline', label: 'Gear Profiles', action: () => handleNavigation('/(app)/(tabs)/gear-profiles') },
    { icon: 'people-outline', label: 'Dive Buddies', action: () => handleNavigation('/(app)/(tabs)/dive-buddies') },
    { icon: 'analytics-outline', label: 'Dive Planning', action: () => handleNavigation('/(app)/(tabs)/dive-planning') },
    { icon: 'flask-outline', label: 'Gas', action: () => handleNavigation('/(app)/(tabs)/gas-calculator') },
    { icon: 'images-outline', label: 'Photos', action: () => handleNavigation('/(app)/(tabs)/photos') },
    { icon: 'ribbon-outline', label: 'Certifications', action: () => handleNavigation('/(app)/(tabs)/certifications') },
    { icon: 'airplane-outline', label: 'Dive Trips', action: () => handleNavigation('/(app)/(tabs)/dive-trips') },
    { icon: 'person-outline', label: 'Profile', action: () => handleNavigation('/(app)/(tabs)/profile') },
    { icon: 'settings-outline', label: 'Settings', action: () => handleNavigation('/(app)/(tabs)/settings') },
  ];

  const adminItems = [
    { icon: 'people-outline', label: 'User Management', action: () => handleNavigation('/(app)/(tabs)/admin') },
    { icon: 'chatbox-ellipses-outline', label: 'Dive Messages', action: () => handleNavigation('/(app)/(tabs)/dive-messages') },
    { icon: 'code-slash-outline', label: 'Dev Log', action: () => handleNavigation('/(app)/(tabs)/dev-log') },
    { icon: 'bug-outline', label: 'Debug Logs', action: () => handleNavigation('/(app)/(tabs)/debug-log') },
    { icon: 'options-outline', label: 'Other Settings', action: () => showComingSoon('Other Settings') },
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
              icon={() => (
                <Ionicons name={item.icon as any} size={22} color={colors.primary} />
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
                  icon={() => (
                    <Ionicons name={item.icon as any} size={22} color={colors.primary} />
                  )}
                  labelStyle={{ color: colors.text }}
                  style={styles.drawerItem}
                />
              ))}
            </>
          )}

        </DrawerContentScrollView>

        <View style={styles.logoutContainer}>
          <View style={[styles.divider, { backgroundColor: colors.border, marginBottom: 8 }]} />
          <DrawerItem
            label="Logout"
            onPress={handleLogout}
            icon={() => (
              <Ionicons name="log-out-outline" size={22} color={colors.primary} />
            )}
            labelStyle={{ color: colors.primary }}
            style={styles.drawerItem}
          />
        </View>
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
            width: 260,
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
  logoutContainer: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
});
