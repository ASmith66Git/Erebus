import React, { useState, useEffect, useRef } from 'react';
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
  FlatList,
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
  tripId: number | null;
  diveNumber: number | null;
  diveDate: string | null;
  diveSiteName: string | null;
  tripName: string | null;
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

interface TripPhoto {
  id: number;
  image_url: string;
  caption: string | null;
}

interface DiveLog {
  id: number;
  diveDateTime: string;
  diveSiteName: string | null;
}

interface DiveTrip {
  id: number;
  name: string;
  start_date: string | null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCRUB_THUMB_SIZE = 60;

const getImageUrl = (url: string) => {
  if (url.startsWith('/')) {
    return `${getApiUrl()}${url}`;
  }
  return url;
};

export default function PhotoDetailScreen() {
  const { id, mode, tripId, photoIndex } = useLocalSearchParams<{ 
    id: string; 
    mode?: string; 
    tripId?: string;
    photoIndex?: string;
  }>();
  const { colors } = useTheme();
  const { token } = useAuth();
  const scrubListRef = useRef<FlatList>(null);
  const mainPhotoListRef = useRef<FlatList>(null);
  
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(mode !== 'view');
  const [caption, setCaption] = useState('');
  const [selectedDiveId, setSelectedDiveId] = useState<number | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [diveLogs, setDiveLogs] = useState<DiveLog[]>([]);
  const [diveTrips, setDiveTrips] = useState<DiveTrip[]>([]);
  const [showDiveSelector, setShowDiveSelector] = useState(false);
  const [showTripSelector, setShowTripSelector] = useState(false);
  const [tripPhotos, setTripPhotos] = useState<TripPhoto[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(
    photoIndex ? parseInt(photoIndex, 10) : 0
  );

  useEffect(() => {
    fetchPhoto();
    if (isEditing) {
      fetchDiveLogs();
      fetchDiveTrips();
    }
    if (tripId) {
      fetchTripPhotos();
    }
  }, [id]);

  useEffect(() => {
    if (tripPhotos.length > 0 && scrubListRef.current) {
      const idx = tripPhotos.findIndex(p => p.id === parseInt(id, 10));
      if (idx >= 0) {
        setCurrentPhotoIndex(idx);
        setTimeout(() => {
          scrubListRef.current?.scrollToIndex({ 
            index: idx, 
            animated: false,
            viewPosition: 0.5 
          });
        }, 100);
      }
    }
  }, [tripPhotos, id]);

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
        setSelectedTripId(data.tripId);
      }
    } catch (error) {
      console.error('Error fetching photo:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTripPhotos = async () => {
    if (!tripId) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-trips/${tripId}/photos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTripPhotos(data.photos || data || []);
      }
    } catch (error) {
      console.error('Error fetching trip photos:', error);
    }
  };

  const fetchDiveTrips = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-trips`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setDiveTrips(data.trips || data || []);
      }
    } catch (error) {
      console.error('Error fetching dive trips:', error);
    }
  };

  const fetchDiveLogs = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setDiveLogs(data.diveLogs || []);
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
          tripId: selectedTripId,
        }),
      });
      
      if (response.ok) {
        setIsEditing(false);
        fetchPhoto();
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

  const getSelectedTrip = () => {
    if (!selectedTripId) return null;
    return diveTrips.find(t => t.id === selectedTripId);
  };

  const navigateToPhoto = (photoId: number, index: number) => {
    setCurrentPhotoIndex(index);
    router.replace(`/photo/${photoId}?mode=view&tripId=${tripId}&photoIndex=${index}` as any);
  };

  const handleStartEditing = () => {
    setIsEditing(true);
    fetchDiveLogs();
    fetchDiveTrips();
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setCaption(photo?.caption || '');
    setSelectedDiveId(photo?.diveLogId || null);
    setSelectedTripId(photo?.tripId || null);
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

  const handleSwipePhotoChange = (index: number) => {
    if (index >= 0 && index < tripPhotos.length && tripPhotos[index]) {
      const newPhoto = tripPhotos[index];
      setCurrentPhotoIndex(index);
      navigateToPhoto(newPhoto.id, index);
    }
  };

  const renderViewMode = () => {
    const hasTripPhotos = tripId && tripPhotos.length > 1;
    
    const renderSinglePhoto = () => (
      <View style={styles.fullImageContainer}>
        <Image
          source={{ uri: getImageUrl(photo.imageUrl) }}
          style={styles.fullImage}
          resizeMode="contain"
        />
      </View>
    );
    
    const renderSwipeablePhotos = () => (
      <FlatList
        ref={mainPhotoListRef}
        data={tripPhotos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={currentPhotoIndex}
        style={styles.swipeablePhotosList}
        getItemLayout={(data, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        onMomentumScrollEnd={(e) => {
          const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          if (newIndex !== currentPhotoIndex && newIndex >= 0 && newIndex < tripPhotos.length) {
            handleSwipePhotoChange(newIndex);
          }
        }}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={[styles.fullImageContainer, { width: SCREEN_WIDTH }]}>
            <Image
              source={{ uri: getImageUrl(item.image_url) }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          </View>
        )}
      />
    );
    
    return (
      <View style={styles.viewModeContainer}>
        {hasTripPhotos ? renderSwipeablePhotos() : renderSinglePhoto()}
        
        <View style={[styles.viewModeOverlay, { backgroundColor: colors.background + 'E6' }]}>
          <View style={styles.viewModeActions}>
            <Pressable 
              style={[styles.viewActionButton, { backgroundColor: colors.surface }]} 
              onPress={toggleFavorite}
            >
              <Ionicons 
                name={photo.isFavorite ? 'heart' : 'heart-outline'} 
                size={24} 
                color={photo.isFavorite ? '#FF3B30' : colors.text} 
              />
            </Pressable>
            
            <Pressable 
              style={[styles.viewActionButton, { backgroundColor: colors.primary }]} 
              onPress={handleStartEditing}
            >
              <Feather name="edit-2" size={20} color="#FFF" />
            </Pressable>
          </View>
          
          {photo.caption && (
            <View style={[styles.captionContainer, { backgroundColor: colors.surface }]}>
              <Text style={[styles.captionText, { color: colors.text }]}>{photo.caption}</Text>
            </View>
          )}
          
          {(photo.diveSiteName || photo.tripName) && (
            <View style={[styles.infoContainer, { backgroundColor: colors.surface }]}>
              {photo.diveSiteName && (
                <View style={styles.infoRow}>
                  <Ionicons name="water" size={16} color={colors.primary} />
                  <Text style={[styles.infoText, { color: colors.text }]}>{photo.diveSiteName}</Text>
                </View>
              )}
              {photo.tripName && (
                <View style={styles.infoRow}>
                  <Ionicons name="airplane" size={16} color={colors.primary} />
                  <Text style={[styles.infoText, { color: colors.text }]}>{photo.tripName}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderEditMode = () => (
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
              {getSelectedDive()?.diveSiteName || 'Unknown site'} - {getSelectedDive()?.diveDateTime ? new Date(getSelectedDive()!.diveDateTime).toLocaleDateString() : ''}
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
                <Text style={[styles.diveItemText, { color: colors.text }]}>{dive.diveSiteName || 'Unknown site'}</Text>
              </View>
              <Text style={[styles.diveItemDate, { color: colors.textSecondary }]}>
                {new Date(dive.diveDateTime).toLocaleDateString()}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      
      <Pressable 
        style={[styles.section, styles.diveSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setShowTripSelector(!showTripSelector)}
      >
        <View style={styles.diveSelectorHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Linked Trip</Text>
          <Ionicons name={showTripSelector ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
        </View>
        {selectedTripId ? (
          <View style={styles.selectedDive}>
            <Ionicons name="airplane" size={18} color={colors.primary} />
            <Text style={[styles.selectedDiveText, { color: colors.text }]}>
              {getSelectedTrip()?.name || 'Unknown trip'}
            </Text>
          </View>
        ) : (
          <Text style={[styles.noLinkText, { color: colors.textSecondary }]}>No trip linked</Text>
        )}
      </Pressable>
      
      {showTripSelector && (
        <View style={[styles.diveList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable 
            style={[styles.diveItem, !selectedTripId && styles.selectedDiveItem]}
            onPress={() => { setSelectedTripId(null); setShowTripSelector(false); }}
          >
            <Text style={[styles.diveItemText, { color: colors.text }]}>No link</Text>
          </Pressable>
          {diveTrips.map(trip => (
            <Pressable
              key={trip.id}
              style={[styles.diveItem, selectedTripId === trip.id && styles.selectedDiveItem]}
              onPress={() => { setSelectedTripId(trip.id); setShowTripSelector(false); }}
            >
              <View style={styles.diveItemContent}>
                <Text style={[styles.diveItemText, { color: colors.text }]}>{trip.name}</Text>
              </View>
              {trip.start_date && (
                <Text style={[styles.diveItemDate, { color: colors.textSecondary }]}>
                  {new Date(trip.start_date).toLocaleDateString()}
                </Text>
              )}
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
  );

  const renderScrubBar = () => {
    if (!tripId || tripPhotos.length <= 1) return null;
    
    return (
      <View style={[styles.scrubBarContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <FlatList
          ref={scrubListRef}
          data={tripPhotos}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.scrubBarContent}
          getItemLayout={(data, index) => ({
            length: SCRUB_THUMB_SIZE + 8,
            offset: (SCRUB_THUMB_SIZE + 8) * index,
            index,
          })}
          renderItem={({ item, index }) => {
            const isActive = item.id === parseInt(id, 10);
            return (
              <Pressable
                onPress={() => navigateToPhoto(item.id, index)}
                style={[
                  styles.scrubThumb,
                  isActive && { borderColor: colors.primary, borderWidth: 2 }
                ]}
              >
                <Image
                  source={{ uri: getImageUrl(item.image_url) }}
                  style={styles.scrubThumbImage}
                  resizeMode="cover"
                />
              </Pressable>
            );
          }}
        />
        <Text style={[styles.scrubCounter, { color: colors.textSecondary }]}>
          {currentPhotoIndex + 1} / {tripPhotos.length}
        </Text>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ThemedBackground style={styles.container}>
        <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {isEditing ? 'Edit Photo' : 'Photo'}
          </Text>
          {isEditing ? (
            <View style={styles.headerRightButtons}>
              <Pressable onPress={handleCancelEdit} style={styles.headerButton}>
                <Text style={[styles.cancelButton, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveChanges} disabled={saving} style={styles.headerButton}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.saveButton, { color: colors.primary }]}>Save</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.headerButton} />
          )}
        </View>
        
        {isEditing ? renderEditMode() : renderViewMode()}
        
        {!isEditing && renderScrubBar()}
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
  headerRightButtons: {
    flexDirection: 'row',
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
  cancelButton: {
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  viewModeContainer: {
    flex: 1,
  },
  swipeablePhotosList: {
    flex: 1,
  },
  fullImageContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  viewModeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  viewModeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginBottom: 12,
  },
  viewActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captionContainer: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  captionText: {
    fontSize: 15,
    lineHeight: 20,
  },
  infoContainer: {
    padding: 12,
    borderRadius: 10,
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
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
  scrubBarContainer: {
    borderTopWidth: 1,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  scrubBarContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  scrubThumb: {
    width: SCRUB_THUMB_SIZE,
    height: SCRUB_THUMB_SIZE,
    borderRadius: 6,
    overflow: 'hidden',
    marginRight: 8,
  },
  scrubThumbImage: {
    width: '100%',
    height: '100%',
  },
  scrubCounter: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },
});
