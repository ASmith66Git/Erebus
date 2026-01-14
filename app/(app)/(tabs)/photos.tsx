import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getApiUrl } from '@/utils/apiConfig';

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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const GAP = 2;
const ITEM_SIZE = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

export default function PhotosScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
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

  const fetchPhotos = async () => {
    try {
      const params = new URLSearchParams();
      if (filter === 'favorites') params.append('favorites', 'true');
      
      const response = await fetch(`${getApiUrl()}/api/photos?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        let filteredPhotos = data.photos;
        if (filter === 'unlinked') {
          filteredPhotos = filteredPhotos.filter((p: Photo) => !p.diveLogId);
        }
        setPhotos(filteredPhotos);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchPhotos();
    }
  }, [filter, token]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPhotos();
  }, [filter]);

  const pickImage = async (useCamera: boolean) => {
    setShowUploadMenu(false);
    
    const permissionResult = useCamera 
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
      
    if (!permissionResult.granted) {
      alert(useCamera ? 'Camera permission is required' : 'Photo library permission is required');
      return;
    }
    
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: true,
          selectionLimit: 10,
          quality: 0.8,
        });
    
    if (!result.canceled && result.assets.length > 0) {
      await uploadImages(result.assets);
    }
  };

  const uploadImages = async (assets: ImagePicker.ImagePickerAsset[]) => {
    setUploading(true);
    
    try {
      for (const asset of assets) {
        console.log('Step 1: Requesting upload URL...');
        const urlResponse = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: `photo-${Date.now()}.jpg`,
            size: asset.fileSize || 0,
            contentType: 'image/jpeg',
          }),
        });
        
        if (!urlResponse.ok) {
          const errorText = await urlResponse.text();
          throw new Error(`Failed to get upload URL: ${urlResponse.status} - ${errorText}`);
        }
        const { uploadURL, objectPath } = await urlResponse.json();
        console.log('Step 2: Got upload URL, fetching image blob...');
        
        const imageResponse = await fetch(asset.uri);
        const imageBlob = await imageResponse.blob();
        console.log('Step 3: Got image blob, uploading to storage...', imageBlob.size);
        
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: imageBlob,
          headers: { 'Content-Type': 'image/jpeg' },
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(`Failed to upload image: ${uploadResponse.status} - ${errorText}`);
        }
        console.log('Step 4: Uploaded to storage, getting public URL...');
        
        const getUrlResponse = await fetch(`${getApiUrl()}/api/objects/url?path=${encodeURIComponent(objectPath)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!getUrlResponse.ok) {
          const errorText = await getUrlResponse.text();
          throw new Error(`Failed to get image URL: ${getUrlResponse.status} - ${errorText}`);
        }
        const { url: imageUrl } = await getUrlResponse.json();
        console.log('Step 5: Got public URL, saving to database...', imageUrl);
        
        const saveResponse = await fetch(`${getApiUrl()}/api/photos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            imageUrl,
            width: asset.width,
            height: asset.height,
            fileSize: asset.fileSize,
          }),
        });
        
        if (!saveResponse.ok) {
          const errorText = await saveResponse.text();
          throw new Error(`Failed to save photo: ${saveResponse.status} - ${errorText}`);
        }
        console.log('Step 6: Photo saved successfully!');
      }
      
      fetchPhotos();
    } catch (error: any) {
      console.error('Upload error:', error?.message || error?.toString() || 'Unknown error');
      console.error('Upload error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      alert(`Failed to upload photos: ${error?.message || 'Unknown error'}`);
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

  const renderPhoto = (photo: Photo, index: number) => {
    const isSelected = selectedIds.has(photo.id);
    
    return (
      <Pressable
        key={photo.id}
        style={[styles.photoItem, { width: ITEM_SIZE, height: ITEM_SIZE }]}
        onPress={() => openViewer(photo, index)}
        onLongPress={() => {
          setSelectionMode(true);
          toggleSelection(photo.id);
        }}
      >
        <Image
          source={{ uri: photo.thumbnailUrl || photo.imageUrl }}
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
                  setShowViewer(false);
                  router.push(`/photo/${selectedPhoto.id}`);
                }} 
                style={styles.viewerButton}
              >
                <Feather name="edit-2" size={22} color="#FFF" />
              </Pressable>
            </View>
          </View>
          
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: viewerIndex * SCREEN_WIDTH, y: 0 }}
            onMomentumScrollEnd={(e) => {
              const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              if (newIndex >= 0 && newIndex < photos.length) {
                setViewerIndex(newIndex);
                setSelectedPhoto(photos[newIndex]);
              }
            }}
          >
            {photos.map((photo) => (
              <View key={photo.id} style={{ width: SCREEN_WIDTH, justifyContent: 'center', alignItems: 'center' }}>
                <Image
                  source={{ uri: photo.imageUrl }}
                  style={styles.viewerImage}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>
          
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
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        {selectionMode ? (
          <>
            <Pressable onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }}>
              <Text style={[styles.toolbarText, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.toolbarTitle, { color: colors.text }]}>{selectedIds.size} selected</Text>
            <Pressable onPress={deleteSelected}>
              <Ionicons name="trash-outline" size={24} color="#FF3B30" />
            </Pressable>
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
          <View style={styles.gridContainer}>
            {photos.map((photo, index) => renderPhoto(photo, index))}
          </View>
        )}
      </ScrollView>
      
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
    paddingHorizontal: GAP,
  },
  photoItem: {
    marginRight: GAP,
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
  viewerImage: {
    width: SCREEN_WIDTH,
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
});
