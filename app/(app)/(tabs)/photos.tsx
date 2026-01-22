import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getApiUrl } from '@/utils/apiConfig';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

interface Photo {
  id: number;
  userId: number;
  diveLogId: number | null;
  diveNumber: number | null;
  diveDate: string | null;
  diveSiteName: string | null;
  tripId: number | null;
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
  mediaType: 'image' | 'video';
  duration: number | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DiveTrip {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
}

const NUM_COLUMNS = 3;
const GAP = 2;

export default function PhotosScreen() {
  const { colors } = useTheme();
  const { token, isLoading: authLoading } = useAuth();
  const { diveLogId } = useLocalSearchParams<{ diveLogId?: string }>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const gridWidth = containerWidth > 0 ? containerWidth : Math.min(windowWidth, 500);
  const screenWidth = containerWidth > 0 ? containerWidth : windowWidth;
  const screenHeight = windowHeight;
  const itemSize = Math.floor((gridWidth - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showViewer, setShowViewer] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<'all' | 'favorites' | 'unlinked'>('all');
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [diveLogs, setDiveLogs] = useState<{id: number; diveDateTime: string; diveSiteName: string | null}[]>([]);
  const [diveTrips, setDiveTrips] = useState<DiveTrip[]>([]);
  const [linking, setLinking] = useState(false);
  const [linkTab, setLinkTab] = useState<'logs' | 'trips'>('logs');
  const viewerScrollRef = useRef<ScrollView>(null);
  const thumbnailScrollRef = useRef<ScrollView>(null);
  const thumbnailScrollPosition = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const filterByDiveLogId = diveLogId ? parseInt(diveLogId) : null;

  // Helper to scroll thumbnail bar to center a given index
  const scrollThumbnailToIndex = useCallback((index: number, animated: boolean = true) => {
    const thumbnailWidth = 50;
    const thumbnailGap = 8;
    const thumbnailTotalWidth = thumbnailWidth + thumbnailGap;
    const scrollX = Math.max(0, (index * thumbnailTotalWidth) - (screenWidth / 2) + (thumbnailWidth / 2));
    thumbnailScrollRef.current?.scrollTo({ x: scrollX, animated });
    thumbnailScrollPosition.current = scrollX;
  }, [screenWidth]);

  useEffect(() => {
    if (showViewer && viewerScrollRef.current) {
      setTimeout(() => {
        viewerScrollRef.current?.scrollTo({ x: viewerIndex * screenWidth, animated: false });
      }, 50);
    }
  }, [showViewer, viewerIndex]);

  const fetchPhotos = async () => {
    console.log('Fetching photos...', 'token exists:', !!token, 'filterByDiveLogId:', filterByDiveLogId);
    try {
      const params = new URLSearchParams();
      if (filter === 'favorites') params.append('favorites', 'true');
      if (filterByDiveLogId) params.append('diveLogId', filterByDiveLogId.toString());
      
      const response = await fetch(`${getApiUrl()}/api/photos?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('Photos response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Photos fetched:', data.photos?.length || 0);
        let filteredPhotos = data.photos || [];
        if (filter === 'unlinked') {
          filteredPhotos = filteredPhotos.filter((p: Photo) => !p.diveLogId);
        }
        if (filterByDiveLogId) {
          filteredPhotos = filteredPhotos.filter((p: Photo) => p.diveLogId === filterByDiveLogId);
        }
        setPhotos(filteredPhotos);
      } else {
        const errorText = await response.text();
        console.error('Photos fetch failed:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!authLoading && token) {
      fetchPhotos();
    }
  }, [filter, token, authLoading, filterByDiveLogId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPhotos();
  }, [filter]);

  const fetchDiveLogs = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs`, {
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

  const fetchDiveTrips = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-trips`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setDiveTrips(data.trips || []);
      }
    } catch (error) {
      console.error('Error fetching dive trips:', error);
    }
  };

  const linkSelectedPhotos = async (diveLogId: number | null, tripId: number | null = null) => {
    setLinking(true);
    try {
      const selectedPhotoIds = Array.from(selectedIds);
      for (const photoId of selectedPhotoIds) {
        await fetch(`${getApiUrl()}/api/photos/${photoId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ diveLogId, tripId }),
        });
      }
      setShowLinkModal(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
      fetchPhotos();
    } catch (error) {
      console.error('Error linking photos:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to link photos');
      } else {
        const { Alert } = require('react-native');
        Alert.alert('Error', 'Failed to link photos');
      }
    } finally {
      setLinking(false);
    }
  };

