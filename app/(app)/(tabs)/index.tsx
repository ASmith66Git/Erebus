import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useRouter } from 'expo-router';
import PageHeader from '@/components/PageHeader';
import { getApiUrl } from '@/utils/apiConfig';
import ThemedBackground from '@/components/ThemedBackground';

const { width: screenWidth } = Dimensions.get('window');

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 0 };
  
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generateColorShades(baseColor: string): string[][] {
  const { h, s, l } = hexToHsl(baseColor);
  
  // Generate 6 distinct gradients using the SAME hue but different lightness levels
  const shades: string[][] = [
    // Stats cards - varying darkness levels of the same color
    [hslToHex(h, Math.min(s + 5, 100), Math.min(l + 8, 55)), hslToHex(h, Math.min(s + 10, 100), Math.max(l - 5, 30))],
    [hslToHex(h, Math.min(s + 3, 100), Math.min(l + 5, 52)), hslToHex(h, Math.min(s + 8, 100), Math.max(l - 8, 28))],
    [hslToHex(h, s, Math.min(l + 3, 50)), hslToHex(h, Math.min(s + 5, 100), Math.max(l - 10, 25))],
    // Quick action cards - slightly different saturation/lightness for variety
    [hslToHex(h, Math.max(s - 5, 60), Math.min(l + 10, 58)), hslToHex(h, s, Math.min(l + 2, 48))],
    [hslToHex(h, Math.max(s - 8, 55), Math.min(l + 12, 60)), hslToHex(h, Math.max(s - 3, 65), Math.min(l + 5, 52))],
    [hslToHex(h, Math.max(s - 10, 50), Math.min(l + 15, 62)), hslToHex(h, Math.max(s - 5, 60), Math.min(l + 8, 55))],
  ];
  
  return shades;
}

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { user, token } = useAuth();
  const { getSelectedQuickActions } = useSettings();
  const router = useRouter();
  const [stats, setStats] = useState({
    totalDives: 0,
    totalTime: 0,
    sitesVisited: 0,
    maxDepth: 0,
  });
  const [tagline, setTagline] = useState('Ready for your next underwater adventure?');
  const [diveTip, setDiveTip] = useState('Always do a buddy check before every dive. Check your BCD, weights, releases, air, and final equipment.');

  useEffect(() => {
    fetchStats();
    fetchDiveMessages();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setStats({
          totalDives: data.totalDives || 0,
          totalTime: Math.floor((data.totalDurationSeconds || 0) / 60),
          sitesVisited: data.sitesVisited || 0,
          maxDepth: data.deepestDiveMeters || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchDiveMessages = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-messages/random`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.tagline?.text) {
          setTagline(data.tagline.text);
        }
        if (data.tip?.text) {
          setDiveTip(data.tip.text);
        }
      }
    } catch (error) {
      console.error('Error fetching dive messages:', error);
    }
  };

  const formatDiveTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Generate graduated color shades from the theme color
  const colorShades = generateColorShades(colors.primary);

  const statsData = [
    { icon: 'water', label: 'Total Dives', value: stats.totalDives.toString(), gradient: colorShades[0] },
    { icon: 'time', label: 'Dive Time', value: formatDiveTime(stats.totalTime), gradient: colorShades[1] },
    { icon: 'location', label: 'Dive Sites', value: stats.sitesVisited.toString(), gradient: colorShades[2] },
  ];

  const selectedActions = getSelectedQuickActions();
  const quickActions = selectedActions.map((action, index) => ({
    icon: action.icon,
    label: action.label,
    route: action.route,
    gradient: colorShades[3 + (index % 3)],
  }));

  return (
    <ThemedBackground>
      <PageHeader title="Erebus" />
      <View style={styles.container}>
        <View style={styles.welcomeSection}>
          <Text style={[styles.timeGreeting, { color: colors.primary }]}>
            {getTimeGreeting()}
          </Text>
          <Text style={[styles.userName, { color: colors.text }]}>
            {user?.firstName || user?.email?.split('@')[0] || 'Diver'}
          </Text>
          <Text style={[styles.welcomeMessage, { color: colors.textSecondary }]}>
            {tagline}
          </Text>
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
              {diveTip}
            </Text>
          </View>
        </View>
      </View>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  welcomeSection: {
    paddingTop: 24,
    paddingBottom: 16,
  },
  timeGreeting: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  welcomeMessage: {
    fontSize: 15,
    lineHeight: 22,
  },
  statsSection: {
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 14,
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
    minHeight: 120,
  },
  statCard: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    textAlign: 'center',
  },
  quickActionsSection: {
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
    minHeight: 120,
  },
  actionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  actionCard: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  tipCard: {
    marginTop: 'auto',
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
});
