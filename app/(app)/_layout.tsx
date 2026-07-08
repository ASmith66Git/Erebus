import React, { useEffect } from 'react';
import { Drawer } from 'expo-router/drawer';
import { View, Text, StyleSheet, SafeAreaView, Alert, Image, Platform } from 'react-native';
import { DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Notifications from 'expo-notifications';
import { notificationService } from '@/services/notificationService';

function CustomDrawerContent(props: any) {
  const { colors } = useTheme();
  const { user, logout, isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  
  const adminKey = `admin-${isAdmin}-${user?.role || 'none'}`;

  const handleLogout = async () => {
    props.navigation.closeDrawer();
    await logout();
  };

  const showComingSoon = (feature: string) => {
    props.navigation.closeDrawer();
    Alert.alert(t('nav.comingSoon'), t('nav.comingSoonMessage', { feature }));
  };

  const handleNavigation = (path: string) => {
    props.navigation.closeDrawer();
    router.push(path as any);
  };

  const menuItems = [
    { icon: 'home-outline', label: t('nav.home'), action: () => handleNavigation('/(app)/(tabs)') },
    { icon: 'journal-outline', label: t('nav.diveLogs'), action: () => handleNavigation('/(app)/(tabs)/dive-logs') },
    { icon: 'location-outline', label: t('nav.diveSites'), action: () => handleNavigation('/(app)/(tabs)/dive-sites') },
    { icon: 'build-outline', label: t('nav.gearProfiles'), action: () => handleNavigation('/(app)/(tabs)/gear-profiles') },
    { icon: 'people-outline', label: t('nav.diveBuddies'), action: () => handleNavigation('/(app)/(tabs)/dive-buddies') },
    { icon: 'analytics-outline', label: t('nav.divePlanning'), action: () => handleNavigation('/(app)/(tabs)/dive-planning') },
    { icon: 'flask-outline', label: t('nav.gas'), action: () => handleNavigation('/(app)/(tabs)/gas-calculator') },
    { icon: 'images-outline', label: t('nav.photos'), action: () => handleNavigation('/(app)/(tabs)/photos') },
    { icon: 'ribbon-outline', label: t('nav.certifications'), action: () => handleNavigation('/(app)/(tabs)/certifications') },
    { icon: 'hardware-chip-outline', label: t('nav.compressors'), action: () => handleNavigation('/(app)/(tabs)/compressors') },
    { icon: 'disc-outline', label: t('nav.cylinders'), action: () => handleNavigation('/(app)/(tabs)/cylinders') },
    { icon: 'airplane-outline', label: t('nav.diveTrips'), action: () => handleNavigation('/(app)/(tabs)/dive-trips') },
    { icon: 'person-outline', label: t('nav.profile'), action: () => handleNavigation('/(app)/(tabs)/profile') },
    { icon: 'settings-outline', label: t('nav.settings'), action: () => handleNavigation('/(app)/(tabs)/settings') },
  ];

  const adminItems = [
    { icon: 'stats-chart-outline', label: t('nav.stats'), action: () => handleNavigation('/(app)/(tabs)/admin-stats') },
    { icon: 'people-outline', label: t('nav.userManagement'), action: () => handleNavigation('/(app)/(tabs)/admin') },
    { icon: 'mail-outline', label: t('nav.supportMessages'), action: () => handleNavigation('/(app)/(tabs)/support-admin') },
    { icon: 'chatbox-ellipses-outline', label: t('nav.diveMessages'), action: () => handleNavigation('/(app)/(tabs)/dive-messages') },
    { icon: 'rocket-outline', label: t('nav.roadmap'), action: () => handleNavigation('/(app)/(tabs)/roadmap-admin') },
    { icon: 'code-slash-outline', label: t('nav.devLog'), action: () => handleNavigation('/(app)/(tabs)/dev-log') },
    { icon: 'bug-outline', label: t('nav.debugLogs'), action: () => handleNavigation('/(app)/(tabs)/debug-log') },
    { icon: 'diamond-outline', label: t('nav.subscription'), action: () => handleNavigation('/paywall') },
  ];

  return (
    <View style={[styles.drawerContainer, { backgroundColor: colors.surface }]}>
      <SafeAreaView style={styles.drawerContent}>
        <View style={styles.drawerHeader}>
          {user?.profileImage ? (
            <Image 
              source={{ uri: user.profileImage }} 
              style={styles.avatarImage}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Ionicons name="person" size={32} color="#FFFFFF" />
            </View>
          )}
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
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('nav.admin')}</Text>
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
            label={t('nav.logout')}
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
  const { token } = useAuth();

  // Silently re-register push token on every app launch if permission already granted.
  // This ensures fresh tokens from new builds always reach the server without
  // requiring the user to manually visit the Notifications settings screen.
  useEffect(() => {
    if (!token || Platform.OS === 'web') return;

    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          const result = await notificationService.initialize();
          if (result.token) {
            await notificationService.registerTokenWithServer(token);
          }
        }
      } catch (e) {
        // Silent — never block app launch for push registration failures
      }
    })();
  }, [token]);

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
        <Drawer.Screen
          name="cylinder/[id]"
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
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
