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
  FlatList,
  Platform
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { getApiUrl } from '@/utils/apiConfig';

interface DevLogEntry {
  id: number;
  task: string;
  pageName: string | null;
  pageType: 'card' | 'detail' | 'edit';
  status: 'todo' | 'in_progress' | 'completed';
  device: 'android' | 'ios' | 'web' | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS = {
  todo: { bg: '#4A5568', text: '#FFFFFF', label: 'To Do' },
  in_progress: { bg: '#D69E2E', text: '#000000', label: 'In Progress' },
  completed: { bg: '#38A169', text: '#FFFFFF', label: 'Completed' },
};

const PAGE_TYPE_COLORS = {
  card: { bg: '#3182CE', text: '#FFFFFF' },
  detail: { bg: '#805AD5', text: '#FFFFFF' },
  edit: { bg: '#DD6B20', text: '#FFFFFF' },
};

const DEVICE_COLORS = {
  android: { bg: '#3DDC84', text: '#000000', label: 'Android' },
  ios: { bg: '#007AFF', text: '#FFFFFF', label: 'iOS' },
  web: { bg: '#FF6B35', text: '#FFFFFF', label: 'Web' },
};

export default function DevLogScreen() {
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
    pageType: 'card' as 'card' | 'detail' | 'edit',
    status: 'todo' as 'todo' | 'in_progress' | 'completed',
    device: null as 'android' | 'ios' | 'web' | null,
  });

  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/' as any);
      return;
    }
    fetchEntries();
    fetchPageNames();
  }, [isAdmin]);

  const fetchEntries = useCallback(async () => {
    try {
      setIsLoading(true);
      let url = `${getApiUrl()}/api/admin/dev-log`;
      if (filterStatus) {
        url += `?status=${filterStatus}`;
      }
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setEntries(data);
      } else {
        setError('Failed to load dev log');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [token, filterStatus]);

  const fetchPageNames = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/dev-log/page-names`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setPageNames(data);
      }
    } catch (err) {
      console.error('Failed to fetch page names:', err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchEntries();
    }
  }, [filterStatus, token, fetchEntries]);

  const openAddModal = () => {
    setEditingEntry(null);
    setFormData({ task: '', pageName: '', pageType: 'card', status: 'todo', device: null });
    setModalVisible(true);
  };

  const openEditModal = (entry: DevLogEntry) => {
    setEditingEntry(entry);
    setFormData({
      task: entry.task,
      pageName: entry.pageName || '',
      pageType: entry.pageType,
      status: entry.status,
      device: entry.device,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.task.trim()) {
      Alert.alert('Error', 'Task is required');
      return;
    }

    try {
      const url = editingEntry 
        ? `${getApiUrl()}/api/admin/dev-log/${editingEntry.id}`
        : `${getApiUrl()}/api/admin/dev-log`;
      
      const response = await fetch(url, {
        method: editingEntry ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setModalVisible(false);
        fetchEntries();
        fetchPageNames();
      } else {
        Alert.alert('Error', 'Failed to save entry');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
    }
  };

  const handleDelete = (entry: DevLogEntry) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${getApiUrl()}/api/admin/dev-log/${entry.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
              });

              if (response.ok) {
                fetchEntries();
              } else {
                Alert.alert('Error', 'Failed to delete entry');
              }
            } catch (err) {
              Alert.alert('Error', 'Network error');
            }
          },
        },
      ]
    );
  };

  const filteredSuggestions = pageNames.filter(name => 
    name.toLowerCase().includes(formData.pageName.toLowerCase()) && 
    name.toLowerCase() !== formData.pageName.toLowerCase()
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderEntry = (entry: DevLogEntry) => {
    const statusConfig = STATUS_COLORS[entry.status];
    const pageTypeConfig = PAGE_TYPE_COLORS[entry.pageType];

    return (
      <Pressable
        key={entry.id}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => openEditModal(entry)}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {formatDate(entry.createdAt)}
          </Text>
          <Pressable onPress={() => handleDelete(entry)} hitSlop={8}>
            <Feather name="trash-2" size={18} color={colors.error} />
          </Pressable>
        </View>

        <Text style={[styles.taskText, { color: colors.text }]} numberOfLines={3}>
          {entry.task}
        </Text>

        <View style={styles.badgeContainer}>
          {entry.pageName && (
            <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>
                {entry.pageName}
              </Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: pageTypeConfig.bg }]}>
            <Text style={[styles.badgeText, { color: pageTypeConfig.text }]}>
              {entry.pageType.charAt(0).toUpperCase() + entry.pageType.slice(1)}
            </Text>
          </View>
          {entry.device && DEVICE_COLORS[entry.device] && (
            <View style={[styles.badge, { backgroundColor: DEVICE_COLORS[entry.device].bg }]}>
              <Text style={[styles.badgeText, { color: DEVICE_COLORS[entry.device].text }]}>
                {DEVICE_COLORS[entry.device].label}
              </Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.badgeText, { color: statusConfig.text }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Dev Log</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchInputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search tasks..."
            placeholderTextColor={colors.textSecondary}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <Pressable
            style={[
              styles.filterChip,
              { backgroundColor: filterStatus === null ? colors.primary : colors.surface, borderColor: colors.border }
            ]}
            onPress={() => setFilterStatus(null)}
          >
            <Text style={[styles.filterChipText, { color: filterStatus === null ? '#FFFFFF' : colors.text }]}>
              All
            </Text>
          </Pressable>
          {Object.entries(STATUS_COLORS).map(([key, config]) => (
            <Pressable
              key={key}
              style={[
                styles.filterChip,
                { backgroundColor: filterStatus === key ? config.bg : colors.surface, borderColor: colors.border }
              ]}
              onPress={() => setFilterStatus(key)}
            >
              <Text style={[styles.filterChipText, { color: filterStatus === key ? config.text : colors.text }]}>
                {config.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          <Pressable style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={fetchEntries}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.centerContainer}>
          <Feather name="clipboard" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No dev log entries yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Tap the + button to add one
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {entries
            .filter(entry => {
              if (!searchQuery.trim()) return true;
              const query = searchQuery.toLowerCase();
              return (
                entry.task.toLowerCase().includes(query) ||
                (entry.pageName && entry.pageName.toLowerCase().includes(query))
              );
            })
            .map(renderEntry)}
        </ScrollView>
      )}

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={openAddModal}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingEntry ? 'Edit Entry' : 'Add Entry'}
              </Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Task *</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              value={formData.task}
              onChangeText={(text) => setFormData({ ...formData, task: text })}
              placeholder="Describe the task..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
            />

            <Text style={[styles.label, { color: colors.text }]}>Page Name</Text>
            <View style={styles.autocompleteContainer}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                value={formData.pageName}
                onChangeText={(text) => {
                  setFormData({ ...formData, pageName: text });
                  setShowPageNameSuggestions(true);
                }}
                onFocus={() => setShowPageNameSuggestions(true)}
                onBlur={() => setTimeout(() => setShowPageNameSuggestions(false), 200)}
                placeholder="e.g., DiveSiteDetail, DiveLogCard"
                placeholderTextColor={colors.textSecondary}
              />
              {showPageNameSuggestions && filteredSuggestions.length > 0 && (
                <View style={[styles.suggestionsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {filteredSuggestions.slice(0, 5).map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      style={[styles.suggestionItem, { borderBottomColor: colors.border }]}
                      onPress={() => {
                        setFormData({ ...formData, pageName: suggestion });
                        setShowPageNameSuggestions(false);
                      }}
                    >
                      <Text style={[styles.suggestionText, { color: colors.text }]}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Page Type</Text>
            <View style={styles.optionsRow}>
              {(['card', 'detail', 'edit'] as const).map((type) => {
                const config = PAGE_TYPE_COLORS[type];
                const isSelected = formData.pageType === type;
                return (
                  <Pressable
                    key={type}
                    style={[
                      styles.optionButton,
                      { backgroundColor: isSelected ? config.bg : colors.background, borderColor: config.bg }
                    ]}
                    onPress={() => setFormData({ ...formData, pageType: type })}
                  >
                    <Text style={[styles.optionText, { color: isSelected ? config.text : colors.text }]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Status</Text>
            <View style={styles.optionsRow}>
              {(['todo', 'in_progress', 'completed'] as const).map((status) => {
                const config = STATUS_COLORS[status];
                const isSelected = formData.status === status;
                return (
                  <Pressable
                    key={status}
                    style={[
                      styles.optionButton,
                      { backgroundColor: isSelected ? config.bg : colors.background, borderColor: config.bg }
                    ]}
                    onPress={() => setFormData({ ...formData, status })}
                  >
                    <Text style={[styles.optionText, { color: isSelected ? config.text : colors.text }]}>
                      {config.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Device</Text>
            <View style={styles.optionsRow}>
              <Pressable
                style={[
                  styles.optionButton,
                  { backgroundColor: formData.device === null ? colors.primary : colors.background, borderColor: colors.border }
                ]}
                onPress={() => setFormData({ ...formData, device: null })}
              >
                <Text style={[styles.optionText, { color: formData.device === null ? '#FFFFFF' : colors.text }]}>
                  None
                </Text>
              </Pressable>
              {(['android', 'ios', 'web'] as const).map((device) => {
                const config = DEVICE_COLORS[device];
                const isSelected = formData.device === device;
                return (
                  <Pressable
                    key={device}
                    style={[
                      styles.optionButton,
                      { backgroundColor: isSelected ? config.bg : colors.background, borderColor: config.bg }
                    ]}
                    onPress={() => setFormData({ ...formData, device })}
                  >
                    <Text style={[styles.optionText, { color: isSelected ? config.text : colors.text }]}>
                      {config.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>
                {editingEntry ? 'Update' : 'Add Entry'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
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
  filterContainer: {
    paddingVertical: 12,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 6,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
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
    maxHeight: '90%',
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    flex: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
