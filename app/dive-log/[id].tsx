import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import { useTranslation } from 'react-i18next';

interface Sample {
  time_seconds: number;
  depth_meters: number;
  temperature_celsius: number | null;
}

interface DiveLog {
  id: number;
  userId: number;
  diveSiteId: number | null;
  diveSiteName: string | null;
  gearProfileId: number | null;
  diveDateTime: string;
  durationSeconds: number | null;
  maxDepthMeters: number | null;
  avgDepthMeters: number | null;
  minTemperatureCelsius: number | null;
  maxTemperatureCelsius: number | null;
  deviceManufacturer: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  samples: Sample[] | null;
  gasMixes: any[] | null;
  notes: string | null;
  rating: number | null;
  importSource: string;
  importFilename: string | null;
  surfaceConditions: string | null;
  weatherConditions: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GearProfile {
  id: number;
  name: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function calculateEndTime(startDateStr: string, durationSeconds: number | null): string {
  if (!durationSeconds) return '--';
  const startDate = new Date(startDateStr);
  const endDate = new Date(startDate.getTime() + durationSeconds * 1000);
  return endDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function DepthProfile({ samples, colors }: { samples: Sample[]; colors: any }) {
  if (!samples || samples.length === 0) return null;

  const screenWidth = Dimensions.get('window').width - 64;
  const height = 200;
  const padding = 32;

  const maxTime = Math.max(...samples.map(s => s.time_seconds));
  const maxDepth = Math.max(...samples.map(s => s.depth_meters));

  const points = samples.map(s => ({
    x: padding + (s.time_seconds / maxTime) * (screenWidth - padding * 2),
    y: padding + (s.depth_meters / maxDepth) * (height - padding * 2),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const timeMarkers = [0, maxTime / 2, maxTime].map(t => ({
    label: `${Math.floor(t / 60)}m`,
    x: padding + (t / maxTime) * (screenWidth - padding * 2),
  }));

  const depthMarkers = [0, maxDepth / 2, maxDepth].map(d => ({
    label: `${d.toFixed(0)}m`,
    y: padding + (d / maxDepth) * (height - padding * 2),
  }));

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.profileContainer, { borderColor: colors.border }]}>
        <Text style={[styles.profileTitle, { color: colors.text }]}>Depth Profile</Text>
        <svg width={screenWidth} height={height} style={{ marginTop: 8 }}>
          <defs>
            <linearGradient id="depthGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colors.primary} stopOpacity="0.3" />
              <stop offset="100%" stopColor={colors.primary} stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {depthMarkers.map((m, i) => (
            <g key={`depth-${i}`}>
              <line
                x1={padding}
                y1={m.y}
                x2={screenWidth - padding}
                y2={m.y}
                stroke={colors.border}
                strokeDasharray="4,4"
              />
              <text x={4} y={m.y + 4} fill={colors.textSecondary} fontSize="10">
                {m.label}
              </text>
            </g>
          ))}
          {timeMarkers.map((m, i) => (
            <text key={`time-${i}`} x={m.x} y={height - 8} fill={colors.textSecondary} fontSize="10" textAnchor="middle">
              {m.label}
            </text>
          ))}
          <path
            d={`${pathD} L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`}
            fill="url(#depthGradient)"
          />
          <path d={pathD} stroke={colors.primary} strokeWidth="2" fill="none" />
          {samples.map((s, i) => (
            s.temperature_celsius && i % Math.max(1, Math.floor(samples.length / 10)) === 0 ? (
              <circle
                key={`temp-${i}`}
                cx={points[i].x}
                cy={points[i].y}
                r="3"
                fill="#FF6B6B"
              />
            ) : null
          ))}
        </svg>
        <View style={styles.profileLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Depth</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.profileContainer, { borderColor: colors.border }]}>
      <Text style={[styles.profileTitle, { color: colors.text }]}>Depth Profile</Text>
      <View style={[styles.profilePlaceholder, { backgroundColor: colors.surface }]}>
        <Feather name="activity" size={32} color={colors.primary} />
        <Text style={[styles.profilePlaceholderText, { color: colors.textSecondary }]}>
          {samples.length} samples recorded
        </Text>
        <Text style={[styles.profilePlaceholderSubtext, { color: colors.textSecondary }]}>
          Max: {maxDepth.toFixed(1)}m | Duration: {Math.floor(maxTime / 60)}m
        </Text>
      </View>
    </View>
  );
}

function StatRow({ icon, label, value, colors }: { icon: string; label: string; value: string; colors: any }) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statRowLeft}>
        <Feather name={icon as any} size={18} color={colors.primary} />
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export default function DiveLogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { token } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [log, setLog] = useState<DiveLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState('');
  const [editedRating, setEditedRating] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<{id: number; imageUrl: string; caption: string | null}[]>([]);
  const [gearProfileName, setGearProfileName] = useState<string | null>(null);

