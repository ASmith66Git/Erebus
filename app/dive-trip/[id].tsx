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
  FlatList,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import ThemedBackground from '@/components/ThemedBackground';
import EmbeddedMapPicker from '@/components/EmbeddedMapPicker';
import StaticMapView from '@/components/StaticMapView';
import * as ImagePicker from 'expo-image-picker';

import DatePickerField from '@/components/DatePickerField';

type TabType = 'details' | 'dives' | 'photos';

interface LinkedDiveLog {
  id: number;
  dive_date: string;
  site_name: string;
  max_depth_meters: number;
  duration_minutes: number;
}

interface TripPhoto {
  id: number;
  image_url: string;
  caption: string | null;
  created_at: string;
}

interface AvailableDiveLog {
  id: number;
  dive_date: string;
  site_name: string;
  max_depth_meters: number;
  duration_minutes: number;
}

const TRIP_TYPES = [
  { value: 'liveaboard', label: 'Liveaboard', icon: 'anchor' },
  { value: 'dive_center', label: 'Dive Center', icon: 'home' },
  { value: 'safari', label: 'Dive Safari', icon: 'truck' },
  { value: 'resort', label: 'Dive Resort', icon: 'sun' },
  { value: 'day_trip', label: 'Day Trip', icon: 'clock' },
  { value: 'other', label: 'Other', icon: 'more-horizontal' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - 48 - 8) / 3;

export default function DiveTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(isNew);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [linkedDives, setLinkedDives] = useState<LinkedDiveLog[]>([]);
  const [tripPhotos, setTripPhotos] = useState<TripPhoto[]>([]);
  const [availableDives, setAvailableDives] = useState<AvailableDiveLog[]>([]);
  const [showDivePicker, setShowDivePicker] = useState(false);

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

  const fetchTripPhotos = useCallback(async () => {
    if (!token || isNew) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-trips/${id}/photos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTripPhotos(data.photos || data || []);
      }
    } catch (error) {
      console.error('Fetch photos error:', error);
    }
  }, [token, id, isNew]);

  const fetchAvailableDives = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAvailableDives(data.diveLogs || data || []);
      }
    } catch (error) {
      console.error('Fetch dives error:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  useEffect(() => {
    if (activeTab === 'photos' && !isNew) {
      fetchTripPhotos();
    }
  }, [activeTab, fetchTripPhotos, isNew]);

  useEffect(() => {
    if (activeTab === 'dives' && showDivePicker) {
      fetchAvailableDives();
    }
  }, [activeTab, showDivePicker, fetchAvailableDives]);

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
        const imageResponse = await fetch(asset.uri);
        const imageBlob = await imageResponse.blob();

        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: imageBlob,
          headers: { 'Content-Type': 'image/jpeg' },
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

  const uploadTripPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setUploadingImage(true);
      try {
        for (const asset of result.assets) {
          const urlResponse = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: `trip-photo-${Date.now()}.jpg`,
              size: asset.fileSize || 0,
              contentType: 'image/jpeg',
            }),
          });

          if (!urlResponse.ok) continue;

          const { uploadURL, objectPath } = await urlResponse.json();
          const imageResponse = await fetch(asset.uri);
          const imageBlob = await imageResponse.blob();

          const uploadResponse = await fetch(uploadURL, {
            method: 'PUT',
            body: imageBlob,
            headers: { 'Content-Type': 'image/jpeg' },
          });

          if (uploadResponse.ok) {
            await fetch(`${getApiUrl()}/api/dive-trips/${id}/photos`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ image_url: objectPath }),
            });
          }
        }
        fetchTripPhotos();
      } catch (error) {
        console.error('Upload error:', error);
        Alert.alert('Error', 'Failed to upload photos');
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const linkDiveToTrip = async (diveId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-trips/${id}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ diveLogId: diveId }),
      });
      if (response.ok) {
        fetchTrip();
        setShowDivePicker(false);
      }
    } catch (error) {
      console.error('Link dive error:', error);
    }
  };

  const unlinkDiveFromTrip = async (diveId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-trips/${id}/logs/${diveId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        fetchTrip();
      }
    } catch (error) {
      console.error('Unlink dive error:', error);
    }
  };

  const getImageUrl = (key: string | null) => {
    if (!key) return null;
    if (key.startsWith('/objects/')) return `${getApiUrl()}${key}`;
    if (key.startsWith('/')) return `${getApiUrl()}${key}`;
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

  const linkedDiveIds = new Set(linkedDives.map(d => d.id));
  const availableUnlinkedDives = availableDives.filter(d => !linkedDiveIds.has(d.id));

  if (loading) {
    return (
      <ThemedBackground style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading trip...</Text>
      </ThemedBackground>
    );
  }

  const renderTabBar = () => (
    <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
      {[
        { key: 'details', label: 'Details', icon: 'info' },
        { key: 'dives', label: 'Dives', icon: 'activity' },
        { key: 'photos', label: 'Photos', icon: 'image' },
      ].map((tab) => (
        <Pressable
          key={tab.key}
          style={[
            styles.tab,
            activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
          ]}
          onPress={() => setActiveTab(tab.key as TabType)}
        >
          <Feather
            name={tab.icon as any}
            size={18}
            color={activeTab === tab.key ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === tab.key ? colors.primary : colors.textSecondary },
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const renderDetailsTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
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
                  source={{ uri: getImageUrl(formData.coverImageKey)! }}
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

          <View style={[styles.formRow, { marginBottom: 20 }]}>
            <View style={styles.formRowDateGroup}>
              <DatePickerField
                label="Start Date"
                value={formData.startDate}
                onChange={(date: string) => setFormData({ ...formData, startDate: date })}
                placeholder="Select date"
              />
            </View>
            <View style={styles.formRowDateGroup}>
              <DatePickerField
                label="End Date"
                value={formData.endDate}
                onChange={(date: string) => setFormData({ ...formData, endDate: date })}
                placeholder="Select date"
                initialDisplayDate={formData.startDate}
                minDate={formData.startDate ? new Date(formData.startDate) : undefined}
              />
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
              onPlaceSelect={(placeData) => {
                if (placeData) {
                  setFormData(prev => ({
                    ...prev,
                    location: placeData.name || prev.location,
                    country: placeData.country || prev.country,
                  }));
                }
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
              source={{ uri: getImageUrl(formData.coverImageKey)! }}
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

          {formData.notes && (
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
              <Text style={[styles.notesText, { color: colors.text }]}>{formData.notes}</Text>
            </View>
          )}

          {formData.latitude && formData.longitude && (
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Location</Text>
              <View style={styles.mapContainer}>
                <StaticMapView
                  latitude={formData.latitude}
                  longitude={formData.longitude}
                  colors={colors}
                />
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );

  const renderDivesTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>
          Linked Dives ({linkedDives.length})
        </Text>
        {!isNew && (
          <Pressable
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowDivePicker(!showDivePicker)}
          >
            <Feather name={showDivePicker ? 'x' : 'plus'} size={18} color="#FFF" />
            <Text style={styles.addButtonText}>{showDivePicker ? 'Cancel' : 'Add'}</Text>
          </Pressable>
        )}
      </View>

      {showDivePicker && (
        <View style={[styles.pickerSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.pickerTitle, { color: colors.text }]}>Select dives to link:</Text>
          {availableUnlinkedDives.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No available dives to link
            </Text>
          ) : (
            availableUnlinkedDives.slice(0, 10).map((dive) => (
              <Pressable
                key={dive.id}
                style={[styles.pickableItem, { borderBottomColor: colors.border }]}
                onPress={() => linkDiveToTrip(dive.id)}
              >
                <View>
                  <Text style={[styles.diveSiteName, { color: colors.text }]}>{dive.site_name || 'Unknown Site'}</Text>
                  <Text style={[styles.diveDate, { color: colors.textSecondary }]}>{formatDate(dive.dive_date)}</Text>
                </View>
                <Feather name="plus-circle" size={20} color={colors.primary} />
              </Pressable>
            ))
          )}
        </View>
      )}

      {linkedDives.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="activity" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyStateTitle, { color: colors.text }]}>No Linked Dives</Text>
          <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
            Link dive logs to this trip to track your dives
          </Text>
        </View>
      ) : (
        linkedDives.map((dive) => (
          <View key={dive.id} style={[styles.diveCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.diveCardContent}>
              <Text style={[styles.diveSiteName, { color: colors.text }]}>{dive.site_name || 'Unknown Site'}</Text>
              <Text style={[styles.diveDate, { color: colors.textSecondary }]}>{formatDate(dive.dive_date)}</Text>
              <View style={styles.diveStats}>
                <Text style={[styles.diveStat, { color: colors.textSecondary }]}>{dive.max_depth_meters}m</Text>
                <Text style={[styles.diveStat, { color: colors.textSecondary }]}>{dive.duration_minutes}min</Text>
              </View>
            </View>
            <Pressable onPress={() => unlinkDiveFromTrip(dive.id)} style={styles.unlinkBtn}>
              <Feather name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderPhotosTab = () => (
    <View style={styles.tabContent}>
      <View style={[styles.sectionHeader, { paddingHorizontal: 16, paddingTop: 16 }]}>
        <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>
          Photos ({tripPhotos.length})
        </Text>
        {!isNew && (
          <Pressable
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={uploadTripPhoto}
            disabled={uploadingImage}
          >
            {uploadingImage ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Feather name="plus" size={18} color="#FFF" />
                <Text style={styles.addButtonText}>Add</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {tripPhotos.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="image" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyStateTitle, { color: colors.text }]}>No Photos</Text>
          <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
            Add photos from your trip
          </Text>
        </View>
      ) : (
        <FlatList
          data={tripPhotos}
          keyExtractor={(item) => item.id.toString()}
          numColumns={3}
          contentContainerStyle={styles.photoGrid}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => router.push(`/photo/${item.id}?mode=view&tripId=${id}&photoIndex=${index}` as any)}>
              <Image
                source={{ uri: getImageUrl(item.image_url)! }}
                style={[styles.photoThumbnail, { backgroundColor: colors.surface }]}
                resizeMode="cover"
              />
            </Pressable>
          )}
        />
      )}
    </View>
  );

  return (
    <ThemedBackground style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="chevron-left" size={28} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {isNew ? 'New Dive Trip' : formData.name}
        </Text>
        <View style={styles.headerActions}>
          {activeTab === 'details' && (
            isEditing ? (
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
            )
          )}
        </View>
      </View>

      {!isNew && renderTabBar()}

      {activeTab === 'details' && renderDetailsTab()}
      {activeTab === 'dives' && !isNew && renderDivesTab()}
      {activeTab === 'photos' && !isNew && renderPhotosTab()}
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabLabel: { fontSize: 14, fontWeight: '500' },
  tabContent: { flex: 1 },
  tabContentContainer: { padding: 16, paddingBottom: 40 },
  formGroup: { marginBottom: 20 },
  formRow: { flexDirection: 'row', gap: 12 },
  formRowDateGroup: { flex: 1, flexBasis: 0, minWidth: 0 },
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
  mapContainer: { height: 200, borderRadius: 8, overflow: 'hidden' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeaderTitle: { fontSize: 18, fontWeight: '600' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  addButtonText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  pickerSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  pickerTitle: { fontSize: 14, fontWeight: '500', marginBottom: 12 },
  pickableItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  diveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  diveCardContent: { flex: 1 },
  diveSiteName: { fontSize: 15, fontWeight: '500' },
  diveDate: { fontSize: 13, marginTop: 2 },
  diveStats: { flexDirection: 'row', gap: 12, marginTop: 6 },
  diveStat: { fontSize: 13 },
  unlinkBtn: { padding: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyStateTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyStateText: { fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  notesText: { fontSize: 15, lineHeight: 22 },
  photoGrid: { padding: 16, gap: 4 },
  photoThumbnail: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 4, margin: 2 },
});
