import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import ThemedBackground from '@/components/ThemedBackground';
import EmbeddedMapPicker from '@/components/EmbeddedMapPicker';
import * as ImagePicker from 'expo-image-picker';

const DatePickerField = Platform.OS === 'android' ? null : require('@/components/DatePickerField').default;
const DEBUG_DISABLE_DATEPICKER = Platform.OS === 'android';

interface LinkedDiveLog {
  id: number;
  dive_date: string;
  site_name: string;
  max_depth_meters: number;
  duration_minutes: number;
}

interface DiveTrip {
  id: number;
  name: string;
  trip_type: string;
  start_date: string | null;
  end_date: string | null;
  operator_name: string | null;
  vessel_name: string | null;
  dive_center_name: string | null;
  location: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  accommodation: string | null;
  total_dives: number;
  notes: string | null;
  cover_image_key: string | null;
  linked_dives?: number | LinkedDiveLog[];
}

const TRIP_TYPES = [
  { value: 'liveaboard', label: 'Liveaboard', icon: 'anchor' },
  { value: 'dive_center', label: 'Dive Center', icon: 'home' },
  { value: 'safari', label: 'Dive Safari', icon: 'truck' },
  { value: 'resort', label: 'Dive Resort', icon: 'sun' },
  { value: 'day_trip', label: 'Day Trip', icon: 'clock' },
  { value: 'other', label: 'Other', icon: 'more-horizontal' },
];