  const pickMedia = async (useCamera: boolean) => {
    setShowUploadMenu(false);
    
    const permissionResult = useCamera 
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
      
    if (!permissionResult.granted) {
      alert(useCamera ? 'Camera permission is required' : 'Media library permission is required');
      return;
    }
    
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images', 'videos'],
          allowsEditing: false,
          quality: 0.8,
          videoMaxDuration: 300,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          allowsMultipleSelection: true,
          selectionLimit: 10,
          quality: 0.8,
          videoMaxDuration: 300,
        });
    
    if (!result.canceled && result.assets.length > 0) {
      await uploadMedia(result.assets);
    }
  };

  const uploadMedia = async (assets: ImagePicker.ImagePickerAsset[]) => {
    setUploading(true);
    
    try {
      for (const asset of assets) {
        const isVideo = asset.type === 'video';
        const extension = isVideo ? 'mp4' : 'jpg';
        const contentType = isVideo ? 'video/mp4' : 'image/jpeg';
        const fileName = `${isVideo ? 'video' : 'photo'}-${Date.now()}.${extension}`;
        
        console.log('Step 1: Requesting upload URL...', 'Type:', asset.type, 'Token exists:', !!token);
        const urlResponse = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: fileName,
            size: asset.fileSize || 0,
            contentType,
          }),
        });
        
        if (!urlResponse.ok) {
          const errorText = await urlResponse.text();
          throw new Error(`Failed to get upload URL: ${urlResponse.status} - ${errorText}`);
        }
        const { uploadURL, objectPath } = await urlResponse.json();
        console.log('Step 2: Got upload URL, fetching media blob...');
        
        const mediaResponse = await fetch(asset.uri);
        const mediaBlob = await mediaResponse.blob();
        console.log('Step 3: Got media blob, uploading to storage...', mediaBlob.size);
        
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: mediaBlob,
          headers: { 'Content-Type': contentType },
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(`Failed to upload ${isVideo ? 'video' : 'image'}: ${uploadResponse.status} - ${errorText}`);
        }
        console.log('Step 4: Uploaded to storage, getting public URL...');
        
        const getUrlResponse = await fetch(`${getApiUrl()}/api/objects/url?path=${encodeURIComponent(objectPath)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!getUrlResponse.ok) {
          const errorText = await getUrlResponse.text();
          throw new Error(`Failed to get media URL: ${getUrlResponse.status} - ${errorText}`);
        }
        const { url: mediaUrl } = await getUrlResponse.json();
        console.log('Step 5: Got public URL, saving to database...', mediaUrl);
        
        const saveResponse = await fetch(`${getApiUrl()}/api/photos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            imageUrl: mediaUrl,
            width: asset.width,
            height: asset.height,
            fileSize: asset.fileSize,
            mediaType: isVideo ? 'video' : 'image',
            duration: isVideo ? Math.round(asset.duration || 0) : null,
          }),
        });
        
        if (!saveResponse.ok) {
          const errorText = await saveResponse.text();
          throw new Error(`Failed to save ${isVideo ? 'video' : 'photo'}: ${saveResponse.status} - ${errorText}`);
        }
        console.log('Step 6: Media saved successfully!');
      }
      
      fetchPhotos();
    } catch (error: any) {
      console.error('Upload error:', error?.message || error?.toString() || 'Unknown error');
      console.error('Upload error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      alert(`Failed to upload media: ${error?.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const toggleFavorite = async (photo: Photo) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/photos/${photo.id}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const { isFavorite } = await response.json();
        setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, isFavorite } : p));
        if (selectedPhoto?.id === photo.id) {
          setSelectedPhoto({ ...photo, isFavorite });
        }
      }
    } catch (error) {
      console.error('Toggle favorite error:', error);
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/photos/batch-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ photoIds: Array.from(selectedIds) }),
      });
      
      if (response.ok) {
        setPhotos(prev => prev.filter(p => !selectedIds.has(p.id)));
        setSelectedIds(new Set());
        setSelectionMode(false);
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const openViewer = (photo: Photo, index: number) => {
    if (selectionMode) {
      toggleSelection(photo.id);
    } else {
      setSelectedPhoto(photo);
      setViewerIndex(index);
      setShowViewer(true);
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Helper to get the full image URL (relative paths need API URL prefix)
  const getImageUrl = (url: string) => {
    if (url.startsWith('/')) {
      return `${getApiUrl()}${url}`;
    }
    return url;
  };

  const renderPhoto = (photo: Photo, index: number) => {
    const isSelected = selectedIds.has(photo.id);
    const isLastInRow = (index + 1) % NUM_COLUMNS === 0;
    
    return (
      <Pressable
        key={photo.id}
        style={[
          styles.photoItem, 
          { 
            width: itemSize, 
            height: itemSize,
            marginRight: isLastInRow ? 0 : GAP,
          }
        ]}
        onPress={() => openViewer(photo, index)}
        onLongPress={() => {
          setSelectionMode(true);
          toggleSelection(photo.id);
        }}
      >
        <Image
          source={{ uri: getImageUrl(photo.thumbnailUrl || photo.imageUrl) }}
          style={styles.photoImage}
          resizeMode="cover"
        />
        
        {photo.isFavorite && (
          <View style={styles.favoriteIndicator}>
            <Ionicons name="heart" size={14} color="#FF3B30" />
          </View>
        )}
        
        {photo.diveLogId && (
          <View style={[styles.diveIndicator, { backgroundColor: colors.primary }]}>
            <Ionicons name="water" size={10} color="#FFF" />
          </View>
        )}
        
        {photo.tripId && (
          <View style={[styles.tripIndicator, { backgroundColor: colors.primary }]}>
            <Ionicons name="airplane" size={10} color="#FFF" />
          </View>
        )}
        
        {selectionMode && (
          <View style={[styles.selectionOverlay, isSelected && styles.selectedOverlay]}>
            <View style={[styles.checkbox, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              {isSelected && <Ionicons name="checkmark" size={16} color="#FFF" />}
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  const renderViewer = () => {
    if (!selectedPhoto) return null;
    
    return (
      <Modal
        visible={showViewer}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowViewer(false)}
      >
        <View style={[styles.viewerContainer, { backgroundColor: '#000' }]}>
          <View style={styles.viewerHeader}>
            <Pressable onPress={() => setShowViewer(false)} style={styles.viewerButton}>
              <Ionicons name="close" size={28} color="#FFF" />
            </Pressable>
            
            <View style={styles.viewerActions}>
              <Pressable onPress={() => toggleFavorite(selectedPhoto)} style={styles.viewerButton}>
                <Ionicons 
                  name={selectedPhoto.isFavorite ? 'heart' : 'heart-outline'} 
                  size={24} 
                  color={selectedPhoto.isFavorite ? '#FF3B30' : '#FFF'} 
                />
              </Pressable>
              <Pressable 
                onPress={() => {
                  console.log('[Photo Viewer] Info button pressed for photo:', selectedPhoto.id);
                  const photoId = selectedPhoto.id;
                  setShowViewer(false);
                  setTimeout(() => {
                    router.push(`/photo/${photoId}`);
                  }, 150);
                }} 
                style={styles.viewerButton}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Ionicons name="information-circle-outline" size={28} color="#FFF" />
              </Pressable>
            </View>
          </View>
          
          <ScrollView
            ref={viewerScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              // Use debounced scroll detection for web compatibility
              if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
              }
              scrollTimeoutRef.current = setTimeout(() => {
                if (!e?.nativeEvent) return;
                // Web uses scrollLeft, native uses contentOffset.x
                const scrollX = e.nativeEvent.contentOffset?.x ?? (e.nativeEvent.target as any)?.scrollLeft ?? 0;
                const viewWidth = e.nativeEvent.layoutMeasurement?.width ?? (e.nativeEvent.target as any)?.clientWidth ?? screenWidth;
                const newIndex = Math.round(scrollX / viewWidth);
                if (newIndex >= 0 && newIndex < photos.length && newIndex !== viewerIndex) {
                  setViewerIndex(newIndex);
                  setSelectedPhoto(photos[newIndex]);
                  scrollThumbnailToIndex(newIndex);
                }
              }, 100);
            }}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => {
              // Also handle momentum scroll end for native
              if (!e?.nativeEvent) return;
              const scrollX = e.nativeEvent.contentOffset?.x ?? (e.nativeEvent.target as any)?.scrollLeft ?? 0;
              const viewWidth = e.nativeEvent.layoutMeasurement?.width ?? (e.nativeEvent.target as any)?.clientWidth ?? screenWidth;
              const newIndex = Math.round(scrollX / viewWidth);
              if (newIndex >= 0 && newIndex < photos.length) {
                setViewerIndex(newIndex);
                setSelectedPhoto(photos[newIndex]);
                scrollThumbnailToIndex(newIndex);
              }
            }}
            style={styles.viewerScrollView}
          >
            {photos.map((photo) => (
              <View key={photo.id} style={[styles.viewerPage, { width: screenWidth, height: screenHeight }]}>
                <Image
                  source={{ uri: getImageUrl(photo.imageUrl) }}
                  style={[styles.viewerImage, { maxWidth: screenWidth, maxHeight: screenHeight - 200 }]}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>
          
          {/* Thumbnail scroll bar */}
          <View 
            style={styles.thumbnailBar}
            {...(Platform.OS === 'web' ? {
              onWheel: (e: any) => {
                e.preventDefault();
                const delta = e.deltaY || e.deltaX;
                thumbnailScrollPosition.current += delta;
                thumbnailScrollRef.current?.scrollTo({ 
                  x: Math.max(0, thumbnailScrollPosition.current), 
                  animated: false 
                });
              }
            } : {})}
          >
            <ScrollView 
              ref={thumbnailScrollRef}
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailContainer}
              onScroll={(e) => {
                if (e?.nativeEvent?.contentOffset) {
                  thumbnailScrollPosition.current = e.nativeEvent.contentOffset.x;
                }
              }}
              scrollEventThrottle={16}
            >
              {photos.map((photo, index) => (
                <Pressable
                  key={photo.id}
                  style={[
                    styles.thumbnailItem,
                    viewerIndex === index && { borderColor: colors.primary, borderWidth: 2 }
                  ]}
                  onPress={() => {
                    setViewerIndex(index);
                    setSelectedPhoto(photo);
                    viewerScrollRef.current?.scrollTo({ x: index * screenWidth, animated: true });
                  }}
                >
                  <Image
                    source={{ uri: getImageUrl(photo.thumbnailUrl || photo.imageUrl) }}
                    style={styles.thumbnailImage}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
          
          <View style={styles.viewerFooter}>
            {selectedPhoto.diveSiteName && (
              <Text style={styles.viewerLocation}>
                <Ionicons name="location" size={14} color="#FFF" /> {selectedPhoto.diveSiteName}
              </Text>
            )}
            {selectedPhoto.diveNumber && (
              <Text style={styles.viewerDive}>Dive #{selectedPhoto.diveNumber}</Text>
            )}
            {selectedPhoto.caption && (
              <Text style={styles.viewerCaption}>{selectedPhoto.caption}</Text>
            )}
            <Text style={styles.viewerDate}>{formatDate(selectedPhoto.takenAt || selectedPhoto.createdAt)}</Text>
          </View>
        </View>
      </Modal>
    );
  };

  const renderUploadMenu = () => (
    <Modal
      visible={showUploadMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowUploadMenu(false)}
    >
      <Pressable style={styles.uploadMenuOverlay} onPress={() => setShowUploadMenu(false)}>
        <View style={[styles.uploadMenu, { backgroundColor: colors.surface }]}>
          <Pressable style={styles.uploadMenuItem} onPress={() => pickImage(true)}>
            <Ionicons name="camera" size={24} color={colors.primary} />
            <Text style={[styles.uploadMenuText, { color: colors.text }]}>Take Photo</Text>
          </Pressable>
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.uploadMenuItem} onPress={() => pickImage(false)}>
            <Ionicons name="images" size={24} color={colors.primary} />
            <Text style={[styles.uploadMenuText, { color: colors.text }]}>Choose from Library</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );

  if (loading) {
    return (
      <ThemedBackground>
        <PageHeader title="Photos" />
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <PageHeader title={filterByDiveLogId ? "Dive Photos" : "Photos"} />
      
      {filterByDiveLogId && (
        <View style={[styles.filterBanner, { backgroundColor: colors.primary + '20', borderBottomColor: colors.border }]}>
          <View style={styles.filterBannerContent}>
            <Ionicons name="water" size={16} color={colors.primary} />
            <Text style={[styles.filterBannerText, { color: colors.text }]}>
              Showing photos linked to this dive
            </Text>
          </View>
          <Pressable onPress={() => router.replace('/(app)/(tabs)/photos')}>
            <Text style={[styles.filterClearText, { color: colors.primary }]}>View All</Text>
          </Pressable>
        </View>
      )}
      
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        {selectionMode ? (
          <>
            <Pressable onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }}>
              <Text style={[styles.toolbarText, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.toolbarTitle, { color: colors.text }]}>{selectedIds.size} selected</Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable 
                onPress={() => { fetchDiveLogs(); fetchDiveTrips(); setLinkTab('logs'); setShowLinkModal(true); }}
                disabled={selectedIds.size === 0}
              >
                <Ionicons name="link" size={24} color={selectedIds.size > 0 ? colors.primary : colors.textSecondary} />
              </Pressable>
              <Pressable onPress={() => setShowDeleteConfirm(true)} disabled={selectedIds.size === 0}>
                <Ionicons name="trash-outline" size={24} color={selectedIds.size > 0 ? '#FF3B30' : colors.textSecondary} />
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.filterTabs}>
              {(['all', 'favorites', 'unlinked'] as const).map((f) => (
                <Pressable
                  key={f}
                  style={[styles.filterTab, filter === f && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[styles.filterText, { color: filter === f ? colors.primary : colors.textSecondary }]}>
                    {f === 'all' ? 'All' : f === 'favorites' ? 'Favorites' : 'Unlinked'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setSelectionMode(true)}>
              <Text style={[styles.toolbarText, { color: colors.primary }]}>Select</Text>
            </Pressable>
          </>
        )}
      </View>
      
      <View 
        style={{ flex: 1 }}
        onLayout={(e) => {
          const { width } = e.nativeEvent.layout;
          if (width > 0 && width !== containerWidth) {
            setContainerWidth(width);
          }
        }}
      >
        <ScrollView
          contentContainerStyle={styles.grid}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {photos.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={64} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Photos Yet</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Tap the + button to add photos from your camera or underwater camera
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.gridContainer}>
                {photos.map((photo, index) => renderPhoto(photo, index))}
              </View>
              <View style={[styles.helpSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
                <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                  To link photos to a dive: tap "Select", choose photos, then tap the link icon. Or tap a photo and use the info button to edit its details.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </View>
      
      {!selectionMode && (
        <Pressable
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => setShowUploadMenu(true)}
        >
          {uploading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Ionicons name="add" size={32} color="#FFF" />
          )}
        </Pressable>
      )}
      
      {renderViewer()}
      {renderUploadMenu()}
      
      <Modal
        visible={showLinkModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLinkModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.linkModal, { backgroundColor: colors.surface }]}>
            <View style={styles.linkModalHeader}>
              <Text style={[styles.linkModalTitle, { color: colors.text }]}>Link Photos</Text>
              <Pressable onPress={() => setShowLinkModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.linkModalSubtitle, { color: colors.textSecondary }]}>
              Link {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''} to a dive log or trip
            </Text>
            
            <View style={[styles.linkTabsContainer, { borderBottomColor: colors.border }]}>
              <Pressable
                style={[
                  styles.linkTab,
                  linkTab === 'logs' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
                ]}
                onPress={() => setLinkTab('logs')}
              >
                <Text style={[styles.linkTabText, { color: linkTab === 'logs' ? colors.primary : colors.textSecondary }]}>
                  Dive Logs
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.linkTab,
                  linkTab === 'trips' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
                ]}
                onPress={() => setLinkTab('trips')}
              >
                <Text style={[styles.linkTabText, { color: linkTab === 'trips' ? colors.primary : colors.textSecondary }]}>
                  Dive Trips
                </Text>
              </Pressable>
            </View>
            
            <ScrollView style={styles.diveLogsList}>
              {linkTab === 'logs' ? (
                <>
                  <Pressable
                    style={[styles.diveLogItem, { borderBottomColor: colors.border }]}
                    onPress={() => linkSelectedPhotos(null, null)}
                  >
                    <View style={styles.diveLogItemContent}>
                      <Ionicons name="close-circle-outline" size={24} color={colors.textSecondary} />
                      <Text style={[styles.diveLogItemText, { color: colors.textSecondary }]}>Unlink from dive log</Text>
                    </View>
                  </Pressable>
                  
                  {diveLogs.map((log) => (
                    <Pressable
                      key={log.id}
                      style={[styles.diveLogItem, { borderBottomColor: colors.border }]}
                      onPress={() => linkSelectedPhotos(log.id, null)}
                    >
                      <View style={styles.diveLogItemContent}>
                        <Ionicons name="water" size={24} color={colors.primary} />
                        <View>
                          <Text style={[styles.diveLogItemText, { color: colors.text }]}>
                            {new Date(log.diveDateTime).toLocaleDateString()}
                          </Text>
                          {log.diveSiteName && (
                            <Text style={[styles.diveLogItemSubtext, { color: colors.textSecondary }]}>
                              {log.diveSiteName}
                            </Text>
                          )}
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                    </Pressable>
                  ))}
                </>
              ) : (
                <>
                  <Pressable
                    style={[styles.diveLogItem, { borderBottomColor: colors.border }]}
                    onPress={() => linkSelectedPhotos(null, null)}
                  >
                    <View style={styles.diveLogItemContent}>
                      <Ionicons name="close-circle-outline" size={24} color={colors.textSecondary} />
                      <Text style={[styles.diveLogItemText, { color: colors.textSecondary }]}>Unlink from dive trip</Text>
                    </View>
                  </Pressable>
                  
                  {diveTrips.map((trip) => (
                    <Pressable
                      key={trip.id}
                      style={[styles.diveLogItem, { borderBottomColor: colors.border }]}
                      onPress={() => linkSelectedPhotos(null, trip.id)}
                    >
                      <View style={styles.diveLogItemContent}>
                        <Ionicons name="airplane" size={24} color={colors.primary} />
                        <View>
                          <Text style={[styles.diveLogItemText, { color: colors.text }]}>
                            {trip.name}
                          </Text>
                          <Text style={[styles.diveLogItemSubtext, { color: colors.textSecondary }]}>
                            {new Date(trip.startDate).toLocaleDateString()}
                            {trip.endDate && ` - ${new Date(trip.endDate).toLocaleDateString()}`}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>
            
            {linking && (
              <View style={styles.linkingOverlay}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.deleteConfirmModal, { backgroundColor: colors.surface }]}>
            <Ionicons name="warning" size={48} color="#FF3B30" style={{ marginBottom: 16 }} />
            <Text style={[styles.deleteConfirmTitle, { color: colors.text }]}>Delete Photos?</Text>
            <Text style={[styles.deleteConfirmText, { color: colors.textSecondary }]}>
              Are you sure you want to delete {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.
            </Text>
            <View style={styles.deleteConfirmButtons}>
              <Pressable
                style={[styles.deleteConfirmButton, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={[styles.deleteConfirmButtonText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteConfirmButton, { backgroundColor: '#FF3B30' }]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  deleteSelected();
                }}
              >
                <Text style={[styles.deleteConfirmButtonText, { color: '#FFF' }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  filterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  filterBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterBannerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterClearText: {
    fontSize: 14,
    fontWeight: '600',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  toolbarText: {
    fontSize: 16,
    fontWeight: '500',
  },
  toolbarTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 16,
  },
  filterTab: {
    paddingVertical: 8,
  },
  filterText: {
    fontSize: 15,
    fontWeight: '500',
  },
  grid: {
    flexGrow: 1,
    paddingTop: GAP,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  photoItem: {
    marginBottom: GAP,
    position: 'relative',
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  favoriteIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  diveIndicator: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripIndicator: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  selectedOverlay: {
    backgroundColor: 'rgba(0, 122, 255, 0.3)',
  },
  checkbox: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  viewerContainer: {
    flex: 1,
  },
  viewerScrollView: {
    flex: 1,
  },
  thumbnailBar: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
  },
  thumbnailContainer: {
    paddingHorizontal: 8,
    gap: 8,
  },
  thumbnailItem: {
    width: 50,
    height: 50,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  viewerHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  viewerActions: {
    flexDirection: 'row',
    gap: 16,
  },
  viewerButton: {
    padding: 8,
  },
  viewerPage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  viewerLocation: {
    color: '#FFF',
    fontSize: 14,
    marginBottom: 4,
  },
  viewerDive: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  viewerCaption: {
    color: '#FFF',
    fontSize: 15,
    marginBottom: 8,
  },
  viewerDate: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  uploadMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  uploadMenu: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  uploadMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  uploadMenuText: {
    fontSize: 17,
  },
  menuDivider: {
    height: 1,
    marginHorizontal: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  linkModal: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  linkModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  linkModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  linkModalSubtitle: {
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  linkTabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  linkTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkTabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  diveLogsList: {
    maxHeight: 400,
  },
  diveLogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  diveLogItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  diveLogItemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  diveLogItemSubtext: {
    fontSize: 13,
    marginTop: 2,
  },
  linkingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    marginHorizontal: 4,
    marginBottom: 100,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  helpText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  deleteConfirmModal: {
    width: '90%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  deleteConfirmTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  deleteConfirmText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  deleteConfirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  deleteConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  deleteConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
