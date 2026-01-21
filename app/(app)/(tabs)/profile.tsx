import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Modal, ActivityIndicator, Platform, RefreshControl, TextInput, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import biometricService from '@/services/biometricService';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

type SexOption = 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;

const SEX_OPTIONS: { value: SexOption; label: string }[] = [
  { value: null, label: 'Not specified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

interface Manufacturer {
  id: string;
  name: string;
}

interface DiveComputerModel {
  id: string;
  name: string;
  has_ble: boolean;
  note?: string;
}

interface DiveComputerCapabilities {
  brand: { id: string; name: string };
  model: {
    id: string;
    name: string;
    has_ble: boolean;
    export_formats: string[];
    note?: string;
  };
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { user, isAdmin, token, biometricCapability, isBiometricEnabled, setBiometricEnabled, refreshUser } = useAuth();
  
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [models, setModels] = useState<DiveComputerModel[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<DiveComputerCapabilities | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchableProfile, setSearchableProfile] = useState(false);
  const [searchableLoading, setSearchableLoading] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [showSexPicker, setShowSexPicker] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editFormData, setEditFormData] = useState({
    firstName: '',
    lastName: '',
    age: '',
    sex: null as SexOption,
  });

  useEffect(() => {
    loadManufacturers();
    loadUserDiveComputer();
    loadSearchableStatus();
  }, []);

  useEffect(() => {
    if (selectedBrand) {
      loadModels(selectedBrand);
    } else {
      setModels([]);
    }
  }, [selectedBrand]);

  const loadManufacturers = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-computers`);
      const data = await response.json();
      setManufacturers(data.manufacturers || []);
    } catch (error) {
      console.error('Error loading manufacturers:', error);
    }
  };

  const loadSearchableStatus = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/profile/searchable`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setSearchableProfile(data.searchable_profile || false);
    } catch (error) {
      console.error('Error loading searchable status:', error);
    }
  };

  const toggleSearchable = async (value: boolean) => {
    setSearchableLoading(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/profile/searchable`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ searchable: value })
      });
      if (response.ok) {
        setSearchableProfile(value);
      }
    } catch (error) {
      console.error('Error toggling searchable:', error);
    } finally {
      setSearchableLoading(false);
    }
  };

  const loadModels = async (brandId: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-computers/${brandId}/models`);
      const data = await response.json();
      setModels(data.models || []);
    } catch (error) {
      console.error('Error loading models:', error);
    }
  };

  const loadUserDiveComputer = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/user/dive-computer`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setSelectedBrand(data.dive_computer_brand);
      setSelectedModel(data.dive_computer_model);
      setCapabilities(data.capabilities);
    } catch (error) {
      console.error('Error loading user dive computer:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadManufacturers(), loadUserDiveComputer()]);
    setRefreshing(false);
  }, []);

  const exportDiveData = async () => {
    if (!token) return;
    
    setExporting(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/export/dive-data`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch dive data');
      }
      
      const data = await response.json();
      
      const workbook = XLSX.utils.book_new();
      
      if (data.diveLogs?.length > 0) {
        const logsSheet = XLSX.utils.json_to_sheet(data.diveLogs.map((log: any) => ({
          'Dive #': log.dive_number,
          'Date': log.dive_datetime,
          'Site': log.site_name || '',
          'Max Depth (m)': log.max_depth_meters,
          'Avg Depth (m)': log.avg_depth_meters,
          'Duration (min)': log.duration_seconds ? Math.round(log.duration_seconds / 60) : '',
          'Min Temp (C)': log.min_temperature_celsius,
          'Max Temp (C)': log.max_temperature_celsius,
          'Dive Mode': log.dive_mode,
          'Rating': log.rating,
          'Surface Conditions': log.surface_conditions,
          'Weather': log.weather_conditions,
          'Notes': log.notes,
        })));
        XLSX.utils.book_append_sheet(workbook, logsSheet, 'Dive Logs');
      }
      
      if (data.diveSites?.length > 0) {
        const sitesSheet = XLSX.utils.json_to_sheet(data.diveSites.map((site: any) => ({
          'Name': site.name,
          'Location': site.location,
          'Country': site.country,
          'Type': site.type,
          'Max Depth (m)': site.max_depth,
          'Difficulty': site.difficulty,
          'Description': site.description,
          'Access': site.access,
          'Latitude': site.latitude,
          'Longitude': site.longitude,
        })));
        XLSX.utils.book_append_sheet(workbook, sitesSheet, 'Dive Sites');
      }
      
      if (data.diveTrips?.length > 0) {
        const tripsSheet = XLSX.utils.json_to_sheet(data.diveTrips.map((trip: any) => ({
          'Name': trip.name,
          'Type': trip.trip_type,
          'Start Date': trip.start_date,
          'End Date': trip.end_date,
          'Location': trip.location,
          'Country': trip.country,
          'Operator': trip.operator,
          'Notes': trip.notes,
        })));
        XLSX.utils.book_append_sheet(workbook, tripsSheet, 'Dive Trips');
      }
      
      if (data.gearProfiles?.length > 0) {
        const gearSheet = XLSX.utils.json_to_sheet(data.gearProfiles.map((gear: any) => ({
          'Name': gear.name,
          'BCD Type': gear.bcd_type,
          'Exposure Suit': gear.exposure_suit_type,
          'Weighting System': gear.weighting_system,
          'Notes': gear.notes,
        })));
        XLSX.utils.book_append_sheet(workbook, gearSheet, 'Gear Profiles');
      }
      
      if (data.certifications?.length > 0) {
        const certsSheet = XLSX.utils.json_to_sheet(data.certifications.map((cert: any) => ({
          'Course': cert.course_name,
          'Agency': cert.agency_name,
          'Certification Date': cert.certification_date,
          'Certification #': cert.certification_number,
          'Instructor': cert.instructor_name,
        })));
        XLSX.utils.book_append_sheet(workbook, certsSheet, 'Certifications');
      }
      
      if (data.diveBuddies?.length > 0) {
        const buddiesSheet = XLSX.utils.json_to_sheet(data.diveBuddies.map((buddy: any) => ({
          'Name': buddy.name,
          'Notes': buddy.notes,
        })));
        XLSX.utils.book_append_sheet(workbook, buddiesSheet, 'Dive Buddies');
      }
      
      if (data.equipment?.length > 0) {
        const equipSheet = XLSX.utils.json_to_sheet(data.equipment.map((eq: any) => ({
          'Type': eq.equipment_type,
          'Name': eq.name,
          'Brand': eq.brand,
          'Model': eq.model,
          'Serial #': eq.serial_number,
          'Quantity': eq.quantity,
          'Purchase Date': eq.purchase_date,
          'Last Service': eq.last_service_date,
          'Notes': eq.notes,
        })));
        XLSX.utils.book_append_sheet(workbook, equipSheet, 'Equipment');
      }
      
      if (data.diveLogSamples?.length > 0) {
        const samplesSheet = XLSX.utils.json_to_sheet(data.diveLogSamples.map((s: any) => ({
          'Dive Log ID': s.dive_log_id,
          'Time (s)': s.time_seconds,
          'Depth (m)': s.depth,
          'Temp (C)': s.temperature,
          'NDL (min)': s.ndl,
          'Ceiling (m)': s.ceiling,
        })));
        XLSX.utils.book_append_sheet(workbook, samplesSheet, 'Dive Samples');
      }
      
      const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const fileName = `erebus_dive_data_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      if (Platform.OS === 'web') {
        const blob = new Blob([Uint8Array.from(atob(wbout), c => c.charCodeAt(0))], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const filePath = `${FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(filePath, wbout, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Export Dive Data',
        });
      }
      
      if (Platform.OS === 'web') {
        window.alert('Dive data exported successfully!');
      } else {
        Alert.alert('Success', 'Dive data exported successfully!');
      }
    } catch (error) {
      console.error('Export error:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to export dive data. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to export dive data. Please try again.');
      }
    } finally {
      setExporting(false);
    }
  };

  const saveDiveComputer = async (brand: string | null, model: string | null) => {
    setLoading(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/user/dive-computer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ brand, model })
      });
      const data = await response.json();
      setCapabilities(data.capabilities);
    } catch (error) {
      console.error('Error saving dive computer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBrandSelect = (brand: Manufacturer) => {
    setSelectedBrand(brand.id);
    setSelectedModel(null);
    setCapabilities(null);
    setShowBrandPicker(false);
  };

  const handleModelSelect = (model: DiveComputerModel) => {
    setSelectedModel(model.id);
    setShowModelPicker(false);
    saveDiveComputer(selectedBrand, model.id);
  };

  const clearDiveComputer = () => {
    setSelectedBrand(null);
    setSelectedModel(null);
    setCapabilities(null);
    saveDiveComputer(null, null);
  };

  const pickProfilePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadProfilePhoto(result.assets[0].uri);
    }
  };

  const uploadProfilePhoto = async (uri: string) => {
    setUploadingPhoto(true);
    try {
      const urlRes = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: `profile-${user?.id}-${Date.now()}.jpg`,
          size: 0,
          contentType: 'image/jpeg',
        }),
      });

      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadURL, objectPath } = await urlRes.json();

      const imageRes = await fetch(uri);
      const blob = await imageRes.blob();

      await fetch(uploadURL, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'image/jpeg' },
      });

      const saveRes = await fetch(`${getApiUrl()}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profileImage: objectPath }),
      });

      if (saveRes.ok) {
        await refreshUser();
      } else {
        throw new Error('Failed to save profile image');
      }
    } catch (error) {
      console.error('Upload profile photo error:', error);
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const getDisplayName = () => {
    if (capabilities) {
      return `${capabilities.brand.name} ${capabilities.model.name}`;
    }
    return 'Not selected';
  };

  const openEditProfile = () => {
    setEditFormData({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      age: user?.age?.toString() || '',
      sex: user?.sex || null,
    });
    setShowEditProfile(true);
  };

  const saveProfile = async () => {
    setEditLoading(true);
    try {
      const payload: any = {};
      
      if (editFormData.firstName !== (user?.firstName || '')) {
        payload.firstName = editFormData.firstName.trim() || null;
      }
      if (editFormData.lastName !== (user?.lastName || '')) {
        payload.lastName = editFormData.lastName.trim() || null;
      }
      if (editFormData.age !== (user?.age?.toString() || '')) {
        const ageValue = editFormData.age.trim();
        payload.age = ageValue ? parseInt(ageValue, 10) : null;
        if (payload.age !== null && (isNaN(payload.age) || payload.age < 0 || payload.age > 150)) {
          Alert.alert('Invalid Age', 'Please enter a valid age between 0 and 150');
          setEditLoading(false);
          return;
        }
      }
      if (editFormData.sex !== (user?.sex || null)) {
        payload.sex = editFormData.sex;
      }

      if (Object.keys(payload).length === 0) {
        setShowEditProfile(false);
        setEditLoading(false);
        return;
      }

      const response = await fetch(`${getApiUrl()}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        await refreshUser();
        setShowEditProfile(false);
      } else {
        const data = await response.json();
        Alert.alert('Error', data.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setEditLoading(false);
    }
  };

  const getSexLabel = (sex: SexOption) => {
    return SEX_OPTIONS.find(opt => opt.value === sex)?.label || 'Not specified';
  };

  const menuItems = [
    { icon: 'diamond-outline', title: 'Subscription', description: 'Manage your plan', route: '/(app)/(tabs)/subscription' },
    { icon: 'rocket-outline', title: 'Roadmap', description: 'See upcoming features', route: '/(app)/(tabs)/roadmap' },
    { icon: 'notifications-outline', title: 'Notifications', description: 'Manage your alerts', route: null },
    { icon: 'shield-checkmark-outline', title: 'Privacy', description: 'Control your data', route: '/privacy' },
    { icon: 'download-outline', title: 'Export Data', description: 'Download your dive data', route: 'export' },
    { icon: 'help-circle-outline', title: 'Help & Support', description: 'Get assistance', route: '/(app)/(tabs)/help-support' },
    { icon: 'document-text-outline', title: 'Terms & Conditions', description: 'Legal information', route: '/terms' },
  ];

  return (
    <ThemedBackground>
      <PageHeader title="Profile" />
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        <View style={[styles.profileHeader, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Pressable style={styles.editProfileButton} onPress={openEditProfile}>
          <Ionicons name="pencil" size={18} color={colors.primary} />
        </Pressable>
        <Pressable onPress={pickProfilePhoto} disabled={uploadingPhoto} style={styles.avatarContainer}>
          {user?.profileImage ? (
            <Image source={{ uri: user.profileImage }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {user?.firstName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'D'}
              </Text>
            </View>
          )}
          {uploadingPhoto ? (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#FFF" size="small" />
            </View>
          ) : (
            <View style={[styles.cameraIconContainer, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera" size={14} color="#FFF" />
            </View>
          )}
        </Pressable>
        <Text style={[styles.userName, { color: colors.text }]}>
          {user?.firstName && user?.lastName
            ? `${user.firstName} ${user.lastName}`
            : user?.firstName || user?.email?.split('@')[0] || 'Diver'}
        </Text>
        <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
        {user?.age && (
          <Text style={[styles.userAge, { color: colors.textSecondary }]}>{user.age} years old</Text>
        )}
        {isAdmin && (
          <View style={[styles.adminBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
            <Text style={styles.adminText}>Administrator</Text>
          </View>
        )}
      </View>

      <View style={[styles.statsRow, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Dives</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0h</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Bottom Time</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Certifications</Text>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferences</Text>
        
        {biometricCapability?.isSupported && biometricCapability?.isEnrolled && Platform.OS !== 'web' && (
          <View style={styles.themeRow}>
            <View style={styles.themeLeft}>
              <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons 
                  name={biometricCapability?.biometricTypeName?.includes('Face') ? 'scan-outline' : 'finger-print-outline'} 
                  size={20} 
                  color={colors.primary} 
                />
              </View>
              <View>
                <Text style={[styles.menuTitle, { color: colors.text }]}>
                  {biometricCapability?.biometricTypeName || 'Biometric'} Login
                </Text>
                <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                  {isBiometricEnabled ? 'Quick login enabled' : 'Use biometrics to login'}
                </Text>
              </View>
            </View>
            <Switch
              value={isBiometricEnabled}
              onValueChange={setBiometricEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        )}
        
        {Platform.OS === 'web' && (
          <View style={styles.mobileOnlyNote}>
            <Ionicons name="finger-print-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.mobileOnlyText, { color: colors.textSecondary }]}>
              Biometric login (fingerprint/Face ID) is available in the mobile app
            </Text>
          </View>
        )}
        
        <View style={styles.themeRow}>
          <View style={styles.themeLeft}>
            <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="search-outline" size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.menuTitle, { color: colors.text }]}>Searchable Profile</Text>
              <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                {searchableProfile ? 'Other divers can find you' : 'Your profile is private'}
              </Text>
            </View>
          </View>
          {searchableLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={searchableProfile}
              onValueChange={toggleSearchable}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          )}
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Dive Computer</Text>
        
        <Pressable style={styles.menuRow} onPress={() => setShowBrandPicker(true)}>
          <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="hardware-chip-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.menuContent}>
            <Text style={[styles.menuTitle, { color: colors.text }]}>Brand</Text>
            <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
              {manufacturers.find(m => m.id === selectedBrand)?.name || 'Select manufacturer'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <Pressable 
          style={[styles.menuRow, { opacity: selectedBrand ? 1 : 0.5 }]} 
          onPress={() => selectedBrand && setShowModelPicker(true)}
          disabled={!selectedBrand}
        >
          <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="watch-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.menuContent}>
            <Text style={[styles.menuTitle, { color: colors.text }]}>Model</Text>
            <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
              {models.find(m => m.id === selectedModel)?.name || 'Select model'}
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          )}
        </Pressable>

        {capabilities && (
          <View style={[styles.capabilityBadge, { backgroundColor: capabilities.model.has_ble ? '#10B98120' : '#F5920020' }]}>
            <Ionicons 
              name={capabilities.model.has_ble ? 'bluetooth' : 'document-outline'} 
              size={16} 
              color={capabilities.model.has_ble ? '#10B981' : '#F59200'} 
            />
            <Text style={[styles.capabilityText, { color: capabilities.model.has_ble ? '#10B981' : '#F59200' }]}>
              {capabilities.model.has_ble 
                ? 'Bluetooth sync supported' 
                : 'File import only'}
            </Text>
          </View>
        )}

        {capabilities?.model.note && (
          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            {capabilities.model.note}
          </Text>
        )}

        {selectedBrand && (
          <Pressable style={styles.clearButton} onPress={clearDiveComputer}>
            <Ionicons name="close-circle-outline" size={18} color={colors.error} />
            <Text style={[styles.clearButtonText, { color: colors.error }]}>Clear selection</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>
        
        {menuItems.map((item, index) => (
          <Pressable 
            key={index} 
            style={styles.menuRow}
            disabled={item.route === 'export' && exporting}
            onPress={() => {
              if (item.route === 'export') {
                exportDiveData();
              } else if (item.route) {
                router.push(item.route as any);
              }
            }}
          >
            <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
              {item.route === 'export' && exporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name={item.icon as any} size={20} color={colors.primary} />
              )}
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>
                {item.route === 'export' && exporting ? 'Exporting...' : item.title}
              </Text>
              <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>{item.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>

      <Text style={[styles.version, { color: colors.textSecondary }]}>Erebus v1.0.0</Text>

      <Modal
        visible={showBrandPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBrandPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Brand</Text>
              <Pressable onPress={() => setShowBrandPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {manufacturers.map((manufacturer) => (
                <Pressable
                  key={manufacturer.id}
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: colors.border },
                    selectedBrand === manufacturer.id && { backgroundColor: colors.primary + '20' }
                  ]}
                  onPress={() => handleBrandSelect(manufacturer)}
                >
                  <Text style={[styles.pickerItemText, { color: colors.text }]}>
                    {manufacturer.name}
                  </Text>
                  {selectedBrand === manufacturer.id && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showModelPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModelPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Model</Text>
              <Pressable onPress={() => setShowModelPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {models.map((model) => (
                <Pressable
                  key={model.id}
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: colors.border },
                    selectedModel === model.id && { backgroundColor: colors.primary + '20' }
                  ]}
                  onPress={() => handleModelSelect(model)}
                >
                  <View style={styles.pickerItemContent}>
                    <Text style={[styles.pickerItemText, { color: colors.text }]}>
                      {model.name}
                    </Text>
                    <View style={styles.pickerItemBadges}>
                      {model.has_ble && (
                        <View style={[styles.bleBadge, { backgroundColor: '#10B98120' }]}>
                          <Ionicons name="bluetooth" size={12} color="#10B981" />
                          <Text style={styles.bleBadgeText}>BLE</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {selectedModel === model.id && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditProfile}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditProfile(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Profile</Text>
              <Pressable onPress={() => setShowEditProfile(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>First Name</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={editFormData.firstName}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, firstName: text }))}
                  placeholder="Enter first name"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Last Name</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={editFormData.lastName}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, lastName: text }))}
                  placeholder="Enter last name"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Age</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={editFormData.age}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, age: text.replace(/[^0-9]/g, '') }))}
                  placeholder="Enter age"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Sex</Text>
                <Pressable
                  style={[styles.formInput, styles.formSelect, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setShowSexPicker(true)}
                >
                  <Text style={{ color: editFormData.sex ? colors.text : colors.textSecondary }}>
                    {getSexLabel(editFormData.sex)}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <Pressable
                style={[styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={saveProfile}
                disabled={editLoading}
              >
                {editLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSexPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSexPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Sex</Text>
              <Pressable onPress={() => setShowSexPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {SEX_OPTIONS.map((option) => (
                <Pressable
                  key={option.label}
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: colors.border },
                    editFormData.sex === option.value && { backgroundColor: colors.primary + '20' }
                  ]}
                  onPress={() => {
                    setEditFormData(prev => ({ ...prev, sex: option.value }));
                    setShowSexPicker(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, { color: colors.text }]}>
                    {option.label}
                  </Text>
                  {editFormData.sex === option.value && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  adminText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    marginVertical: 8,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mobileOnlyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  mobileOnlyText: {
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  menuDescription: {
    fontSize: 13,
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 24,
  },
  capabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  capabilityText: {
    fontSize: 13,
    fontWeight: '500',
  },
  noteText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalScroll: {
    paddingHorizontal: 16,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerItemContent: {
    flex: 1,
  },
  pickerItemText: {
    fontSize: 16,
  },
  pickerItemBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  bleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  bleBadgeText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
  },
  editProfileButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(210, 47, 0, 0.1)',
  },
  userAge: {
    fontSize: 13,
    marginTop: 4,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  formInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
  },
  formSelect: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
