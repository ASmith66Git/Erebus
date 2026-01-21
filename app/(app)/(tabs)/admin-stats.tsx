import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';

interface Stats {
  totals: {
    users: number;
    diveLogs: number;
    buddies: number;
    gearProfiles: number;
    diveSites: number;
    photos: number;
    certifications: number;
    diveTrips: number;
  };
  usersByMonth: { month: string; count: number }[];
}

export default function AdminStatsScreen() {
  const { colors, isDark } = useTheme();
  const { token, isAdmin } = useAuth();
  const navigation = useNavigation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      console.log('Fetching stats from:', `${getApiUrl()}/api/admin/stats`);
      const response = await fetch(`${getApiUrl()}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Stats response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Stats data:', data);
        setStats(data);
      } else {
        const errorText = await response.text();
        console.error('Stats error response:', errorText);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (!isAdmin) {
    return (
      <ThemedBackground>
        <SafeAreaView style={styles.container} edges={['top']}>
          <PageHeader
            title="Admin Stats"
            leftIcon="menu"
            onLeftPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          />
          <View style={styles.centered}>
            <Text style={{ color: colors.text }}>Admin access required</Text>
          </View>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  const statCards = stats ? [
    { label: 'Users', value: stats.totals.users, icon: 'people', color: '#007AFF' },
    { label: 'Dive Logs', value: stats.totals.diveLogs, icon: 'journal', color: '#34C759' },
    { label: 'Buddies', value: stats.totals.buddies, icon: 'people-circle', color: '#FF9500' },
    { label: 'Gear Profiles', value: stats.totals.gearProfiles, icon: 'build', color: '#AF52DE' },
    { label: 'Dive Sites', value: stats.totals.diveSites, icon: 'location', color: '#FF3B30' },
    { label: 'Photos', value: stats.totals.photos, icon: 'images', color: '#5856D6' },
    { label: 'Certifications', value: stats.totals.certifications, icon: 'ribbon', color: '#FF2D55' },
    { label: 'Dive Trips', value: stats.totals.diveTrips, icon: 'airplane', color: '#00C7BE' },
  ] : [];

  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.min(screenWidth - 64, 500);
  const chartHeight = 200;
  const padding = { left: 50, right: 20, top: 20, bottom: 40 };
  const chartW = chartWidth - padding.left - padding.right;
  const chartH = chartHeight - padding.top - padding.bottom;

  const renderUserGrowthChart = () => {
    if (!stats || stats.usersByMonth.length === 0) {
      return (
        <View style={[styles.chartContainer, { backgroundColor: colors.card }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>User Growth (Last 12 Months)</Text>
          <View style={styles.emptyChart}>
            <Text style={{ color: colors.textSecondary }}>No data available</Text>
          </View>
        </View>
      );
    }

    const data = stats.usersByMonth;
    const maxCount = Math.max(...data.map(d => d.count), 1);
    const barWidth = Math.max(chartW / data.length - 8, 10);

    return (
      <View style={[styles.chartContainer, { backgroundColor: colors.card }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>User Growth (Last 12 Months)</Text>
        <Svg width={chartWidth} height={chartHeight}>
          <Line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartH} stroke={colors.border} strokeWidth={1} />
          <Line x1={padding.left} y1={padding.top + chartH} x2={padding.left + chartW} y2={padding.top + chartH} stroke={colors.border} strokeWidth={1} />
          
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = padding.top + chartH * (1 - ratio);
            const value = Math.round(maxCount * ratio);
            return (
              <React.Fragment key={i}>
                <Line x1={padding.left - 5} y1={y} x2={padding.left + chartW} y2={y} stroke={colors.border} strokeWidth={0.5} strokeDasharray="3,3" />
                <SvgText x={padding.left - 8} y={y + 4} fontSize={10} fill={colors.textSecondary} textAnchor="end">{value}</SvgText>
              </React.Fragment>
            );
          })}

          {data.map((d, i) => {
            const x = padding.left + (i + 0.5) * (chartW / data.length) - barWidth / 2;
            const barHeight = (d.count / maxCount) * chartH;
            const y = padding.top + chartH - barHeight;
            const monthLabel = d.month.split('-')[1];
            
            return (
              <React.Fragment key={d.month}>
                <Rect x={x} y={y} width={barWidth} height={barHeight} fill={colors.primary} rx={3} />
                <SvgText x={x + barWidth / 2} y={padding.top + chartH + 15} fontSize={9} fill={colors.textSecondary} textAnchor="middle">{monthLabel}</SvgText>
                {d.count > 0 && (
                  <SvgText x={x + barWidth / 2} y={y - 5} fontSize={9} fill={colors.text} textAnchor="middle">{d.count}</SvgText>
                )}
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    );
  };

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.container} edges={['top']}>
        <PageHeader
          title="Platform Statistics"
          leftIcon="menu"
          onLeftPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        />

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView 
            style={styles.content}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
          >
            <View style={styles.statsGrid}>
              {statCards.map((card, index) => (
                <View key={index} style={[styles.statCard, { backgroundColor: colors.card }]}>
                  <View style={[styles.iconCircle, { backgroundColor: card.color + '20' }]}>
                    <Ionicons name={card.icon as any} size={24} color={card.color} />
                  </View>
                  <Text style={[styles.statValue, { color: colors.text }]}>{card.value.toLocaleString()}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{card.label}</Text>
                </View>
              ))}
            </View>

            {renderUserGrowthChart()}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  statCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  chartContainer: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  emptyChart: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
