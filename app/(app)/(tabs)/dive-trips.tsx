import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { getApiUrl } from '@/utils/apiConfig';
import EmbeddedMapPicker from '@/components/EmbeddedMapPicker';
import StaticMapView from '@/components/StaticMapView';
import PageHeader from '@/components/PageHeader';

// Dynamic import to prevent DatePickerField from loading on Android (causes latin1 encoding crash)
// iOS and web can use the date picker; only Android has the TextDecoder latin1 issue
const DatePickerField = Platform.OS === 'android' ? null : require('@/components/DatePickerField').default;
import * as ImagePicker from 'expo-image-picker';

const DEBUG_DISABLE_MAPS = false;
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

export default function DiveTripsScreen() {
  const { colors } = useTheme();
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();

  const [trips, setTrips] = useState<DiveTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<DiveTrip | null>(null);
  const [linkedDives, setLinkedDives] = useState<LinkedDiveLog[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editingTrip, setEditingTrip] = useState<DiveTrip | null>(null);
  const [saving, setSaving] = useState(false);

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
  const [uploadingImage, setUploadingImage] = useState(false);

  const resetForm = () => {
    setFormData({
      name: '',
      tripType: 'dive_center',
      startDate: '',
      endDate: '',
      operatorName: '',
      vesselName: '',
      diveCenterName: '',
      location: '',
      country: '',
      latitude: null,
      longitude: null,
      accommodation: '',
      notes: '',
      coverImageKey: null,
    });
    setEditingTrip(null);
  };

  const fetchTrips = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-trips`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTrips(data);
      }
    } catch (error) {
      console.error('Fetch trips error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const fetchTripDetails = useCallback(async (tripId: number) => {
    if (!token) return;
    setLoadingDetail(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-trips/${tripId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedTrip(data);
        setLinkedDives(data.linked_dives || []);
      }
    } catch (error) {
      console.error('Fetch trip details error:', error);
    } finally {
      setLoadingDetail(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading && token) {
      fetchTrips();
    }
  }, [authLoading, token, fetchTrips]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Trip name is required');
      return;
    }

    setSaving(true);
    try {
      const url = editingTrip
        ? `${getApiUrl()}/api/dive-trips/${editingTrip.id}`
        : `${getApiUrl()}/api/dive-trips`;
      const method = editingTrip ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowAddModal(false);
        resetForm();
        fetchTrips();
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

  const handleDelete = async (id: number) => {
    Alert.alert(
      'Delete Trip',
      'Are you sure you want to delete this trip?',
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
                setShowDetailModal(false);
                setSelectedTrip(null);
                fetchTrips();
              }
            } catch (error) {
              console.error('Delete trip error:', error);
            }
          },
        },
      ]
    );
  };

  const handleEdit = (trip: DiveTrip) => {
    setEditingTrip(trip);
    setFormData({
      name: trip.name,
      tripType: trip.trip_type,
      startDate: trip.start_date || '',
      endDate: trip.end_date || '',
      operatorName: trip.operator_name || '',
      vesselName: trip.vessel_name || '',
      diveCenterName: trip.dive_center_name || '',
      location: trip.location || '',
      country: trip.country || '',
      latitude: trip.latitude,
      longitude: trip.longitude,
      accommodation: trip.accommodation || '',
      notes: trip.notes || '',
      coverImageKey: trip.cover_image_key || null,
    });
    setShowDetailModal(false);
    setShowAddModal(true);
  };

  const pickImage = async (useCamera: boolean) => {
    try {
      let result;
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Required', 'Camera access is needed to take photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [16, 9],
          quality: 0.8,
        });
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Required', 'Photo library access is needed to select images.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [16, 9],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets[0]) {
        await uploadCoverImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadCoverImage = async (imageUri: string) => {
    if (!token) return;
    setUploadingImage(true);
    try {
      const filename = `trip-cover-${Date.now()}.jpg`;
      const presignedResponse = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: filename, contentType: 'image/jpeg' }),
      });

      if (!presignedResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL, objectPath } = await presignedResponse.json();

      const imageResponse = await fetch(imageUri);
      const imageBlob = await imageResponse.blob();

      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: imageBlob,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }

      setFormData(prev => ({ ...prev, coverImageKey: objectPath }));
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Error', 'Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const getCoverImageUrl = (key: string | null) => {
    if (!key) return null;
    if (key.startsWith('/objects/')) {
      return `${getApiUrl()}${key}`;
    }
    return `${getApiUrl()}/objects/${key}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getTripTypeInfo = (type: string) => {
    return TRIP_TYPES.find((t) => t.value === type) || TRIP_TYPES[5];
  };

  const renderTripCard = (trip: DiveTrip) => {
    const typeInfo = getTripTypeInfo(trip.trip_type);
    const coverUrl = getCoverImageUrl(trip.cover_image_key);
    return (
      <Pressable
        key={trip.id}
        style={[styles.tripCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => {
          setSelectedTrip(trip);
          setLinkedDives([]);
          setShowDetailModal(true);
          fetchTripDetails(trip.id);
        }}
      >
        <View style={styles.tripCardRow}>
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={styles.tripCardThumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.tripCardThumbnailPlaceholder, { backgroundColor: colors.primary + '15' }]}>
              <Feather name={typeInfo.icon as any} size={28} color={colors.primary} />
            </View>
          )}
          <View style={styles.tripCardContent}>
            <Text style={[styles.tripName, { color: colors.text }]} numberOfLines={1}>{trip.name}</Text>
            <Text style={[styles.tripType, { color: colors.textSecondary }]}>{typeInfo.label}</Text>
            
            {(trip.start_date || trip.end_date) && (
              <Text style={[styles.tripCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                {formatDate(trip.start_date)}{trip.end_date && ` - ${formatDate(trip.end_date)}`}
              </Text>
            )}
            {trip.location && (
              <Text style={[styles.tripCardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                {trip.location}{trip.country ? `, ${trip.country}` : ''}
              </Text>
            )}
            
            <Text style={[styles.tripCardDives, { color: colors.primary }]}>
              {typeof trip.linked_dives === 'number' ? trip.linked_dives : (Array.isArray(trip.linked_dives) ? trip.linked_dives.length : trip.total_dives || 0)} dives
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading trips...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PageHeader title="Dive Trips" />

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => renderTripCard(item)}
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, trips.length === 0 && styles.emptyContainer]}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTrips(); }} />
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="navigation" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyStateTitle, { color: colors.text }]}>No Dive Trips Yet</Text>
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              Start tracking your diving holidays, liveaboard adventures, and dive center visits.
            </Text>
            <Pressable
              style={[styles.emptyStateBtn, { backgroundColor: colors.primary }]}
              onPress={() => { resetForm(); setShowAddModal(true); }}
            >
              <Feather name="plus" size={18} color="#FFF" />
              <Text style={styles.emptyStateBtnText}>Add Dive Trip</Text>
            </Pressable>
          </View>
        }
      />

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => { resetForm(); setShowAddModal(true); }}
      >
        <Feather name="plus" size={24} color="#FFF" />
      </Pressable>

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingTrip ? 'Edit Dive Trip' : 'New Dive Trip'}
              </Text>
              <Pressable onPress={() => { setShowAddModal(false); resetForm(); }}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Trip Name *</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.name}
                  onChangeText={(v) => setFormData({ ...formData, name: v })}
                  placeholder="e.g., Red Sea Liveaboard 2024"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.coverImageSection}>
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
                        <Feather name="trash-2" size={16} color={colors.error} />
                        <Text style={[styles.imageButtonText, { color: colors.error }]}>Remove</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.imageButton, { borderColor: colors.primary }]}
                        onPress={() => pickImage(false)}
                        disabled={uploadingImage}
                      >
                        <Feather name="image" size={16} color={colors.primary} />
                        <Text style={[styles.imageButtonText, { color: colors.primary }]}>Change</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View>
                    <View style={[styles.coverImagePlaceholder, { borderColor: colors.border }]}>
                      {uploadingImage ? (
                        <ActivityIndicator size="large" color={colors.primary} />
                      ) : (
                        <>
                          <Feather name="image" size={32} color={colors.textSecondary} />
                          <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Add a cover photo</Text>
                        </>
                      )}
                    </View>
                    <View style={styles.imageButtonRow}>
                      <Pressable
                        style={[styles.imageButton, { borderColor: colors.border }]}
                        onPress={() => pickImage(true)}
                        disabled={uploadingImage}
                      >
                        <Feather name="camera" size={16} color={colors.text} />
                        <Text style={[styles.imageButtonText, { color: colors.text }]}>Camera</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.imageButton, { borderColor: colors.primary }]}
                        onPress={() => pickImage(false)}
                        disabled={uploadingImage}
                      >
                        <Feather name="image" size={16} color={colors.primary} />
                        <Text style={[styles.imageButtonText, { color: colors.primary }]}>Gallery</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Trip Type</Text>
                <View style={styles.tripTypeGrid}>
                  {TRIP_TYPES.map((type) => (
                    <Pressable
                      key={type.value}
                      style={[
                        styles.tripTypeBtn,
                        { borderColor: formData.tripType === type.value ? colors.primary : colors.border },
                        formData.tripType === type.value && { backgroundColor: colors.primary + '10' },
                      ]}
                      onPress={() => setFormData(prev => ({ ...prev, tripType: type.value }))}
                    >
                      <Feather name={type.icon as any} size={18} color={formData.tripType === type.value ? colors.primary : colors.textSecondary} />
                      <Text style={[styles.tripTypeBtnText, { color: formData.tripType === type.value ? colors.primary : colors.text }]}>
                        {type.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  {DEBUG_DISABLE_DATEPICKER ? (
                    <View style={styles.formGroup}>
                      <Text style={[styles.formLabel, { color: colors.text }]}>Start Date</Text>
                      <TextInput
                        style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                        value={formData.startDate}
                        onChangeText={(v) => setFormData(prev => ({ ...prev, startDate: v }))}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                  ) : (
                    <DatePickerField
                      label="Start Date"
                      value={formData.startDate}
                      onChange={(v) => setFormData(prev => ({ ...prev, startDate: v }))}
                      placeholder="Select start date"
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  {DEBUG_DISABLE_DATEPICKER ? (
                    <View style={styles.formGroup}>
                      <Text style={[styles.formLabel, { color: colors.text }]}>End Date</Text>
                      <TextInput
                        style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                        value={formData.endDate}
                        onChangeText={(v) => setFormData(prev => ({ ...prev, endDate: v }))}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                  ) : (
                    <DatePickerField
                      label="End Date"
                      value={formData.endDate}
                      onChange={(v) => setFormData(prev => ({ ...prev, endDate: v }))}
                      placeholder="Select end date"
                    />
                  )}
                </View>
              </View>

              {formData.tripType === 'liveaboard' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={[styles.formLabel, { color: colors.text }]}>Vessel Name</Text>
                    <TextInput
                      style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                      value={formData.vesselName}
                      onChangeText={(v) => setFormData(prev => ({ ...prev, vesselName: v }))}
                      placeholder="e.g., MY Blue Horizon"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={[styles.formLabel, { color: colors.text }]}>Operator</Text>
                    <TextInput
                      style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                      value={formData.operatorName}
                      onChangeText={(v) => setFormData(prev => ({ ...prev, operatorName: v }))}
                      placeholder="e.g., Emperor Divers"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                </>
              )}

              {(formData.tripType === 'dive_center' || formData.tripType === 'resort') && (
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>Dive Center / Resort</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={formData.diveCenterName}
                    onChangeText={(v) => setFormData(prev => ({ ...prev, diveCenterName: v }))}
                    placeholder="e.g., Coral Divers Koh Tao"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              )}

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>Location</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={formData.location}
                    onChangeText={(v) => setFormData(prev => ({ ...prev, location: v }))}
                    placeholder="e.g., Sharm El Sheikh"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>Country</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={formData.country}
                    onChangeText={(v) => setFormData(prev => ({ ...prev, country: v }))}
                    placeholder="e.g., Egypt"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Map Location</Text>
                {DEBUG_DISABLE_MAPS ? (
                  <View style={[styles.mapPlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Feather name="map" size={32} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Map disabled for debugging</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      Lat: {formData.latitude || 0}, Lng: {formData.longitude || 0}
                    </Text>
                  </View>
                ) : (
                  <EmbeddedMapPicker
                    latitude={formData.latitude || 0}
                    longitude={formData.longitude || 0}
                    onCoordinatesChange={(lat, lng) => {
                      setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
                    }}
                    colors={{
                      background: colors.background,
                      surface: colors.surface,
                      text: colors.text,
                      textSecondary: colors.textSecondary,
                      border: colors.border,
                      primary: colors.primary,
                    }}
                  />
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Accommodation</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.accommodation}
                  onChangeText={(v) => setFormData(prev => ({ ...prev, accommodation: v }))}
                  placeholder="e.g., Hilton Resort & Spa"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Notes</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.notes}
                  onChangeText={(v) => setFormData(prev => ({ ...prev, notes: v }))}
                  placeholder="Trip highlights, memorable moments..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary, { borderColor: colors.border }]}
                onPress={() => { setShowAddModal(false); resetForm(); }}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#FFF' }]}>
                    {editingTrip ? 'Update' : 'Create'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Trip Details</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable onPress={() => selectedTrip && handleEdit(selectedTrip)}>
                  <Feather name="edit-2" size={22} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => { setShowDetailModal(false); setSelectedTrip(null); }}>
                  <Feather name="x" size={24} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {selectedTrip && (
              <ScrollView style={styles.modalBody}>
                {selectedTrip.cover_image_key && (
                  <Image
                    source={{ uri: getCoverImageUrl(selectedTrip.cover_image_key)! }}
                    style={styles.detailCoverImage}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.detailSection}>
                  <View style={styles.detailHeader}>
                    <View style={[styles.tripTypeIcon, { backgroundColor: colors.primary + '20' }]}>
                      <Feather name={getTripTypeInfo(selectedTrip.trip_type).icon as any} size={24} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={[styles.detailName, { color: colors.text }]}>{selectedTrip.name}</Text>
                      <Text style={[styles.detailType, { color: colors.textSecondary }]}>
                        {getTripTypeInfo(selectedTrip.trip_type).label}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.detailCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {(selectedTrip.start_date || selectedTrip.end_date) && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Dates</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {formatDate(selectedTrip.start_date)}
                        {selectedTrip.end_date && ` - ${formatDate(selectedTrip.end_date)}`}
                      </Text>
                    </View>
                  )}
                  {selectedTrip.vessel_name && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Vessel</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{selectedTrip.vessel_name}</Text>
                    </View>
                  )}
                  {selectedTrip.operator_name && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Operator</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{selectedTrip.operator_name}</Text>
                    </View>
                  )}
                  {selectedTrip.dive_center_name && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Dive Center</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{selectedTrip.dive_center_name}</Text>
                    </View>
                  )}
                  {selectedTrip.location && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Location</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {selectedTrip.location}{selectedTrip.country ? `, ${selectedTrip.country}` : ''}
                      </Text>
                    </View>
                  )}
                  {selectedTrip.accommodation && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Accommodation</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{selectedTrip.accommodation}</Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Total Dives</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {linkedDives.length || selectedTrip.total_dives || 0}
                    </Text>
                  </View>
                </View>

                {selectedTrip.latitude && selectedTrip.longitude && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Map</Text>
                    {DEBUG_DISABLE_MAPS ? (
                      <View style={[styles.mapPlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <Feather name="map-pin" size={32} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Map disabled for debugging</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                          Lat: {selectedTrip.latitude}, Lng: {selectedTrip.longitude}
                        </Text>
                      </View>
                    ) : (
                      <StaticMapView
                        latitude={selectedTrip.latitude}
                        longitude={selectedTrip.longitude}
                        colors={colors}
                      />
                    )}
                  </View>
                )}

                {selectedTrip.notes && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
                    <Text style={[styles.notesText, { color: colors.textSecondary }]}>{selectedTrip.notes}</Text>
                  </View>
                )}

                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Linked Dives ({linkedDives.length})
                  </Text>
                  {loadingDetail ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
                  ) : linkedDives.length === 0 ? (
                    <View style={[styles.emptyDivesBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Feather name="activity" size={24} color={colors.textSecondary} />
                      <Text style={[styles.emptyDivesText, { color: colors.textSecondary }]}>
                        No dives linked to this trip yet
                      </Text>
                      <Text style={[styles.emptyDivesHint, { color: colors.textSecondary }]}>
                        Link dives from your dive logs
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.linkedDivesList}>
                      {linkedDives.map((dive) => (
                        <View
                          key={dive.id}
                          style={[styles.linkedDiveItem, { backgroundColor: colors.background, borderColor: colors.border }]}
                        >
                          <View style={styles.linkedDiveInfo}>
                            <Text style={[styles.linkedDiveSite, { color: colors.text }]}>
                              {dive.site_name || 'Unknown Site'}
                            </Text>
                            <Text style={[styles.linkedDiveDate, { color: colors.textSecondary }]}>
                              {formatDate(dive.dive_date)}
                            </Text>
                          </View>
                          <View style={styles.linkedDiveStats}>
                            <Text style={[styles.linkedDiveStat, { color: colors.primary }]}>
                              {dive.max_depth_meters}m
                            </Text>
                            <Text style={[styles.linkedDiveStat, { color: colors.textSecondary }]}>
                              {dive.duration_minutes}min
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <Pressable
                  style={[styles.deleteBtn, { borderColor: colors.error }]}
                  onPress={() => handleDelete(selectedTrip.id)}
                >
                  <Feather name="trash-2" size={18} color={colors.error} />
                  <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete Trip</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyStateTitle: { fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyStateText: { fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 },
  emptyStateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, marginTop: 24 },
  emptyStateBtnText: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  tripCard: { borderRadius: 12, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  tripCardRow: { flexDirection: 'row', alignItems: 'stretch' },
  tripCardThumbnail: { width: 90, height: 110, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  tripCardThumbnailPlaceholder: { width: 90, height: 110, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tripCardContent: { padding: 10, flex: 1, justifyContent: 'center' },
  tripCardMeta: { fontSize: 12, marginTop: 2 },
  tripCardDives: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  detailCoverImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 16 },
  coverImageSection: { marginBottom: 16 },
  coverImagePreview: { width: '100%', height: 160, borderRadius: 12, marginBottom: 12 },
  coverImagePlaceholder: { width: '100%', height: 120, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  imageButtonRow: { flexDirection: 'row', gap: 12 },
  imageButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 8, borderWidth: 1 },
  imageButtonText: { fontSize: 14, fontWeight: '500' },
  tripCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  tripTypeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tripCardHeaderText: { flex: 1 },
  tripName: { fontSize: 18, fontWeight: '700' },
  tripType: { fontSize: 13, marginTop: 2 },
  tripCardDetails: { gap: 6 },
  tripDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripDetailText: { fontSize: 13 },
  tripCardFooter: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  tripStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripStatText: { fontSize: 13, fontWeight: '500' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  modalBody: { padding: 16 },
  modalFooter: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  modalBtnSecondary: { borderWidth: 1 },
  modalBtnPrimary: {},
  modalBtnText: { fontSize: 16, fontWeight: '600' },
  formGroup: { marginBottom: 16 },
  formRow: { flexDirection: 'row', gap: 12 },
  formLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  formInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  formTextarea: { height: 100, textAlignVertical: 'top' },
  tripTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tripTypeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  tripTypeBtnText: { fontSize: 13, fontWeight: '500' },
  detailSection: { marginBottom: 20 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailName: { fontSize: 22, fontWeight: '700' },
  detailType: { fontSize: 14, marginTop: 2 },
  detailCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  detailLabel: { fontSize: 14 },
  detailValue: { fontSize: 14, fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  notesText: { fontSize: 14, lineHeight: 20 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, marginBottom: 16, paddingVertical: 14, borderRadius: 8, borderWidth: 1 },
  deleteBtnText: { fontSize: 16, fontWeight: '500' },
  emptyDivesBox: { alignItems: 'center', padding: 24, borderRadius: 12, borderWidth: 1, gap: 8 },
  emptyDivesText: { fontSize: 14, fontWeight: '500' },
  emptyDivesHint: { fontSize: 12 },
  linkedDivesList: { gap: 8 },
  linkedDiveItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, borderWidth: 1 },
  linkedDiveInfo: { flex: 1 },
  linkedDiveSite: { fontSize: 14, fontWeight: '600' },
  linkedDiveDate: { fontSize: 12, marginTop: 2 },
  linkedDiveStats: { flexDirection: 'row', gap: 12 },
  linkedDiveStat: { fontSize: 13, fontWeight: '500' },
  mapPlaceholder: { height: 200, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
