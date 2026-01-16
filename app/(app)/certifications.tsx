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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import * as ImagePicker from 'expo-image-picker';

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
  created_at: string;
}

type TabType = 'completed' | 'wishlist';

export default function CertificationsScreen() {
  const { colors } = useTheme();
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<TabType>('completed');
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [agencies, setAgencies] = useState<TrainingAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCoursePickerModal, setShowCoursePickerModal] = useState(false);
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
    notes: '',
  });
  const [editingCertification, setEditingCertification] = useState<Certification | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCertification, setSelectedCertification] = useState<Certification | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    
    try {
      const [certsRes, wishRes, agenciesRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/certifications`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/certification-wishlist`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/training-agencies`, {
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
      notes: '',
    });
    setSelectedAgency(null);
    setSelectedCourse(null);
    setAgencyCourses([]);
    setEditingCertification(null);
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
          notes: formData.notes || null,
        }),
      });
      
      if (response.ok) {
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

  const handleAddToWishlist = async (course: TrainingCourse) => {
    if (!token) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/certification-wishlist`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ courseId: course.id }),
      });
      
      if (response.ok) {
        Alert.alert('Success', `${course.name} added to wishlist`);
        fetchData();
      }
    } catch (error) {
      console.error('Error adding to wishlist:', error);
    }
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

  const handleScanCard = async (side: 'front' | 'back') => {
    if (!selectedCertification || !token) return;
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 10],
      quality: 0.8,
    });
    
    if (!result.canceled && result.assets[0]) {
      setUploadingImage(true);
      try {
        const asset = result.assets[0];
        const filename = `cert_${selectedCertification.id}_${side}_${Date.now()}.jpg`;
        
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
        
        if (!urlResponse.ok) throw new Error('Failed to get upload URL');
        
        const { uploadURL, objectPath } = await urlResponse.json();
        
        const imageBlob = await fetch(asset.uri).then(r => r.blob());
        
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: imageBlob,
          headers: { 'Content-Type': 'image/jpeg' },
        });
        
        if (!uploadResponse.ok) throw new Error('Failed to upload image');
        
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
        
        if (addImageResponse.ok) {
          Alert.alert('Success', `${side === 'front' ? 'Front' : 'Back'} of card scanned`);
          fetchData();
          setShowDetailModal(false);
        }
      } catch (error) {
        console.error('Error scanning card:', error);
        Alert.alert('Error', 'Failed to scan card');
      } finally {
        setUploadingImage(false);
      }
    }
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
    <View
      key={item.id}
      style={[styles.wishlistCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.wishlistCardContent}>
        <Text style={[styles.agencyName, { color: colors.primary }]}>{item.agency_name}</Text>
        <Text style={[styles.certCourseName, { color: colors.text }]}>{item.course_name}</Text>
        
        <View style={[styles.levelBadge, { backgroundColor: getLevelColor(item.course_level) + '20', alignSelf: 'flex-start', marginTop: 8 }]}>
          <Text style={[styles.levelBadgeText, { color: getLevelColor(item.course_level) }]}>
            {item.course_level?.charAt(0).toUpperCase() + item.course_level?.slice(1)}
          </Text>
        </View>
        
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
        onPress={() => handleRemoveFromWishlist(item.id)}
      >
        <Feather name="x" size={18} color={colors.danger} />
      </Pressable>
    </View>
  );

  if (authLoading || loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading certifications...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Certifications</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setShowAddModal(true);
          }}
        >
          <Feather name="plus" size={24} color={colors.primary} />
        </Pressable>
      </View>

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
            </View>
          ) : (
            wishlist.map(renderWishlistCard)
          )
        )}
      </ScrollView>

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
              
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Date Certified</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.certificationDate}
                  onChangeText={(v) => setFormData({ ...formData, certificationDate: v })}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              
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
                <Text style={[styles.formLabel, { color: colors.text }]}>Location</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.location}
                  onChangeText={(v) => setFormData({ ...formData, location: v })}
                  placeholder="City, Country"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              
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
                } else {
                  setShowCoursePickerModal(false);
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
              {!selectedAgency || agencyCourses.length === 0 ? (
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
              <Pressable onPress={() => setShowDetailModal(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Certification Details</Text>
              <Pressable onPress={() => selectedCertification && handleDeleteCertification(selectedCertification.id)}>
                <Feather name="trash-2" size={22} color={colors.danger} />
              </Pressable>
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
                    {selectedCertification.images.map((img) => (
                      <View key={img.id} style={styles.scannedImageContainer}>
                        <Text style={[styles.scannedImageLabel, { color: colors.textSecondary }]}>
                          {img.image_side === 'front' ? 'Front' : 'Back'}
                        </Text>
                        <View style={[styles.scannedImagePlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <Feather name="credit-card" size={32} color={colors.textSecondary} />
                          <Text style={[styles.scannedImageText, { color: colors.textSecondary }]}>Image saved</Text>
                        </View>
                      </View>
                    ))}
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
  backButton: { padding: 8 },
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
  scanBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24, borderRadius: 12, borderWidth: 1, gap: 8 },
  scanBtnText: { fontSize: 14, fontWeight: '500' },
  scannedImages: { flexDirection: 'row', gap: 12, marginTop: 16 },
  scannedImageContainer: { flex: 1 },
  scannedImageLabel: { fontSize: 12, marginBottom: 4 },
  scannedImagePlaceholder: { height: 100, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  scannedImageText: { fontSize: 12 },
  notesText: { fontSize: 14, lineHeight: 20 },
});
