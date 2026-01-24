import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
  Image,
  Dimensions,
  Alert,
  Modal,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import EmbeddedMapPicker from '@/components/EmbeddedMapPicker';
import StaticMapView from '@/components/StaticMapView';
import { getApiUrl } from '@/utils/apiConfig';
import * as ImagePicker from 'expo-image-picker';
import ThemedBackground from '@/components/ThemedBackground';

const DEBUG_DISABLE_MAPS = false;

const { width } = Dimensions.get('window');

interface DiveSiteImage {
  id: number;
  diveSiteId: number;
  imageUrl: string;
  caption: string | null;
  isPrimary: boolean;
  isStock: boolean;
  attribution: string | null;
  createdAt: string;
}


interface DiveSite {
  id: number;
  name: string;
  description: string | null;
  siteType: string;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  region: string | null;
  waterType: string;
  depthMax: number | null;
  visibilityMin: number | null;
  visibilityMax: number | null;
  currentStrength: string | null;
  accessNotes: string | null;
  facilities: string[];
  hazards: string[];
  bestSeason: string | null;
  ratingAvg: number;
  ratingsCount: number;
  wikipediaUrl: string | null;
  externalInfo: string | null;
  imageUrl: string | null;
  images: DiveSiteImage[];
  isWreck: boolean;
  wreckName: string | null;
  wreckUrl: string | null;
  wreckInfo: string | null;
}

interface WikipediaInfo {
  title: string;
  extract: string;
  thumbnail: string | null;
  url: string | null;
}

interface TideData {
  time: string;
  height: number;
  type: 'high' | 'low';
}

interface WeatherData {
  temperature?: number;
  temperatureMax?: number;
  temperatureMin?: number;
  temperatureUnit?: string;
  humidity?: number;
  precipitation?: number;
  weatherCode?: number;
  windSpeed?: number;
  windSpeedUnit?: string;
  windDirection?: number;
  waveHeight?: number;
  waveHeightUnit?: string;
  waveDirection?: number;
  wavePeriod?: number;
  wavePeriodUnit?: string;
  currentVelocity?: number;
  currentVelocityUnit?: string;
  currentDirection?: number;
  tides?: TideData[];
  isMarine?: boolean;
  isToday?: boolean;
  forecastDate?: string;
  fetchedAt?: string;
}

const weatherCodeLabels: { [key: number]: string } = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

const getWindDirection = (degrees: number): string => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
};

const baseTabs = ['Overview', 'Conditions', 'Media', 'Notes'];

const siteTypeLabels: { [key: string]: string } = {
  reef: 'Reef',
  wreck: 'Wreck',
  cave: 'Cave',
  wall: 'Wall',
  drift: 'Drift',
  quarry: 'Quarry',
  lake: 'Lake',
  river: 'River',
  sinkhole: 'Sink Hole',
  artificial: 'Artificial Reef',
  other: 'Other',
};

const waterTypeOptions = [
  { value: 'marine', label: 'Marine (Saltwater)' },
  { value: 'inland', label: 'Normal (Freshwater)' },
];

const currentStrengthOptions = [
  { value: 'none', label: 'None' },
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'strong', label: 'Strong' },
  { value: 'variable', label: 'Variable' },
];

const bestSeasonOptions = [
  { value: 'year-round', label: 'Year Round' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  { value: 'winter', label: 'Winter' },
  { value: 'spring-summer', label: 'Spring - Summer' },
  { value: 'summer-autumn', label: 'Summer - Autumn' },
  { value: 'autumn-winter', label: 'Autumn - Winter' },
  { value: 'winter-spring', label: 'Winter - Spring' },
];

const siteTypeOptions = Object.entries(siteTypeLabels).map(([value, label]) => ({ value, label }));

function StarRating({ rating, onRatingChange, editable, colors, size = 28 }: { rating: number; onRatingChange?: (rating: number) => void; editable: boolean; colors: any; size?: number }) {
  return (
    <View style={starStyles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => editable && onRatingChange?.(star)}
          disabled={!editable}
          style={starStyles.star}
        >
          <Feather
            name="star"
            size={size}
            color={star <= rating ? '#FFC107' : '#9E9E9E'}
          />
        </Pressable>
      ))}
      <Text style={[starStyles.ratingText, { color: colors.textSecondary, fontSize: size * 0.5 }]}>
        {Math.round(rating)}/5
      </Text>
    </View>
  );
}

const starStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  star: {
    padding: 2,
  },
  ratingText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
});