export default function DiveTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(isNew);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [linkedDives, setLinkedDives] = useState<LinkedDiveLog[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    tripType: 'dive_center',
    startDate: '',
    endDate: '',
    operatorName: '',
    vesselName: '',
    diveCenterName: '',
    location: '',
    country: '',
    latitude: null as number | null,
    longitude: null as number | null,
    accommodation: '',
    notes: '',
    coverImageKey: null as string | null,
  });

  const [originalData, setOriginalData] = useState(formData);

  const fetchTrip = useCallback(async () => {
    if (!token || isNew) return;
    setLoading(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-trips/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const tripData = {
          name: data.name || '',
          tripType: data.trip_type || 'dive_center',
          startDate: data.start_date || '',
          endDate: data.end_date || '',
          operatorName: data.operator_name || '',
          vesselName: data.vessel_name || '',
          diveCenterName: data.dive_center_name || '',
          location: data.location || '',
          country: data.country || '',
          latitude: data.latitude != null ? parseFloat(data.latitude) : null,
          longitude: data.longitude != null ? parseFloat(data.longitude) : null,
          accommodation: data.accommodation || '',
          notes: data.notes || '',
          coverImageKey: data.cover_image_key || null,
        };
        setFormData(tripData);
        setOriginalData(tripData);
        setLinkedDives(data.linked_dives || []);
      } else {
        Alert.alert('Error', 'Failed to load trip');
        router.back();
      }
    } catch (error) {
      console.error('Fetch trip error:', error);
      Alert.alert('Error', 'Failed to load trip');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [token, id, isNew, router]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Trip name is required');
      return;
    }

    setSaving(true);
    try {
      const url = isNew
        ? `${getApiUrl()}/api/dive-trips`
        : `${getApiUrl()}/api/dive-trips/${id}`;
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        if (isNew) {
          router.back();
        } else {
          setOriginalData(formData);
          setIsEditing(false);
        }
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Failed to save trip');
      }
    } catch (error) {
      console.error('Save trip error:', error);
      Alert.alert('Error', 'Failed to save trip');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Trip',
      'Are you sure you want to delete this trip? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${getApiUrl()}/api/dive-trips/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (response.ok) {
                router.back();
              } else {
                Alert.alert('Error', 'Failed to delete trip');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete trip');
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    if (isNew) {
      router.back();
    } else {
      setFormData(originalData);
      setIsEditing(false);
    }
  };

  const pickCoverImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setUploadingImage(true);
      try {
        const asset = result.assets[0];
        
        // Step 1: Request upload URL from server
        const urlResponse = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: `trip-cover-${Date.now()}.jpg`,
            size: asset.fileSize || 0,
            contentType: 'image/jpeg',
          }),
        });

        if (!urlResponse.ok) {
          throw new Error('Failed to get upload URL');
        }

        const { uploadURL, objectPath } = await urlResponse.json();

        // Step 2: Fetch image as blob
        const imageResponse = await fetch(asset.uri);
        const imageBlob = await imageResponse.blob();

        // Step 3: Upload to object storage
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: imageBlob,
          headers: {
            'Content-Type': 'image/jpeg',
          },
        });

        if (uploadResponse.ok) {
          setFormData(prev => ({ ...prev, coverImageKey: objectPath }));
        } else {
          Alert.alert('Error', 'Failed to upload image');
        }
      } catch (error) {
        console.error('Upload error:', error);
        Alert.alert('Error', 'Failed to upload image');
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const getCoverImageUrl = (key: string | null) => {
    if (!key) return null;
    if (key.startsWith('/objects/')) {
      return `${getApiUrl()}${key}`;
    }
    return `${getApiUrl()}/objects/${key}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const getTripTypeLabel = (value: string) => {
    return TRIP_TYPES.find(t => t.value === value)?.label || value;
  };

  if (loading) {
    return (
      <ThemedBackground style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading trip...</Text>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="chevron-left" size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {isNew ? 'New Dive Trip' : isEditing ? 'Edit Trip' : formData.name}
        </Text>
        <View style={styles.headerActions}>
          {isEditing ? (
            <>
              <Pressable onPress={handleCancel} style={styles.headerBtn}>
                <Text style={[styles.headerBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSave} disabled={saving} style={styles.headerBtn}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.headerBtnText, { color: colors.primary, fontWeight: '600' }]}>Save</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setIsEditing(true)} style={styles.headerBtn}>
              <Feather name="edit-2" size={20} color={colors.primary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {isEditing ? (
          <>
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Trip Name *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.name}
                onChangeText={(v) => setFormData({ ...formData, name: v })}
                placeholder="e.g., Red Sea Liveaboard 2024"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Cover Photo</Text>
              {formData.coverImageKey ? (
                <View>
                  <Image
                    source={{ uri: getCoverImageUrl(formData.coverImageKey)! }}
                    style={styles.coverImagePreview}
                    resizeMode="cover"
                  />
                  <View style={styles.imageButtonRow}>
                    <Pressable
                      style={[styles.imageButton, { borderColor: colors.border }]}
                      onPress={() => setFormData(prev => ({ ...prev, coverImageKey: null }))}
                    >
                      <Feather name="trash-2" size={16} color={colors.primary} />
                      <Text style={[styles.imageButtonText, { color: colors.primary }]}>Remove</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.imageButton, { borderColor: colors.border }]}
                      onPress={pickCoverImage}
                    >
                      <Feather name="image" size={16} color={colors.primary} />
                      <Text style={[styles.imageButtonText, { color: colors.primary }]}>Change</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={[styles.uploadButton, { borderColor: colors.border }]}
                  onPress={pickCoverImage}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Feather name="upload" size={20} color={colors.textSecondary} />
                      <Text style={[styles.uploadButtonText, { color: colors.textSecondary }]}>
                        Add Cover Photo
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Trip Type</Text>
              <View style={styles.tripTypeGrid}>
                {TRIP_TYPES.map((type) => (
                  <Pressable
                    key={type.value}
                    style={[
                      styles.tripTypeOption,
                      { borderColor: formData.tripType === type.value ? colors.primary : colors.border },
                      formData.tripType === type.value && { backgroundColor: colors.primary + '15' },
                    ]}
                    onPress={() => setFormData({ ...formData, tripType: type.value })}
                  >
                    <Feather
                      name={type.icon as any}
                      size={18}
                      color={formData.tripType === type.value ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.tripTypeLabel,
                        { color: formData.tripType === type.value ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {type.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Start Date</Text>
                {!DEBUG_DISABLE_DATEPICKER && DatePickerField ? (
                  <DatePickerField
                    value={formData.startDate}
                    onChange={(date: string) => setFormData({ ...formData, startDate: date })}
                    placeholder="Select date"
                  />
                ) : (
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                    value={formData.startDate}
                    onChangeText={(v) => setFormData({ ...formData, startDate: v })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textSecondary}
                  />
                )}
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.formLabel, { color: colors.text }]}>End Date</Text>
                {!DEBUG_DISABLE_DATEPICKER && DatePickerField ? (
                  <DatePickerField
                    value={formData.endDate}
                    onChange={(date: string) => setFormData({ ...formData, endDate: date })}
                    placeholder="Select date"
                  />
                ) : (
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                    value={formData.endDate}
                    onChangeText={(v) => setFormData({ ...formData, endDate: v })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textSecondary}
                  />
                )}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Dive Center / Resort</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.diveCenterName}
                onChangeText={(v) => setFormData({ ...formData, diveCenterName: v })}
                placeholder="Name of dive center or resort"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Location</Text>
              <EmbeddedMapPicker
                latitude={formData.latitude || 0}
                longitude={formData.longitude || 0}
                onCoordinatesChange={(lat, lng) => {
                  setFormData(prev => ({
                    ...prev,
                    latitude: lat,
                    longitude: lng,
                  }));
                }}
                colors={colors}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Operator Name</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.operatorName}
                onChangeText={(v) => setFormData({ ...formData, operatorName: v })}
                placeholder="Tour operator or company"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {formData.tripType === 'liveaboard' && (
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Vessel Name</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  value={formData.vesselName}
                  onChangeText={(v) => setFormData({ ...formData, vesselName: v })}
                  placeholder="Name of the boat"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Accommodation</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.accommodation}
                onChangeText={(v) => setFormData({ ...formData, accommodation: v })}
                placeholder="Where you stayed"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Notes</Text>
              <TextInput
                style={[styles.formInput, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.notes}
                onChangeText={(v) => setFormData({ ...formData, notes: v })}
                placeholder="Additional notes about the trip"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
              />
            </View>

            {!isNew && (
              <Pressable style={[styles.deleteButton, { borderColor: '#FF3B30' }]} onPress={handleDelete}>
                <Feather name="trash-2" size={18} color="#FF3B30" />
                <Text style={styles.deleteButtonText}>Delete Trip</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            {formData.coverImageKey && (
              <Image
                source={{ uri: getCoverImageUrl(formData.coverImageKey)! }}
                style={styles.coverImage}
                resizeMode="cover"
              />
            )}

            <View style={styles.detailSection}>
              <View style={styles.detailRow}>
                <Feather name={TRIP_TYPES.find(t => t.value === formData.tripType)?.icon as any || 'map-pin'} size={18} color={colors.textSecondary} />
                <Text style={[styles.detailValue, { color: colors.text }]}>{getTripTypeLabel(formData.tripType)}</Text>
              </View>

              {(formData.startDate || formData.endDate) && (
                <View style={styles.detailRow}>
                  <Feather name="calendar" size={18} color={colors.textSecondary} />
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {formData.startDate ? formatDate(formData.startDate) : '?'} - {formData.endDate ? formatDate(formData.endDate) : '?'}
                  </Text>
                </View>
              )}

              {formData.location && (
                <View style={styles.detailRow}>
                  <Feather name="map-pin" size={18} color={colors.textSecondary} />
                  <Text style={[styles.detailValue, { color: colors.text }]}>
                    {formData.location}{formData.country ? `, ${formData.country}` : ''}
                  </Text>
                </View>
              )}

              {formData.diveCenterName && (
                <View style={styles.detailRow}>
                  <Feather name="home" size={18} color={colors.textSecondary} />
                  <Text style={[styles.detailValue, { color: colors.text }]}>{formData.diveCenterName}</Text>
                </View>
              )}

              {formData.operatorName && (
                <View style={styles.detailRow}>
                  <Feather name="briefcase" size={18} color={colors.textSecondary} />
                  <Text style={[styles.detailValue, { color: colors.text }]}>{formData.operatorName}</Text>
                </View>
              )}

              {formData.vesselName && (
                <View style={styles.detailRow}>
                  <Feather name="anchor" size={18} color={colors.textSecondary} />
                  <Text style={[styles.detailValue, { color: colors.text }]}>{formData.vesselName}</Text>
                </View>
              )}

              {formData.accommodation && (
                <View style={styles.detailRow}>
                  <Feather name="moon" size={18} color={colors.textSecondary} />
                  <Text style={[styles.detailValue, { color: colors.text }]}>{formData.accommodation}</Text>
                </View>
              )}
            </View>

            {linkedDives.length > 0 && (
              <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Linked Dives ({linkedDives.length})
                </Text>
                {linkedDives.map((dive) => (
                  <View key={dive.id} style={[styles.diveItem, { borderBottomColor: colors.border }]}>
                    <View>
                      <Text style={[styles.diveSiteName, { color: colors.text }]}>{dive.site_name || 'Unknown Site'}</Text>
                      <Text style={[styles.diveDate, { color: colors.textSecondary }]}>
                        {formatDate(dive.dive_date)}
                      </Text>
                    </View>
                    <View style={styles.diveStats}>
                      <Text style={[styles.diveStat, { color: colors.textSecondary }]}>{dive.max_depth_meters}m</Text>
                      <Text style={[styles.diveStat, { color: colors.textSecondary }]}>{dive.duration_minutes}min</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {formData.notes && (
              <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
                <Text style={[styles.notesText, { color: colors.text }]}>{formData.notes}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', marginHorizontal: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: { padding: 8 },
  headerBtnText: { fontSize: 16 },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },
  formGroup: { marginBottom: 20 },
  formRow: { flexDirection: 'row', gap: 12 },
  formLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  formInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  tripTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tripTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  tripTypeLabel: { fontSize: 13 },
  coverImagePreview: { width: '100%', height: 160, borderRadius: 8, marginBottom: 8 },
  imageButtonRow: { flexDirection: 'row', gap: 12 },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  imageButtonText: { fontSize: 14 },
  uploadButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  uploadButtonText: { fontSize: 14 },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 20,
  },
  deleteButtonText: { color: '#FF3B30', fontSize: 16, fontWeight: '500' },
  coverImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  detailSection: { gap: 12, marginBottom: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailValue: { fontSize: 16, flex: 1 },
  section: { borderRadius: 12, padding: 16, borderWidth: 1, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  diveItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  diveSiteName: { fontSize: 15, fontWeight: '500' },
  diveDate: { fontSize: 13, marginTop: 2 },
  diveStats: { flexDirection: 'row', gap: 12 },
  diveStat: { fontSize: 13 },
  notesText: { fontSize: 15, lineHeight: 22 },
});
