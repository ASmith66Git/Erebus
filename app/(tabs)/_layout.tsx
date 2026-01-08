import React, { useState } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, Pressable, TouchableOpacity, StyleSheet, Modal, SafeAreaView, Switch, ScrollView, Alert, Platform } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';

function MenuItem({ icon, label, onPress, colors }: { icon: string; label: string; onPress: () => void; colors: any }) {
  const [isHovered, setIsHovered] = useState(false);
  
  const webProps = Platform.OS === 'web' ? {
    onClick: onPress,
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    style: { cursor: 'pointer' } as any,
  } : {};
  
  return (
    <View
      {...webProps}
      style={[
        styles.menuItem,
        isHovered && { backgroundColor: colors.border }
      ]}
    >
      {Platform.OS !== 'web' ? (
        <TouchableOpacity onPress={onPress} style={styles.menuItemInner} activeOpacity={0.7}>
          <Feather name={icon as any} size={22} color={colors.primary} />
          <Text style={[styles.menuItemText, { color: colors.text }]}>{label}</Text>
        </TouchableOpacity>
      ) : (
        <>
          <Feather name={icon as any} size={22} color={colors.primary} />
          <Text style={[styles.menuItemText, { color: colors.text }]}>{label}</Text>
        </>
      )}
    </View>
  );
}

function DrawerMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout, isAdmin } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const navigateTo = (path: string) => {
    onClose();
    router.push(path as any);
  };

  const showComingSoon = (feature: string) => {
    Alert.alert('Coming Soon', `${feature} will be available in a future update.`);
  };

  const handleNavigation = (path: string) => {
    onClose();
    router.push(path as any);
  };

  const menuItems = [
    { icon: 'home', label: 'Home', action: () => handleNavigation('/') },
    { icon: 'book', label: 'Dive Logs', action: () => showComingSoon('Dive Logs') },
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
    { icon: 'sliders', label: 'Other Settings', action: () => showComingSoon('Other Settings') },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[styles.drawer, { backgroundColor: colors.surface }]}>
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

            <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.menuItems}>
                {menuItems.map((item, index) => (
                  <MenuItem 
                    key={index}
                    icon={item.icon}
                    label={item.label}
                    onPress={item.action}
                    colors={colors}
                  />
                ))}
              </View>

              {isAdmin && (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Admin</Text>
                  <View style={styles.menuItems}>
                    {adminItems.map((item, index) => (
                      <MenuItem 
                        key={index}
                        icon={item.icon}
                        label={item.label}
                        onPress={item.action}
                        colors={colors}
                      />
                    ))}
                  </View>
                </>
              )}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

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
            </ScrollView>

            <TouchableOpacity style={[styles.logoutButton, { borderColor: colors.error }]} onPress={handleLogout} activeOpacity={0.7}>
              <Feather name="log-out" size={22} color={colors.error} />
              <Text style={[styles.logoutText, { color: colors.error }]}>Logout</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

function CustomHeader({ onMenuPress }: { onMenuPress: () => void }) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
      <Pressable onPress={onMenuPress} style={styles.menuButton}>
        <Ionicons name="menu" size={28} color={colors.text} />
      </Pressable>
      <View style={styles.headerCenter}>
        <Ionicons name="water" size={24} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Erebus</Text>
      </View>
      <View style={styles.headerRight} />
    </SafeAreaView>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const [drawerVisible, setDrawerVisible] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <CustomHeader onMenuPress={() => setDrawerVisible(true)} />
      <DrawerMenu visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
      
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
    padding: 4,
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
  modalOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1,
  },
  drawer: {
    width: '80%',
    maxWidth: 320,
    height: '100%',
    position: 'relative',
    zIndex: 2,
  },
  drawerContent: {
    flex: 1,
    padding: 20,
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
    marginVertical: 12,
  },
  menuScroll: {
    flex: 1,
  },
  menuItems: {
    gap: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  menuItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  menuItemText: {
    fontSize: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 8,
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  themeToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
