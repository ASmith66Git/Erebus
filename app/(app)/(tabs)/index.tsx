import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

export default function HomeScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();

  const stats = [
    { icon: 'water', label: 'Total Dives', value: '0' },
    { icon: 'time', label: 'Dive Time', value: '0h' },
    { icon: 'location', label: 'Sites Visited', value: '0' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.welcomeSection}>
        <Text style={[styles.greeting, { color: colors.textSecondary }]}>Welcome back,</Text>
        <Text style={[styles.name, { color: colors.text }]}>
          {user?.firstName || user?.email?.split('@')[0] || 'Diver'}!
        </Text>
      </View>

      <View style={styles.statsContainer}>
        {stats.map((stat, index) => (
          <View key={index} style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={[styles.statIconContainer, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name={stat.icon as any} size={24} color={colors.primary} />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="flash" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
        </View>
        <View style={styles.quickActions}>
          <View style={[styles.actionButton, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={24} color="#FFFFFF" />
            <Text style={styles.actionText}>Log Dive</Text>
          </View>
          <View style={[styles.actionButton, { backgroundColor: colors.primary }]}>
            <Ionicons name="map" size={24} color="#FFFFFF" />
            <Text style={styles.actionText}>Find Site</Text>
          </View>
          <View style={[styles.actionButton, { backgroundColor: colors.primary }]}>
            <Ionicons name="calendar" size={24} color="#FFFFFF" />
            <Text style={styles.actionText}>Plan Trip</Text>
          </View>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="time-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="water-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No dives logged yet. Start by logging your first dive!
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  welcomeSection: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 16,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  section: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
});