function PickerDropdown({ 
  label, 
  value, 
  options, 
  onValueChange, 
  colors,
  placeholder = 'Select...'
}: { 
  label: string;
  value: string | null | undefined;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
  colors: any;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(opt => opt.value === value);

  return (
    <View style={pickerStyles.container}>
      <Text style={[pickerStyles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        style={[pickerStyles.button, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setIsOpen(true)}
      >
        <Text style={[pickerStyles.buttonText, { color: selectedOption ? colors.text : colors.textSecondary }]}>
          {selectedOption?.label || placeholder}
        </Text>
        <Feather name="chevron-down" size={20} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade">
        <Pressable style={pickerStyles.overlay} onPress={() => setIsOpen(false)}>
          <View style={[pickerStyles.modal, { backgroundColor: colors.surface }]}>
            <View style={[pickerStyles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[pickerStyles.modalTitle, { color: colors.text }]}>{label}</Text>
              <Pressable onPress={() => setIsOpen(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={pickerStyles.optionsList}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    pickerStyles.option,
                    value === option.value && { backgroundColor: colors.primary + '20' }
                  ]}
                  onPress={() => {
                    onValueChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  <Text style={[
                    pickerStyles.optionText,
                    { color: value === option.value ? colors.primary : colors.text }
                  ]}>
                    {option.label}
                  </Text>
                  {value === option.value && (
                    <Feather name="check" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  optionsList: {
    maxHeight: 300,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  optionText: {
    fontSize: 16,
  },
});

export default function DiveSiteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  const [site, setSite] = useState<DiveSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSite, setEditedSite] = useState<Partial<DiveSite>>({});
  const [saving, setSaving] = useState(false);
  const [wikipediaInfo, setWikipediaInfo] = useState<WikipediaInfo | null>(null);
  const [loadingWiki, setLoadingWiki] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [siteImages, setSiteImages] = useState<DiveSiteImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<DiveSiteImage | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  const isNewSite = id === 'new';

  const fetchSite = useCallback(async () => {
    if (!token || isNewSite) {
      setLoading(false);
      setIsEditing(true);
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/dive-sites/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSite(data);
        setEditedSite(data);
      }
    } catch (error) {
      console.error('Error fetching dive site:', error);
    } finally {
      setLoading(false);
    }
  }, [token, id, isNewSite]);

  const fetchWikipediaInfo = useCallback(async () => {
    if (!token || !site?.id || !site?.isWreck) return;

    setLoadingWiki(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-sites/${site.id}/wikipedia`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.title) {
          setWikipediaInfo(data);
        }
      }
    } catch (error) {
      console.error('Error fetching Wikipedia info:', error);
    } finally {
      setLoadingWiki(false);
    }
  }, [token, site?.id, site?.isWreck]);

  useEffect(() => {
    fetchSite();
  }, [fetchSite]);

  useEffect(() => {
    if (site?.isWreck) {
      fetchWikipediaInfo();
    }
  }, [site?.isWreck, fetchWikipediaInfo]);

  const fetchWeather = useCallback(async (date?: string) => {
    if (!token || !site?.id || !site?.latitude || !site?.longitude) return;

    setLoadingWeather(true);
    try {
      const dateParam = date || selectedDate;
      const response = await fetch(`${getApiUrl()}/api/dive-sites/${site.id}/weather?date=${dateParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setWeatherData(data);
      }
    } catch (error) {
      console.error('Error fetching weather:', error);
    } finally {
      setLoadingWeather(false);
    }
  }, [token, site?.id, site?.latitude, site?.longitude, selectedDate]);

  useEffect(() => {
    if (site?.latitude && site?.longitude) {
      fetchWeather(selectedDate);
    }
  }, [site?.latitude, site?.longitude]);

  const fetchSiteImages = useCallback(async () => {
    if (!token || !site?.id) return;

    setLoadingImages(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-sites/${site.id}/images`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSiteImages(data);
      }
    } catch (error) {
      console.error('Error fetching images:', error);
    } finally {
      setLoadingImages(false);
    }
  }, [token, site?.id]);

  useEffect(() => {
    if (site?.id) {
      fetchSiteImages();
    }
  }, [site?.id, fetchSiteImages]);

  const handleImageUpload = async () => {
    if (!token || !site?.id || Platform.OS !== 'web') {
      Alert.alert('Info', 'Image upload is only available on web for now');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadingImage(true);
      try {
        const urlResponse = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        });

        if (!urlResponse.ok) {
          throw new Error('Failed to get upload URL');
        }

        const { uploadURL, objectPath } = await urlResponse.json();

        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload file');
        }

        const addImageResponse = await fetch(`${getApiUrl()}/api/dive-sites/${site.id}/images`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrl: objectPath,
            caption: null,
            isPrimary: siteImages.length === 0,
          }),
        });

        if (addImageResponse.ok) {
          const newImage = await addImageResponse.json();
          setSiteImages(prev => [...prev, newImage]);
          Alert.alert('Success', 'Image uploaded successfully');
        }
      } catch (error) {
        console.error('Error uploading image:', error);
        Alert.alert('Error', 'Failed to upload image');
      } finally {
        setUploadingImage(false);
      }
    };
    input.click();
  };

  const handleTakePhoto = async () => {
    if (!token || !site?.id) {
      Alert.alert('Error', 'Please save the dive site first');
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingImage(true);

    try {
      const fileName = `photo_${Date.now()}.jpg`;
      const fileSize = asset.fileSize || 100000;

      const urlResponse = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: fileName,
          size: fileSize,
          contentType: 'image/jpeg',
        }),
      });

      if (!urlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL, objectPath } = await urlResponse.json();

      const photoResponse = await fetch(asset.uri);
      const photoBlob = await photoResponse.blob();

      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: photoBlob,
        headers: { 'Content-Type': 'image/jpeg' },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload photo');
      }

      const addImageResponse = await fetch(`${getApiUrl()}/api/dive-sites/${site.id}/images`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: objectPath,
          caption: null,
          isPrimary: siteImages.length === 0,
        }),
      });

      if (addImageResponse.ok) {
        const newImage = await addImageResponse.json();
        setSiteImages(prev => [...prev, newImage]);
        Alert.alert('Success', 'Photo saved successfully');
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to save photo');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSearchWeb = () => {
    const searchQuery = encodeURIComponent(`${site?.name || 'dive site'} underwater photos`);
    const url = `https://www.google.com/search?q=${searchQuery}&tbm=isch`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const setImageAsPrimary = async (imageId: number) => {
    if (!token || !site?.id) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/dive-sites/${site.id}/images/${imageId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isPrimary: true }),
      });

      if (response.ok) {
        const updatedImage = await response.json();
        setSiteImages(prev => prev.map(img => ({
          ...img,
          isPrimary: img.id === imageId
        })));
        setSite(prev => prev ? { ...prev, imageUrl: updatedImage.imageUrl } : prev);
        setShowImageModal(false);
        Alert.alert('Success', 'Primary image updated');
      }
    } catch (error) {
      console.error('Error setting primary image:', error);
    }
  };

  const deleteImage = async (imageId: number) => {
    if (!token || !site?.id) return;

    const doDelete = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/dive-sites/${site.id}/images/${imageId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          setSiteImages(prev => prev.filter(img => img.id !== imageId));
          setShowImageModal(false);
          if (Platform.OS === 'web') {
            alert('Image deleted successfully');
          } else {
            Alert.alert('Success', 'Image deleted');
          }
        }
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this image?')) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Image', 'Are you sure you want to delete this image?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleSave = async () => {
    if (!token) return;

    setSaving(true);
    try {
      const url = isNewSite
        ? `${getApiUrl()}/api/dive-sites`
        : `${getApiUrl()}/api/dive-sites/${id}`;
      const method = isNewSite ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editedSite),
      });

      if (response.ok) {
        const data = await response.json();
        if (isNewSite) {
          router.replace(`/dive-site/${data.id}` as any);
        } else {
          setSite({ ...site, ...data } as DiveSite);
          setIsEditing(false);
        }
        Alert.alert('Success', isNewSite ? 'Dive site created!' : 'Changes saved!');
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Error', 'Failed to save dive site');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (isNewSite) {
      router.back();
    } else {
      setEditedSite(site || {});
      setIsEditing(false);
    }
  };

  const handleDeleteSite = async () => {
    if (!token || !id || isNewSite) return;

    const doDelete = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/dive-sites/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          Alert.alert('Success', 'Dive site deleted');
          router.back();
        } else {
          const error = await response.json();
          Alert.alert('Error', error.error || 'Failed to delete dive site');
        }
      } catch (error) {
        console.error('Error deleting dive site:', error);
        Alert.alert('Error', 'Failed to delete dive site');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this dive site? This action cannot be undone.')) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Dive Site',
        'Are you sure you want to delete this dive site? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const updateField = (field: keyof DiveSite, value: any) => {
    setEditedSite((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <ThemedBackground style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </ThemedBackground>
    );
  }

  const displaySite = isEditing ? editedSite : site;
  
  const showWreckTab = displaySite?.isWreck || false;
  const tabs = showWreckTab 
    ? ['Overview', 'Conditions', 'Media', 'Wreck', 'Notes']
    : baseTabs;

  const renderOverviewTab = () => (
    <View style={styles.tabContent}>
      {isEditing ? (
        <>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Name *</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={editedSite.name || ''}
              onChangeText={(v) => updateField('name', v)}
              placeholder="Dive site name"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Description</Text>
            <TextInput
              style={[styles.formInput, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={editedSite.description || ''}
              onChangeText={(v) => updateField('description', v)}
              placeholder="Describe this dive site..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <PickerDropdown
                label="Site Type *"
                value={editedSite.siteType}
                options={siteTypeOptions}
                onValueChange={(v) => updateField('siteType', v)}
                colors={colors}
                placeholder="Select type..."
              />
            </View>
            <View style={{ flex: 1 }}>
              <PickerDropdown
                label="Water Type *"
                value={editedSite.waterType}
                options={waterTypeOptions}
                onValueChange={(v) => updateField('waterType', v)}
                colors={colors}
                placeholder="Select water type..."
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Max Depth (m)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editedSite.depthMax?.toString() || ''}
                onChangeText={(v) => updateField('depthMax', v ? parseFloat(v) : null)}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <PickerDropdown
                label="Current Strength"
                value={editedSite.currentStrength}
                options={currentStrengthOptions}
                onValueChange={(v) => updateField('currentStrength', v)}
                colors={colors}
                placeholder="Select..."
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Visibility Min (m)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editedSite.visibilityMin?.toString() || ''}
                onChangeText={(v) => updateField('visibilityMin', v ? parseFloat(v) : null)}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Visibility Max (m)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editedSite.visibilityMax?.toString() || ''}
                onChangeText={(v) => updateField('visibilityMax', v ? parseFloat(v) : null)}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <PickerDropdown
              label="Best Season"
              value={editedSite.bestSeason}
              options={bestSeasonOptions}
              onValueChange={(v) => updateField('bestSeason', v)}
              colors={colors}
              placeholder="Select best season..."
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Rating</Text>
            <StarRating
              rating={editedSite.ratingAvg || 0}
              onRatingChange={(rating) => updateField('ratingAvg', rating)}
              editable={true}
              colors={colors}
            />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Country</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editedSite.country || ''}
                onChangeText={(v) => updateField('country', v)}
                placeholder="Country"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Region</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editedSite.region || ''}
                onChangeText={(v) => updateField('region', v)}
                placeholder="Region"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Location</Text>
            {DEBUG_DISABLE_MAPS ? (
              <View style={[styles.mapPlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="map" size={32} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Map disabled for debugging</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Lat: {editedSite.latitude || 0}, Lng: {editedSite.longitude || 0}
                </Text>
              </View>
            ) : (
              <EmbeddedMapPicker
                latitude={editedSite.latitude || 0}
                longitude={editedSite.longitude || 0}
                onCoordinatesChange={(lat, lng) => {
                  updateField('latitude', lat);
                  updateField('longitude', lng);
                }}
                onPlaceSelect={(placeData) => {
                  if (placeData.country) {
                    updateField('country', placeData.country);
                  }
                  if (placeData.region) {
                    updateField('region', placeData.region);
                  }
                }}
                colors={colors}
              />
            )}
          </View>

          <Pressable
            style={styles.checkboxRow}
            onPress={() => updateField('isWreck', !editedSite.isWreck)}
          >
            <View style={[
              styles.checkbox,
              { borderColor: colors.border },
              editedSite.isWreck && { backgroundColor: colors.primary, borderColor: colors.primary }
            ]}>
              {editedSite.isWreck && <Feather name="check" size={14} color="#fff" />}
            </View>
            <Text style={[styles.checkboxLabel, { color: colors.text }]}>This is a wreck/shipwreck dive site</Text>
          </Pressable>
        </>
      ) : (
        <>
          {displaySite?.description && (
            <Text style={[styles.descriptionCompact, { color: colors.textSecondary }]}>
              {displaySite.description}
            </Text>
          )}

          <View style={[styles.detailsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.detailRow}>
              <View style={styles.detailRowIcon}>
                <Feather name="layers" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.detailRowLabel, { color: colors.textSecondary }]}>Type</Text>
              <Text style={[styles.detailRowValue, { color: colors.text }]}>
                {siteTypeLabels[displaySite?.siteType || ''] || displaySite?.siteType}
              </Text>
            </View>
            <View style={[styles.detailRowDivider, { backgroundColor: colors.border }]} />
            <View style={styles.detailRow}>
              <View style={styles.detailRowIcon}>
                <Feather name="droplet" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.detailRowLabel, { color: colors.textSecondary }]}>Water</Text>
              <Text style={[styles.detailRowValue, { color: colors.text }]}>
                {displaySite?.waterType === 'marine' ? 'Marine' : 'Normal'}
              </Text>
            </View>
            {displaySite?.depthMax && (
              <>
                <View style={[styles.detailRowDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailRow}>
                  <View style={styles.detailRowIcon}>
                    <Feather name="arrow-down" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.detailRowLabel, { color: colors.textSecondary }]}>Max Depth</Text>
                  <Text style={[styles.detailRowValue, { color: colors.text }]}>
                    {displaySite.depthMax}m
                  </Text>
                </View>
              </>
            )}
            {(displaySite?.visibilityMin || displaySite?.visibilityMax) && (
              <>
                <View style={[styles.detailRowDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailRow}>
                  <View style={styles.detailRowIcon}>
                    <Feather name="eye" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.detailRowLabel, { color: colors.textSecondary }]}>Visibility</Text>
                  <Text style={[styles.detailRowValue, { color: colors.text }]}>
                    {displaySite?.visibilityMin && displaySite?.visibilityMax 
                      ? `${displaySite.visibilityMin} - ${displaySite.visibilityMax}m`
                      : displaySite?.visibilityMax 
                        ? `${displaySite.visibilityMax}m` 
                        : `${displaySite?.visibilityMin}m`}
                  </Text>
                </View>
              </>
            )}
            {displaySite?.currentStrength && (
              <>
                <View style={[styles.detailRowDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailRow}>
                  <View style={styles.detailRowIcon}>
                    <Feather name="wind" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.detailRowLabel, { color: colors.textSecondary }]}>Current</Text>
                  <Text style={[styles.detailRowValue, { color: colors.text }]}>
                    {currentStrengthOptions.find(o => o.value === displaySite.currentStrength)?.label || displaySite.currentStrength}
                  </Text>
                </View>
              </>
            )}
            {displaySite?.bestSeason && (
              <>
                <View style={[styles.detailRowDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailRow}>
                  <View style={styles.detailRowIcon}>
                    <Feather name="calendar" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.detailRowLabel, { color: colors.textSecondary }]}>Best Season</Text>
                  <Text style={[styles.detailRowValue, { color: colors.text }]}>
                    {bestSeasonOptions.find(o => o.value === displaySite.bestSeason)?.label || displaySite.bestSeason}
                  </Text>
                </View>
              </>
            )}
            {(displaySite?.country || displaySite?.region) && (
              <>
                <View style={[styles.detailRowDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailRow}>
                  <View style={styles.detailRowIcon}>
                    <Feather name="map-pin" size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.detailRowLabel, { color: colors.textSecondary }]}>Location</Text>
                  <Text style={[styles.detailRowValue, { color: colors.text }]} numberOfLines={1}>
                    {[displaySite.region, displaySite.country].filter(Boolean).join(', ')}
                  </Text>
                </View>
              </>
            )}
            <View style={[styles.detailRowDivider, { backgroundColor: colors.border }]} />
            <View style={styles.detailRow}>
              <View style={styles.detailRowIcon}>
                <Feather name="star" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.detailRowLabel, { color: colors.textSecondary }]}>Rating</Text>
              <StarRating rating={displaySite?.ratingAvg || 0} editable={false} colors={colors} size={16} />
            </View>
          </View>

          {displaySite?.latitude && displaySite?.longitude && (
            <View style={styles.mapSection}>
              {DEBUG_DISABLE_MAPS ? (
                <View style={[styles.mapPlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="map-pin" size={32} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Map disabled for debugging</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Lat: {displaySite.latitude}, Lng: {displaySite.longitude}
                  </Text>
                </View>
              ) : (
                <StaticMapView
                  latitude={displaySite.latitude}
                  longitude={displaySite.longitude}
                  colors={colors}
                />
              )}
            </View>
          )}
        </>
      )}
    </View>
  );

  const renderConditionsTab = () => (
    <View style={styles.tabContent}>
      {isEditing ? (
        <View style={[styles.editConditionsNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="info" size={20} color={colors.textSecondary} />
          <Text style={[styles.editConditionsText, { color: colors.textSecondary }]}>
            Weather conditions are fetched live from Open-Meteo. Dive conditions (depth, visibility, etc.) are recorded in individual dive logs.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Weather Forecast</Text>
              <Pressable onPress={() => fetchWeather(selectedDate)} style={styles.refreshButton}>
                <Feather name="refresh-cw" size={16} color={colors.primary} />
              </Pressable>
            </View>

            <View style={styles.datePickerRow}>
              <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>Date:</Text>
              <View style={styles.dateButtonsRow}>
                {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
                  const date = new Date();
                  date.setDate(date.getDate() + dayOffset);
                  const dateStr = date.toISOString().split('T')[0];
                  const isSelected = selectedDate === dateStr;
                  const dayLabel = dayOffset === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' });
                  return (
                    <Pressable
                      key={dateStr}
                      style={[
                        styles.dateButton,
                        { backgroundColor: isSelected ? colors.primary : colors.surface, borderColor: colors.border },
                      ]}
                      onPress={() => {
                        setSelectedDate(dateStr);
                        fetchWeather(dateStr);
                      }}
                    >
                      <Text style={[styles.dateButtonText, { color: isSelected ? '#fff' : colors.text }]}>
                        {dayLabel}
                      </Text>
                      <Text style={[styles.dateButtonDate, { color: isSelected ? '#fff' : colors.textSecondary }]}>
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {loadingWeather ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : weatherData ? (
              <View style={styles.weatherContainer}>
                <View style={styles.conditionsGrid}>
                  {(weatherData.temperature !== undefined || weatherData.temperatureMax !== undefined) && (
                    <View style={[styles.conditionCard, { backgroundColor: colors.surface }]}>
                      <Feather name="thermometer" size={24} color={colors.primary} />
                      <Text style={[styles.conditionLabel, { color: colors.textSecondary }]}>Temperature</Text>
                      <Text style={[styles.conditionValue, { color: colors.text }]}>
                        {weatherData.isToday 
                          ? `${weatherData.temperature}${weatherData.temperatureUnit}`
                          : `${weatherData.temperatureMin} - ${weatherData.temperatureMax}${weatherData.temperatureUnit}`
                        }
                      </Text>
                    </View>
                  )}
                  {weatherData.weatherCode !== undefined && (
                    <View style={[styles.conditionCard, { backgroundColor: colors.surface }]}>
                      <Feather name="cloud" size={24} color={colors.primary} />
                      <Text style={[styles.conditionLabel, { color: colors.textSecondary }]}>Conditions</Text>
                      <Text style={[styles.conditionValue, { color: colors.text }]}>
                        {weatherCodeLabels[weatherData.weatherCode] || 'Unknown'}
                      </Text>
                    </View>
                  )}
                  {weatherData.windSpeed !== undefined && (
                    <View style={[styles.conditionCard, { backgroundColor: colors.surface }]}>
                      <Feather name="wind" size={24} color={colors.primary} />
                      <Text style={[styles.conditionLabel, { color: colors.textSecondary }]}>Wind</Text>
                      <Text style={[styles.conditionValue, { color: colors.text }]}>
                        {weatherData.windSpeed} {weatherData.windSpeedUnit} {weatherData.windDirection !== undefined ? getWindDirection(weatherData.windDirection) : ''}
                      </Text>
                    </View>
                  )}
                  {weatherData.humidity !== undefined && (
                    <View style={[styles.conditionCard, { backgroundColor: colors.surface }]}>
                      <Feather name="droplet" size={24} color={colors.primary} />
                      <Text style={[styles.conditionLabel, { color: colors.textSecondary }]}>Humidity</Text>
                      <Text style={[styles.conditionValue, { color: colors.text }]}>{weatherData.humidity}%</Text>
                    </View>
                  )}
                </View>

                {weatherData.isMarine && (
                  <>
                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>Marine Conditions</Text>
                    <View style={styles.conditionsGrid}>
                      {weatherData.waveHeight !== undefined && (
                        <View style={[styles.conditionCard, { backgroundColor: colors.surface }]}>
                          <Feather name="activity" size={24} color={colors.primary} />
                          <Text style={[styles.conditionLabel, { color: colors.textSecondary }]}>Wave Height</Text>
                          <Text style={[styles.conditionValue, { color: colors.text }]}>
                            {weatherData.waveHeight} {weatherData.waveHeightUnit}
                          </Text>
                        </View>
                      )}
                      {weatherData.wavePeriod !== undefined && (
                        <View style={[styles.conditionCard, { backgroundColor: colors.surface }]}>
                          <Feather name="clock" size={24} color={colors.primary} />
                          <Text style={[styles.conditionLabel, { color: colors.textSecondary }]}>Wave Period</Text>
                          <Text style={[styles.conditionValue, { color: colors.text }]}>
                            {weatherData.wavePeriod} {weatherData.wavePeriodUnit}
                          </Text>
                        </View>
                      )}
                      {weatherData.currentVelocity !== undefined && (
                        <View style={[styles.conditionCard, { backgroundColor: colors.surface }]}>
                          <Feather name="navigation" size={24} color={colors.primary} />
                          <Text style={[styles.conditionLabel, { color: colors.textSecondary }]}>Current</Text>
                          <Text style={[styles.conditionValue, { color: colors.text }]}>
                            {weatherData.currentVelocity} {weatherData.currentVelocityUnit} {weatherData.currentDirection !== undefined ? getWindDirection(weatherData.currentDirection) : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  </>
                )}

                {weatherData.tides && weatherData.tides.length > 0 && (
                  <>
                    <Text style={[styles.subsectionTitle, { color: colors.text }]}>Tides</Text>
                    <View style={styles.tidesContainer}>
                      {weatherData.tides.map((tide, index) => (
                        <View key={index} style={[styles.tideCard, { backgroundColor: colors.surface }]}>
                          <View style={styles.tideIconContainer}>
                            <Feather 
                              name={tide.type === 'high' ? 'arrow-up' : 'arrow-down'} 
                              size={20} 
                              color={tide.type === 'high' ? '#4CAF50' : '#2196F3'} 
                            />
                          </View>
                          <View style={styles.tideInfo}>
                            <Text style={[styles.tideType, { color: colors.text }]}>
                              {tide.type === 'high' ? 'High Tide' : 'Low Tide'}
                            </Text>
                            <Text style={[styles.tideTime, { color: colors.textSecondary }]}>
                              {new Date(tide.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                          <Text style={[styles.tideHeight, { color: colors.primary }]}>
                            {tide.height.toFixed(2)}m
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {weatherData.fetchedAt && (
                  <Text style={[styles.weatherTimestamp, { color: colors.textSecondary }]}>
                    Updated: {new Date(weatherData.fetchedAt).toLocaleTimeString()}
                  </Text>
                )}
              </View>
            ) : (
              <View style={[styles.weatherPlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="map-pin" size={32} color={colors.textSecondary} />
                <Text style={[styles.weatherPlaceholderText, { color: colors.textSecondary }]}>
                  Add location coordinates to see weather data
                </Text>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );

  const getImageUrl = (imageUrl: string) => {
    if (imageUrl.startsWith('/objects/')) {
      return `${getApiUrl()}${imageUrl}`;
    }
    return imageUrl;
  };

  const renderMediaTab = () => (
    <View style={styles.tabContent}>
      {!isNewSite && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Photos</Text>
          </View>
          
          {!loadingImages && (
            <View style={styles.mediaButtonRow}>
              <Pressable
                onPress={handleSearchWeb}
                style={[styles.mediaActionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Feather name="globe" size={18} color={colors.primary} />
                <Text style={[styles.mediaActionText, { color: colors.primary }]}>Search Web</Text>
              </Pressable>
              <Pressable
                onPress={handleImageUpload}
                style={[styles.mediaActionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Feather name="upload" size={18} color={colors.primary} />
                    <Text style={[styles.mediaActionText, { color: colors.primary }]}>Upload</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={handleTakePhoto}
                style={[styles.mediaActionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                disabled={uploadingImage}
              >
                <Feather name="camera" size={18} color={colors.primary} />
                <Text style={[styles.mediaActionText, { color: colors.primary }]}>Camera</Text>
              </Pressable>
            </View>
          )}

          {loadingImages ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
          ) : siteImages.length > 0 ? (
            <View style={styles.imageGrid}>
              {siteImages.map((img) => (
                <Pressable
                  key={img.id}
                  onPress={() => {
                    setSelectedImage(img);
                    setShowImageModal(true);
                  }}
                  style={[styles.imageGridItem, { borderColor: img.isPrimary ? colors.primary : colors.border }]}
                >
                  <Image source={{ uri: getImageUrl(img.imageUrl) }} style={styles.gridImage} resizeMode="cover" />
                  {img.isPrimary && (
                    <View style={[styles.primaryBadge, { backgroundColor: colors.primary }]}>
                      <Feather name="star" size={12} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyMedia, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="image" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyMediaText, { color: colors.textSecondary }]}>No photos yet</Text>
              <Text style={[styles.emptyMediaSubtext, { color: colors.textSecondary }]}>
                Use the camera or upload to add photos
              </Text>
            </View>
          )}
        </View>
      )}

      <Modal visible={showImageModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowImageModal(false)}>
          <View style={[styles.imageModalContent, { backgroundColor: colors.background }]}>
            {selectedImage && (
              <>
                <Image
                  source={{ uri: getImageUrl(selectedImage.imageUrl) }}
                  style={styles.imageModalImage}
                  resizeMode="contain"
                />
                {selectedImage.attribution && (
                  <Text style={[styles.imageAttribution, { color: colors.textSecondary }]}>
                    {selectedImage.attribution}
                  </Text>
                )}
                <View style={styles.imageModalActions}>
                  {!selectedImage.isPrimary && (
                    <Pressable
                      onPress={() => setImageAsPrimary(selectedImage.id)}
                      style={[styles.imageModalButton, { backgroundColor: colors.primary }]}
                    >
                      <Feather name="star" size={18} color="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Set as Primary</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => deleteImage(selectedImage.id)}
                    style={[styles.imageModalButton, { backgroundColor: colors.error }]}
                  >
                    <Feather name="trash-2" size={18} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Delete</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );

  const isValidUrl = (str: string) => {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  const renderWreckTab = () => (
    <View style={styles.tabContent}>
      {isEditing ? (
        <>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Wreck Name</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={editedSite.wreckName || ''}
              onChangeText={(v) => updateField('wreckName', v)}
              placeholder="e.g., SS Thistlegorm, USS Arizona"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Additional Notes</Text>
            <TextInput
              style={[styles.formInput, styles.textAreaLarge, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={editedSite.wreckInfo || ''}
              onChangeText={(v) => updateField('wreckInfo', v)}
              placeholder="Sinking date, history, cargo, notable features..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={8}
            />
          </View>
          <TouchableOpacity 
            style={[styles.askGeminiButton, { backgroundColor: colors.surface, borderColor: colors.border, cursor: 'pointer' } as any]}
            activeOpacity={0.7}
            onPress={() => {
              const query = encodeURIComponent(`Tell me about the shipwreck ${editedSite.wreckName || displaySite?.name || 'wreck'} - history, sinking, location, and diving conditions`);
              const url = `https://gemini.google.com/app?q=${query}`;
              if (Platform.OS === 'web') {
                window.open(url, '_blank');
              } else {
                Linking.openURL(url);
              }
            }}
          >
            <Feather name="cpu" size={18} color={colors.primary} />
            <Text style={[styles.askGeminiText, { color: colors.primary }]}>Ask Gemini</Text>
            <Feather name="external-link" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </>
      ) : (
        <>
          {loadingWiki ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading wreck information...</Text>
            </View>
          ) : (
            <>
              {displaySite?.wreckName && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    <Feather name="anchor" size={16} color={colors.primary} /> {displaySite.wreckName}
                  </Text>
                </View>
              )}

              {wikipediaInfo && (
                <View style={[styles.wikiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.wikiHeader}>
                    <Feather name="book-open" size={20} color={colors.primary} />
                    <Text style={[styles.wikiTitle, { color: colors.text }]}>{wikipediaInfo.title}</Text>
                  </View>
                  {wikipediaInfo.thumbnail && (
                    <Image source={{ uri: wikipediaInfo.thumbnail }} style={styles.wikiThumbnail} />
                  )}
                  <Text style={[styles.wikiExtract, { color: colors.textSecondary }]}>{wikipediaInfo.extract}</Text>
                  {wikipediaInfo.url && (
                    <Pressable 
                      style={styles.wikiLink}
                      onPress={() => Linking.openURL(wikipediaInfo.url!)}
                    >
                      <Feather name="external-link" size={14} color={colors.primary} />
                      <Text style={[styles.wikiLinkText, { color: colors.primary }]}>View on Wikipedia</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {displaySite?.wreckInfo && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
                  <Text style={[styles.description, { color: colors.textSecondary }]}>{displaySite.wreckInfo}</Text>
                </View>
              )}

              {!wikipediaInfo && !displaySite?.wreckInfo && !displaySite?.wreckName && (
                <View style={styles.emptyTab}>
                  <Feather name="anchor" size={48} color={colors.textSecondary} />
                  <Text style={[styles.emptyTabText, { color: colors.textSecondary }]}>No wreck information available</Text>
                  <Text style={[styles.emptyTabSubtext, { color: colors.textSecondary }]}>
                    Edit this dive site to add wreck details
                  </Text>
                </View>
              )}

              <TouchableOpacity 
                style={[styles.askGeminiButton, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 16, cursor: 'pointer' } as any]}
                activeOpacity={0.7}
                onPress={() => {
                  const query = encodeURIComponent(`Tell me about the shipwreck ${displaySite?.wreckName || displaySite?.name || 'wreck'} - history, sinking, location, and diving conditions`);
                  const url = `https://gemini.google.com/app?q=${query}`;
                  if (Platform.OS === 'web') {
                    window.open(url, '_blank');
                  } else {
                    Linking.openURL(url);
                  }
                }}
              >
                <Feather name="cpu" size={18} color={colors.primary} />
                <Text style={[styles.askGeminiText, { color: colors.primary }]}>Ask Gemini</Text>
                <Feather name="external-link" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </View>
  );

  const renderNotesTab = () => (
    <View style={styles.tabContent}>
      {isEditing ? (
        <>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Notes</Text>
            <TextInput
              style={[styles.formInput, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={editedSite.accessNotes || ''}
              onChangeText={(v) => updateField('accessNotes', v)}
              placeholder="How to access this dive site..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
            />
          </View>
        </>
      ) : (
        <>
          {displaySite?.accessNotes && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>{displaySite.accessNotes}</Text>
            </View>
          )}

          {displaySite?.hazards && displaySite.hazards.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Hazards</Text>
              <View style={styles.tagContainer}>
                {displaySite.hazards.map((hazard, index) => (
                  <View key={index} style={[styles.tag, { backgroundColor: colors.error + '20' }]}>
                    <Feather name="alert-triangle" size={14} color={colors.error} />
                    <Text style={[styles.tagText, { color: colors.error }]}>{hazard}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {displaySite?.facilities && displaySite.facilities.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Facilities</Text>
              <View style={styles.tagContainer}>
                {displaySite.facilities.map((facility, index) => (
                  <View key={index} style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
                    <Feather name="check" size={14} color={colors.primary} />
                    <Text style={[styles.tagText, { color: colors.primary }]}>{facility}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {!displaySite?.accessNotes && (!displaySite?.hazards || displaySite.hazards.length === 0) && (!displaySite?.facilities || displaySite.facilities.length === 0) && (
            <View style={styles.emptyTab}>
              <Feather name="file-text" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTabText, { color: colors.textSecondary }]}>No notes available</Text>
            </View>
          )}
        </>
      )}
    </View>
  );

  return (
    <ThemedBackground>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {isNewSite ? 'New Dive Site' : displaySite?.name || 'Dive Site'}
        </Text>
        {!isEditing && !isNewSite && (
          <View style={styles.headerActions}>
            <Pressable onPress={() => setIsEditing(true)} style={styles.headerActionButton}>
              <Feather name="edit-2" size={20} color={colors.primary} />
            </Pressable>
            <Pressable onPress={handleDeleteSite} style={styles.headerActionButton}>
              <Feather name="trash-2" size={20} color={colors.primary} />
            </Pressable>
          </View>
        )}
        {(isEditing || isNewSite) && <View style={styles.headerActions} />}
      </View>

      {isEditing && (
        <View style={[styles.editToolbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable onPress={handleCancel} style={[styles.toolbarButton, { borderColor: colors.border }]}>
            <Feather name="x" size={18} color={colors.text} />
            <Text style={[styles.toolbarButtonText, { color: colors.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            style={[styles.toolbarButton, styles.saveButton, { backgroundColor: colors.primary }]}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="check" size={18} color="#FFFFFF" />
                <Text style={[styles.toolbarButtonText, { color: '#FFFFFF' }]}>Save</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {tabs.map((tab, index) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === index && { borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab(index)}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === index ? colors.primary : colors.textSecondary },
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {tabs[activeTab] === 'Overview' && renderOverviewTab()}
        {tabs[activeTab] === 'Conditions' && renderConditionsTab()}
        {tabs[activeTab] === 'Media' && renderMediaTab()}
        {tabs[activeTab] === 'Wreck' && renderWreckTab()}
        {tabs[activeTab] === 'Notes' && renderNotesTab()}
      </ScrollView>

    </ThemedBackground>
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
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
    justifyContent: 'flex-end',
  },
  headerActionButton: {
    padding: 8,
  },
  editToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  saveButton: {
    borderWidth: 0,
  },
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  tabContent: {
    gap: 16,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailItem: {
    width: (width - 44) / 2,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  ratingRow: {
    marginBottom: 12,
  },
  descriptionCompact: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  detailsCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  detailRowIcon: {
    width: 28,
    alignItems: 'center',
  },
  detailRowLabel: {
    fontSize: 14,
    width: 80,
  },
  detailRowValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  detailRowDivider: {
    height: 1,
    marginLeft: 42,
  },
  mapSection: {
    marginTop: 12,
  },
  mapPlaceholder: {
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingSection: {
    marginTop: 16,
    paddingTop: 12,
  },
  ratingLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  refreshButton: {
    padding: 8,
  },
  weatherContainer: {
    gap: 16,
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  weatherTimestamp: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  datePickerRow: {
    marginBottom: 16,
  },
  dateLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  dateButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dateButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 50,
  },
  dateButtonText: {
    fontSize: 10,
    fontWeight: '500',
  },
  dateButtonDate: {
    fontSize: 14,
    fontWeight: '600',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: {
    fontSize: 14,
  },
  coordinates: {
    fontSize: 12,
    marginLeft: 26,
  },
  staticMapContainer: {
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  mapLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
    borderRadius: 8,
  },
  mapLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  conditionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  conditionCard: {
    width: '48%',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    gap: 4,
  },
  conditionLabel: {
    fontSize: 11,
  },
  conditionValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  weatherPlaceholder: {
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: 8,
  },
  weatherPlaceholderText: {
    fontSize: 14,
  },
  tidesContainer: {
    gap: 8,
  },
  tideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 12,
  },
  tideIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tideInfo: {
    flex: 1,
  },
  tideType: {
    fontSize: 14,
    fontWeight: '600',
  },
  tideTime: {
    fontSize: 12,
  },
  tideHeight: {
    fontSize: 16,
    fontWeight: '700',
  },
  editConditionsNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  editConditionsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  mainImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  wikiCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  wikiImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
  },
  wikiTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  wikiExtract: {
    fontSize: 14,
    lineHeight: 20,
  },
  wikiLink: {
    fontSize: 14,
    fontWeight: '500',
  },
  noDataText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyTab: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyTabText: {
    fontSize: 14,
  },
  formGroup: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  formInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  textAreaLarge: {
    minHeight: 180,
    textAlignVertical: 'top',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  coordsContainer: {
    gap: 12,
  },
  coordsInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  coordInput: {
    flex: 1,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  mapContainer: {
    flex: 1,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  mapHeaderButton: {
    padding: 8,
  },
  mapHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  map: {
    flex: 1,
  },
  mapFooter: {
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  mapCoordsDisplay: {
    gap: 4,
  },
  mapCoordsLabel: {
    fontSize: 12,
  },
  mapCoordsValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  locationButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  webMapFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  webMapTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  webMapSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  webMapInputs: {
    width: '100%',
    maxWidth: 300,
    gap: 12,
    marginTop: 16,
  },
  webMapInputRow: {
    gap: 4,
  },
  webMapInputLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  webMapInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  webMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
    marginTop: 16,
  },
  webMapButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  mediaActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  mediaActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mediaButtonRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  stockPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  stockPhotosText: {
    flex: 1,
    fontSize: 14,
  },
  urlModal: {
    width: '90%',
    maxWidth: 500,
    borderRadius: 16,
    overflow: 'hidden',
  },
  urlModalContent: {
    padding: 16,
  },
  urlInstructions: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  urlInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 16,
  },
  urlPreviewContainer: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  urlPreviewImage: {
    width: '100%',
    height: 200,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
    marginBottom: 16,
  },
  importButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  searchWebLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  searchWebLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageGridItem: {
    width: (width - 48) / 3,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 4,
    borderRadius: 12,
  },
  stockBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptyMedia: {
    alignItems: 'center',
    paddingVertical: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyMediaText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyMediaSubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stockModal: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  stockModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  stockModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  stockSearchRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  stockSearchInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  stockSearchButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stockResults: {
    flex: 1,
  },
  stockResultsContent: {
    padding: 16,
    paddingTop: 0,
  },
  stockGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stockPhotoItem: {
    width: (width * 0.9 - 64) / 3,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  stockPhotoImage: {
    width: '100%',
    height: '100%',
  },
  stockPhotoInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 4,
  },
  stockEmptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  pexelsAttribution: {
    textAlign: 'center',
    padding: 12,
    fontSize: 12,
  },
  imageModalContent: {
    width: '90%',
    maxWidth: 500,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 16,
  },
  imageModalImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
  },
  imageAttribution: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },
  imageModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    justifyContent: 'center',
  },
  imageModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 16,
  },
  wreckInfoTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  wreckInfoTipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  wikiCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  wikiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wikiTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  wikiThumbnail: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  wikiExtract: {
    fontSize: 14,
    lineHeight: 22,
  },
  wikiLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  wikiLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyTabSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  askGeminiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  askGeminiText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
});
