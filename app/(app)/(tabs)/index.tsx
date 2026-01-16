import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import PageHeader from '@/components/PageHeader';
import { getApiUrl } from '@/utils/apiConfig';

const { width: screenWidth } = Dimensions.get('window');

function WavePattern({ color, opacity = 0.15 }: { color: string; opacity?: number }) {
  return (
    <Svg
      width="100%"
      height="120"
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      style={styles.wavePattern}
    >
      <Path
        d="M0,60 C240,100 480,20 720,60 C960,100 1200,20 1440,60 L1440,120 L0,120 Z"
        fill={color}
        fillOpacity={opacity}
      />
      <Path
        d="M0,80 C360,120 720,40 1080,80 C1260,100 1350,60 1440,80 L1440,120 L0,120 Z"
        fill={color}
        fillOpacity={opacity * 0.7}
      />
    </Svg>
  );
}

function BubbleDecoration({ color }: { color: string }) {
  return (
    <Svg width="200" height="200" viewBox="0 0 200 200" style={styles.bubbleDecoration}>
      <Defs>
        <RadialGradient id="bubbleGrad" cx="30%" cy="30%" r="70%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.4" />
          <Stop offset="100%" stopColor={color} stopOpacity="0.1" />
        </RadialGradient>
      </Defs>
      <Circle cx="160" cy="40" r="20" fill="url(#bubbleGrad)" />
      <Circle cx="180" cy="80" r="12" fill="url(#bubbleGrad)" />
      <Circle cx="140" cy="70" r="8" fill="url(#bubbleGrad)" />
      <Circle cx="170" cy="110" r="6" fill="url(#bubbleGrad)" />
    </Svg>
  );
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { user, token } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({
    totalDives: 0,
    totalTime: 0,
    sitesVisited: 0,
    maxDepth: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const formatDiveTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const statsData = [
    { icon: 'water', label: 'Total Dives', value: stats.totalDives.toString(), gradient: ['#0EA5E9', '#0284C7'] },
    { icon: 'time', label: 'Dive Time', value: formatDiveTime(stats.totalTime), gradient: ['#8B5CF6', '#7C3AED'] },
    { icon: 'navigate', label: 'Max Depth', value: stats.maxDepth > 0 ? `${stats.maxDepth}m` : '--', gradient: ['#10B981', '#059669'] },
  ];

  const quickActions = [
    { icon: 'add-circle', label: 'Log Dive', route: '/(app)/dive-logs', gradient: [colors.primary, colors.primary] },
    { icon: 'compass', label: 'Explore Sites', route: '/(app)/(tabs)/explore', gradient: ['#06B6D4', '#0891B2'] },
    { icon: 'airplane', label: 'Plan Trip', route: '/(app)/dive-trips', gradient: ['#F59E0B', '#D97706'] },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Erebus" />
      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.heroSection}>
          <LinearGradient
            colors={isDark 
              ? [colors.primary + '30', colors.primary + '10', 'transparent']
              : [colors.primary + '20', colors.primary + '08', 'transparent']
            }
            style={styles.heroGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <BubbleDecoration color={colors.primary} />
          
          <View style={styles.welcomeContent}>
            <Text style={[styles.timeGreeting, { color: colors.primary }]}>
              {getTimeGreeting()}
            </Text>
            <Text style={[styles.userName, { color: colors.text }]}>
              {user?.firstName || user?.email?.split('@')[0] || 'Diver'}
            </Text>
            <Text style={[styles.welcomeMessage, { color: colors.textSecondary }]}>
              Ready for your next underwater adventure?
            </Text>
          </View>
          
          <WavePattern color={colors.primary} opacity={isDark ? 0.2 : 0.15} />
        </View>

        <View style={styles.statsSection}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>YOUR DIVE STATS</Text>
          <View style={styles.statsGrid}>
            {statsData.map((stat, index) => (
              <View key={index} style={styles.statCardWrapper}>
                <LinearGradient
                  colors={stat.gradient}
                  style={styles.statCard}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.statIconCircle}>
                    <Ionicons name={stat.icon as any} size={22} color="#FFFFFF" />
                  </View>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </LinearGradient>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.quickActionsSection}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>QUICK ACTIONS</Text>
          <View style={styles.actionsGrid}>
            {quickActions.map((action, index) => (
              <Pressable 
                key={index} 
                style={({ pressed }) => [
                  styles.actionCardWrapper,
                  pressed && styles.actionPressed
                ]}
                onPress={() => router.push(action.route as any)}
              >
                <LinearGradient
                  colors={action.gradient}
                  style={styles.actionCard}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.actionIconCircle}>
                    <Ionicons name={action.icon as any} size={28} color="#FFFFFF" />
                  </View>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.tipCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={[styles.tipIconContainer, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="bulb-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.tipContent}>
            <Text style={[styles.tipTitle, { color: colors.text }]}>Dive Tip</Text>
            <Text style={[styles.tipText, { color: colors.textSecondary }]}>
              Always do a buddy check before every dive. Check your BCD, weights, releases, air, and final equipment.
            </Text>
          </View>
        </View>

        <View style={[styles.featuresSection, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.featuresTitle, { color: colors.text }]}>Explore Erebus</Text>
          <View style={styles.featuresList}>
            {[
              { icon: 'book-outline', title: 'Dive Logs', desc: 'Track all your dives' },
              { icon: 'hardware-chip-outline', title: 'Gear Profiles', desc: 'Manage your equipment' },
              { icon: 'school-outline', title: 'Certifications', desc: 'Track your training' },
              { icon: 'people-outline', title: 'Dive Buddies', desc: 'Connect with divers' },
            ].map((feature, index) => (
              <View key={index} style={[styles.featureItem, index < 3 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={[styles.featureIcon, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name={feature.icon as any} size={20} color={colors.primary} />
                </View>
                <View style={styles.featureText}>
                  <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                  <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{feature.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 16,
  },
  heroSection: {
    position: 'relative',
    paddingTop: 20,
    paddingBottom: 40,
    overflow: 'hidden',
  },
  heroGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bubbleDecoration: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  wavePattern: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  welcomeContent: {
    paddingHorizontal: 20,
    zIndex: 1,
  },
  timeGreeting: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  userName: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  welcomeMessage: {
    fontSize: 16,
    lineHeight: 22,
  },
  statsSection: {
    paddingHorizontal: 16,
    marginTop: -20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCardWrapper: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  statCard: {
    padding: 16,
    alignItems: 'center',
  },
  statIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    textAlign: 'center',
  },
  quickActionsSection: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCardWrapper: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  actionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  actionCard: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  actionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  tipCard: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  tipIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 14,
    lineHeight: 20,
  },
  featuresSection: {
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    padding: 16,
    paddingBottom: 12,
  },
  featuresList: {
    paddingHorizontal: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  featureDesc: {
    fontSize: 13,
    marginTop: 2,
  },
});
