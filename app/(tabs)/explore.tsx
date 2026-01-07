import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';

export default function ExploreScreen() {
  const { colors } = useTheme();

  const categories = [
    { icon: 'location', title: 'Dive Sites', description: 'Discover new diving locations' },
    { icon: 'fish', title: 'Marine Life', description: 'Learn about underwater species' },
    { icon: 'school', title: 'Courses', description: 'Improve your diving skills' },
    { icon: 'shield-checkmark', title: 'Safety', description: 'Stay safe underwater' },
  ];

  const featuredSites = [
    { name: 'Great Barrier Reef', location: 'Australia', depth: '30m' },
    { name: 'Blue Hole', location: 'Belize', depth: '124m' },
    { name: 'SS Thistlegorm', location: 'Red Sea', depth: '30m' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Explore</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Discover dive sites, marine life, and more
      </Text>

      <View style={styles.categoriesGrid}>
        {categories.map((category, index) => (
          <Pressable
            key={index}
            style={[styles.categoryCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
          >
            <View style={[styles.categoryIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name={category.icon as any} size={28} color={colors.primary} />
            </View>
            <Text style={[styles.categoryTitle, { color: colors.text }]}>{category.title}</Text>
            <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>
              {category.description}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Featured Sites</Text>
          <Pressable>
            <Text style={[styles.seeAll, { color: colors.primary }]}>See All</Text>
          </Pressable>
        </View>

        {featuredSites.map((site, index) => (
          <Pressable
            key={index}
            style={[styles.siteCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
          >
            <View style={[styles.siteImage, { backgroundColor: colors.primary + '30' }]}>
              <Ionicons name="water" size={32} color={colors.primary} />
            </View>
            <View style={styles.siteInfo}>
              <Text style={[styles.siteName, { color: colors.text }]}>{site.name}</Text>
              <View style={styles.siteDetails}>
                <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                <Text style={[styles.siteLocation, { color: colors.textSecondary }]}>{site.location}</Text>
                <View style={styles.dot} />
                <Ionicons name="arrow-down" size={14} color={colors.textSecondary} />
                <Text style={[styles.siteDepth, { color: colors.textSecondary }]}>{site.depth}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  categoryCard: {
    width: '48%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 13,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
  },
  siteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  siteImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  siteInfo: {
    flex: 1,
    marginLeft: 12,
  },
  siteName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  siteDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  siteLocation: {
    fontSize: 13,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#999',
    marginHorizontal: 4,
  },
  siteDepth: {
    fontSize: 13,
  },
});
