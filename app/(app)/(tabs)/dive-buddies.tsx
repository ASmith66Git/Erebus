import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  TextInput,
  Image,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusEffect, useNavigation, DrawerActions } from '@react-navigation/native';
import { getApiUrl } from '@/utils/apiConfig';
import * as ImagePicker from 'expo-image-picker';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';
import { useTranslation } from 'react-i18next';

interface Buddy {
  id: number;
  name: string;
  photo_url: string | null;
  notes: string | null;
  linked_user_id: number | null;
  linked_username: string | null;
  linked_email: string | null;
  created_at: string;
}

interface SearchUser {
  id: number;
  username: string;
  email: string;
}

const resolvePhotoUrl = (url: string | null): string | null => {
  if (!url) return null;
  return url.startsWith('/') ? `${getApiUrl()}${url}` : url;
};

export default function DiveBuddiesScreen() {
  const { colors } = useTheme();
  const { token, isLoading: authLoading } = useAuth();
  const navigation = useNavigation();
  const { t } = useTranslation();

  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const [selectedBuddy, setSelectedBuddy] = useState<Buddy | null>(null);
  const [editingBuddy, setEditingBuddy] = useState<Buddy | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    photo_url: '',
    notes: '',
    linked_user_id: null as number | null,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchBuddies = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/dive-buddies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBuddies(data);
      }
    } catch (error) {
      console.error('Fetch buddies error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && token) {
        fetchBuddies();
      }
    }, [authLoading, token, fetchBuddies])
  );

  const resetForm = () => {
    setFormData({ name: '', photo_url: '', notes: '', linked_user_id: null });
    setEditingBuddy(null);
  };

  const handleEdit = (buddy: Buddy) => {
    setEditingBuddy(buddy);
    setFormData({
      name: buddy.name,
      photo_url: buddy.photo_url || '',
      notes: buddy.notes || '',
      linked_user_id: buddy.linked_user_id,
    });
    setShowDetailModal(false);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert(t('common.error'), t('diveBuddies.pleaseEnterName'));
      return;
    }
    setSaving(true);
    try {
      const url = editingBuddy
        ? `${getApiUrl()}/api/dive-buddies/${editingBuddy.id}`
        : `${getApiUrl()}/api/dive-buddies`;
      const method = editingBuddy ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          photo_url: formData.photo_url || null,
          notes: formData.notes || null,
          linked_user_id: formData.linked_user_id,
        }),
      });
      
      if (res.ok) {
        setShowAddModal(false);
        resetForm();
        fetchBuddies();
      } else {
        const err = await res.json();
        Alert.alert(t('common.error'), err.error || t('diveBuddies.failedToSaveBuddy'));
      }
    } catch (error) {
      console.error('Save buddy error:', error);
      Alert.alert(t('common.error'), t('diveBuddies.failedToSaveBuddy'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(t('diveBuddies.deleteBuddyConfirm'));
      if (confirmed) {
        await performDelete(id);
      }
    } else {
      Alert.alert(
        t('diveBuddies.deleteBuddy'),
        t('diveBuddies.deleteBuddyConfirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => performDelete(id),
          },
        ]
      );
    }
  };

  const performDelete = async (id: number) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/dive-buddies/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setShowDetailModal(false);
        setSelectedBuddy(null);
        fetchBuddies();
      } else {
        const err = await res.json();
        Alert.alert(t('common.error'), err.error || t('diveBuddies.failedToDeleteBuddy'));
      }
    } catch (error) {
      console.error('Delete buddy error:', error);
      Alert.alert(t('common.error'), t('diveBuddies.failedToDeleteBuddy'));
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.permissionRequired'), t('common.grantPhotoAccess'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.permissionRequired'), t('common.grantCameraAccess'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri: string) => {
    setUploading(true);
    try {
      const name = uri.split('/').pop() || 'photo.jpg';
      const urlRes = await fetch(`${getApiUrl()}/api/uploads/request-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, contentType: 'image/jpeg' }),
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

      setFormData({ ...formData, photo_url: objectPath });
    } catch (error) {
      console.error('Upload photo error:', error);
      Alert.alert(t('common.error'), t('diveBuddies.failedToUploadPhoto'));
    } finally {
      setUploading(false);
    }
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/users/search?query=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (error) {
      console.error('Search users error:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectUser = (user: SearchUser) => {
    setFormData({
      ...formData,
      name: user.username,
      linked_user_id: user.id,
    });
    setShowInlineSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchUsers(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const renderBuddyCard = (buddy: Buddy) => (
    <Pressable
      key={buddy.id}
      style={[styles.buddyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => {
        setSelectedBuddy(buddy);
        setShowDetailModal(true);
      }}
    >
      <View style={styles.buddyCardContent}>
        {buddy.photo_url ? (
          <Image source={{ uri: resolvePhotoUrl(buddy.photo_url)! }} style={styles.buddyAvatar} />
        ) : (
          <View style={[styles.buddyAvatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
            <Feather name="user" size={24} color={colors.primary} />
          </View>
        )}
        <View style={styles.buddyInfo}>
          <Text style={[styles.buddyName, { color: colors.text }]}>{buddy.name}</Text>
          {buddy.linked_username && (
            <View style={styles.linkedBadge}>
              <Feather name="link" size={12} color={colors.primary} />
              <Text style={[styles.linkedText, { color: colors.primary }]}>{t('diveBuddies.connected')}</Text>
            </View>
          )}
          {buddy.notes && (
            <Text style={[styles.buddyNotes, { color: colors.textSecondary }]} numberOfLines={1}>
              {buddy.notes}
            </Text>
          )}
        </View>
        <Feather name="chevron-right" size={20} color={colors.textSecondary} />
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <ThemedBackground style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('diveBuddies.loadingBuddies')}</Text>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <PageHeader title={t('diveBuddies.title')} />

      <FlatList
        data={buddies}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => renderBuddyCard(item)}
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, buddies.length === 0 && styles.emptyContainer]}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBuddies(); }} />
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="users" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyStateTitle, { color: colors.text }]}>{t('diveBuddies.noBuddiesYet')}</Text>
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              {t('diveBuddies.emptyDescription')}
            </Text>
            <Pressable
              style={[styles.emptyStateBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowAddModal(true)}
            >
              <Feather name="plus" size={20} color="#FFF" />
              <Text style={styles.emptyStateBtnText}>{t('diveBuddies.addBuddy')}</Text>
            </Pressable>
          </View>
        }
      />

      {buddies.length > 0 && (
        <Pressable
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => setShowAddModal(true)}
        >
          <Feather name="plus" size={28} color="#FFF" />
        </Pressable>
      )}

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingBuddy ? t('diveBuddies.editBuddy') : t('diveBuddies.addBuddyTitle')}
              </Text>
              <Pressable onPress={() => { setShowAddModal(false); resetForm(); setShowInlineSearch(false); setSearchQuery(''); setSearchResults([]); }}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <View style={styles.photoSection}>
                {formData.photo_url ? (
                  <Pressable onPress={pickImage}>
                    <Image source={{ uri: resolvePhotoUrl(formData.photo_url)! }} style={styles.photoPreview} />
                    {uploading && (
                      <View style={styles.uploadingOverlay}>
                        <ActivityIndicator color="#FFF" />
                      </View>
                    )}
                  </Pressable>
                ) : (
                  <View style={[styles.photoPlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Feather name="user" size={40} color={colors.textSecondary} />
                    {uploading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
                  </View>
                )}
                <View style={styles.photoButtons}>
                  <Pressable
                    style={[styles.photoBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={pickImage}
                    disabled={uploading}
                  >
                    <Feather name="image" size={18} color={colors.text} />
                    <Text style={[styles.photoBtnText, { color: colors.text }]}>{t('diveBuddies.gallery')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.photoBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={takePhoto}
                    disabled={uploading}
                  >
                    <Feather name="camera" size={18} color={colors.text} />
                    <Text style={[styles.photoBtnText, { color: colors.text }]}>{t('diveBuddies.camera')}</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={[styles.findUserBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
                onPress={() => { setShowInlineSearch(v => !v); setSearchQuery(''); setSearchResults([]); }}
              >
                <Feather name="search" size={18} color={colors.primary} />
                <Text style={[styles.findUserBtnText, { color: colors.primary }]}>{t('diveBuddies.findDiverOnErebus')}</Text>
              </Pressable>

              {showInlineSearch && (
                <View style={[styles.inlineSearchContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={[styles.searchInputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Feather name="search" size={20} color={colors.textSecondary} />
                    <TextInput
                      style={[styles.searchInput, { color: colors.text }]}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder={t('diveBuddies.searchUserPlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                      autoFocus
                    />
                    {searching && <ActivityIndicator size="small" color={colors.primary} />}
                  </View>
                  <Text style={[styles.searchHint, { color: colors.textSecondary }]}>
                    {t('diveBuddies.searchHint')}
                  </Text>
                  <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled">
                    {searchResults.map((user) => (
                      <Pressable
                        key={user.id}
                        style={[styles.searchResultItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={() => handleSelectUser(user)}
                      >
                        <View style={[styles.searchResultAvatar, { backgroundColor: colors.primary + '20' }]}>
                          <Feather name="user" size={20} color={colors.primary} />
                        </View>
                        <View style={styles.searchResultInfo}>
                          <Text style={[styles.searchResultName, { color: colors.text }]}>{user.username}</Text>
                          <Text style={[styles.searchResultEmail, { color: colors.textSecondary }]}>{user.email}</Text>
                        </View>
                        <Feather name="plus-circle" size={22} color={colors.primary} />
                      </Pressable>
                    ))}
                    {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                      <Text style={[styles.noResults, { color: colors.textSecondary }]}>
                        {t('diveBuddies.noDiversFound', { query: searchQuery })}
                      </Text>
                    )}
                  </ScrollView>
                </View>
              )}

              {formData.linked_user_id && (
                <View style={[styles.linkedUserBox, { backgroundColor: colors.primary + '10', borderColor: colors.primary }]}>
                  <Feather name="link" size={16} color={colors.primary} />
                  <Text style={[styles.linkedUserText, { color: colors.primary }]}>{t('diveBuddies.linkedToErebusUser')}</Text>
                  <Pressable onPress={() => setFormData({ ...formData, linked_user_id: null })}>
                    <Feather name="x-circle" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('diveBuddies.buddyName')} *</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.name}
                  onChangeText={(v) => setFormData({ ...formData, name: v })}
                  placeholder={t('diveBuddies.buddyNamePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>{t('diveBuddies.notes')}</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                  value={formData.notes}
                  onChangeText={(v) => setFormData({ ...formData, notes: v })}
                  placeholder={t('diveBuddies.notesPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSecondary, { borderColor: colors.border }]}
                onPress={() => { setShowAddModal(false); resetForm(); setShowInlineSearch(false); setSearchQuery(''); setSearchResults([]); }}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#FFF' }]}>
                    {editingBuddy ? t('diveBuddies.saveChanges') : t('common.save')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('diveBuddies.buddyDetails')}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable onPress={() => selectedBuddy && handleEdit(selectedBuddy)}>
                  <Feather name="edit-2" size={22} color={colors.primary} />
                </Pressable>
                <Pressable onPress={() => { setShowDetailModal(false); setSelectedBuddy(null); }}>
                  <Feather name="x" size={24} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {selectedBuddy && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailHeader}>
                  {selectedBuddy.photo_url ? (
                    <Image source={{ uri: resolvePhotoUrl(selectedBuddy.photo_url)! }} style={styles.detailAvatar} />
                  ) : (
                    <View style={[styles.detailAvatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
                      <Feather name="user" size={48} color={colors.primary} />
                    </View>
                  )}
                  <Text style={[styles.detailName, { color: colors.text }]}>{selectedBuddy.name}</Text>
                  {selectedBuddy.linked_username && (
                    <View style={[styles.connectedBadge, { backgroundColor: colors.primary + '15' }]}>
                      <Feather name="link" size={14} color={colors.primary} />
                      <Text style={[styles.connectedText, { color: colors.primary }]}>
                        {t('diveBuddies.connectedAt', { username: selectedBuddy.linked_username })}
                      </Text>
                    </View>
                  )}
                </View>

                {selectedBuddy.notes && (
                  <View style={[styles.detailCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{t('diveBuddies.notes')}</Text>
                    <Text style={[styles.detailNotes, { color: colors.text }]}>{selectedBuddy.notes}</Text>
                  </View>
                )}

                <Pressable
                  style={[styles.deleteBtn, { borderColor: colors.error }]}
                  onPress={() => handleDelete(selectedBuddy.id)}
                >
                  <Feather name="trash-2" size={18} color={colors.error} />
                  <Text style={[styles.deleteBtnText, { color: colors.error }]}>{t('diveBuddies.deleteBuddy')}</Text>
                </Pressable>
              </ScrollView>
            )}
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
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyStateTitle: { fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyStateText: { fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 },
  emptyStateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, marginTop: 24 },
  emptyStateBtnText: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  buddyCard: { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
  buddyCardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buddyAvatar: { width: 56, height: 56, borderRadius: 28 },
  buddyAvatarPlaceholder: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  buddyInfo: { flex: 1 },
  buddyName: { fontSize: 17, fontWeight: '600' },
  linkedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  linkedText: { fontSize: 12, fontWeight: '500' },
  buddyNotes: { fontSize: 13, marginTop: 4 },
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
  photoSection: { alignItems: 'center', marginBottom: 24 },
  photoPreview: { width: 100, height: 100, borderRadius: 50 },
  photoPlaceholder: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed' },
  uploadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  photoButtons: { flexDirection: 'row', gap: 12, marginTop: 12 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  photoBtnText: { fontSize: 14 },
  findUserBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 20 },
  findUserBtnText: { fontSize: 15, fontWeight: '600' },
  linkedUserBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  linkedUserText: { flex: 1, fontSize: 14, fontWeight: '500' },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  formInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  formTextarea: { height: 100, textAlignVertical: 'top' },
  detailHeader: { alignItems: 'center', marginBottom: 24 },
  detailAvatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16 },
  detailAvatarPlaceholder: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  detailName: { fontSize: 24, fontWeight: '700' },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginTop: 8 },
  connectedText: { fontSize: 13, fontWeight: '500' },
  detailCard: { borderRadius: 12, padding: 16, borderWidth: 1, marginBottom: 16 },
  detailLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  detailNotes: { fontSize: 15, lineHeight: 22 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, marginBottom: 16, paddingVertical: 14, borderRadius: 8, borderWidth: 1 },
  deleteBtnText: { fontSize: 16, fontWeight: '500' },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 16 },
  searchHint: { fontSize: 12, marginBottom: 16, textAlign: 'center' },
  searchResults: { maxHeight: 300 },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  searchResultAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 16, fontWeight: '600' },
  searchResultEmail: { fontSize: 13, marginTop: 2 },
  noResults: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  inlineSearchContainer: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 16 },
});
