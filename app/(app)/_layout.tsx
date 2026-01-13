import React from 'react';
import { Drawer } from 'expo-router/drawer';
import { View, Text, StyleSheet, SafeAreaView, Switch, Alert, Pressable } from 'react-native';
import { DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';

function CustomDrawerContent(props: any) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout, isAdmin } = useAuth();
  const router = useRouter();

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
    { icon: 'home', label: 'Home', action: () => handleNavigation('/') },
    { icon: 'book', label: 'Dive Logs', action: () => handleNavigation('/dive-logs') },
    { icon: 'map-pin', label: 'Dive Sites', action: () => handleNavigation('/dive-sites') },
    { icon: 'tool', label: 'Gear Profiles', action: () => showComingSoon('Gear Profiles') },
    { icon: 'users', label: 'Buddies', action: () => showComingSoon('Buddies') },
    { icon: 'activity', label: 'Dive Planning', action: () => showComingSoon('Dive Planning') },
    { icon: 'database', label: 'Gas', action: () => showComingSoon('Gas') },
    { icon: 'image', label: 'Photos', action: () => showComingSoon('Photos') },
    { icon: 'map', label: 'Trips', action: () => showComingSoon('Trips') },
    { icon: 'award', label: 'Training', action: () => showComingSoon('Training') },
    { icon: 'settings', label: 'Settings', action: () => showComingSoon('Settings') },
  ];

  const adminItems = [
    { icon: 'users', label: 'User Management', action: () => handleNavigation('/admin') },
    { icon: 'code', label: 'Dev Log', action: () => handleNavigation('/dev-log') },
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

        <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }} key={`drawer-${isAdmin}`}>
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

          <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: 12 }]} />

          <View style={styles.themeToggle}>
            <View style={styles.themeToggleLeft}>
              <Feather name={isDark ? 'moon' : 'sun'} size={22} color={colors.primary} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
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
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  themeToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuItemText: {
    fontSize: 16,
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
