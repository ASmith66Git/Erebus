import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfileScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout, isAdmin } = useAuth();

  const menuItems = [
    { icon: 'person-outline', title: 'Edit Profile', description: 'Update your information' },
    { icon: 'notifications-outline', title: 'Notifications', description: 'Manage your alerts' },
    { icon: 'shield-checkmark-outline', title: 'Privacy', description: 'Control your data' },
    { icon: 'help-circle-outline', title: 'Help & Support', description: 'Get assistance' },
    { icon: 'document-text-outline', title: 'Terms & Conditions', description: 'Legal information' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.profileHeader, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>
            {user?.firstName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'D'}
          </Text>
        </View>
        <Text style={[styles.userName, { color: colors.text }]}>
          {user?.firstName && user?.lastName
            ? `${user.firstName} ${user.lastName}`
            : user?.firstName || user?.email?.split('@')[0] || 'Diver'}
        </Text>
        <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
        {isAdmin && (
          <View style={[styles.adminBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
            <Text style={styles.adminText}>Administrator</Text>
          </View>
        )}
      </View>

      <View style={[styles.statsRow, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Dives</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0h</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Bottom Time</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Certifications</Text>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferences</Text>
        
        <View style={styles.themeRow}>
          <View style={styles.themeLeft}>
            <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.menuTitle, { color: colors.text }]}>Dark Mode</Text>
              <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                {isDark ? 'Dark theme active' : 'Light theme active'}
              </Text>
            </View>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>
        
        {menuItems.map((item, index) => (
          <Pressable key={index} style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name={item.icon as any} size={20} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>{item.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.logoutButton, { borderColor: colors.error }]}
        onPress={logout}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.error} />
        <Text style={[styles.logoutText, { color: colors.error }]}>Logout</Text>
      </Pressable>

      <Text style={[styles.version, { color: colors.textSecondary }]}>Erebus v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  adminText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    marginVertical: 8,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  menuDescription: {
    fontSize: 13,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 24,
  },
});