  const isNew = id === 'new';

  const fetchLog = useCallback(async () => {
    if (!token || isNew) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setLog(data);
        setEditedNotes(data.notes || '');
        setEditedRating(data.rating || 0);
      } else {
        Alert.alert(t('common.error'), t('diveLogs.failedToLoadDiveLog'));
        router.back();
      }
    } catch (error) {
      console.error('Error fetching dive log:', error);
      Alert.alert(t('common.error'), t('diveLogs.failedToLoadDiveLog'));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [token, id, isNew]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  const fetchPhotos = useCallback(async () => {
    if (!token || !id || isNew) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs/${id}/photos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setPhotos(data.photos || []);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
    }
  }, [token, id, isNew]);

  useFocusEffect(useCallback(() => {
    fetchPhotos();
  }, [fetchPhotos]));

  useEffect(() => {
    const fetchGearProfile = async () => {
      if (!token || !log?.gearProfileId) {
        setGearProfileName(null);
        return;
      }
      try {
        const response = await fetch(`${getApiUrl()}/api/gear-profiles/${log.gearProfileId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setGearProfileName(data.name || null);
        }
      } catch (error) {
        console.error('Error fetching gear profile:', error);
      }
    };
    fetchGearProfile();
  }, [token, log?.gearProfileId]);

  const handleSave = async () => {
    if (!token || !log) return;

    setSaving(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs/${log.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: editedNotes,
          rating: editedRating,
        }),
      });

      if (response.ok) {
        const updatedLog = await response.json();
        setLog({ ...log, notes: editedNotes, rating: editedRating });
        setEditing(false);
      } else {
        Alert.alert(t('common.error'), t('diveLogs.failedToSaveChanges'));
      }
    } catch (error) {
      console.error('Error saving dive log:', error);
      Alert.alert(t('common.error'), t('diveLogs.failedToSaveChanges'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('diveLogs.deleteDiveLog'),
      t('diveLogs.deleteDiveLogConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!token || !log) return;
            try {
              const response = await fetch(`${getApiUrl()}/api/dive-logs/${log.id}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });
              if (response.ok) {
                router.back();
              } else {
                Alert.alert(t('common.error'), t('diveLogs.failedToDeleteDiveLog'));
              }
            } catch (error) {
              console.error('Error deleting dive log:', error);
              Alert.alert(t('common.error'), t('diveLogs.failedToDeleteDiveLog'));
            }
          },
        },
      ]
    );
  };

  const renderRatingStars = () => {
    return (
      <View style={styles.ratingContainer}>
        {[1, 2, 3, 4, 5].map(star => (
          <Pressable
            key={star}
            onPress={() => editing && setEditedRating(star)}
            disabled={!editing}
          >
            <Feather
              name={star <= (editing ? editedRating : (log?.rating || 0)) ? 'star' : 'star'}
              size={24}
              color={star <= (editing ? editedRating : (log?.rating || 0)) ? '#FFC107' : colors.border}
            />
          </Pressable>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: t('diveLogs.loadingDiveLog') }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!log) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: t('diveLogs.notFound') }} />
        <Text style={{ color: colors.text }}>Dive log not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: formatDateTime(log.diveDateTime).split(',')[0],
          headerRight: () => (
            <View style={styles.headerActions}>
              {editing ? (
                <>
                  <Pressable onPress={() => setEditing(false)} style={styles.headerButton}>
                    <Feather name="x" size={22} color={colors.error} />
                  </Pressable>
                  <Pressable onPress={handleSave} style={styles.headerButton} disabled={saving}>
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Feather name="check" size={22} color={colors.primary} />
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={() => setEditing(true)} style={styles.headerButton}>
                    <Feather name="edit-2" size={20} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={handleDelete} style={styles.headerButton}>
                    <Feather name="trash-2" size={20} color={colors.error} />
                  </Pressable>
                </>
              )}
            </View>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.header, { borderColor: colors.border }]}>
          {renderRatingStars()}
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Dive Information</Text>
          <StatRow icon="calendar" label="Date" value={formatDate(log.diveDateTime)} colors={colors} />
          <StatRow icon="play" label="Start Time" value={formatTime(log.diveDateTime)} colors={colors} />
          <StatRow icon="stop-circle" label="End Time" value={calculateEndTime(log.diveDateTime, log.durationSeconds)} colors={colors} />
          <StatRow icon="clock" label="Duration" value={formatDuration(log.durationSeconds)} colors={colors} />
          <StatRow icon="thermometer" label="Min Temp" value={log.minTemperatureCelsius ? `${log.minTemperatureCelsius.toFixed(0)}°C` : '--'} colors={colors} />
          <StatRow icon="wind" label="Surface Conditions" value={log.surfaceConditions || '--'} colors={colors} />
          <StatRow icon="cloud" label="Weather" value={log.weatherConditions || '--'} colors={colors} />
          <StatRow icon="map-pin" label="Dive Site" value={log.diveSiteName || '--'} colors={colors} />
          <StatRow icon="briefcase" label="Gear Profile" value={gearProfileName || '--'} colors={colors} />
        </View>

        {log.samples && log.samples.length > 0 && (
          <DepthProfile samples={log.samples} colors={colors} />
        )}

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Dive Statistics</Text>
          <StatRow icon="arrow-down" label="Max Depth" value={log.maxDepthMeters ? `${log.maxDepthMeters.toFixed(1)} m` : '--'} colors={colors} />
          <StatRow icon="trending-up" label="Avg Depth" value={log.avgDepthMeters ? `${log.avgDepthMeters.toFixed(1)} m` : '--'} colors={colors} />
        </View>

        {(log.deviceManufacturer || log.deviceModel) && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Device Information</Text>
            {log.deviceManufacturer && (
              <StatRow icon="cpu" label="Manufacturer" value={log.deviceManufacturer} colors={colors} />
            )}
            {log.deviceModel && (
              <StatRow icon="hard-drive" label="Model" value={log.deviceModel} colors={colors} />
            )}
            {log.deviceSerial && (
              <StatRow icon="hash" label="Serial" value={log.deviceSerial} colors={colors} />
            )}
          </View>
        )}

        {log.gasMixes && log.gasMixes.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Gas Mixes</Text>
            {log.gasMixes.map((mix, i) => (
              <View key={i} style={styles.gasMixRow}>
                <Text style={[styles.gasMixName, { color: colors.text }]}>{mix.name || `Mix ${i + 1}`}</Text>
                <Text style={[styles.gasMixDetails, { color: colors.textSecondary }]}>
                  O₂: {mix.o2}% | He: {mix.he}%
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
          {editing ? (
            <TextInput
              style={[styles.notesInput, { color: colors.text, borderColor: colors.border }]}
              value={editedNotes}
              onChangeText={setEditedNotes}
              multiline
              placeholder={t("diveLogs.notesPlaceholder")}
              placeholderTextColor={colors.textSecondary}
            />
          ) : (
            <Text style={[styles.notes, { color: log.notes ? colors.text : colors.textSecondary }]}>
              {log.notes || t('diveLogs.noNotesRecorded')}
            </Text>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.photosSectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Photos</Text>
            <Pressable 
              onPress={() => router.push(`/(app)/(tabs)/photos?diveLogId=${id}`)}
              style={styles.addPhotoButton}
            >
              <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
            </Pressable>
          </View>
          {photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosCarousel}>
              {photos.map((photo) => {
                const photoUrl = photo.imageUrl.startsWith('/') ? `${getApiUrl()}${photo.imageUrl}` : photo.imageUrl;
                return (
                  <Pressable 
                    key={photo.id} 
                    onPress={() => router.push(`/photo/${photo.id}`)}
                    style={styles.photoThumbnail}
                  >
                    <Image source={{ uri: photoUrl }} style={styles.photoImage} resizeMode="cover" />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Pressable 
              style={[styles.emptyPhotos, { borderColor: colors.border }]}
              onPress={() => router.push(`/(app)/(tabs)/photos?diveLogId=${id}`)}
            >
              <Ionicons name="images-outline" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyPhotosText, { color: colors.textSecondary }]}>
                No photos yet. Tap to add some!
              </Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.metaSection, { borderColor: colors.border }]}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            Source: {log.importSource === 'manual' ? 'Manual entry' : `Imported (${log.importSource.toUpperCase()})`}
            {log.importFilename ? ` - ${log.importFilename}` : ''}
          </Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            Created: {new Date(log.createdAt).toLocaleDateString()}
          </Text>
        </View>
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
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  header: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  dateTime: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  siteName: {
    fontSize: 16,
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  section: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statLabel: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  profileContainer: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  profileTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  profilePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderRadius: 8,
    marginTop: 12,
  },
  profilePlaceholderText: {
    fontSize: 14,
    marginTop: 12,
  },
  profilePlaceholderSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  profileLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
  },
  gasMixRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  gasMixName: {
    fontSize: 14,
    fontWeight: '500',
  },
  gasMixDetails: {
    fontSize: 14,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  notes: {
    fontSize: 14,
    lineHeight: 22,
  },
  metaSection: {
    paddingTop: 16,
    borderTopWidth: 1,
  },
  metaText: {
    fontSize: 12,
    marginBottom: 4,
  },
  photosSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addPhotoButton: {
    padding: 4,
  },
  photosCarousel: {
    marginHorizontal: -8,
  },
  photoThumbnail: {
    marginHorizontal: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  emptyPhotos: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    gap: 8,
  },
  emptyPhotosText: {
    fontSize: 14,
  },
});
