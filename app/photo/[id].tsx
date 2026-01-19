import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { getApiUrl } from '@/utils/apiConfig';
import ThemedBackground from '@/components/ThemedBackground';

interface Photo {
  id: number;
  userId: number;
  diveLogId: number | null;
  diveNumber: number | null;
  diveDate: string | null;
  diveSiteName: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  takenAt: string | null;
  locationLat: number | null;
  locationLng: number | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DiveLog {
  id: number;
  diveNumber: number;
  diveDate: string;
  diveSiteName: string | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Helper to get the full image URL (relative paths need API URL prefix)
const getImageUrl = (url: string) => {
  if (url.startsWith('/')) {
    return `${getApiUrl()}${url}`;
  }
  return url;
};

export default function PhotoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { token } = useAuth();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [caption, setCaption] = useState('');
  const [selectedDiveId, setSelectedDiveId] = useState<number | null>(null);
  const [diveLogs, setDiveLogs] = useState<DiveLog[]>([]);
  const [showDiveSelector, setShowDiveSelector] = useState(false);

  useEffect(() => {
    fetchPhoto();
    fetchDiveLogs();
  }, [id]);

  const fetchPhoto = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/photos/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setPhoto(data);
        setCaption(data.caption || '');
        setSelectedDiveId(data.diveLogId);
      }
    } catch (error) {
      console.error('Error fetching photo:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDiveLogs = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setDiveLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Error fetching dive logs:', error);
    }
  };

  const saveChanges = async () => {
    if (!photo) return;
    
    setSaving(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/photos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          caption: caption || null,
          diveLogId: selectedDiveId,
        }),
      });
      
      if (response.ok) {
        router.back();
      } else {
        Alert.alert('Error', 'Failed to save changes');
      }
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = async () => {
    if (!photo) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/photos/${id}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const { isFavorite } = await response.json();
        setPhoto({ ...photo, isFavorite });
      }
    } catch (error) {
      console.error('Toggle favorite error:', error);
    }
  };

  const deletePhoto = () => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${getApiUrl()}/api/photos/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              
              if (response.ok) {
                router.back();
              }
            } catch (error) {
              console.error('Delete error:', error);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getSelectedDive = () => {
    if (!selectedDiveId) return null;
    return diveLogs.find(d => d.id === selectedDiveId);
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ThemedBackground style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </ThemedBackground>
      </>
    );
  }

  if (!photo) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ThemedBackground style={[styles.container, styles.centered]}>
          <Text style={{ color: colors.text }}>Photo not found</Text>
        </ThemedBackground>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedBackground>
        <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Photo</Text>
          <Pressable onPress={saveChanges} disabled={saving} style={styles.headerButton}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.saveButton, { color: colors.primary }]}>Save</Text>
            )}
          </Pressable>
        </View>
        
        <ScrollView style={styles.content}>
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: getImageUrl(photo.imageUrl) }}
              style={[styles.image, { aspectRatio: (photo.width || 1) / (photo.height || 1) }]}
              resizeMode="contain"
            />
          </View>
          
          <View style={styles.actions}>
            <Pressable 
              style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border }]} 
              onPress={toggleFavorite}
            >
              <Ionicons 
                name={photo.isFavorite ? 'heart' : 'heart-outline'} 
                size={22} 
                color={photo.isFavorite ? '#FF3B30' : colors.text} 
              />
              <Text style={[styles.actionText, { color: colors.text }]}>
                {photo.isFavorite ? 'Favorited' : 'Favorite'}
              </Text>
            </Pressable>
            
            <Pressable 
              style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border }]} 
              onPress={deletePhoto}
            >
              <Ionicons name="trash-outline" size={22} color="#FF3B30" />
              <Text style={[styles.actionText, { color: '#FF3B30' }]}>Delete</Text>
            </Pressable>
          </View>
          
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Caption</Text>
            <TextInput
              style={[styles.textInput, { color: colors.text, borderColor: colors.border }]}
              value={caption}
              onChangeText={setCaption}
              placeholder="Add a caption..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
            />
          </View>
          
          <Pressable 
            style={[styles.section, styles.diveSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setShowDiveSelector(!showDiveSelector)}
          >
            <View style={styles.diveSelectorHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Linked Dive</Text>
              <Ionicons name={showDiveSelector ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
            </View>
            {selectedDiveId ? (
              <View style={styles.selectedDive}>
                <Ionicons name="water" size={18} color={colors.primary} />
                <Text style={[styles.selectedDiveText, { color: colors.text }]}>
                  Dive #{getSelectedDive()?.diveNumber} - {getSelectedDive()?.diveSiteName || 'Unknown site'}
                </Text>
              </View>
            ) : (
              <Text style={[styles.noLinkText, { color: colors.textSecondary }]}>No dive linked</Text>
            )}
          </Pressable>
          
          {showDiveSelector && (
            <View style={[styles.diveList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable 
                style={[styles.diveItem, !selectedDiveId && styles.selectedDiveItem]}
                onPress={() => { setSelectedDiveId(null); setShowDiveSelector(false); }}
              >
                <Text style={[styles.diveItemText, { color: colors.text }]}>No link</Text>
              </Pressable>
              {diveLogs.map(dive => (
                <Pressable
                  key={dive.id}
                  style={[styles.diveItem, selectedDiveId === dive.id && styles.selectedDiveItem]}
                  onPress={() => { setSelectedDiveId(dive.id); setShowDiveSelector(false); }}
                >
                  <View style={styles.diveItemContent}>
                    <Text style={[styles.diveItemNumber, { color: colors.primary }]}>#{dive.diveNumber}</Text>
                    <Text style={[styles.diveItemText, { color: colors.text }]}>{dive.diveSiteName || 'Unknown site'}</Text>
                  </View>
                  <Text style={[styles.diveItemDate, { color: colors.textSecondary }]}>
                    {new Date(dive.diveDate).toLocaleDateString()}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Details</Text>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Date Taken</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {formatDate(photo.takenAt || photo.createdAt)}
              </Text>
            </View>
            {photo.width && photo.height && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Dimensions</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{photo.width} x {photo.height}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>File Size</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{formatFileSize(photo.fileSize)}</Text>
            </View>
            {photo.diveSiteName && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Location</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{photo.diveSiteName}</Text>
              </View>
            )}
          </View>
          
          <View style={{ height: 40 }} />
        </ScrollView>
      </ThemedBackground>
    </>
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
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  saveButton: {
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  imageContainer: {
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    maxHeight: 400,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 22,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  diveSelector: {
    paddingBottom: 12,
  },
  diveSelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectedDive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedDiveText: {
    fontSize: 15,
  },
  noLinkText: {
    fontSize: 15,
    fontStyle: 'italic',
  },
  diveList: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 300,
    overflow: 'hidden',
  },
  diveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  selectedDiveItem: {
    backgroundColor: 'rgba(0,122,255,0.1)',
  },
  diveItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  diveItemNumber: {
    fontSize: 15,
    fontWeight: '600',
  },
  diveItemText: {
    fontSize: 15,
  },
  diveItemDate: {
    fontSize: 13,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  detailLabel: {
    fontSize: 15,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '500',
  },
});
