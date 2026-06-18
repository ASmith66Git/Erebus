import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Pressable, 
  ActivityIndicator, 
  Alert, 
  Modal, 
  TextInput,
  Image,
  Platform,
  RefreshControl,
  KeyboardAvoidingView
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { authFetch } from '@/utils/authFetch';
import { getApiUrl } from '@/utils/apiConfig';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

interface DevLogNote {
  id: number;
  note: string;
  createdAt: string;
}

interface DevLogEntry {
  id: number;
  task: string;
  pageName: string | null;
  pageType: 'card' | 'detail' | 'edit' | 'other';
  status: 'todo' | 'in_progress' | 'completed';
  devices: ('android' | 'ios' | 'web')[];
  taskRef: string | null;
  screenshots: string[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS = {
  todo: { bg: '#4A5568', text: '#FFFFFF', label: 'To Do' },
  in_progress: { bg: '#D69E2E', text: '#000000', label: 'In Progress' },
  completed: { bg: '#38A169', text: '#FFFFFF', label: 'Completed' },
};

const PAGE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  card: { bg: '#3182CE', text: '#FFFFFF' },
  detail: { bg: '#805AD5', text: '#FFFFFF' },
  edit: { bg: '#DD6B20', text: '#FFFFFF' },
  other: { bg: '#718096', text: '#FFFFFF' },
};

const DEVICE_COLORS = {
  android: { bg: '#3DDC84', text: '#000000', label: 'Android' },
  ios: { bg: '#007AFF', text: '#FFFFFF', label: 'iOS' },
  web: { bg: '#FF6B35', text: '#FFFFFF', label: 'Web' },
};

export default function DevLogScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { token, isAdmin } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<DevLogEntry[]>([]);
  const [pageNames, setPageNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DevLogEntry | null>(null);
  const [showPageNameSuggestions, setShowPageNameSuggestions] = useState(false);

  const [formData, setFormData] = useState({
    task: '',
    pageName: '',
    pageType: 'card' as 'card' | 'detail' | 'edit' | 'other',
    status: 'todo' as 'todo' | 'in_progress' | 'completed',
    devices: [] as ('android' | 'ios' | 'web')[],
    screenshots: [] as string[],
    taskRef: null as string | null,
  });

  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [statusCounts, setStatusCounts] = useState<{ todo: number; in_progress: number; completed: number }>({ todo: 0, in_progress: 0, completed: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'in_progress'>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);

  const [notesMap, setNotesMap] = useState<Record<number, DevLogNote[]>>({});
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [newNoteTexts, setNewNoteTexts] = useState<Record<number, string>>({});
  const [isAddingNote, setIsAddingNote] = useState<Record<number, boolean>>({});
  const [isSendingToAgent, setIsSendingToAgent] = useState<Record<number, boolean>>({});
  const [viewingScreenshot, setViewingScreenshot] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/' as any);
      return;
    }
    fetchEntries();
    fetchPageNames();
    fetchStatusCounts();
  }, [isAdmin]);

  const fetchEntries = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await authFetch('/api/admin/dev-log', token);
      if (response.ok) {
        const data = await response.json();
        setEntries(data);
      } else if (response.status !== 401) {
        setError(t('devLog.failedToLoad'));
      }
    } catch (err) {
      setError(t('common.networkError'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const fetchPageNames = async () => {
    try {
      const response = await authFetch('/api/admin/dev-log/page-names', token);
      if (response.ok) {
        const data = await response.json();
        setPageNames(data);
      }
    } catch (err) {
      console.error('Failed to fetch page names:', err);
    }
  };

  const fetchStatusCounts = async () => {
    try {
      const response = await authFetch('/api/admin/dev-log', token);
      if (response.ok) {
        const allEntries: DevLogEntry[] = await response.json();
        const counts = { todo: 0, in_progress: 0, completed: 0 };
        allEntries.forEach(entry => {
          if (entry.status in counts) counts[entry.status]++;
        });
        setStatusCounts(counts);
      }
    } catch (err) {
      console.error('Failed to fetch status counts:', err);
    }
  };

  const fetchNotes = useCallback(async (entryId: number) => {
    try {
      const response = await authFetch(`/api/admin/dev-log/${entryId}/notes`, token);
      if (response.ok) {
        const data: DevLogNote[] = await response.json();
        setNotesMap(prev => ({ ...prev, [entryId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    }
  }, [token]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchEntries(), fetchStatusCounts()]);
    setRefreshing(false);
  }, [fetchEntries]);

  useEffect(() => {
    if (token) fetchEntries();
  }, [token, fetchEntries]);

  const openAddModal = () => {
    setEditingEntry(null);
    setFormData({ task: '', pageName: '', pageType: 'card', status: 'todo', devices: [], screenshots: [], taskRef: null });
    setModalVisible(true);
  };

  const openEditModal = (entry: DevLogEntry) => {
    setEditingEntry(entry);
    setFormData({
      task: entry.task,
      pageName: entry.pageName || '',
      pageType: entry.pageType,
      status: entry.status,
      devices: entry.devices || [],
      screenshots: entry.screenshots || [],
      taskRef: entry.taskRef || null,
    });
    setModalVisible(true);
  };

  const toggleDevice = (device: 'android' | 'ios' | 'web') => {
    setFormData(prev => ({
      ...prev,
      devices: prev.devices.includes(device)
        ? prev.devices.filter(d => d !== device)
        : [...prev.devices, device]
    }));
  };

  const handleSave = async () => {
    if (!formData.task.trim()) {
      Alert.alert(t('common.error'), t('devLog.taskRequired'));
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const url = editingEntry
        ? `/api/admin/dev-log/${editingEntry.id}`
        : `/api/admin/dev-log`;
      const response = await authFetch(url, token, {
        method: editingEntry ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        setModalVisible(false);
        fetchEntries();
        fetchPageNames();
        fetchStatusCounts();
      } else if (response.status !== 401) {
        Alert.alert(t('common.error'), t('devLog.failedToSave'));
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('common.networkError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (entry: DevLogEntry) => {
    Alert.alert(
      t('devLog.deleteEntry'),
      t('devLog.deleteEntryConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await authFetch(`/api/admin/dev-log/${entry.id}`, token, { method: 'DELETE' });
              if (response.ok) {
                fetchEntries();
                fetchStatusCounts();
              } else if (response.status !== 401) {
                Alert.alert(t('common.error'), t('devLog.failedToDelete'));
              }
            } catch (err) {
              Alert.alert(t('common.error'), t('common.networkError'));
            }
          },
        },
      ]
    );
  };

  const handleToggleNotes = async (entryId: number) => {
    const next = new Set(expandedNotes);
    if (next.has(entryId)) {
      next.delete(entryId);
    } else {
      next.add(entryId);
      if (!notesMap[entryId]) {
        await fetchNotes(entryId);
      }
    }
    setExpandedNotes(next);
  };

  const handleAddNote = async (entryId: number) => {
    const text = (newNoteTexts[entryId] || '').trim();
    if (!text) return;
    setIsAddingNote(prev => ({ ...prev, [entryId]: true }));
    try {
      const response = await authFetch(`/api/admin/dev-log/${entryId}/notes`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: text }),
      });
      if (response.ok) {
        setNewNoteTexts(prev => ({ ...prev, [entryId]: '' }));
        await fetchNotes(entryId);
        showToast(t('devLog.noteAdded'));
      } else if (response.status !== 401) {
        Alert.alert(t('common.error'), t('devLog.failedToAddNote'));
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('common.networkError'));
    } finally {
      setIsAddingNote(prev => ({ ...prev, [entryId]: false }));
    }
  };

  const handleSendToAgent = async (entry: DevLogEntry) => {
    setIsSendingToAgent(prev => ({ ...prev, [entry.id]: true }));
    try {
      const response = await authFetch(`/api/admin/dev-log/${entry.id}/send-to-agent`, token, {
        method: 'POST',
      });
      if (response.ok) {
        showToast(t('devLog.sentToReplit'));
      } else if (response.status !== 401) {
        Alert.alert(t('common.error'), t('devLog.failedToSend'));
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('common.networkError'));
    } finally {
      setIsSendingToAgent(prev => ({ ...prev, [entry.id]: false }));
    }
  };

  const pickScreenshot = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), 'Photo library permission is required to add screenshots.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) return;
    const asset = result.assets[0];
    setIsUploadingScreenshot(true);
    try {
      const filename = `devlog-screenshot-${Date.now()}.jpg`;
      const urlRes = await authFetch('/api/uploads/request-url', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: filename, size: asset.fileSize || 500000, contentType: 'image/jpeg' }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadURL, objectPath } = await urlRes.json();
      const mediaResponse = await fetch(asset.uri);
      const mediaBlob = await mediaResponse.blob();
      await fetch(uploadURL, { method: 'PUT', body: mediaBlob, headers: { 'Content-Type': 'image/jpeg' } });
      const publicUrlRes = await authFetch(`/api/objects/url?path=${encodeURIComponent(objectPath)}`, token);
      if (!publicUrlRes.ok) throw new Error('Failed to get public URL');
      const { url: publicUrl } = await publicUrlRes.json();
      setFormData(prev => ({ ...prev, screenshots: [...prev.screenshots, publicUrl] }));
    } catch (err) {
      Alert.alert(t('common.error'), t('devLog.failedToUploadScreenshot'));
    } finally {
      setIsUploadingScreenshot(false);
    }
  };

  const removeScreenshot = (url: string) => {
    setFormData(prev => ({ ...prev, screenshots: prev.screenshots.filter(s => s !== url) }));
  };

  const filteredSuggestions = pageNames.filter(name =>
    name.toLowerCase().includes(formData.pageName.toLowerCase()) &&
    name.toLowerCase() !== formData.pageName.toLowerCase()
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatNoteDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const copyEntryToClipboard = async (entry: DevLogEntry) => {
    const devices = entry.devices?.length > 0 ? entry.devices.join(', ') : t('common.notSpecified');
    const formattedText = `**Dev Task: ${entry.task}**\n\n- **Page**: ${entry.pageName || 'N/A'} (${entry.pageType})\n- **Target Devices**: ${devices}${entry.taskRef ? `\n- **Task Ref**: ${entry.taskRef}` : ''}\n\nPlease help me with this development task.`;
    try {
      if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(formattedText);
      } else {
        await Clipboard.setStringAsync(formattedText);
      }
      showToast(t('devLog.copiedToClipboard'));
    } catch (err) {
      Alert.alert(t('common.error'), t('devLog.failedToCopy'));
    }
  };

  const renderEntry = (entry: DevLogEntry) => {
    const statusConfig = STATUS_COLORS[entry.status];
    const pageTypeConfig = PAGE_TYPE_COLORS[entry.pageType] || PAGE_TYPE_COLORS.other;
    const notes = notesMap[entry.id] || [];
    const isExpanded = expandedNotes.has(entry.id);
    const sending = !!isSendingToAgent[entry.id];

    return (
      <View
        key={entry.id}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Pressable onPress={() => openEditModal(entry)}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              {entry.taskRef && (
                <View style={[styles.taskRefBadge, { backgroundColor: colors.text }]}>
                  <Text style={[styles.taskRefText, { color: colors.background }]}>{entry.taskRef}</Text>
                </View>
              )}
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                {formatDate(entry.createdAt)}
              </Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable
                onPress={() => handleSendToAgent(entry)}
                hitSlop={8}
                style={styles.actionButton}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : entry.taskRef ? (
                  <Feather name="refresh-cw" size={16} color={colors.textSecondary} />
                ) : (
                  <Feather name="zap" size={16} color={colors.primary} />
                )}
              </Pressable>
              <Pressable onPress={() => copyEntryToClipboard(entry)} hitSlop={8} style={styles.actionButton}>
                <Feather name="copy" size={16} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => handleDelete(entry)} hitSlop={8} style={styles.actionButton}>
                <Feather name="trash-2" size={16} color={colors.error} />
              </Pressable>
            </View>
          </View>

          <Text style={[styles.taskText, { color: colors.text }]} numberOfLines={3}>
            {entry.task}
          </Text>

          <View style={styles.badgeContainer}>
            {entry.pageName && (
              <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{entry.pageName}</Text>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: pageTypeConfig.bg }]}>
              <Text style={[styles.badgeText, { color: pageTypeConfig.text }]}>
                {t(`devLog.pageType${entry.pageType.charAt(0).toUpperCase() + entry.pageType.slice(1)}`)}
              </Text>
            </View>
            {entry.devices && entry.devices.map((device) => (
              DEVICE_COLORS[device] && (
                <View key={device} style={[styles.badge, { backgroundColor: DEVICE_COLORS[device].bg }]}>
                  <Text style={[styles.badgeText, { color: DEVICE_COLORS[device].text }]}>
                    {t(`devLog.${device}`)}
                  </Text>
                </View>
              )
            ))}
            <View style={[styles.badge, { backgroundColor: statusConfig.bg }]}>
              <Text style={[styles.badgeText, { color: statusConfig.text }]}>
                {t(`devLog.status${entry.status === 'todo' ? 'Todo' : entry.status === 'in_progress' ? 'InProgress' : 'Completed'}`)}
              </Text>
            </View>
          </View>
        </Pressable>

        {entry.screenshots && entry.screenshots.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.screenshotStrip} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
            {entry.screenshots.map((url, i) => (
              <Pressable key={i} onPress={() => setViewingScreenshot(url)}>
                <Image source={{ uri: url }} style={[styles.screenshotThumb, { borderColor: colors.border }]} />
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Pressable
          onPress={() => handleToggleNotes(entry.id)}
          style={[styles.notesToggle, { borderTopColor: colors.border }]}
        >
          <Feather name="message-square" size={14} color={colors.textSecondary} />
          <Text style={[styles.notesToggleText, { color: colors.textSecondary }]}>
            {isExpanded
              ? t('devLog.hideNotes')
              : notes.length > 0
                ? `${t('devLog.notesTitle')} (${notes.length})`
                : t('devLog.notesTitle')}
          </Text>
          <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
        </Pressable>

        {isExpanded && (
          <View style={[styles.notesSection, { borderTopColor: colors.border }]}>
            {notes.length === 0 ? (
              <Text style={[styles.noNotesText, { color: colors.textSecondary }]}>{t('devLog.noNotesYet')}</Text>
            ) : (
              notes.map(note => (
                <View key={note.id} style={[styles.noteItem, { borderLeftColor: colors.primary }]}>
                  <Text style={[styles.noteDateText, { color: colors.textSecondary }]}>{formatNoteDate(note.createdAt)}</Text>
                  <Text style={[styles.noteText, { color: colors.text }]}>{note.note}</Text>
                </View>
              ))
            )}
            <View style={[styles.addNoteRow, { borderTopColor: colors.border }]}>
              <TextInput
                style={[styles.addNoteInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={newNoteTexts[entry.id] || ''}
                onChangeText={text => setNewNoteTexts(prev => ({ ...prev, [entry.id]: text }))}
                placeholder={t('devLog.addNotePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                multiline
              />
              <Pressable
                onPress={() => handleAddNote(entry.id)}
                disabled={!!isAddingNote[entry.id] || !(newNoteTexts[entry.id] || '').trim()}
                style={[styles.addNoteBtn, { backgroundColor: colors.primary, opacity: !(newNoteTexts[entry.id] || '').trim() ? 0.5 : 1 }]}
              >
                {isAddingNote[entry.id] ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="send" size={16} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (!isAdmin) return null;

  return (
    <ThemedBackground>
      <PageHeader title={t('devLog.title')} />

      <View style={styles.searchContainer}>
        <View style={[styles.searchInputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('devLog.searchTasks')}
            placeholderTextColor={colors.textSecondary}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, { borderBottomColor: activeTab === 'active' ? colors.primary : 'transparent' }]}
          onPress={() => { setActiveTab('active'); setStatusFilter('all'); }}
        >
          <Text style={[styles.tabText, { color: activeTab === 'active' ? colors.primary : colors.textSecondary }]}>
            {t('devLog.activeTab')}
          </Text>
          <View style={[styles.tabBadge, { backgroundColor: activeTab === 'active' ? colors.primary : colors.surface }]}>
            <Text style={[styles.tabBadgeText, { color: activeTab === 'active' ? '#FFFFFF' : colors.text }]}>
              {statusCounts.todo + statusCounts.in_progress}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={[styles.tab, { borderBottomColor: activeTab === 'completed' ? colors.primary : 'transparent' }]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'completed' ? colors.primary : colors.textSecondary }]}>
            {t('devLog.completedTab')}
          </Text>
          <View style={[styles.tabBadge, { backgroundColor: activeTab === 'completed' ? colors.primary : colors.surface }]}>
            <Text style={[styles.tabBadgeText, { color: activeTab === 'completed' ? '#FFFFFF' : colors.text }]}>
              {statusCounts.completed}
            </Text>
          </View>
        </Pressable>
      </View>

      {activeTab === 'active' && (
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {(['all', 'todo', 'in_progress'] as const).map(f => {
              const isActive = statusFilter === f;
              const bg = f === 'all' ? colors.primary : STATUS_COLORS[f]?.bg;
              const count = f === 'all' ? statusCounts.todo + statusCounts.in_progress : statusCounts[f];
              return (
                <Pressable
                  key={f}
                  style={[styles.filterChip, { backgroundColor: isActive ? bg : colors.surface, borderColor: isActive ? bg : colors.border }]}
                  onPress={() => setStatusFilter(f)}
                >
                  <Text style={[styles.filterChipText, { color: isActive ? (f === 'in_progress' ? '#000000' : '#FFFFFF') : colors.text }]}>
                    {f === 'all' ? t('common.all') : t(`devLog.status${f === 'todo' ? 'Todo' : 'InProgress'}`)}
                  </Text>
                  <View style={[styles.filterBadge, { backgroundColor: isActive ? 'rgba(0,0,0,0.15)' : colors.border }]}>
                    <Text style={[styles.filterBadgeText, { color: isActive ? (f === 'in_progress' ? '#000000' : '#FFFFFF') : colors.text }]}>
                      {count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <Pressable style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={fetchEntries}>
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.centerContainer}>
          <Feather name="clipboard" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('devLog.noEntries')}</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>{t('devLog.tapToAdd')}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          {entries
            .filter(entry => {
              if (activeTab === 'completed') {
                if (entry.status !== 'completed') return false;
              } else {
                if (entry.status === 'completed') return false;
                if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
              }
              if (!searchQuery.trim()) return true;
              const query = searchQuery.toLowerCase();
              return (
                entry.task.toLowerCase().includes(query) ||
                (entry.pageName && entry.pageName.toLowerCase().includes(query)) ||
                (entry.taskRef && entry.taskRef.toLowerCase().includes(query))
              );
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map(renderEntry)}
        </ScrollView>
      )}

      <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={openAddModal}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingEntry ? t('devLog.editEntry') : t('devLog.addEntry')}
              </Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {formData.taskRef && (
                <View style={[styles.taskRefRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Feather name="link" size={14} color={colors.textSecondary} />
                  <Text style={[styles.taskRefRowText, { color: colors.textSecondary }]}>
                    {t('devLog.linkedTo')} <Text style={{ color: colors.text, fontWeight: '700' }}>{formData.taskRef}</Text>
                  </Text>
                </View>
              )}

              <Text style={[styles.label, { color: colors.text }]}>{t('devLog.task')} *</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={formData.task}
                onChangeText={text => setFormData({ ...formData, task: text })}
                placeholder={t('devLog.describeTask')}
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.label, { color: colors.text }]}>{t('devLog.pageName')}</Text>
              <View style={styles.autocompleteContainer}>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  value={formData.pageName}
                  onChangeText={text => { setFormData({ ...formData, pageName: text }); setShowPageNameSuggestions(true); }}
                  onFocus={() => setShowPageNameSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowPageNameSuggestions(false), 200)}
                  placeholder={t('devLog.pageNamePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                />
                {showPageNameSuggestions && filteredSuggestions.length > 0 && (
                  <View style={[styles.suggestionsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {filteredSuggestions.slice(0, 5).map(suggestion => (
                      <Pressable
                        key={suggestion}
                        style={[styles.suggestionItem, { borderBottomColor: colors.border }]}
                        onPress={() => { setFormData({ ...formData, pageName: suggestion }); setShowPageNameSuggestions(false); }}
                      >
                        <Text style={[styles.suggestionText, { color: colors.text }]}>{suggestion}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <Text style={[styles.label, { color: colors.text }]}>{t('devLog.pageType')}</Text>
              <View style={styles.optionsRow}>
                {(['card', 'detail', 'edit', 'other'] as const).map(type => {
                  const config = PAGE_TYPE_COLORS[type];
                  const isSelected = formData.pageType === type;
                  return (
                    <Pressable
                      key={type}
                      style={[styles.optionButton, { backgroundColor: isSelected ? config.bg : colors.background, borderColor: config.bg }]}
                      onPress={() => setFormData({ ...formData, pageType: type })}
                    >
                      <Text style={[styles.optionText, { color: isSelected ? config.text : colors.text }]}>
                        {t(`devLog.pageType${type.charAt(0).toUpperCase() + type.slice(1)}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.text }]}>{t('common.status')}</Text>
              <View style={styles.optionsRow}>
                {(['todo', 'in_progress', 'completed'] as const).map(status => {
                  const config = STATUS_COLORS[status];
                  const isSelected = formData.status === status;
                  return (
                    <Pressable
                      key={status}
                      style={[styles.optionButton, { backgroundColor: isSelected ? config.bg : colors.background, borderColor: config.bg }]}
                      onPress={() => setFormData({ ...formData, status })}
                    >
                      <Text style={[styles.optionText, { color: isSelected ? config.text : colors.text }]}>
                        {t(`devLog.status${status === 'todo' ? 'Todo' : status === 'in_progress' ? 'InProgress' : 'Completed'}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.text }]}>{t('devLog.deviceSelectMultiple')}</Text>
              <View style={styles.optionsRow}>
                {(['android', 'ios', 'web'] as const).map(device => {
                  const config = DEVICE_COLORS[device];
                  const isSelected = formData.devices.includes(device);
                  return (
                    <Pressable
                      key={device}
                      style={[styles.optionButton, { backgroundColor: isSelected ? config.bg : colors.background, borderColor: config.bg }]}
                      onPress={() => toggleDevice(device)}
                    >
                      <Text style={[styles.optionText, { color: isSelected ? config.text : colors.text }]}>
                        {t(`devLog.${device}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.text }]}>{t('devLog.screenshotsTitle')}</Text>
              {formData.screenshots.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 8 }}>
                  {formData.screenshots.map((url, i) => (
                    <View key={i} style={styles.screenshotEditThumbContainer}>
                      <Pressable onPress={() => setViewingScreenshot(url)}>
                        <Image source={{ uri: url }} style={[styles.screenshotEditThumb, { borderColor: colors.border }]} />
                      </Pressable>
                      <Pressable onPress={() => removeScreenshot(url)} style={[styles.screenshotRemoveBtn, { backgroundColor: colors.error }]}>
                        <Feather name="x" size={10} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}
              <Pressable
                onPress={pickScreenshot}
                disabled={isUploadingScreenshot}
                style={[styles.addScreenshotBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
              >
                {isUploadingScreenshot ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Feather name="camera" size={16} color={colors.primary} />
                    <Text style={[styles.addScreenshotText, { color: colors.primary }]}>{t('devLog.addScreenshotBtn')}</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={[styles.saveButton, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingEntry ? t('common.update') : t('devLog.addEntry')}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!viewingScreenshot} transparent animationType="fade" onRequestClose={() => setViewingScreenshot(null)}>
        <Pressable style={styles.screenshotViewer} onPress={() => setViewingScreenshot(null)}>
          <Pressable style={styles.screenshotViewerClose} onPress={() => setViewingScreenshot(null)}>
            <Feather name="x" size={22} color="#FFFFFF" />
          </Pressable>
          {viewingScreenshot && (
            <Image source={{ uri: viewingScreenshot }} style={styles.screenshotViewerImage} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>

      {toastVisible && (
        <View style={styles.toastContainer}>
          <View style={[styles.toast, { backgroundColor: colors.primary }]}>
            <Feather name="check" size={18} color="#FFFFFF" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      )}
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    gap: 8,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  tabBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
  },
  tabBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterContainer: {
    paddingVertical: 12,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 6,
    gap: 6,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  filterBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 20,
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  taskRefBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  taskRefText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    padding: 4,
    width: 28,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 12,
  },
  taskText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
    lineHeight: 22,
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  screenshotStrip: {
    marginTop: 4,
  },
  screenshotThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
  },
  notesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  notesToggleText: {
    fontSize: 12,
    flex: 1,
  },
  notesSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  noNotesText: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  noteItem: {
    borderLeftWidth: 2,
    paddingLeft: 10,
    marginBottom: 10,
  },
  noteDateText: {
    fontSize: 11,
    marginBottom: 2,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
  },
  addNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addNoteInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 38,
    maxHeight: 80,
    textAlignVertical: 'top',
  },
  addNoteBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '92%',
  },
  modalScrollContent: {
    flexGrow: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  taskRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  taskRefRowText: {
    fontSize: 13,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  autocompleteContainer: {
    position: 'relative',
    zIndex: 10,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    maxHeight: 150,
    zIndex: 100,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  suggestionText: {
    fontSize: 14,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    flex: 1,
    minWidth: 56,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  screenshotEditThumbContainer: {
    position: 'relative',
  },
  screenshotEditThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
  },
  screenshotRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addScreenshotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 8,
    borderStyle: 'dashed',
    paddingVertical: 12,
    marginTop: 4,
  },
  addScreenshotText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    marginTop: 24,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  screenshotViewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenshotViewerClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  screenshotViewerImage: {
    width: '95%',
    height: '80%',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
