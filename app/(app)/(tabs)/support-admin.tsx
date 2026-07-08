import React, { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';
import { useTranslation } from 'react-i18next';

interface Conversation {
  id: number;
  user_id: number;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  email: string;
  unread_count: number;
  last_message: string;
  last_message_at: string;
}

interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  is_admin_reply: boolean;
  message: string;
  read_at: string | null;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface UserGroup {
  userId: number;
  name: string;
  email: string;
  conversations: Conversation[];
  latestActivity: string;
  totalUnread: number;
}

const STATUS_ACTIONS = [
  { value: 'open', labelKey: 'supportAdmin.openTickets' },
  { value: 'in_progress', labelKey: 'supportAdmin.inProgressTickets' },
  { value: 'resolved', labelKey: 'supportAdmin.resolvedTickets' },
  { value: 'closed', labelKey: 'supportAdmin.closedTickets' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', labelKey: 'support.priorityLow' },
  { value: 'normal', labelKey: 'support.priorityNormal' },
  { value: 'high', labelKey: 'support.priorityHigh' },
  { value: 'urgent', labelKey: 'support.priorityUrgent' },
];

const CATEGORY_OPTIONS = [
  { value: 'general', labelKey: 'support.categoryGeneral', icon: 'help-circle-outline' as const },
  { value: 'bug', labelKey: 'support.categoryBug', icon: 'bug-outline' as const },
  { value: 'feature', labelKey: 'support.categoryFeature', icon: 'bulb-outline' as const },
  { value: 'account', labelKey: 'support.categoryAccount', icon: 'person-outline' as const },
  { value: 'billing', labelKey: 'support.categoryBilling', icon: 'card-outline' as const },
];

interface UserOption {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  isBlocked?: boolean;
}

function groupByUser(conversations: Conversation[]): UserGroup[] {
  const map = new Map<number, UserGroup>();
  for (const conv of conversations) {
    if (!map.has(conv.user_id)) {
      map.set(conv.user_id, {
        userId: conv.user_id,
        name: `${conv.first_name} ${conv.last_name}`,
        email: conv.email,
        conversations: [],
        latestActivity: conv.last_message_at || conv.updated_at,
        totalUnread: 0,
      });
    }
    const group = map.get(conv.user_id)!;
    group.conversations.push(conv);
    group.totalUnread += conv.unread_count || 0;
    const convTime = conv.last_message_at || conv.updated_at;
    if (convTime > group.latestActivity) group.latestActivity = convTime;
  }
  return Array.from(map.values()).sort((a, b) =>
    b.latestActivity.localeCompare(a.latestActivity)
  );
}

export default function SupportAdminScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { t } = useTranslation();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'archive'>('new');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newTicketMessage, setNewTicketMessage] = useState('');
  const [newPriority, setNewPriority] = useState('normal');
  const [newCategory, setNewCategory] = useState('general');
  const [creating, setCreating] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState('');

  const messagesListRef = useRef<FlatList>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/support/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.filter((u: UserOption) => !u.isBlocked));
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, [token]);

  const handleCreateTicket = async () => {
    if (!newSubject.trim() || !newTicketMessage.trim() || !selectedUserId) return;

    setCreating(true);
    try {
      const categoryLabelKey = CATEGORY_OPTIONS.find(c => c.value === newCategory)?.labelKey || 'support.categoryGeneral';
      const categoryLabel = t(categoryLabelKey);
      const fullSubject = `[${categoryLabel}] ${newSubject.trim()}`;

      const response = await fetch(`${getApiUrl()}/api/admin/support/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: selectedUserId,
          subject: fullSubject,
          message: newTicketMessage.trim(),
          priority: newPriority,
        }),
      });

      if (response.ok) {
        const conversation = await response.json();
        setShowNewTicket(false);
        setNewSubject('');
        setNewTicketMessage('');
        setNewPriority('normal');
        setNewCategory('general');
        setSelectedUserId(null);
        setUserSearch('');
        fetchConversations();
        fetchMessages(conversation.id);
      }
    } catch (error) {
      console.error('Failed to create ticket:', error);
    } finally {
      setCreating(false);
    }
  };

  const fetchMessages = useCallback(async (conversationId: number) => {
    setMessagesLoading(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/support/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
        setSelectedConversation(data.conversation);
        fetchConversations();
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  }, [token, fetchConversations]);

  useFocusEffect(useCallback(() => {
    fetchConversations();
  }, [fetchConversations]));

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    setSending(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/support/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: newMessage.trim() }),
      });

      if (response.ok) {
        const msg = await response.json();
        setMessages(prev => [...prev, {
          ...msg,
          first_name: user?.firstName || 'Admin',
          last_name: user?.lastName || '',
          email: user?.email || ''
        }]);
        setNewMessage('');
        fetchConversations();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedConversation) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/admin/support/conversations/${selectedConversation.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        const updated = await response.json();
        setSelectedConversation({ ...selectedConversation, status: updated.status });
        fetchConversations();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
    setShowStatusModal(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('common.justNow');
    if (diffMins < 60) return t('common.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('common.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
    return date.toLocaleDateString();
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#22C55E';
      case 'in_progress': return '#F59E0B';
      case 'resolved': return '#3B82F6';
      case 'closed': return '#6B7280';
      default: return colors.textSecondary;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return '#EF4444';
      case 'high': return '#F59E0B';
      case 'normal': return '#3B82F6';
      case 'low': return '#6B7280';
      default: return colors.textSecondary;
    }
  };

  const newConversations = conversations.filter(c => c.status === 'open' || c.status === 'in_progress');
  const archiveConversations = conversations.filter(c => c.status === 'resolved' || c.status === 'closed');
  const totalUnread = newConversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const activeConversations = activeTab === 'new' ? newConversations : archiveConversations;
  const userGroups = groupByUser(activeConversations);

  const renderConversationCard = (item: Conversation) => (
    <Pressable
      key={item.id}
      style={[
        styles.conversationCard,
        { backgroundColor: colors.background, borderColor: colors.border },
        item.unread_count > 0 && { borderLeftWidth: 3, borderLeftColor: colors.primary }
      ]}
      onPress={() => fetchMessages(item.id)}
    >
      <View style={styles.conversationHeader}>
        <View style={styles.badgeRow}>
          <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) + '20' }]}>
            <Text style={[styles.badgeText, { color: getPriorityColor(item.priority) }]}>
              {item.priority}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>
              {item.status.replace('_', ' ')}
            </Text>
          </View>
        </View>
        {item.unread_count > 0 && (
          <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.unreadText}>{item.unread_count}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.conversationSubject, { color: colors.text }]} numberOfLines={1}>
        {item.subject}
      </Text>

      {item.last_message && (
        <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.last_message}
        </Text>
      )}

      <Text style={[styles.timeText, { color: colors.textSecondary }]}>
        {item.last_message_at ? formatDate(item.last_message_at) : formatDate(item.created_at)}
      </Text>
    </Pressable>
  );

  const renderUserGroup = ({ item }: { item: UserGroup }) => (
    <View style={styles.userGroupSection}>
      <View style={[styles.userGroupHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.userGroupLeft}>
          <View style={[styles.userAvatar, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.userAvatarText, { color: colors.primary }]}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={[styles.userGroupName, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.userGroupEmail, { color: colors.textSecondary }]}>{item.email}</Text>
          </View>
        </View>
        {item.totalUnread > 0 && (
          <View style={[styles.groupUnreadBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.groupUnreadText}>{item.totalUnread}</Text>
          </View>
        )}
      </View>
      <View style={styles.conversationsUnderUser}>
        {item.conversations.map(conv => renderConversationCard(conv))}
      </View>
    </View>
  );

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[
      styles.messageBubble,
      item.is_admin_reply ? styles.adminMessage : styles.userMessage,
      {
        backgroundColor: item.is_admin_reply ? colors.primary : colors.surface,
        borderColor: item.is_admin_reply ? colors.primary : colors.border,
      }
    ]}>
      <Text style={[
        styles.messageTime,
        { color: item.is_admin_reply ? 'rgba(255,255,255,0.7)' : colors.textSecondary, marginBottom: 4 }
      ]}>
        {formatMessageTime(item.created_at)}
      </Text>
      <Text style={[
        styles.senderName,
        { color: item.is_admin_reply ? '#FFFFFF' : colors.primary, marginBottom: 4 }
      ]}>
        {item.is_admin_reply ? `${item.first_name} ${t('supportAdmin.admin')}` : `${item.first_name} ${item.last_name}`}
      </Text>
      <Text style={[
        styles.messageText,
        { color: item.is_admin_reply ? '#FFFFFF' : colors.text }
      ]}>
        {item.message}
      </Text>
    </View>
  );

  if (user?.role !== 'admin') {
    return (
      <ThemedBackground>
        <PageHeader title={t('supportAdmin.supportMessages')} />
        <View style={styles.centeredContainer}>
          <Ionicons name="lock-closed-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.centeredText, { color: colors.text }]}>{t('supportAdmin.adminAccessRequired')}</Text>
        </View>
      </ThemedBackground>
    );
  }

  if (selectedConversation) {
    return (
      <ThemedBackground>
        <PageHeader
          title={t('supportAdmin.conversation')}
          rightAction={
            <View style={styles.headerActions}>
              <Pressable onPress={() => setShowStatusModal(true)} style={styles.headerButton}>
                <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(selectedConversation.status) }]} />
                <Text style={[styles.headerButtonText, { color: colors.text }]}>
                  {selectedConversation.status.replace('_', ' ')}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.text} />
              </Pressable>
              <Pressable onPress={() => setSelectedConversation(null)} style={styles.headerButton}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </Pressable>
            </View>
          }
        />
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={100}
        >
          <View style={[styles.conversationInfo, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Text style={[styles.infoSubject, { color: colors.text }]}>{selectedConversation.subject}</Text>
            <Text style={[styles.infoUser, { color: colors.textSecondary }]}>
              {t('supportAdmin.from', { name: `${selectedConversation.first_name} ${selectedConversation.last_name}`, email: selectedConversation.email })}
            </Text>
          </View>

          {messagesLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={messagesListRef}
              data={messages}
              keyExtractor={item => item.id.toString()}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() => messagesListRef.current?.scrollToEnd()}
            />
          )}

          <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: 12 + insets.bottom }]}>
            <TextInput
              style={[styles.messageInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder={t('supportAdmin.replyPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={newMessage}
              onChangeText={setNewMessage}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={[styles.sendButton, { backgroundColor: colors.primary, opacity: sending || !newMessage.trim() ? 0.5 : 1 }]}
              onPress={handleSendMessage}
              disabled={sending || !newMessage.trim()}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={20} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>

        <Modal visible={showStatusModal} transparent animationType="fade" onRequestClose={() => setShowStatusModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowStatusModal(false)}>
            <View style={[styles.statusModalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statusModalTitle, { color: colors.text }]}>{t('supportAdmin.updateStatus')}</Text>
              {STATUS_ACTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.statusOption,
                    selectedConversation.status === opt.value && { backgroundColor: colors.primary + '20' }
                  ]}
                  onPress={() => handleUpdateStatus(opt.value)}
                >
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(opt.value) }]} />
                  <Text style={[styles.statusOptionText, { color: colors.text }]}>{t(opt.labelKey)}</Text>
                  {selectedConversation.status === opt.value && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <PageHeader title={t('supportAdmin.supportMessages')} />
      <View style={styles.container}>
        <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <Pressable
            style={[styles.tab, activeTab === 'new' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('new')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'new' ? colors.primary : colors.textSecondary }]}>
              {t('supportAdmin.newMessages')}
            </Text>
            {totalUnread > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.tabBadgeText}>{totalUnread}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'archive' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('archive')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'archive' ? colors.primary : colors.textSecondary }]}>
              {t('supportAdmin.archive')}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : userGroups.length === 0 ? (
          <View style={styles.centeredContainer}>
            <Ionicons name="mail-open-outline" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {activeTab === 'new' ? t('supportAdmin.noNewMessages') : t('supportAdmin.noArchivedMessages')}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {activeTab === 'new' ? t('supportAdmin.noNewMessagesDesc') : t('supportAdmin.noArchivedMessagesDesc')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={userGroups}
            keyExtractor={item => item.userId.toString()}
            renderItem={renderUserGroup}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchConversations();
            }}
          />
        )}

        <Pressable
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => {
            fetchUsers();
            setShowNewTicket(true);
          }}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      </View>

      <Modal visible={showNewTicket} transparent animationType="fade" onRequestClose={() => setShowNewTicket(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewTicket(false)}>
          <Pressable style={[styles.newTicketModalContent, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
            <View style={styles.newTicketModalHeader}>
              <Text style={[styles.newTicketModalTitle, { color: colors.text }]}>{t('supportAdmin.newMessageToUser')}</Text>
              <Pressable onPress={() => setShowNewTicket(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.newTicketModalBody}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>{t('supportAdmin.selectUser')}</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder={t('supportAdmin.searchUsers')}
                placeholderTextColor={colors.textSecondary}
                value={userSearch}
                onChangeText={setUserSearch}
              />
              {userSearch.length > 0 && (
                <View style={[styles.userDropdown, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {users
                    .filter(u =>
                      `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())
                    )
                    .slice(0, 5)
                    .map(u => (
                      <Pressable
                        key={u.id}
                        style={[
                          styles.userDropdownItem,
                          { borderBottomColor: colors.border },
                          selectedUserId === u.id && { backgroundColor: colors.primary + '20' }
                        ]}
                        onPress={() => {
                          setSelectedUserId(u.id);
                          setUserSearch(`${u.firstName} ${u.lastName} (${u.email})`);
                        }}
                      >
                        <Text style={[styles.userDropdownName, { color: colors.text }]}>
                          {u.firstName} {u.lastName}
                        </Text>
                        <Text style={[styles.userDropdownEmail, { color: colors.textSecondary }]}>
                          {u.email}
                        </Text>
                      </Pressable>
                    ))
                  }
                  {users.filter(u =>
                    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(userSearch.toLowerCase())
                  ).length === 0 && (
                    <Text style={[styles.noUsersText, { color: colors.textSecondary }]}>{t('supportAdmin.noUsersFound')}</Text>
                  )}
                </View>
              )}
              {selectedUserId && (
                <View style={[styles.selectedUserChip, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.selectedUserText, { color: colors.primary }]}>
                    {users.find(u => u.id === selectedUserId)?.firstName} {users.find(u => u.id === selectedUserId)?.lastName}
                  </Text>
                  <Pressable onPress={() => { setSelectedUserId(null); setUserSearch(''); }}>
                    <Ionicons name="close-circle" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              )}

              <Text style={[styles.inputLabel, { color: colors.text }]}>{t('support.category')}</Text>
              <View style={styles.categoryContainer}>
                {CATEGORY_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.categoryOption,
                      { borderColor: colors.border, backgroundColor: colors.background },
                      newCategory === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                    onPress={() => setNewCategory(opt.value)}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={newCategory === opt.value ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text style={[
                      styles.categoryText,
                      { color: newCategory === opt.value ? '#FFFFFF' : colors.text }
                    ]}>
                      {t(`support.category${opt.value.charAt(0).toUpperCase() + opt.value.slice(1)}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>{t('support.subject')}</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder={t('support.subjectPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={newSubject}
                onChangeText={setNewSubject}
                maxLength={255}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>{t('support.priority')}</Text>
              <View style={styles.priorityContainer}>
                {PRIORITY_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.priorityOption,
                      { borderColor: colors.border },
                      newPriority === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                    onPress={() => setNewPriority(opt.value)}
                  >
                    <Text style={[
                      styles.priorityText,
                      { color: newPriority === opt.value ? '#FFFFFF' : colors.text }
                    ]}>
                      {t(`support.priority${opt.value.charAt(0).toUpperCase() + opt.value.slice(1)}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>{t('support.message')}</Text>
              <TextInput
                style={[styles.textInput, styles.textArea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder={t('supportAdmin.messageToUserPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={newTicketMessage}
                onChangeText={setNewTicketMessage}
                multiline
                numberOfLines={6}
                maxLength={2000}
                textAlignVertical="top"
              />
            </ScrollView>

            <Pressable
              style={[styles.submitButton, { backgroundColor: colors.primary, opacity: creating || !newSubject.trim() || !newTicketMessage.trim() || !selectedUserId ? 0.5 : 1 }]}
              onPress={handleCreateTicket}
              disabled={creating || !newSubject.trim() || !newTicketMessage.trim() || !selectedUserId}
            >
              {creating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>{t('supportAdmin.sendMessage')}</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  centeredText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  userGroupSection: {
    marginBottom: 20,
  },
  userGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  userGroupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  userGroupName: {
    fontSize: 14,
    fontWeight: '600',
  },
  userGroupEmail: {
    fontSize: 12,
    marginTop: 1,
  },
  groupUnreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  groupUnreadText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  conversationsUnderUser: {
    paddingLeft: 12,
  },
  conversationCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  conversationSubject: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 18,
  },
  timeText: {
    fontSize: 11,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  conversationInfo: {
    padding: 12,
    borderBottomWidth: 1,
  },
  infoSubject: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoUser: {
    fontSize: 13,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '85%',
    borderWidth: 1,
  },
  userMessage: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  adminMessage: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
  },
  messageTime: {
    fontSize: 10,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    alignItems: 'flex-end',
    gap: 8,
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 4,
  },
  headerButtonText: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  statusModalContent: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 12,
    overflow: 'hidden',
    padding: 8,
  },
  statusModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    padding: 12,
    textAlign: 'center',
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOptionText: {
    flex: 1,
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
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
  newTicketModalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  newTicketModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  newTicketModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  newTicketModalBody: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  textArea: {
    minHeight: 120,
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  priorityText: {
    fontSize: 13,
    fontWeight: '500',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
  },
  submitButton: {
    margin: 16,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  userDropdown: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 200,
  },
  userDropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
  },
  userDropdownName: {
    fontSize: 14,
    fontWeight: '500',
  },
  userDropdownEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  noUsersText: {
    padding: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  selectedUserChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 6,
  },
  selectedUserText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
