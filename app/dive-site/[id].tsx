import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
  Image,
  Dimensions,
  Alert,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import EmbeddedMapPicker from '@/components/EmbeddedMapPicker';
import StaticMapView from '@/components/StaticMapView';

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

interface StockPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographerUrl: string;
  src: {
    original: string;
    large: string;
    medium: string;
    small: string;
    thumbnail: string;
  };
  alt: string;
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
  depthMin: number | null;
  depthMax: number | null;
  visibilityMin: number | null;
  visibilityMax: number | null;
  difficulty: string;
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
}

interface WikipediaInfo {
  title: string;
  extract: string;
  thumbnail: string | null;
  url: string | null;
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

function getApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location.host;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return `${window.location.protocol}//localhost:3001`;
    }
    return `${window.location.protocol}//${window.location.host}`;
  }
  return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
}

const tabs = ['Overview', 'Conditions', 'Media', 'Notes'];

const siteTypeLabels: { [key: string]: string } = {
  reef: 'Reef',
  wreck: 'Wreck',
  cave: 'Cave',
  wall: 'Wall',
  drift: 'Drift',
  shore: 'Shore',
  quarry: 'Quarry',
  lake: 'Lake',
  river: 'River',
  cenote: 'Cenote',
  artificial: 'Artificial Reef',
  other: 'Other',
};

const difficultyLabels: { [key: string]: string } = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  technical: 'Technical',
};

const waterTypeOptions = [
  { value: 'marine', label: 'Marine (Saltwater)' },
  { value: 'inland', label: 'Normal (Freshwater)' },
];

const siteTypeOptions = Object.entries(siteTypeLabels).map(([value, label]) => ({ value, label }));
const difficultyOptions = Object.entries(difficultyLabels).map(([value, label]) => ({ value, label }));

