import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

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

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const STATUS_ACTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function SupportAdminScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const messagesListRef = useRef<FlatList>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const response = await fetch(`${getApiUrl()}/api/admin/support/conversations${params}`, {
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
    }
  }, [token, statusFilter]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/admin/support/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count);
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, [token]);

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
        fetchUnreadCount();
        fetchConversations();
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  }, [token, fetchUnreadCount, fetchConversations]);

  useEffect(() => {
    fetchConversations();
    fetchUnreadCount();
  }, [fetchConversations, fetchUnreadCount]);

  useEffect(() => {
    if (!selectedConversation) return;
    
    const pollInterval = setInterval(() => {
      fetchMessages(selectedConversation.id);
    }, 3000);
    
    return () => clearInterval(pollInterval);
  }, [selectedConversation?.id, fetchMessages]);

  useEffect(() => {
    const pollConversationsInterval = setInterval(() => {
      fetchConversations();
      fetchUnreadCount();
    }, 5000);
    
    return () => clearInterval(pollConversationsInterval);
  }, [fetchConversations, fetchUnreadCount]);

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
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
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

  const renderConversation = ({ item }: { item: Conversation }) => (
    <Pressable
      style={[
        styles.conversationCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        item.unread_count > 0 && { borderLeftWidth: 3, borderLeftColor: colors.primary }
      ]}
      onPress={() => fetchMessages(item.id)}
    >
      <View style={styles.conversationHeader}>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.text }]}>
            {item.first_name} {item.last_name}
          </Text>
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{item.email}</Text>
        </View>
        <View style={styles.badges}>
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
      </View>
      
      <Text style={[styles.conversationSubject, { color: colors.text }]} numberOfLines={1}>
        {item.subject}
      </Text>
      
      {item.last_message && (
        <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.last_message}
        </Text>
      )}
      
      <View style={styles.conversationFooter}>
        <Text style={[styles.timeText, { color: colors.textSecondary }]}>
          {item.last_message_at ? formatDate(item.last_message_at) : formatDate(item.created_at)}
        </Text>
        {item.unread_count > 0 && (
          <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.unreadText}>{item.unread_count}</Text>
          </View>
        )}
      </View>
    </Pressable>
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
        {item.is_admin_reply ? `${item.first_name} (Admin)` : `${item.first_name} ${item.last_name}`}
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
        <PageHeader title="Support Messages" />
        <View style={styles.unauthorizedContainer}>
          <Ionicons name="lock-closed-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.unauthorizedText, { color: colors.text }]}>Admin Access Required</Text>
        </View>
      </ThemedBackground>
    );
  }

  if (selectedConversation) {
    return (
      <ThemedBackground>
        <PageHeader 
          title="Conversation"
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
              From: {selectedConversation.first_name} {selectedConversation.last_name} ({selectedConversation.email})
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
              placeholder="Type your reply..."
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
              <Text style={[styles.statusModalTitle, { color: colors.text }]}>Update Status</Text>
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
                  <Text style={[styles.statusOptionText, { color: colors.text }]}>{opt.label}</Text>
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
      <PageHeader 
        title="Support Messages"
        rightAction={
          unreadCount > 0 ? (
            <View style={[styles.headerBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          ) : null
        }
      />
      <View style={styles.container}>
        <View style={[styles.filterContainer, { borderBottomColor: colors.border }]}>
          <FlatList
            horizontal
            data={STATUS_OPTIONS}
            keyExtractor={item => item.value}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterList}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.filterChip,
                  { borderColor: colors.border },
                  statusFilter === item.value && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                onPress={() => {
                  setStatusFilter(item.value);
                  setLoading(true);
                }}
              >
                <Text style={[
                  styles.filterChipText,
                  { color: statusFilter === item.value ? '#FFFFFF' : colors.text }
                ]}>
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        </View>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="mail-open-outline" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Messages</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {statusFilter !== 'all' ? `No ${statusFilter.replace('_', ' ')} conversations` : 'No support messages yet'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={item => item.id.toString()}
            renderItem={renderConversation}
            contentContainerStyle={styles.listContent}
            refreshing={loading}
            onRefresh={() => {
              setLoading(true);
              fetchConversations();
            }}
          />
        )}
      </View>
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
  unauthorizedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  unauthorizedText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  filterContainer: {
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  filterList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
  },
  conversationCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 12,
  },
  badges: {
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
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 13,
    marginBottom: 8,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '600',
  },
  headerBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
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
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
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
});
