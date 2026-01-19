import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import * as ImagePicker from 'expo-image-picker';
import EmbeddedMapPicker from '@/components/EmbeddedMapPicker';
import DatePickerField from '@/components/DatePickerField';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

let DocumentScanner: any = null;
if (Platform.OS !== 'web') {
  try {
    DocumentScanner = require('react-native-document-scanner-plugin').default;
  } catch (e) {
    console.log('Document scanner not available (requires EAS Build)');
  }
}

interface TrainingAgency {
  id: number;
  name: string;
  full_name: string;
  website: string | null;
  logo_url: string | null;
}

interface TrainingCourse {
  id: number;
  name: string;
  level: string;
  category: string;
  agency_id: number;
  agency_name: string;
  agency_logo: string | null;
}

interface CertificationImage {
  id: number;
  image_url: string;
  image_side: string;
}

interface Certification {
  id: number;
  course_id: number | null;
  course_name: string | null;
  course_level: string | null;
  course_category: string | null;
  agency_id: number | null;
  agency_name: string | null;
  agency_logo: string | null;
  certification_date: string | null;
  certification_number: string | null;
  instructor_name: string | null;
  instructor_number: string | null;
  dive_center: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  is_verified: boolean;
  images: CertificationImage[] | null;
  created_at: string;
}

interface WishlistItem {
  id: number;
  course_id: number;
  course_name: string;
  course_level: string;
  course_category: string;
  agency_id: number;
  agency_name: string;
  agency_logo: string | null;
  priority: number;
  target_date: string | null;
  notes: string | null;
  dive_center: string | null;
  created_at: string;
}

type TabType = 'completed' | 'wishlist';

