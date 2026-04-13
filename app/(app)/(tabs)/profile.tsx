import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Modal, ActivityIndicator, Platform, RefreshControl, TextInput, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import biometricService from '@/services/biometricService';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

type SexOption = 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;

const SEX_OPTIONS: { value: SexOption; labelKey: string }[] = [
  { value: null, labelKey: 'profile.notSpecified' },
  { value: 'male', labelKey: 'profile.male' },
  { value: 'female', labelKey: 'profile.female' },
  { value: 'other', labelKey: 'profile.other' },
  { value: 'prefer_not_to_say', labelKey: 'profile.preferNotToSay' },
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

interface UserDiveComputer {
  id: number;
  brand: string;
  model: string;
  nickname: string | null;
  created_at: string;
  capabilities: DiveComputerCapabilities | null;
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { user, isAdmin, token, biometricCapability, isBiometricEnabled, setBiometricEnabled, refreshUser } = useAuth();
  
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [models, setModels] = useState<DiveComputerModel[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [userComputers, setUserComputers] = useState<UserDiveComputer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showAddComputer, setShowAddComputer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchableProfile, setSearchableProfile] = useState(false);
  const [searchableLoading, setSearchableLoading] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [showSexPicker, setShowSexPicker] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const [editFormData, setEditFormData] = useState({
    firstName: '',
    lastName: '',
    age: '',
    sex: null as SexOption,
  });

  const fetchSupportUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/support/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSupportUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Failed to fetch support unread count:', error);
    }
  }, [token]);

  useEffect(() => {
    loadManufacturers();
    loadUserDiveComputers();
    loadSearchableStatus();
    fetchSupportUnreadCount();
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

  const loadUserDiveComputers = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/user/dive-computers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setUserComputers(data.computers || []);
    } catch (error) {
      console.error('Error loading user dive computers:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadManufacturers(), loadUserDiveComputers()]);
    setRefreshing(false);
  }, []);

  const showExportOptions = () => {
    if (Platform.OS === 'web') {
      const includeMedia = window.confirm(
        t('profile.includePhotosVideos') + '\n\n' +
        t('profile.clickOkForMedia') + '\n' +
        t('profile.clickCancelDataOnly')
      );
      exportDiveData(includeMedia);
    } else {
      Alert.alert(
        t('profile.exportOptions'),
        t('profile.includeMediaQuestion'),
        [
          { text: t('profile.dataOnly'), onPress: () => exportDiveData(false) },
          { text: t('profile.includeMedia'), onPress: () => exportDiveData(true) },
          { text: t('common.cancel'), style: 'cancel' }
        ]
      );
    }
  };

  const exportDiveData = async (includeMedia: boolean = false) => {
    if (!token) return;
    
    setExporting(true);
    try {
      if (includeMedia) {
        const response = await fetch(`${getApiUrl()}/api/export/dive-data-with-media`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
          throw new Error('Failed to export data with media');
        }
        
        const blob = await response.blob();
        const fileName = `erebus_dive_data_${new Date().toISOString().split('T')[0]}.zip`;
        
        if (Platform.OS === 'web') {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
          window.alert(t('profile.exportMediaSuccess'));
        } else {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
            reader.readAsDataURL(blob);
          });
          const filePath = `${FileSystem.documentDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(filePath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await Sharing.shareAsync(filePath, {
            mimeType: 'application/zip',
            dialogTitle: 'Export Dive Data with Media',
          });
          Alert.alert(t('common.success'), t('profile.exportMediaSuccess'));
        }
        setExporting(false);
        return;
      }
      
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
      
      // Extract dive profile samples from dive logs' embedded JSON
      const allSamples: any[] = [];
      const allGasMixes: any[] = [];
      
      data.diveLogs?.forEach((log: any) => {
        if (log.samples && Array.isArray(log.samples)) {
          log.samples.forEach((s: any) => {
            allSamples.push({
              'Dive #': log.dive_number,
              'Dive Log ID': log.id,
              'Time (s)': s.time ?? s.time_seconds ?? s.t ?? '',
              'Depth (m)': s.depth ?? s.depth_meters ?? s.d ?? '',
              'Temp (C)': s.temperature ?? s.temp ?? s.temperature_celsius ?? '',
              'NDL (min)': s.ndl ?? s.ndl_time ?? '',
              'Ceiling (m)': s.ceiling ?? s.deco_ceiling ?? '',
              'TTS (min)': s.tts ?? '',
              'CNS %': s.cns ?? '',
            });
          });
        }
        if (log.gas_mixes && Array.isArray(log.gas_mixes)) {
          log.gas_mixes.forEach((g: any, idx: number) => {
            allGasMixes.push({
              'Dive #': log.dive_number,
              'Dive Log ID': log.id,
              'Gas #': idx + 1,
              'O2 %': g.o2 ?? g.o2_percent ?? g.oxygen ?? '',
              'He %': g.he ?? g.he_percent ?? g.helium ?? '',
              'N2 %': g.n2 ?? g.n2_percent ?? g.nitrogen ?? '',
              'Name': g.name ?? '',
            });
          });
        }
      });
      
      if (allSamples.length > 0) {
        const samplesSheet = XLSX.utils.json_to_sheet(allSamples);
        XLSX.utils.book_append_sheet(workbook, samplesSheet, 'Dive Samples');
      }
      
      if (allGasMixes.length > 0) {
        const gasSheet = XLSX.utils.json_to_sheet(allGasMixes);
        XLSX.utils.book_append_sheet(workbook, gasSheet, 'Dive Gas Mixes');
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
        window.alert(t('profile.exportSuccess'));
      } else {
        Alert.alert(t('common.success'), t('profile.exportSuccess'));
      }
    } catch (error) {
      console.error('Export error:', error);
      if (Platform.OS === 'web') {
        window.alert(t('profile.failedToExport'));
      } else {
        Alert.alert(t('common.error'), t('profile.failedToExport'));
      }
    } finally {
      setExporting(false);
    }
  };

  const addDiveComputer = async (brand: string, model: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/user/dive-computers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ brand, model })
      });
      if (response.ok) {
        await loadUserDiveComputers();
        setShowAddComputer(false);
        setSelectedBrand(null);
        setSelectedModel(null);
      } else {
        const data = await response.json();
        if (Platform.OS === 'web') {
          window.alert(data.error || t('common.error'));
        } else {
          Alert.alert(t('common.error'), data.error || t('profile.failedToSaveProfile'));
        }
      }
    } catch (error) {
      console.error('Error adding dive computer:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeDiveComputer = async (computerId: number) => {
    const doRemove = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/user/dive-computers/${computerId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          setUserComputers(prev => prev.filter(c => c.id !== computerId));
        }
      } catch (error) {
        console.error('Error removing dive computer:', error);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(t('profile.confirmRemoveComputer'))) {
        await doRemove();
      }
    } else {
      Alert.alert(
        t('profile.removeComputer'),
        t('profile.confirmRemoveComputer'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.remove'), style: 'destructive', onPress: doRemove }
        ]
      );
    }
  };

  const handleBrandSelect = (brand: Manufacturer) => {
    setSelectedBrand(brand.id);
    setSelectedModel(null);
    setShowBrandPicker(false);
  };

  const handleModelSelect = (model: DiveComputerModel) => {
    setSelectedModel(model.id);
    setShowModelPicker(false);
  };

  const openAddComputer = () => {
    setSelectedBrand(null);
    setSelectedModel(null);
    setShowAddComputer(true);
  };

  const closeAddComputer = () => {
    setShowAddComputer(false);
    setSelectedBrand(null);
    setSelectedModel(null);
  };

  const pickProfilePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('profile.permissionRequired'), t('profile.grantPhotoAccess'));
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
      Alert.alert(t('common.error'), t('profile.failedToUploadPhoto'));
    } finally {
      setUploadingPhoto(false);
    }
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
          Alert.alert(t('profile.invalidAge'), t('profile.invalidAgeMessage'));
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
        Alert.alert(t('common.error'), data.error || t('profile.failedToUpdateProfile'));
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert(t('common.error'), t('profile.failedToSaveProfile'));
    } finally {
      setEditLoading(false);
    }
  };

  const getSexLabel = (sex: SexOption) => {
    const key = SEX_OPTIONS.find(opt => opt.value === sex)?.labelKey || 'profile.notSpecified';
    return t(key);
  };

  const menuItems = [
    { icon: 'diamond-outline', title: t('profile.subscription'), description: t('profile.manageYourPlan'), route: '/(app)/(tabs)/subscription' },
    { icon: 'rocket-outline', title: t('profile.roadmap'), description: t('profile.seeUpcomingFeatures'), route: '/(app)/(tabs)/roadmap' },
    { icon: 'notifications-outline', title: t('profile.notifications'), description: t('profile.manageYourAlerts'), route: '/(app)/(tabs)/notifications' },
    { icon: 'shield-checkmark-outline', title: t('profile.privacy'), description: t('profile.controlYourData'), route: '/privacy' },
    { icon: 'download-outline', title: t('profile.exportData'), description: t('profile.downloadDiveData'), route: 'export' },
    { icon: 'chatbubble-ellipses-outline', title: t('profile.faq'), description: t('profile.frequentlyAskedQuestions'), route: '/(app)/(tabs)/faq' },
    { icon: 'help-circle-outline', title: t('profile.helpSupport'), description: t('profile.getAssistance'), route: '/(app)/(tabs)/help-support' },
    { icon: 'document-text-outline', title: t('profile.termsConditions'), description: t('profile.legalInformation'), route: '/terms' },
  ];

  return (
    <ThemedBackground>
      <PageHeader title={t('profile.title')} />
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
          <Text style={[styles.userAge, { color: colors.textSecondary }]}>{t('profile.yearsOld', { age: user.age })}</Text>
        )}
        {isAdmin && (
          <View style={[styles.adminBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
            <Text style={styles.adminText}>{t('profile.administrator')}</Text>
          </View>
        )}
      </View>

      <View style={[styles.statsRow, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('profile.dives')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0h</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('profile.bottomTime')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('profile.certificationsLabel')}</Text>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.preferences')}</Text>
        
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
                  {t('profile.biometricLogin')}
                </Text>
                <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                  {isBiometricEnabled ? t('profile.quickLoginEnabled') : t('profile.useBiometricsToLogin')}
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
              {t('profile.biometricMobileOnly')}
            </Text>
          </View>
        )}
        
        <View style={styles.themeRow}>
          <View style={styles.themeLeft}>
            <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="search-outline" size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.menuTitle, { color: colors.text }]}>{t('profile.searchableProfile')}</Text>
              <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                {searchableProfile ? t('profile.otherDiversCanFindYou') : t('profile.profileIsPrivate')}
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
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.diveComputers')}</Text>
        
        {userComputers.length === 0 && (
          <Text style={[styles.menuDescription, { color: colors.textSecondary, marginBottom: 12 }]}>
            {t('profile.noComputersYet')}
          </Text>
        )}

        {userComputers.map((computer) => (
          <View key={computer.id} style={[styles.computerCard, { borderColor: colors.border }]}>
            <View style={styles.computerCardHeader}>
              <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="hardware-chip-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>
                  {computer.capabilities?.brand?.name || computer.brand}{' '}
                  {computer.capabilities?.model?.name || computer.model}
                </Text>
                {computer.nickname && (
                  <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                    {computer.nickname}
                  </Text>
                )}
              </View>
              <Pressable onPress={() => removeDiveComputer(computer.id)} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={22} color={colors.error} />
              </Pressable>
            </View>
            {computer.capabilities && (
              <View style={[styles.capabilityBadge, { backgroundColor: computer.capabilities.model.has_ble ? '#10B98120' : '#F5920020' }]}>
                <Ionicons 
                  name={computer.capabilities.model.has_ble ? 'bluetooth' : 'document-outline'} 
                  size={14} 
                  color={computer.capabilities.model.has_ble ? '#10B981' : '#F59200'} 
                />
                <Text style={[styles.capabilityText, { color: computer.capabilities.model.has_ble ? '#10B981' : '#F59200' }]}>
                  {computer.capabilities.model.has_ble 
                    ? t('profile.bluetoothSyncSupported') 
                    : t('profile.fileImportOnly')}
                </Text>
              </View>
            )}
          </View>
        ))}

        <Pressable style={[styles.addComputerButton, { borderColor: colors.primary }]} onPress={openAddComputer}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.addComputerText, { color: colors.primary }]}>{t('profile.addComputer')}</Text>
        </Pressable>
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.settings')}</Text>
        
        {menuItems.map((item, index) => (
          <Pressable 
            key={index} 
            style={styles.menuRow}
            disabled={item.route === 'export' && exporting}
            onPress={() => {
              if (item.route === 'export') {
                showExportOptions();
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
              <View style={styles.menuTitleRow}>
                <Text style={[styles.menuTitle, { color: colors.text }]}>
                  {item.route === 'export' && exporting ? t('profile.exporting') : item.title}
                </Text>
                {item.route === '/(app)/(tabs)/help-support' && supportUnreadCount > 0 && (
                  <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.unreadBadgeText}>{supportUnreadCount > 99 ? '99+' : supportUnreadCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>{item.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>

      <Text style={[styles.version, { color: colors.textSecondary }]}>Erebus v{Constants.expoConfig?.version || '1.0.0'}</Text>

      <Modal
        visible={showAddComputer}
        animationType="slide"
        transparent={true}
        onRequestClose={closeAddComputer}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.addComputer')}</Text>
              <Pressable onPress={closeAddComputer}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <Pressable style={[styles.menuRow]} onPress={() => setShowBrandPicker(true)}>
                <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
                  <Ionicons name="hardware-chip-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuTitle, { color: colors.text }]}>{t('profile.brand')}</Text>
                  <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                    {manufacturers.find(m => m.id === selectedBrand)?.name || t('profile.selectManufacturer')}
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
                  <Text style={[styles.menuTitle, { color: colors.text }]}>{t('profile.model')}</Text>
                  <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                    {models.find(m => m.id === selectedModel)?.name || t('profile.selectModel')}
                  </Text>
                </View>
                {loading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                )}
              </Pressable>
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable
                style={[
                  styles.saveButton,
                  { backgroundColor: selectedBrand && selectedModel ? colors.primary : colors.primary + '40' },
                ]}
                onPress={() => {
                  if (selectedBrand && selectedModel) {
                    addDiveComputer(selectedBrand, selectedModel);
                  }
                }}
                disabled={!selectedBrand || !selectedModel}
              >
                <Text style={[styles.saveButtonText, { opacity: selectedBrand && selectedModel ? 1 : 0.5 }]}>
                  {t('profile.addComputer')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showBrandPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBrandPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.selectBrand')}</Text>
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
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.selectModel')}</Text>
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
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.editProfile')}</Text>
              <Pressable onPress={() => setShowEditProfile(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('profile.firstName')}</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={editFormData.firstName}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, firstName: text }))}
                  placeholder={t('profile.enterFirstName')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('profile.lastName')}</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={editFormData.lastName}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, lastName: text }))}
                  placeholder={t('profile.enterLastName')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('profile.age')}</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  value={editFormData.age}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, age: text.replace(/[^0-9]/g, '') }))}
                  placeholder={t('profile.enterAge')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('profile.sex')}</Text>
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
                  <Text style={styles.saveButtonText}>{t('profile.saveChanges')}</Text>
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
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.selectSex')}</Text>
              <Pressable onPress={() => setShowSexPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {SEX_OPTIONS.map((option) => (
                <Pressable
                  key={option.labelKey}
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
                    {t(option.labelKey)}
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
  menuTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  menuDescription: {
    fontSize: 13,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
  computerCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  computerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addComputerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addComputerText: {
    fontSize: 15,
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
    maxHeight: '80%',
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
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
