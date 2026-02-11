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
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { authFetch } from '@/utils/authFetch';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

interface DiveMessage {
  id: number;
  messageType: 'tip' | 'tagline';
  text: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const MESSAGE_TYPE_CONFIG = {
  tip: { icon: 'bulb-outline', label: 'Dive Tip', color: '#38A169' },
  tagline: { icon: 'chatbubble-outline', label: 'Tagline', color: '#3182CE' },
};

export default function DiveMessagesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { token, isAdmin } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<DiveMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMessage, setEditingMessage] = useState<DiveMessage | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'tip' | 'tagline'>('all');
  
  const [formData, setFormData] = useState({
    messageType: 'tip' as 'tip' | 'tagline',
    text: '',
  });

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/' as any);
      return;
    }
    fetchMessages();
  }, [isAdmin]);

  const fetchMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await authFetch('/api/admin/dive-messages', token);

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      } else if (response.status !== 401) {
        setError(t('diveMessages.failedToLoad'));
      }
    } catch (err) {
      setError(t('common.networkError'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  }, [fetchMessages]);

  const openAddModal = () => {
    setEditingMessage(null);
    setFormData({ messageType: 'tip', text: '' });
    setModalVisible(true);
  };

  const openEditModal = (message: DiveMessage) => {
    setEditingMessage(message);
    setFormData({
      messageType: message.messageType,
      text: message.text,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.text.trim()) {
      Alert.alert(t('common.error'), t('diveMessages.messageTextRequired'));
      return;
    }

    setIsSaving(true);

    try {
      if (editingMessage) {
        const response = await authFetch(`/api/admin/dive-messages/${editingMessage.id}`, token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: formData.text.trim() }),
        });

        if (response.ok) {
          const updated = await response.json();
          setMessages(messages.map(m => m.id === editingMessage.id ? updated : m));
          setModalVisible(false);
        } else if (response.status !== 401) {
          Alert.alert(t('common.error'), t('diveMessages.failedToUpdate'));
        }
      } else {
        const response = await authFetch('/api/admin/dive-messages', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageType: formData.messageType,
            text: formData.text.trim(),
          }),
        });

        if (response.ok) {
          const newMessage = await response.json();
          setMessages([newMessage, ...messages]);
          setModalVisible(false);
        } else if (response.status !== 401) {
          Alert.alert(t('common.error'), t('diveMessages.failedToCreate'));
        }
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('common.networkError'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (message: DiveMessage) => {
    try {
      const response = await authFetch(`/api/admin/dive-messages/${message.id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !message.isActive }),
      });

      if (response.ok) {
        const updated = await response.json();
        setMessages(messages.map(m => m.id === message.id ? updated : m));
      } else if (response.status !== 401) {
        Alert.alert(t('common.error'), t('diveMessages.failedToUpdate'));
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('common.networkError'));
    }
  };

  const deleteMessage = (message: DiveMessage) => {
    Alert.alert(
      t('diveMessages.deleteMessage'),
      t('diveMessages.deleteMessageConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await authFetch(`/api/admin/dive-messages/${message.id}`, token, {
                method: 'DELETE',
              });

              if (response.ok) {
                setMessages(messages.filter(m => m.id !== message.id));
              } else if (response.status !== 401) {
                Alert.alert(t('common.error'), t('diveMessages.failedToDelete'));
              }
            } catch (err) {
              Alert.alert(t('common.error'), t('common.networkError'));
            }
          },
        },
      ]
    );
  };

  const filteredMessages = messages.filter(m => {
    if (activeTab === 'all') return true;
    return m.messageType === activeTab;
  });

  const tipCount = messages.filter(m => m.messageType === 'tip').length;
  const taglineCount = messages.filter(m => m.messageType === 'tagline').length;
  const activeCount = messages.filter(m => m.isActive).length;

  if (!isAdmin) {
    return null;
  }

  return (
    <ThemedBackground>
      <PageHeader title={t('diveMessages.title')} />
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="chatbox-ellipses" size={24} color="#FFFFFF" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{t('diveMessages.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('diveMessages.manageTipsTaglines')}
          </Text>
        </View>

        <View style={[styles.statsCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: MESSAGE_TYPE_CONFIG.tip.color }]}>{tipCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('diveMessages.tips')}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: MESSAGE_TYPE_CONFIG.tagline.color }]}>{taglineCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('diveMessages.taglines')}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{activeCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('diveMessages.active')}</Text>
          </View>
        </View>

        <View style={styles.tabContainer}>
          {(['all', 'tip', 'tagline'] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.tab,
                { borderColor: colors.border },
                activeTab === tab && { backgroundColor: colors.primary, borderColor: colors.primary }
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[
                styles.tabText,
                { color: activeTab === tab ? '#FFFFFF' : colors.text }
              ]}>
                {tab === 'all' ? t('common.all') : tab === 'tip' ? t('diveMessages.tips') : t('diveMessages.taglines')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={openAddModal}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.addButtonText}>{t('diveMessages.addMessage')}</Text>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : error ? (
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        ) : filteredMessages.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Ionicons name="chatbox-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('diveMessages.noMessagesFound')}</Text>
          </View>
        ) : (
          <View style={styles.messagesList}>
            {filteredMessages.map((message) => {
              const config = MESSAGE_TYPE_CONFIG[message.messageType];
              return (
                <View
                  key={message.id}
                  style={[
                    styles.messageCard,
                    { backgroundColor: colors.cardBackground, borderColor: colors.border },
                    !message.isActive && styles.inactiveCard
                  ]}
                >
                  <View style={styles.messageHeader}>
                    <View style={[styles.typeBadge, { backgroundColor: config.color + '20' }]}>
                      <Ionicons name={config.icon as any} size={14} color={config.color} />
                      <Text style={[styles.typeBadgeText, { color: config.color }]}>{message.messageType === 'tip' ? t('diveMessages.diveTip') : t('diveMessages.tagline')}</Text>
                    </View>
                    <View style={styles.activeToggle}>
                      <Text style={[styles.activeLabel, { color: colors.textSecondary }]}>
                        {message.isActive ? t('diveMessages.active') : t('diveMessages.inactive')}
                      </Text>
                      <Switch
                        value={message.isActive}
                        onValueChange={() => toggleActive(message)}
                        trackColor={{ false: colors.border, true: colors.primary + '80' }}
                        thumbColor={message.isActive ? colors.primary : colors.textSecondary}
                      />
                    </View>
                  </View>

                  <Text style={[styles.messageText, { color: colors.text }]}>{message.text}</Text>

                  <View style={styles.messageActions}>
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: colors.surface }]}
                      onPress={() => openEditModal(message)}
                    >
                      <Ionicons name="pencil" size={16} color={colors.primary} />
                      <Text style={[styles.actionButtonText, { color: colors.primary }]}>{t('common.edit')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
                      onPress={() => deleteMessage(message)}
                    >
                      <Ionicons name="trash" size={16} color={colors.error} />
                      <Text style={[styles.actionButtonText, { color: colors.error }]}>{t('common.delete')}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingMessage ? t('diveMessages.editMessage') : t('diveMessages.addNewMessage')}
              </Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            {!editingMessage && (
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.text }]}>{t('diveMessages.messageType')}</Text>
                <View style={styles.typeSelector}>
                  {(['tip', 'tagline'] as const).map((type) => (
                    <Pressable
                      key={type}
                      style={[
                        styles.typeOption,
                        { borderColor: colors.border },
                        formData.messageType === type && { 
                          backgroundColor: MESSAGE_TYPE_CONFIG[type].color + '20',
                          borderColor: MESSAGE_TYPE_CONFIG[type].color 
                        }
                      ]}
                      onPress={() => setFormData(prev => ({ ...prev, messageType: type }))}
                    >
                      <Ionicons 
                        name={MESSAGE_TYPE_CONFIG[type].icon as any} 
                        size={20} 
                        color={formData.messageType === type ? MESSAGE_TYPE_CONFIG[type].color : colors.textSecondary} 
                      />
                      <Text style={[
                        styles.typeOptionText,
                        { color: formData.messageType === type ? MESSAGE_TYPE_CONFIG[type].color : colors.text }
                      ]}>
                        {type === 'tip' ? t('diveMessages.diveTip') : t('diveMessages.tagline')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('diveMessages.messageText')}</Text>
              <TextInput
                style={[
                  styles.textArea,
                  { 
                    backgroundColor: colors.background, 
                    borderColor: colors.border,
                    color: colors.text 
                  }
                ]}
                value={formData.text}
                onChangeText={(text) => setFormData(prev => ({ ...prev, text }))}
                placeholder={formData.messageType === 'tip' ? t('diveMessages.enterDiveTip') : t('diveMessages.enterTagline')}
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.cancelButton, { borderColor: colors.border }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingMessage ? t('common.update') : t('common.create')}
                  </Text>
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
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  statsCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: '100%',
    marginHorizontal: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 16,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loader: {
    marginTop: 40,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 24,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
  },
  messagesList: {
    gap: 12,
  },
  messageCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  inactiveCard: {
    opacity: 0.6,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  activeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeLabel: {
    fontSize: 12,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  messageActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 100,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
