import React, { useState } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet, Modal, SafeAreaView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.drawer, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
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

            <View style={styles.menuItems}>
              <Pressable style={styles.menuItem} onPress={() => navigateTo('/(tabs)')}>
                <Ionicons name="home-outline" size={24} color={colors.primary} />
                <Text style={[styles.menuItemText, { color: colors.text }]}>Home</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={() => navigateTo('/(tabs)/explore')}>
                <Ionicons name="compass-outline" size={24} color={colors.primary} />
                <Text style={[styles.menuItemText, { color: colors.text }]}>Explore</Text>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={() => navigateTo('/(tabs)/profile')}>
                <Ionicons name="person-outline" size={24} color={colors.primary} />
                <Text style={[styles.menuItemText, { color: colors.text }]}>Profile</Text>
              </Pressable>

              {isAdmin && (
                <Pressable style={styles.menuItem} onPress={() => navigateTo('/(tabs)/admin')}>
                  <Ionicons name="settings-outline" size={24} color={colors.primary} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>Admin Panel</Text>
                </Pressable>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.themeToggle}>
              <View style={styles.themeToggleLeft}>
                <Ionicons name={isDark ? 'moon' : 'sunny'} size={24} color={colors.primary} />
                <Text style={[styles.menuItemText, { color: colors.text }]}>Dark Mode</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.spacer} />

            <Pressable style={[styles.logoutButton, { borderColor: colors.error }]} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color={colors.error} />
              <Text style={[styles.logoutText, { color: colors.error }]}>Logout</Text>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Pressable>
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
          name="admin"
          options={{
            href: null,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawer: {
    width: '80%',
    maxWidth: 320,
    height: '100%',
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
    marginVertical: 16,
  },
  menuItems: {
    gap: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  menuItemText: {
    fontSize: 16,
  },
  themeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  themeToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  spacer: {
    flex: 1,
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
