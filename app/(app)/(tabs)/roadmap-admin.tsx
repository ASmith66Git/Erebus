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
  RefreshControl,
  Switch,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { authFetch } from '@/utils/authFetch';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

interface RoadmapFeature {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  predicted_go_live: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned', color: '#6B7280' },
  { value: 'in_development', label: 'In Development', color: '#3B82F6' },
  { value: 'testing', label: 'Testing', color: '#F59E0B' },
  { value: 'ready', label: 'Ready', color: '#10B981' },
  { value: 'released', label: 'Released', color: '#8B5CF6' },
];

const getStatusConfig = (status: string) => {
  return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
};

export default function RoadmapAdminScreen() {
  const { colors } = useTheme();
  const { token, isAdmin } = useAuth();
  const router = useRouter();
  const [features, setFeatures] = useState<RoadmapFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingFeature, setEditingFeature] = useState<RoadmapFeature | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'planned',
    priority: 0,
    predicted_go_live: '',
    is_published: false,
  });

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/' as any);
      return;
    }
    fetchFeatures();
  }, [isAdmin]);

  const fetchFeatures = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await authFetch('/api/admin/roadmap', token);

      if (response.ok) {
        const data = await response.json();
        setFeatures(data.features || []);
      } else if (response.status !== 401) {
        setError('Failed to load roadmap features');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFeatures();
    setRefreshing(false);
  }, [fetchFeatures]);

  const openAddModal = () => {
    setEditingFeature(null);
    setFormData({
      title: '',
      description: '',
      status: 'planned',
      priority: 0,
      predicted_go_live: '',
      is_published: false,
    });
    setModalVisible(true);
  };

  const openEditModal = (feature: RoadmapFeature) => {
    setEditingFeature(feature);
    setFormData({
      title: feature.title,
      description: feature.description || '',
      status: feature.status,
      priority: feature.priority,
      predicted_go_live: feature.predicted_go_live || '',
      is_published: feature.is_published,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    setIsSaving(true);
    try {
      const url = editingFeature 
        ? `/api/admin/roadmap/${editingFeature.id}`
        : '/api/admin/roadmap';
      
      const response = await authFetch(url, token, {
        method: editingFeature ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          status: formData.status,
          priority: formData.priority,
          predicted_go_live: formData.predicted_go_live || null,
          is_published: formData.is_published,
        }),
      });

      if (response.ok) {
        setModalVisible(false);
        fetchFeatures();
      } else {
        Alert.alert('Error', 'Failed to save feature');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (feature: RoadmapFeature) => {
    const confirmDelete = async () => {
      try {
        const response = await authFetch(`/api/admin/roadmap/${feature.id}`, token, {
          method: 'DELETE',
        });
        if (response.ok) {
          fetchFeatures();
        } else {
          Alert.alert('Error', 'Failed to delete feature');
        }
      } catch (err) {
        Alert.alert('Error', 'Network error');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${feature.title}"?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert('Delete Feature', `Are you sure you want to delete "${feature.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const togglePublished = async (feature: RoadmapFeature) => {
    try {
      const response = await authFetch(`/api/admin/roadmap/${feature.id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...feature,
          is_published: !feature.is_published,
        }),
      });
      if (response.ok) {
        fetchFeatures();
      }
    } catch (err) {
      console.error('Toggle published error:', err);
    }
  };

  const filteredFeatures = statusFilter === 'all' 
    ? features 
    : features.filter(f => f.status === statusFilter);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'TBD';
    return new Date(dateStr).toLocaleDateString();
  };

  if (isLoading && features.length === 0) {
    return (
      <ThemedBackground style={styles.container}>
        <PageHeader title="Roadmap Management" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground style={styles.container}>
      <PageHeader 
        title="Roadmap Management" 
        rightAction={
          <Pressable onPress={openAddModal} style={{ padding: 8 }}>
            <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
          </Pressable>
        }
      />

      <View style={[styles.filterBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          <Pressable
            style={[styles.filterChip, statusFilter === 'all' && { backgroundColor: colors.primary }]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[styles.filterChipText, { color: statusFilter === 'all' ? '#FFF' : colors.text }]}>All</Text>
          </Pressable>
          {STATUS_OPTIONS.map(opt => (
            <Pressable
              key={opt.value}
              style={[styles.filterChip, statusFilter === opt.value && { backgroundColor: opt.color }]}
              onPress={() => setStatusFilter(opt.value)}
            >
              <Text style={[styles.filterChipText, { color: statusFilter === opt.value ? '#FFF' : colors.text }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            <Pressable style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={fetchFeatures}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : filteredFeatures.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="rocket-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Features</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Add features to the roadmap
            </Text>
          </View>
        ) : (
          filteredFeatures.map(feature => {
            const statusConfig = getStatusConfig(feature.status);
            return (
              <Pressable 
                key={feature.id} 
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => openEditModal(feature)}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20' }]}>
                    <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                  </View>
                  <View style={styles.cardActions}>
                    <Pressable onPress={() => togglePublished(feature)} style={styles.publishToggle}>
                      <Ionicons 
                        name={feature.is_published ? 'eye' : 'eye-off'} 
                        size={20} 
                        color={feature.is_published ? colors.primary : colors.textSecondary} 
                      />
                    </Pressable>
                    <Pressable onPress={() => handleDelete(feature)} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={18} color={colors.error || '#EF4444'} />
                    </Pressable>
                  </View>
                </View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{feature.title}</Text>
                {feature.description && (
                  <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                    {feature.description}
                  </Text>
                )}
                <View style={styles.cardFooter}>
                  <View style={styles.footerItem}>
                    <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                      {formatDate(feature.predicted_go_live)}
                    </Text>
                  </View>
                  <View style={styles.footerItem}>
                    <Ionicons name="arrow-up" size={14} color={colors.textSecondary} />
                    <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                      Priority: {feature.priority}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingFeature ? 'Edit Feature' : 'Add Feature'}
              </Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Title *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={formData.title}
                onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
                placeholder="Feature title"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={formData.description}
                onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                placeholder="Feature description"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Status</Text>
              <View style={styles.statusOptions}>
                {STATUS_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.statusOption,
                      { borderColor: colors.border },
                      formData.status === opt.value && { backgroundColor: opt.color, borderColor: opt.color }
                    ]}
                    onPress={() => setFormData(prev => ({ ...prev, status: opt.value }))}
                  >
                    <Text style={[
                      styles.statusOptionText,
                      { color: formData.status === opt.value ? '#FFF' : colors.text }
                    ]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>Predicted Go-Live Date</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={formData.predicted_go_live}
                onChangeText={(text) => setFormData(prev => ({ ...prev, predicted_go_live: text }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Priority (higher = more important)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={formData.priority.toString()}
                onChangeText={(text) => setFormData(prev => ({ ...prev, priority: parseInt(text) || 0 }))}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />

              <View style={styles.switchRow}>
                <Text style={[styles.inputLabel, { color: colors.text, marginBottom: 0 }]}>Visible to Users</Text>
                <Switch
                  value={formData.is_published}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, is_published: value }))}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable 
                style={[styles.cancelButton, { borderColor: colors.border }]} 
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.saveButton, { backgroundColor: colors.primary }]} 
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBar: {
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  errorText: {
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  publishToggle: {
    padding: 4,
  },
  deleteBtn: {
    padding: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    gap: 16,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusOptionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
