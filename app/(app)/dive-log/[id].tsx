import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';

interface DiveLog {
  id: number;
  diveSiteId: number | null;
  diveSiteName: string | null;
  diveDateTime: string;
  durationSeconds: number | null;
  maxDepthMeters: number | null;
  avgDepthMeters: number | null;
  minTemperatureCelsius: number | null;
  maxTemperatureCelsius: number | null;
  deviceManufacturer: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  samples: any[] | null;
  gasMixes: any[] | null;
  notes: string | null;
  rating: number | null;
  importSource: string;
  importFilename: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${secs}s`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEndTime(startStr: string, durationSeconds: number | null): string {
  if (!durationSeconds) return '--';
  const start = new Date(startStr);
  const end = new Date(start.getTime() + durationSeconds * 1000);
  return end.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Sample {
  time_seconds: number;
  depth_meters: number;
  temperature_celsius: number | null;
}

function DiveProfileChart({ samples, colors }: { samples: Sample[]; colors: any }) {
  if (!samples || samples.length === 0) return null;
  
  const maxDepth = Math.max(...samples.map(s => s.depth_meters));
  const maxTime = samples[samples.length - 1]?.time_seconds || 1;
  const chartHeight = 120;
  const chartWidth = 300;
  
  const points = samples.map((s, i) => {
    const x = (s.time_seconds / maxTime) * chartWidth;
    const y = (s.depth_meters / maxDepth) * chartHeight;
    return { x, y, sample: s };
  });

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 10, color: colors.textSecondary }}>0m</Text>
        <Text style={{ fontSize: 10, color: colors.textSecondary }}>
          {Math.floor(maxTime / 60)}min
        </Text>
      </View>
      <View 
        style={{ 
          height: chartHeight, 
          backgroundColor: colors.primary + '10',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {points.map((point, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: `${(point.x / chartWidth) * 100}%`,
              top: point.y,
              width: 3,
              height: 3,
              borderRadius: 1.5,
              backgroundColor: colors.primary,
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
          }}
        >
          <Text style={{ fontSize: 10, color: colors.textSecondary }}>
            {maxDepth.toFixed(1)}m max
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4, textAlign: 'center' }}>
        {samples.length} sample points recorded
      </Text>
    </View>
  );
}

export default function DiveLogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useAuth();
  const [diveLog, setDiveLog] = useState<DiveLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchDiveLog();
    }
  }, [id]);

  const fetchDiveLog = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${getApiUrl()}/api/dive-logs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Dive log not found');
      }

      const data = await response.json();
      setDiveLog(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load dive log');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    const doDelete = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/dive-logs/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Failed to delete dive log');
        }

        if (Platform.OS === 'web') {
          alert('Dive log deleted');
          router.back();
        } else {
          Alert.alert('Success', 'Dive log deleted', [
            { text: 'OK', onPress: () => router.back() },
          ]);
        }
      } catch (err: any) {
        if (Platform.OS === 'web') {
          alert(err.message || 'Failed to delete dive log');
        } else {
          Alert.alert('Error', err.message || 'Failed to delete dive log');
        }
      }
    };

    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to delete this dive log?')) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Dive Log', 'Are you sure you want to delete this dive log?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !diveLog) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Dive Log</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={[styles.centered, { flex: 1 }]}>
          <Feather name="alert-circle" size={48} color={colors.textSecondary} />
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            {error || 'Dive log not found'}
          </Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={fetchDiveLog}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Dive Log</Text>
        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Feather name="trash-2" size={20} color={colors.error || '#D22F00'} />
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary + '20' }]}>
            <Feather name="activity" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.heroDate, { color: colors.text }]}>
            {formatDate(diveLog.diveDateTime)}
          </Text>
          <Text style={[styles.heroTime, { color: colors.textSecondary }]}>
            {formatTime(diveLog.diveDateTime)}
          </Text>
          {diveLog.diveSiteName && (
            <View style={styles.locationRow}>
              <Feather name="map-pin" size={14} color={colors.primary} />
              <Text style={[styles.locationText, { color: colors.text }]}>
                {diveLog.diveSiteName}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Timing</Text>
          <View style={styles.timingGrid}>
            <View style={styles.timingItem}>
              <Feather name="play" size={16} color={colors.primary} />
              <Text style={[styles.timingLabel, { color: colors.textSecondary }]}>Start</Text>
              <Text style={[styles.timingValue, { color: colors.text }]}>
                {formatTime(diveLog.diveDateTime)}
              </Text>
            </View>
            <View style={styles.timingItem}>
              <Feather name="square" size={16} color={colors.primary} />
              <Text style={[styles.timingLabel, { color: colors.textSecondary }]}>End</Text>
              <Text style={[styles.timingValue, { color: colors.text }]}>
                {formatEndTime(diveLog.diveDateTime, diveLog.durationSeconds)}
              </Text>
            </View>
            <View style={styles.timingItem}>
              <Feather name="clock" size={16} color={colors.primary} />
              <Text style={[styles.timingLabel, { color: colors.textSecondary }]}>Duration</Text>
              <Text style={[styles.timingValue, { color: colors.text }]}>
                {formatDuration(diveLog.durationSeconds)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="arrow-down" size={20} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>
              {diveLog.maxDepthMeters?.toFixed(1) || '--'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Max Depth (m)</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="trending-down" size={20} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>
              {diveLog.avgDepthMeters?.toFixed(1) || '--'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Avg Depth (m)</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="thermometer" size={20} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>
              {diveLog.minTemperatureCelsius?.toFixed(1) || '--'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Min Temp (C)</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="thermometer" size={20} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>
              {diveLog.maxTemperatureCelsius?.toFixed(1) || '--'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Max Temp (C)</Text>
          </View>
        </View>

        {diveLog.samples && diveLog.samples.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Dive Profile</Text>
            <DiveProfileChart samples={diveLog.samples} colors={colors} />
          </View>
        )}

        {diveLog.rating && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Feather
                  key={star}
                  name="star"
                  size={24}
                  color={star <= diveLog.rating! ? colors.primary : colors.border}
                  style={{ marginRight: 4 }}
                />
              ))}
            </View>
          </View>
        )}

        {diveLog.notes && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
            <Text style={[styles.notesText, { color: colors.textSecondary }]}>
              {diveLog.notes}
            </Text>
          </View>
        )}

        {(diveLog.deviceManufacturer || diveLog.deviceModel) && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Dive Computer</Text>
            <View style={styles.deviceRow}>
              <Feather name="cpu" size={16} color={colors.textSecondary} />
              <Text style={[styles.deviceText, { color: colors.textSecondary }]}>
                {[diveLog.deviceManufacturer, diveLog.deviceModel].filter(Boolean).join(' ')}
              </Text>
            </View>
            {diveLog.deviceSerial && (
              <Text style={[styles.serialText, { color: colors.textSecondary }]}>
                S/N: {diveLog.deviceSerial}
              </Text>
            )}
          </View>
        )}

        {diveLog.gasMixes && diveLog.gasMixes.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Gas Mixes</Text>
            {diveLog.gasMixes.map((mix, index) => (
              <View key={index} style={styles.gasMixRow}>
                <Feather name="wind" size={16} color={colors.textSecondary} />
                <Text style={[styles.gasMixText, { color: colors.textSecondary }]}>
                  {mix.name}: O2 {mix.o2?.toFixed(0) || 21}%{mix.he ? `, He ${mix.he.toFixed(0)}%` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Import Details</Text>
          <View style={styles.importRow}>
            <Text style={[styles.importLabel, { color: colors.textSecondary }]}>Source:</Text>
            <Text style={[styles.importValue, { color: colors.text }]}>
              {diveLog.importSource.toUpperCase()}
            </Text>
          </View>
          {diveLog.importFilename && (
            <View style={styles.importRow}>
              <Text style={[styles.importLabel, { color: colors.textSecondary }]}>File:</Text>
              <Text style={[styles.importValue, { color: colors.text }]} numberOfLines={1}>
                {diveLog.importFilename}
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  deleteButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroDate: {
    fontSize: 20,
    fontWeight: '600',
  },
  heroTime: {
    fontSize: 16,
    marginTop: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  locationText: {
    fontSize: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  timingGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  timingItem: {
    alignItems: 'center',
    gap: 4,
  },
  timingLabel: {
    fontSize: 12,
  },
  timingValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  ratingRow: {
    flexDirection: 'row',
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceText: {
    fontSize: 14,
  },
  serialText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 24,
  },
  gasMixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  gasMixText: {
    fontSize: 14,
  },
  importRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  importLabel: {
    fontSize: 14,
    width: 60,
  },
  importValue: {
    fontSize: 14,
    flex: 1,
  },
  errorText: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