function StarRating({ rating, onRatingChange, editable, colors }: { rating: number; onRatingChange?: (rating: number) => void; editable: boolean; colors: any }) {
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
            name={star <= rating ? 'star' : 'star'}
            size={28}
            color={star <= rating ? '#FFC107' : colors.border}
            style={{ opacity: star <= rating ? 1 : 0.4 }}
          />
        </Pressable>
      ))}
      {rating > 0 && (
        <Text style={[starStyles.ratingText, { color: colors.textSecondary }]}>
          {rating.toFixed(1)}
        </Text>
      )}
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
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockPhotos, setStockPhotos] = useState<StockPhoto[]>([]);
  const [searchingStock, setSearchingStock] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
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
    if (!token || !site?.id || site.siteType !== 'wreck') return;

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
  }, [token, site?.id, site?.siteType]);

  useEffect(() => {
    fetchSite();
  }, [fetchSite]);

  useEffect(() => {
    if (site?.siteType === 'wreck') {
      fetchWikipediaInfo();
    }
  }, [site?.siteType, fetchWikipediaInfo]);

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
          fetchSiteImages();
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

  const searchStockPhotos = async () => {
    if (!token || !stockSearchQuery.trim()) return;

    setSearchingStock(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/stock-photos/search?query=${encodeURIComponent(stockSearchQuery)}&perPage=12`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setStockPhotos(data.photos || []);
      } else {
        const error = await response.json();
        Alert.alert('Info', error.error || 'Could not search stock photos');
        setStockPhotos([]);
      }
    } catch (error) {
      console.error('Error searching stock photos:', error);
    } finally {
      setSearchingStock(false);
    }
  };

  const addStockPhoto = async (photo: StockPhoto) => {
    if (!token || !site?.id) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/dive-sites/${site.id}/images`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: photo.src.large,
          caption: photo.alt || null,
          isPrimary: siteImages.length === 0,
          isStock: true,
          attribution: `Photo by ${photo.photographer} on Pexels`,
        }),
      });

      if (response.ok) {
        fetchSiteImages();
        setShowStockModal(false);
        Alert.alert('Success', 'Stock photo added');
      }
    } catch (error) {
      console.error('Error adding stock photo:', error);
      Alert.alert('Error', 'Failed to add stock photo');
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
        fetchSiteImages();
        setShowImageModal(false);
        Alert.alert('Success', 'Primary image updated');
      }
    } catch (error) {
      console.error('Error setting primary image:', error);
    }
  };

  const deleteImage = async (imageId: number) => {
    if (!token || !site?.id) return;

    Alert.alert('Delete Image', 'Are you sure you want to delete this image?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await fetch(`${getApiUrl()}/api/dive-sites/${site.id}/images/${imageId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
              fetchSiteImages();
              setShowImageModal(false);
              Alert.alert('Success', 'Image deleted');
            }
          } catch (error) {
            console.error('Error deleting image:', error);
          }
        },
      },
    ]);
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

  const updateField = (field: keyof DiveSite, value: any) => {
    setEditedSite((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const displaySite = isEditing ? editedSite : site;

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
            <View style={{ flex: 1 }}>
              <PickerDropdown
                label="Difficulty"
                value={editedSite.difficulty}
                options={difficultyOptions}
                onValueChange={(v) => updateField('difficulty', v)}
                colors={colors}
                placeholder="Select difficulty..."
              />
            </View>
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
            <EmbeddedMapPicker
              latitude={editedSite.latitude || 0}
              longitude={editedSite.longitude || 0}
              onCoordinatesChange={(lat, lng) => {
                updateField('latitude', lat);
                updateField('longitude', lng);
              }}
              colors={colors}
            />
          </View>
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
                <Feather name="activity" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.detailRowLabel, { color: colors.textSecondary }]}>Difficulty</Text>
              <Text style={[styles.detailRowValue, { color: colors.text }]}>
                {difficultyLabels[displaySite?.difficulty || ''] || displaySite?.difficulty}
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
          </View>

          {displaySite?.latitude && displaySite?.longitude && (
            <View style={styles.mapSection}>
              <StaticMapView
                latitude={displaySite.latitude}
                longitude={displaySite.longitude}
                colors={colors}
              />
            </View>
          )}

          <View style={styles.ratingSection}>
            <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>Rating</Text>
            <StarRating rating={displaySite?.ratingAvg || 0} editable={false} colors={colors} />
          </View>
        </>
      )}
    </View>
  );

  const renderConditionsTab = () => (
    <View style={styles.tabContent}>
      {isEditing ? (
        <>
          <View style={styles.formRow}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Min Depth (m)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editedSite.depthMin?.toString() || ''}
                onChangeText={(v) => updateField('depthMin', v ? parseFloat(v) : null)}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
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
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={[styles.formLabel, { color: colors.text }]}>Min Visibility (m)</Text>
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
              <Text style={[styles.formLabel, { color: colors.text }]}>Max Visibility (m)</Text>
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
            <Text style={[styles.formLabel, { color: colors.text }]}>Current Strength</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={editedSite.currentStrength || ''}
              onChangeText={(v) => updateField('currentStrength', v)}
              placeholder="e.g., None, Light, Moderate, Strong"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Best Season</Text>
            <TextInput
              style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={editedSite.bestSeason || ''}
              onChangeText={(v) => updateField('bestSeason', v)}
              placeholder="e.g., April - October"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </>
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
                  const dayLabel = dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' });
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
            {!loadingImages && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setShowStockModal(true)}
                  style={[styles.mediaActionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Feather name="search" size={18} color={colors.primary} />
                  <Text style={[styles.mediaActionText, { color: colors.primary }]}>Stock</Text>
                </Pressable>
                <Pressable
                  onPress={handleImageUpload}
                  style={[styles.mediaActionButton, { backgroundColor: colors.primary }]}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="upload" size={18} color="#FFFFFF" />
                      <Text style={[styles.mediaActionText, { color: '#FFFFFF' }]}>Upload</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>

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
                  {img.isStock && (
                    <View style={[styles.stockBadge, { backgroundColor: colors.surface }]}>
                      <Text style={{ fontSize: 10, color: colors.textSecondary }}>Pexels</Text>
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
                Upload your own or add from stock photos
              </Text>
            </View>
          )}
        </View>
      )}

      {site?.siteType === 'wreck' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Wikipedia Information</Text>
          {loadingWiki ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : wikipediaInfo ? (
            <View style={[styles.wikiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {wikipediaInfo.thumbnail && (
                <Image source={{ uri: wikipediaInfo.thumbnail }} style={styles.wikiImage} resizeMode="cover" />
              )}
              <Text style={[styles.wikiTitle, { color: colors.text }]}>{wikipediaInfo.title}</Text>
              <Text style={[styles.wikiExtract, { color: colors.textSecondary }]} numberOfLines={5}>
                {wikipediaInfo.extract}
              </Text>
              {wikipediaInfo.url && (
                <Text style={[styles.wikiLink, { color: colors.primary }]}>Read more on Wikipedia</Text>
              )}
            </View>
          ) : (
            <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
              No Wikipedia information found for this wreck
            </Text>
          )}
        </View>
      )}

      {isEditing && site?.siteType === 'wreck' && (
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.text }]}>Wikipedia URL</Text>
          <TextInput
            style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            value={editedSite.wikipediaUrl || ''}
            onChangeText={(v) => updateField('wikipediaUrl', v)}
            placeholder="https://en.wikipedia.org/wiki/..."
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      )}

      <Modal visible={showStockModal} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.stockModal, { backgroundColor: colors.background }]}>
            <View style={[styles.stockModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.stockModalTitle, { color: colors.text }]}>Search Stock Photos</Text>
              <Pressable onPress={() => setShowStockModal(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.stockSearchRow}>
              <TextInput
                style={[styles.stockSearchInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={stockSearchQuery}
                onChangeText={setStockSearchQuery}
                placeholder="Search diving, coral reef, ocean..."
                placeholderTextColor={colors.textSecondary}
                onSubmitEditing={searchStockPhotos}
              />
              <Pressable
                onPress={searchStockPhotos}
                style={[styles.stockSearchButton, { backgroundColor: colors.primary }]}
                disabled={searchingStock}
              >
                {searchingStock ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="search" size={20} color="#FFFFFF" />
                )}
              </Pressable>
            </View>

            <ScrollView style={styles.stockResults} contentContainerStyle={styles.stockResultsContent}>
              {stockPhotos.length > 0 ? (
                <View style={styles.stockGrid}>
                  {stockPhotos.map((photo) => (
                    <Pressable
                      key={photo.id}
                      onPress={() => addStockPhoto(photo)}
                      style={[styles.stockPhotoItem, { borderColor: colors.border }]}
                    >
                      <Image source={{ uri: photo.src.medium }} style={styles.stockPhotoImage} resizeMode="cover" />
                      <View style={[styles.stockPhotoInfo, { backgroundColor: colors.surface }]}>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }} numberOfLines={1}>
                          {photo.photographer}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={styles.stockEmptyState}>
                  <Feather name="camera" size={48} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, marginTop: 12 }}>
                    Search for photos above
                  </Text>
                </View>
              )}
            </ScrollView>

            <Text style={[styles.pexelsAttribution, { color: colors.textSecondary }]}>
              Photos provided by Pexels
            </Text>
          </View>
        </View>
      </Modal>

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

  const renderNotesTab = () => (
    <View style={styles.tabContent}>
      {isEditing ? (
        <>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.text }]}>Access Notes</Text>
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
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Access Notes</Text>
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {isNewSite ? 'New Dive Site' : displaySite?.name || 'Dive Site'}
        </Text>
        {!isEditing && !isNewSite && (
          <Pressable onPress={() => setIsEditing(true)} style={styles.editButton}>
            <Feather name="edit-2" size={20} color={colors.primary} />
          </Pressable>
        )}
        {isEditing && <View style={styles.editButton} />}
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
        {activeTab === 0 && renderOverviewTab()}
        {activeTab === 1 && renderConditionsTab()}
        {activeTab === 2 && renderMediaTab()}
        {activeTab === 3 && renderNotesTab()}
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
  editButton: {
    padding: 8,
    width: 40,
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
    gap: 8,
  },
  dateButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 60,
  },
  dateButtonText: {
    fontSize: 11,
    fontWeight: '500',
  },
  dateButtonDate: {
    fontSize: 16,
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
    gap: 12,
  },
  conditionCard: {
    width: (width - 44) / 2,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  conditionLabel: {
    fontSize: 12,
  },
  conditionValue: {
    fontSize: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  mediaActionText: {
    fontSize: 13,
    fontWeight: '600',
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
});