export default function CertificationsScreen() {
  const { colors } = useTheme();
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  
  const [activeTab, setActiveTab] = useState<TabType>('completed');
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [agencies, setAgencies] = useState<TrainingAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCoursePickerModal, setShowCoursePickerModal] = useState(false);
  const [showAddWishlistModal, setShowAddWishlistModal] = useState(false);
  const [wishlistCourse, setWishlistCourse] = useState<TrainingCourse | null>(null);
  const [wishlistDiveCenter, setWishlistDiveCenter] = useState('');
  const [editingWishlistItem, setEditingWishlistItem] = useState<WishlistItem | null>(null);
  const [selectedAgency, setSelectedAgency] = useState<TrainingAgency | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<TrainingCourse | null>(null);
  const [agencyCourses, setAgencyCourses] = useState<TrainingCourse[]>([]);
  
  const [formData, setFormData] = useState({
    certificationDate: '',
    certificationNumber: '',
    instructorName: '',
    instructorNumber: '',
    diveCenter: '',
    location: '',
    latitude: null as number | null,
    longitude: null as number | null,
    notes: '',
  });
  const [editingCertification, setEditingCertification] = useState<Certification | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCertification, setSelectedCertification] = useState<Certification | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [viewingImage, setViewingImage] = useState<CertificationImage | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<number | null>(null);
  const [pendingCardImages, setPendingCardImages] = useState<{ front: string | null; back: string | null }>({ front: null, back: null });

  const fetchData = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    
    const apiUrl = getApiUrl();
    
    try {
      const [certsRes, wishRes, agenciesRes] = await Promise.all([
        fetch(`${apiUrl}/api/certifications`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/api/certification-wishlist`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/api/training-agencies`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      
      if (certsRes.ok) {
        const certsData = await certsRes.json();
        setCertifications(certsData);
      }
      
      if (wishRes.ok) {
        const wishData = await wishRes.json();
        setWishlist(wishData);
      }
      
      if (agenciesRes.ok) {
        const agenciesData = await agenciesRes.json();
        setAgencies(agenciesData);
      }
    } catch (error) {
      console.error('Error fetching certifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading && token) {
      fetchData();
    }
  }, [token, authLoading, fetchData]);

  const fetchAgencyCourses = async (agencyId: number) => {
    if (!token) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/training-agencies/${agencyId}/courses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setAgencyCourses(data);
      }
    } catch (error) {
      console.error('Error fetching agency courses:', error);
    }
  };

  const handleAgencySelect = async (agency: TrainingAgency) => {
    setSelectedAgency(agency);
    await fetchAgencyCourses(agency.id);
  };

  const handleCourseSelect = (course: any) => {
    setSelectedCourse({
      ...course,
      agency_id: selectedAgency?.id,
      agency_name: selectedAgency?.name,
      agency_logo: selectedAgency?.logo_url,
    });
    setShowCoursePickerModal(false);
  };

  const resetForm = () => {
    setFormData({
      certificationDate: '',
      certificationNumber: '',
      instructorName: '',
      instructorNumber: '',
      diveCenter: '',
      location: '',
      latitude: null,
      longitude: null,
      notes: '',
    });
    setSelectedAgency(null);
    setSelectedCourse(null);
    setAgencyCourses([]);
    setEditingCertification(null);
    setPendingCardImages({ front: null, back: null });
  };

  const handleSaveCertification = async () => {
    if (!token || !selectedCourse) {
      Alert.alert('Error', 'Please select a course');
      return;
    }
    
    setSaving(true);
    try {
      const url = editingCertification
        ? `${getApiUrl()}/api/certifications/${editingCertification.id}`
        : `${getApiUrl()}/api/certifications`;
      
      const response = await fetch(url, {
        method: editingCertification ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId: selectedCourse.id,
          certificationDate: formData.certificationDate || null,
          certificationNumber: formData.certificationNumber || null,
          instructorName: formData.instructorName || null,
          instructorNumber: formData.instructorNumber || null,
          diveCenter: formData.diveCenter || null,
          location: formData.location || null,
          latitude: formData.latitude || null,
          longitude: formData.longitude || null,
          notes: formData.notes || null,
        }),
      });
      
      if (response.ok) {
        const savedCert = await response.json();
        
        // Upload pending card images for new certifications
        if (!editingCertification && (pendingCardImages.front || pendingCardImages.back)) {
          await uploadPendingImages(savedCert.id);
        }
        
        Alert.alert('Success', editingCertification ? 'Certification updated' : 'Certification added');
        setShowAddModal(false);
        resetForm();
        fetchData();
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Failed to save certification');
      }
    } catch (error) {
      console.error('Error saving certification:', error);
      Alert.alert('Error', 'Failed to save certification');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCertification = async (id: number) => {
    if (!token) return;
    
    const doDelete = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/certifications/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          Alert.alert('Success', 'Certification deleted');
          setShowDetailModal(false);
          fetchData();
        }
      } catch (error) {
        console.error('Error deleting certification:', error);
        Alert.alert('Error', 'Failed to delete certification');
      }
    };
    
    Alert.alert('Delete Certification', 'Are you sure you want to delete this certification?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  const handleAddToWishlist = async () => {
    if (!token || (!wishlistCourse && !editingWishlistItem)) {
      Alert.alert('Error', 'Please select a course');
      return;
    }
    
    setSaving(true);
    try {
      const url = editingWishlistItem
        ? `${getApiUrl()}/api/certification-wishlist/${editingWishlistItem.id}`
        : `${getApiUrl()}/api/certification-wishlist`;
      
      const response = await fetch(url, {
        method: editingWishlistItem ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          courseId: wishlistCourse?.id || editingWishlistItem?.course_id,
          diveCenter: wishlistDiveCenter || null,
        }),
      });
      
      if (response.ok) {
        Alert.alert('Success', editingWishlistItem ? 'Wishlist item updated' : `${wishlistCourse?.name} added to wishlist`);
        setShowAddWishlistModal(false);
        setWishlistCourse(null);
        setWishlistDiveCenter('');
        setEditingWishlistItem(null);
        setSelectedAgency(null);
        setAgencyCourses([]);
        fetchData();
      }
    } catch (error) {
      console.error('Error saving wishlist:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleEditWishlistItem = (item: WishlistItem) => {
    setEditingWishlistItem(item);
    setWishlistDiveCenter(item.dive_center || '');
    setWishlistCourse({
      id: item.course_id,
      name: item.course_name,
      level: item.course_level,
      category: item.course_category,
      agency_id: item.agency_id,
      agency_name: item.agency_name,
      agency_logo: item.agency_logo,
    });
    setShowAddWishlistModal(true);
  };

  const handleSelectWishlistCourse = (course: any) => {
    setWishlistCourse({
      ...course,
      agency_id: selectedAgency?.id,
      agency_name: selectedAgency?.name,
      agency_logo: selectedAgency?.logo_url,
    });
  };

  const handleRemoveFromWishlist = async (id: number) => {
    if (!token) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/certification-wishlist/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error removing from wishlist:', error);
    }
  };

  const uploadScannedImage = async (imageUri: string, side: 'front' | 'back') => {
    if (!selectedCertification || !token) return;
    
    setUploadingImage(true);
    try {
      const filename = `cert_${selectedCertification.id}_${side}_${Date.now()}.jpg`;
      
      console.log('Step 1: Requesting upload URL for', filename);
      const urlResponse = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: filename,
          size: 1000000,
          contentType: 'image/jpeg',
        }),
      });
      
      if (!urlResponse.ok) {
        const errorText = await urlResponse.text();
        console.error('Failed to get upload URL:', urlResponse.status, errorText);
        throw new Error('Failed to get upload URL');
      }
      
      const { uploadURL, objectPath } = await urlResponse.json();
      console.log('Step 2: Got upload URL, objectPath:', objectPath);
      
      const imageBlob = await fetch(imageUri).then(r => r.blob());
      console.log('Step 3: Created blob, size:', imageBlob.size);
      
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: imageBlob,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Failed to upload to storage:', uploadResponse.status, errorText);
        throw new Error('Failed to upload image');
      }
      console.log('Step 4: Uploaded to storage successfully');
      
      const addImageResponse = await fetch(
        `${getApiUrl()}/api/certifications/${selectedCertification.id}/images`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrl: objectPath,
            imageSide: side,
          }),
        }
      );
      
      if (!addImageResponse.ok) {
        const errorText = await addImageResponse.text();
        console.error('Failed to save image record:', addImageResponse.status, errorText);
        throw new Error('Failed to save image record');
      }
      
      console.log('Step 5: Image record saved to database');
      Alert.alert('Success', `${side === 'front' ? 'Front' : 'Back'} of card scanned`);
      
      // Refetch certifications and update selected certification with fresh data
      const freshCertsResponse = await fetch(`${getApiUrl()}/api/certifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (freshCertsResponse.ok) {
        const freshCerts = await freshCertsResponse.json();
        setCertifications(freshCerts);
        const updatedCert = freshCerts.find((c: Certification) => c.id === selectedCertification.id);
        if (updatedCert) {
          setSelectedCertification(updatedCert);
        }
      }
    } catch (error) {
      console.error('Error scanning card:', error);
      Alert.alert('Error', 'Failed to scan card. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleScanCard = async (side: 'front' | 'back') => {
    if (!selectedCertification || !token) return;
    
    // Try to use document scanner on native platforms (requires EAS Build)
    if (Platform.OS !== 'web' && DocumentScanner) {
      try {
        const { scannedImages } = await DocumentScanner.scanDocument({
          maxNumDocuments: 1,
          croppedImageQuality: 80,
        });
        
        if (scannedImages && scannedImages.length > 0) {
          await uploadScannedImage(scannedImages[0], side);
        }
        return;
      } catch (scanError: any) {
        // If scanner fails (e.g., user cancelled or not available), fall back to image picker
        if (scanError?.message !== 'User canceled') {
          console.log('Document scanner error, falling back to camera:', scanError);
        } else {
          return; // User cancelled, don't show fallback
        }
      }
    }
    
    // Fallback to expo-image-picker (works on web and when scanner not available)
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 10],
      quality: 0.8,
    });
    
    if (!result.canceled && result.assets[0]) {
      await uploadScannedImage(result.assets[0].uri, side);
    }
  };

  const handleScanCardForAdd = async (side: 'front' | 'back') => {
    // Try to use document scanner on native platforms (requires EAS Build)
    if (Platform.OS !== 'web' && DocumentScanner) {
      try {
        const { scannedImages } = await DocumentScanner.scanDocument({
          maxNumDocuments: 1,
          croppedImageQuality: 80,
        });
        
        if (scannedImages && scannedImages.length > 0) {
          setPendingCardImages(prev => ({ ...prev, [side]: scannedImages[0] }));
        }
        return;
      } catch (scanError: any) {
        if (scanError?.message !== 'User canceled') {
          console.log('Document scanner error, falling back to camera:', scanError);
        } else {
          return;
        }
      }
    }
    
    // Fallback to expo-image-picker
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 10],
      quality: 0.8,
    });
    
    if (!result.canceled && result.assets[0]) {
      setPendingCardImages(prev => ({ ...prev, [side]: result.assets[0].uri }));
    }
  };

  const uploadPendingImages = async (certificationId: number) => {
    const sides: ('front' | 'back')[] = ['front', 'back'];
    
    for (const side of sides) {
      const imageUri = pendingCardImages[side];
      if (!imageUri) continue;
      
      try {
        const filename = `cert-card-${certificationId}-${side}-${Date.now()}.jpg`;
        const urlResponse = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: filename, contentType: 'image/jpeg' }),
        });
        
        if (!urlResponse.ok) throw new Error('Failed to get upload URL');
        
        const { uploadURL, objectPath } = await urlResponse.json();
        const imageBlob = await fetch(imageUri).then(r => r.blob());
        
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: imageBlob,
          headers: { 'Content-Type': 'image/jpeg' },
        });
        
        if (!uploadResponse.ok) throw new Error('Failed to upload image');
        
        await fetch(`${getApiUrl()}/api/certifications/${certificationId}/images`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imageUrl: objectPath, imageSide: side }),
        });
      } catch (error) {
        console.error(`Error uploading ${side} card image:`, error);
      }
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    if (!selectedCertification || !token) return;
    
    const doDelete = async () => {
      setDeletingImageId(imageId);
      try {
        const response = await fetch(
          `${getApiUrl()}/api/certifications/${selectedCertification.id}/images/${imageId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        
        if (response.ok) {
          Alert.alert('Success', 'Image deleted');
          setShowImageViewer(false);
          setViewingImage(null);
          
          // Refetch certifications and update selected certification with fresh data
          const freshCertsResponse = await fetch(`${getApiUrl()}/api/certifications`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (freshCertsResponse.ok) {
            const freshCerts = await freshCertsResponse.json();
            setCertifications(freshCerts);
            const updated = freshCerts.find((c: Certification) => c.id === selectedCertification.id);
            if (updated) {
              setSelectedCertification(updated);
            }
          }
        } else {
          Alert.alert('Error', 'Failed to delete image');
        }
      } catch (error) {
        console.error('Error deleting image:', error);
        Alert.alert('Error', 'Failed to delete image');
      } finally {
        setDeletingImageId(null);
      }
    };
    
    Alert.alert('Delete Image', 'Are you sure you want to delete this card image?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  const handleReplaceImage = async (imageToReplace: CertificationImage) => {
    if (!selectedCertification || !token) return;
    
    const side = imageToReplace.image_side as 'front' | 'back';
    
    // First delete the old image
    setDeletingImageId(imageToReplace.id);
    try {
      const deleteResponse = await fetch(
        `${getApiUrl()}/api/certifications/${selectedCertification.id}/images/${imageToReplace.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      if (!deleteResponse.ok) {
        throw new Error('Failed to delete old image');
      }
      
      setDeletingImageId(null);
      setShowImageViewer(false);
      setViewingImage(null);
      
      // Now scan a new image
      await handleScanCard(side);
    } catch (error) {
      console.error('Error replacing image:', error);
      Alert.alert('Error', 'Failed to replace image');
      setDeletingImageId(null);
    }
  };

  const openImageViewer = (img: CertificationImage) => {
    setViewingImage(img);
    setShowImageViewer(true);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not recorded';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'recreational': return '#4CAF50';
      case 'technical': return '#FF9800';
      case 'professional': return '#2196F3';
      default: return colors.textSecondary;
    }
  };

  const renderCertificationCard = (cert: Certification) => (
    <Pressable
      key={cert.id}
      style={[styles.certCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => {
        setSelectedCertification(cert);
        setShowDetailModal(true);
      }}
    >
      <View style={styles.certCardHeader}>
        <View style={styles.certCardAgency}>
          <Text style={[styles.agencyName, { color: colors.primary }]}>{cert.agency_name || 'Unknown Agency'}</Text>
        </View>
        <View style={[styles.levelBadge, { backgroundColor: getLevelColor(cert.course_level || '') + '20' }]}>
          <Text style={[styles.levelBadgeText, { color: getLevelColor(cert.course_level || '') }]}>
            {cert.course_level?.charAt(0).toUpperCase() + cert.course_level?.slice(1) || 'N/A'}
          </Text>
        </View>
      </View>
      
      <Text style={[styles.certCourseName, { color: colors.text }]}>{cert.course_name || 'Unknown Course'}</Text>
      
      <View style={styles.certCardDetails}>
        <View style={styles.certDetailRow}>
          <Feather name="calendar" size={14} color={colors.textSecondary} />
          <Text style={[styles.certDetailText, { color: colors.textSecondary }]}>
            {formatDate(cert.certification_date)}
          </Text>
        </View>
        
        {cert.location && (
          <View style={styles.certDetailRow}>
            <Feather name="map-pin" size={14} color={colors.textSecondary} />
            <Text style={[styles.certDetailText, { color: colors.textSecondary }]} numberOfLines={1}>
              {cert.location}
            </Text>
          </View>
        )}
      </View>
      
      {cert.images && cert.images.length > 0 && (
        <View style={styles.cardImageIndicator}>
          <Feather name="credit-card" size={14} color={colors.primary} />
          <Text style={[styles.cardImageText, { color: colors.primary }]}>Card scanned</Text>
        </View>
      )}
    </Pressable>
  );

  const renderWishlistCard = (item: WishlistItem) => (
    <Pressable
      key={item.id}
      style={[styles.wishlistCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => handleEditWishlistItem(item)}
    >
      <View style={styles.wishlistCardContent}>
        <Text style={[styles.agencyName, { color: colors.primary }]}>{item.agency_name}</Text>
        <Text style={[styles.certCourseName, { color: colors.text }]}>{item.course_name}</Text>
        
        <View style={[styles.levelBadge, { backgroundColor: getLevelColor(item.course_level) + '20', alignSelf: 'flex-start', marginTop: 8 }]}>
          <Text style={[styles.levelBadgeText, { color: getLevelColor(item.course_level) }]}>
            {item.course_level?.charAt(0).toUpperCase() + item.course_level?.slice(1)}
          </Text>
        </View>
        
        {item.dive_center && (
          <View style={[styles.certDetailRow, { marginTop: 8 }]}>
            <Feather name="home" size={14} color={colors.textSecondary} />
            <Text style={[styles.certDetailText, { color: colors.textSecondary }]}>
              {item.dive_center}
            </Text>
          </View>
        )}
        
        {item.target_date && (
          <View style={[styles.certDetailRow, { marginTop: 8 }]}>
            <Feather name="target" size={14} color={colors.textSecondary} />
            <Text style={[styles.certDetailText, { color: colors.textSecondary }]}>
              Target: {formatDate(item.target_date)}
            </Text>
          </View>
        )}
      </View>
      
      <Pressable
        style={[styles.removeWishlistBtn, { backgroundColor: colors.danger + '20' }]}
        onPress={(e) => { e.stopPropagation(); handleRemoveFromWishlist(item.id); }}
      >
        <Feather name="x" size={18} color={colors.danger} />
      </Pressable>
    </Pressable>
  );

  if (authLoading || loading) {
    return (
      <ThemedBackground style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading certifications...</Text>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <PageHeader title="Certifications" />

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          style={[styles.tab, activeTab === 'completed' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('completed')}
        >
          <Feather name="award" size={18} color={activeTab === 'completed' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'completed' ? colors.primary : colors.textSecondary }]}>
            Completed ({certifications.length})
          </Text>
        </Pressable>
        
        <Pressable
          style={[styles.tab, activeTab === 'wishlist' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('wishlist')}
        >
          <Feather name="star" size={18} color={activeTab === 'wishlist' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'wishlist' ? colors.primary : colors.textSecondary }]}>
            Wishlist ({wishlist.length})
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />
        }
      >
        {activeTab === 'completed' ? (
          certifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="award" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyStateTitle, { color: colors.text }]}>No Certifications Yet</Text>
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                Add your diving certifications to keep track of your training history.
              </Text>
              <Pressable
                style={[styles.emptyStateBtn, { backgroundColor: colors.primary }]}
                onPress={() => { resetForm(); setShowAddModal(true); }}
              >
                <Feather name="plus" size={18} color="#FFF" />
                <Text style={styles.emptyStateBtnText}>Add Certification</Text>
              </Pressable>
            </View>
          ) : (
            certifications.map(renderCertificationCard)
          )
        ) : (
          wishlist.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="star" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyStateTitle, { color: colors.text }]}>Wishlist Empty</Text>
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                Add courses you'd like to take in the future.
              </Text>
              <Pressable
                style={[styles.emptyStateBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setWishlistCourse(null);
                  setWishlistDiveCenter('');
                  setSelectedAgency(null);
                  setAgencyCourses([]);
                  setShowAddWishlistModal(true);
                }}
              >
                <Feather name="plus" size={18} color="#FFF" />
                <Text style={styles.emptyStateBtnText}>Add to Wishlist</Text>
              </Pressable>
            </View>
          ) : (
            wishlist.map(renderWishlistCard)
          )
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => { 
          if (activeTab === 'wishlist') {
            setWishlistCourse(null);
            setWishlistDiveCenter('');
            setSelectedAgency(null);
            setAgencyCourses([]);
            setShowAddWishlistModal(true);
          } else {
            resetForm(); 
            setShowAddModal(true); 
          }
        }}
      >
        <Feather name="plus" size={24} color="#FFF" />
      </Pressable>

      {/* Add/Edit Certification Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingCertification ? 'Edit Certification' : 'Add Certification'}
              </Text>
              <Pressable onPress={() => { setShowAddModal(false); resetForm(); }}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <Pressable
                style={[styles.pickerButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => setShowCoursePickerModal(true)}
              >
                <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Course *</Text>
                <View style={styles.pickerValue}>
                  <Text style={[styles.pickerValueText, { color: selectedCourse ? colors.text : colors.textSecondary }]}>
                    {selectedCourse ? `${selectedCourse.agency_name} - ${selectedCourse.name}` : 'Select a course...'}
                  </Text>
                  <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                </View>
              </Pressable>
              
              <DatePickerField
                label="Date Certified"
                value={formData.certificationDate}
                onChange={(v) => setFormData({ ...formData, certificationDate: v })}
                placeholder="Select certification date"
              />
              
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Certification Number</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.certificationNumber}
                  onChangeText={(v) => setFormData({ ...formData, certificationNumber: v })}
                  placeholder="e.g., 12345678"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              
              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>Instructor Name</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={formData.instructorName}
                    onChangeText={(v) => setFormData({ ...formData, instructorName: v })}
                    placeholder="Name"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>Instructor #</Text>
                  <TextInput
                    style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                    value={formData.instructorNumber}
                    onChangeText={(v) => setFormData({ ...formData, instructorNumber: v })}
                    placeholder="Number"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
              
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Dive Center</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.diveCenter}
                  onChangeText={(v) => setFormData({ ...formData, diveCenter: v })}
                  placeholder="Where you trained"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Location Name</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.location}
                  onChangeText={(v) => setFormData({ ...formData, location: v })}
                  placeholder="e.g., Koh Tao, Thailand"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Map Location</Text>
                <EmbeddedMapPicker
                  latitude={formData.latitude || 0}
                  longitude={formData.longitude || 0}
                  onCoordinatesChange={(lat, lng) => {
                    setFormData({
                      ...formData,
                      latitude: lat,
                      longitude: lng,
                    });
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
              </View>
              
              {!editingCertification && (
                <View style={styles.formGroup}>
                  <Text style={[styles.formLabel, { color: colors.text }]}>Certification Card</Text>
                  <View style={styles.cardScanButtons}>
                    <Pressable
                      style={[styles.scanBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => handleScanCardForAdd('front')}
                    >
                      {pendingCardImages.front ? (
                        <Image source={{ uri: pendingCardImages.front }} style={styles.scanBtnPreview} resizeMode="cover" />
                      ) : (
                        <>
                          <Feather name="camera" size={24} color={colors.primary} />
                          <Text style={[styles.scanBtnText, { color: colors.text }]}>Scan Front</Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.scanBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => handleScanCardForAdd('back')}
                    >
                      {pendingCardImages.back ? (
                        <Image source={{ uri: pendingCardImages.back }} style={styles.scanBtnPreview} resizeMode="cover" />
                      ) : (
                        <>
                          <Feather name="camera" size={24} color={colors.primary} />
                          <Text style={[styles.scanBtnText, { color: colors.text }]}>Scan Back</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                  {(pendingCardImages.front || pendingCardImages.back) && (
                    <Pressable
                      style={{ marginTop: 8 }}
                      onPress={() => setPendingCardImages({ front: null, back: null })}
                    >
                      <Text style={{ color: colors.primary, fontSize: 14 }}>Clear scanned images</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Notes</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.notes}
                  onChangeText={(v) => setFormData({ ...formData, notes: v })}
                  placeholder="Additional notes..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
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
                onPress={handleSaveCertification}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Course Picker Modal */}
      <Modal visible={showCoursePickerModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, height: '80%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Pressable onPress={() => {
                if (selectedAgency && agencyCourses.length > 0) {
                  setAgencyCourses([]);
                  setSelectedAgency(null);
                } else {
                  setShowCoursePickerModal(false);
                  setSelectedAgency(null);
                  setAgencyCourses([]);
                }
              }}>
                <Feather name="arrow-left" size={24} color={colors.text} />
              </Pressable>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {selectedAgency && agencyCourses.length > 0 ? selectedAgency.name + ' Courses' : 'Select Agency'}
              </Text>
              <View style={{ width: 24 }} />
            </View>
            
            <ScrollView style={styles.modalBody}>
              {!selectedAgency ? (
                agencies.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Loading agencies...</Text>
                  </View>
                ) : (
                  agencies.map((agency) => (
                    <Pressable
                      key={agency.id}
                      style={[styles.agencyRow, { borderBottomColor: colors.border }]}
                      onPress={() => handleAgencySelect(agency)}
                    >
                      <View>
                        <Text style={[styles.agencyRowName, { color: colors.text }]}>{agency.name}</Text>
                        <Text style={[styles.agencyRowFullName, { color: colors.textSecondary }]}>{agency.full_name}</Text>
                      </View>
                      <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                    </Pressable>
                  ))
                )
              ) : agencyCourses.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Loading courses...</Text>
                </View>
              ) : (
                agencyCourses.map((course) => (
                  <Pressable
                    key={course.id}
                    style={[styles.courseRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleCourseSelect(course)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.courseRowName, { color: colors.text }]}>{course.name}</Text>
                      <View style={styles.courseRowMeta}>
                        <View style={[styles.levelBadgeSmall, { backgroundColor: getLevelColor(course.level) + '20' }]}>
                          <Text style={[styles.levelBadgeTextSmall, { color: getLevelColor(course.level) }]}>
                            {course.level}
                          </Text>
                        </View>
                        {course.category && (
                          <Text style={[styles.courseCategory, { color: colors.textSecondary }]}>{course.category}</Text>
                        )}
                      </View>
                    </View>
                    <Feather name="check" size={20} color={colors.primary} style={{ opacity: 0 }} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Certification Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, height: '85%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Certification Details</Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Pressable onPress={() => {
                  if (selectedCertification) {
                    setEditingCertification(selectedCertification);
                    setSelectedCourse({
                      id: selectedCertification.course_id || 0,
                      name: selectedCertification.course_name || '',
                      level: selectedCertification.course_level || '',
                      category: selectedCertification.course_category || '',
                      agency_id: selectedCertification.agency_id || 0,
                      agency_name: selectedCertification.agency_name || '',
                      agency_logo: selectedCertification.agency_logo,
                    });
                    setFormData({
                      certificationDate: selectedCertification.certification_date || '',
                      certificationNumber: selectedCertification.certification_number || '',
                      instructorName: selectedCertification.instructor_name || '',
                      instructorNumber: selectedCertification.instructor_number || '',
                      diveCenter: selectedCertification.dive_center || '',
                      location: selectedCertification.location || '',
                      latitude: selectedCertification.latitude,
                      longitude: selectedCertification.longitude,
                      notes: selectedCertification.notes || '',
                    });
                    setShowDetailModal(false);
                    setShowAddModal(true);
                  }
                }}>
                  <Feather name="edit-2" size={22} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => selectedCertification && handleDeleteCertification(selectedCertification.id)}>
                  <Feather name="trash-2" size={22} color={colors.danger} />
                </Pressable>
                <Pressable onPress={() => setShowDetailModal(false)}>
                  <Feather name="x" size={24} color={colors.text} />
                </Pressable>
              </View>
            </View>
            
            {selectedCertification && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailSection}>
                  <Text style={[styles.detailAgency, { color: colors.primary }]}>{selectedCertification.agency_name}</Text>
                  <Text style={[styles.detailCourse, { color: colors.text }]}>{selectedCertification.course_name}</Text>
                  <View style={[styles.levelBadge, { backgroundColor: getLevelColor(selectedCertification.course_level || '') + '20', alignSelf: 'flex-start', marginTop: 8 }]}>
                    <Text style={[styles.levelBadgeText, { color: getLevelColor(selectedCertification.course_level || '') }]}>
                      {selectedCertification.course_level}
                    </Text>
                  </View>
                </View>
                
                <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Date</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{formatDate(selectedCertification.certification_date)}</Text>
                  </View>
                  {selectedCertification.certification_number && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Cert #</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{selectedCertification.certification_number}</Text>
                    </View>
                  )}
                  {selectedCertification.instructor_name && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Instructor</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {selectedCertification.instructor_name}
                        {selectedCertification.instructor_number && ` (#${selectedCertification.instructor_number})`}
                      </Text>
                    </View>
                  )}
                  {selectedCertification.dive_center && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Dive Center</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{selectedCertification.dive_center}</Text>
                    </View>
                  )}
                  {selectedCertification.location && (
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Location</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>{selectedCertification.location}</Text>
                    </View>
                  )}
                </View>
                
                {selectedCertification.latitude && selectedCertification.longitude && (
                  <View style={{ marginTop: 16, marginBottom: 8 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Training Location</Text>
                    <EmbeddedMapPicker
                      latitude={selectedCertification.latitude}
                      longitude={selectedCertification.longitude}
                      onCoordinatesChange={() => {}}
                      colors={{
                        background: colors.background,
                        surface: colors.surface,
                        text: colors.text,
                        textSecondary: colors.textSecondary,
                        border: colors.border,
                        primary: colors.primary,
                      }}
                    />
                  </View>
                )}
                
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Certification Card</Text>
                <View style={styles.cardScanButtons}>
                  <Pressable
                    style={[styles.scanBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => handleScanCard('front')}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Feather name="camera" size={24} color={colors.primary} />
                        <Text style={[styles.scanBtnText, { color: colors.text }]}>Scan Front</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.scanBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => handleScanCard('back')}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Feather name="camera" size={24} color={colors.primary} />
                        <Text style={[styles.scanBtnText, { color: colors.text }]}>Scan Back</Text>
                      </>
                    )}
                  </Pressable>
                </View>
                
                {selectedCertification.images && selectedCertification.images.length > 0 && (
                  <View style={styles.scannedImages}>
                    {selectedCertification.images.map((img) => {
                      const imageUrl = img.image_url.startsWith('http') 
                        ? img.image_url 
                        : `${getApiUrl()}${img.image_url}`;
                      const isDeleting = deletingImageId === img.id;
                      return (
                        <View key={img.id} style={styles.scannedImageContainer}>
                          <View style={styles.scannedImageHeader}>
                            <Text style={[styles.scannedImageLabel, { color: colors.textSecondary }]}>
                              {img.image_side === 'front' ? 'Front' : 'Back'}
                            </Text>
                            <View style={styles.scannedImageActions}>
                              <Pressable
                                style={[styles.imageActionBtn, { backgroundColor: colors.card }]}
                                onPress={() => handleReplaceImage(img)}
                                disabled={isDeleting}
                              >
                                <Feather name="refresh-cw" size={16} color={colors.primary} />
                              </Pressable>
                              <Pressable
                                style={[styles.imageActionBtn, { backgroundColor: colors.card }]}
                                onPress={() => handleDeleteImage(img.id)}
                                disabled={isDeleting}
                              >
                                {isDeleting ? (
                                  <ActivityIndicator size="small" color={colors.danger} />
                                ) : (
                                  <Feather name="trash-2" size={16} color={colors.danger} />
                                )}
                              </Pressable>
                            </View>
                          </View>
                          <Pressable onPress={() => openImageViewer(img)}>
                            <Image
                              source={{ uri: imageUrl }}
                              style={styles.scannedImage}
                              resizeMode="cover"
                            />
                            <View style={[styles.tapToViewOverlay, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                              <Feather name="maximize-2" size={20} color="#FFF" />
                              <Text style={styles.tapToViewText}>Tap to view</Text>
                            </View>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}
                
                {selectedCertification.notes && (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>Notes</Text>
                    <Text style={[styles.notesText, { color: colors.textSecondary }]}>{selectedCertification.notes}</Text>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Add to Wishlist Modal */}
      <Modal visible={showAddWishlistModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingWishlistItem ? 'Edit Wishlist Item' : 'Add to Wishlist'}
              </Text>
              <Pressable onPress={() => {
                setShowAddWishlistModal(false);
                setWishlistCourse(null);
                setWishlistDiveCenter('');
                setEditingWishlistItem(null);
                setSelectedAgency(null);
                setAgencyCourses([]);
              }}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {!wishlistCourse ? (
                <>
                  <Text style={[styles.formLabel, { color: colors.text, marginBottom: 12 }]}>
                    {!selectedAgency ? 'Select Agency' : `${selectedAgency.name} Courses`}
                  </Text>
                  {!selectedAgency ? (
                    agencies.map((agency) => (
                      <Pressable
                        key={agency.id}
                        style={[styles.agencyRow, { borderBottomColor: colors.border }]}
                        onPress={() => handleAgencySelect(agency)}
                      >
                        <View>
                          <Text style={[styles.agencyName, { color: colors.text }]}>{agency.name}</Text>
                          {agency.full_name && (
                            <Text style={[styles.agencyFullName, { color: colors.textSecondary }]}>{agency.full_name}</Text>
                          )}
                        </View>
                        <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                      </Pressable>
                    ))
                  ) : (
                    <>
                      <Pressable
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}
                        onPress={() => { setSelectedAgency(null); setAgencyCourses([]); }}
                      >
                        <Feather name="arrow-left" size={20} color={colors.primary} />
                        <Text style={{ color: colors.primary, marginLeft: 8 }}>Back to agencies</Text>
                      </Pressable>
                      {agencyCourses.map((course) => (
                        <Pressable
                          key={course.id}
                          style={[styles.courseRow, { borderBottomColor: colors.border }]}
                          onPress={() => handleSelectWishlistCourse(course)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.courseName, { color: colors.text }]}>{course.name}</Text>
                            <Text style={[styles.courseLevel, { color: colors.textSecondary }]}>{course.level}</Text>
                          </View>
                          <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                        </Pressable>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  <View style={[styles.selectedCourseCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.agencyName, { color: colors.primary }]}>{wishlistCourse.agency_name}</Text>
                    <Text style={[styles.courseName, { color: colors.text, fontSize: 18 }]}>{wishlistCourse.name}</Text>
                    {!editingWishlistItem && (
                      <Pressable
                        onPress={() => setWishlistCourse(null)}
                        style={{ marginTop: 8 }}
                      >
                        <Text style={{ color: colors.primary }}>Change course</Text>
                      </Pressable>
                    )}
                  </View>
                  
                  <View style={styles.formGroup}>
                    <Text style={[styles.formLabel, { color: colors.text }]}>Dive Center (Optional)</Text>
                    <TextInput
                      style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                      value={wishlistDiveCenter}
                      onChangeText={setWishlistDiveCenter}
                      placeholder="Where you plan to train"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                </>
              )}
            </ScrollView>
            
            {wishlistCourse && (
              <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnSecondary, { borderColor: colors.border }]}
                  onPress={() => {
                    setShowAddWishlistModal(false);
                    setWishlistCourse(null);
                    setWishlistDiveCenter('');
                    setEditingWishlistItem(null);
                    setSelectedAgency(null);
                    setAgencyCourses([]);
                  }}
                >
                  <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
                  onPress={handleAddToWishlist}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: '#FFF' }]}>
                      {editingWishlistItem ? 'Save Changes' : 'Add to Wishlist'}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Full-Screen Image Viewer Modal */}
      <Modal visible={showImageViewer} animationType="fade" transparent>
        <View style={styles.imageViewerOverlay}>
          <View style={styles.imageViewerHeader}>
            <Text style={styles.imageViewerTitle}>
              {viewingImage?.image_side === 'front' ? 'Front of Card' : 'Back of Card'}
            </Text>
            <Pressable
              style={styles.imageViewerCloseBtn}
              onPress={() => {
                setShowImageViewer(false);
                setViewingImage(null);
              }}
            >
              <Feather name="x" size={28} color="#FFF" />
            </Pressable>
          </View>
          
          {viewingImage && (
            <View style={styles.imageViewerContent}>
              <Image
                source={{ 
                  uri: viewingImage.image_url.startsWith('http') 
                    ? viewingImage.image_url 
                    : `${getApiUrl()}${viewingImage.image_url}` 
                }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
            </View>
          )}
          
          <View style={styles.imageViewerActions}>
            <Pressable
              style={[styles.imageViewerActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => viewingImage && handleReplaceImage(viewingImage)}
            >
              <Feather name="refresh-cw" size={20} color="#FFF" />
              <Text style={styles.imageViewerActionText}>Replace</Text>
            </Pressable>
            <Pressable
              style={[styles.imageViewerActionBtn, { backgroundColor: colors.danger }]}
              onPress={() => viewingImage && handleDeleteImage(viewingImage.id)}
            >
              <Feather name="trash-2" size={20} color="#FFF" />
              <Text style={styles.imageViewerActionText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  addButton: { padding: 8 },
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
    gap: 8,
  },
  tabText: { fontSize: 14, fontWeight: '500' },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyStateTitle: { fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyStateText: { fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 },
  emptyStateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, marginTop: 24 },
  emptyStateBtnText: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  certCard: { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
  certCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  certCardAgency: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agencyName: { fontSize: 14, fontWeight: '600' },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  levelBadgeText: { fontSize: 12, fontWeight: '600' },
  certCourseName: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  certCardDetails: { gap: 6 },
  certDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  certDetailText: { fontSize: 13 },
  cardImageIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.2)' },
  cardImageText: { fontSize: 12, fontWeight: '500' },
  wishlistCard: { flexDirection: 'row', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
  wishlistCardContent: { flex: 1 },
  removeWishlistBtn: { padding: 8, borderRadius: 20, alignSelf: 'flex-start' },
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
  pickerButton: { borderWidth: 1, borderRadius: 8, padding: 16, marginBottom: 16 },
  pickerLabel: { fontSize: 12, marginBottom: 4 },
  pickerValue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerValueText: { fontSize: 16 },
  formGroup: { marginBottom: 16 },
  selectedCourseCard: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  formRow: { flexDirection: 'row', gap: 12 },
  formLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  formInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  formTextarea: { height: 80, textAlignVertical: 'top' },
  agencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1 },
  agencyRowName: { fontSize: 16, fontWeight: '600' },
  agencyRowFullName: { fontSize: 13, marginTop: 2 },
  courseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  courseRowName: { fontSize: 16, fontWeight: '500' },
  courseRowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  levelBadgeSmall: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  levelBadgeTextSmall: { fontSize: 11, fontWeight: '600' },
  courseCategory: { fontSize: 12 },
  detailSection: { marginBottom: 20 },
  detailAgency: { fontSize: 14, fontWeight: '600' },
  detailCourse: { fontSize: 24, fontWeight: '700', marginTop: 4 },
  detailCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  detailLabel: { fontSize: 14 },
  detailValue: { fontSize: 14, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 24, marginBottom: 12 },
  cardScanButtons: { flexDirection: 'row', gap: 12 },
  scanBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24, borderRadius: 12, borderWidth: 1, gap: 8, overflow: 'hidden' },
  scanBtnPreview: { width: '100%', height: 80, borderRadius: 8 },
  scanBtnText: { fontSize: 14, fontWeight: '500' },
  scannedImages: { flexDirection: 'row', gap: 12, marginTop: 16 },
  scannedImageContainer: { flex: 1 },
  scannedImageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  scannedImageLabel: { fontSize: 12 },
  scannedImageActions: { flexDirection: 'row', gap: 8 },
  imageActionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  scannedImage: { width: '100%', height: 120, borderRadius: 8 },
  tapToViewOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  tapToViewText: { color: '#FFF', fontSize: 12, fontWeight: '500' },
  scannedImagePlaceholder: { height: 100, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  scannedImageText: { fontSize: 12 },
  notesText: { fontSize: 14, lineHeight: 20 },
  imageViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'space-between' },
  imageViewerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16 },
  imageViewerTitle: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  imageViewerCloseBtn: { padding: 8 },
  imageViewerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullScreenImage: { width: screenWidth - 32, height: screenHeight * 0.6 },
  imageViewerActions: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingBottom: 50, justifyContent: 'center' },
  imageViewerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  imageViewerActionText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
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
});
