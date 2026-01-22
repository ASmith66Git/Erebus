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
  ScrollView,
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
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
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

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export default function HelpSupportScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newTicketMessage, setNewTicketMessage] = useState('');
  const [newPriority, setNewPriority] = useState('normal');
  const [creating, setCreating] = useState(false);
  
  const messagesListRef = useRef<FlatList>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/support/conversations`, {
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
  }, [token]);

  const fetchMessages = useCallback(async (conversationId: number, isPolling = false) => {
    if (!isPolling) {
      setMessagesLoading(true);
    }
    try {
      const response = await fetch(`${getApiUrl()}/api/support/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (isPolling) {
          setMessages(prev => {
            if (data.messages.length !== prev.length || 
                (data.messages.length > 0 && prev.length > 0 && 
                 data.messages[data.messages.length - 1].id !== prev[prev.length - 1].id)) {
              return data.messages;
            }
            return prev;
          });
          setSelectedConversation(prev => {
            if (prev && data.conversation.status !== prev.status) {
              return data.conversation;
            }
            return prev;
          });
        } else {
          setMessages(data.messages);
          setSelectedConversation(data.conversation);
        }
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      if (!isPolling) {
        setMessagesLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedConversation) return;
    
    const pollInterval = setInterval(() => {
      fetchMessages(selectedConversation.id, true);
    }, 3000);
    
    return () => clearInterval(pollInterval);
  }, [selectedConversation?.id, fetchMessages]);

  useEffect(() => {
    const pollConversationsInterval = setInterval(() => {
      fetchConversations();
    }, 5000);
    
    return () => clearInterval(pollConversationsInterval);
  }, [fetchConversations]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    setSending(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/support/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: newMessage.trim() }),
      });
      
      if (response.ok) {
        const msg = await response.json();
        setMessages(prev => [...prev, { ...msg, first_name: 'You', last_name: '', email: '' }]);
        setNewMessage('');
        fetchConversations();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!newSubject.trim() || !newTicketMessage.trim()) return;
    
    setCreating(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/support/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: newSubject.trim(),
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
        fetchConversations();
        fetchMessages(conversation.id);
      }
    } catch (error) {
      console.error('Failed to create ticket:', error);
    } finally {
      setCreating(false);
    }
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
        <Text style={[styles.conversationSubject, { color: colors.text }]} numberOfLines={1}>
          {item.subject}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status.replace('_', ' ')}
          </Text>
        </View>
      </View>
      
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
        backgroundColor: item.is_admin_reply ? colors.surface : colors.primary,
        borderColor: item.is_admin_reply ? colors.border : colors.primary,
      }
    ]}>
      <Text style={[
        styles.messageTime,
        { color: item.is_admin_reply ? colors.textSecondary : 'rgba(255,255,255,0.7)', marginBottom: 4 }
      ]}>
        {formatMessageTime(item.created_at)}
      </Text>
      <Text style={[
        styles.senderName,
        { color: item.is_admin_reply ? colors.primary : '#FFFFFF', marginBottom: 4 }
      ]}>
        {item.is_admin_reply ? 'Support Team' : 'You'}
      </Text>
      <Text style={[
        styles.messageText,
        { color: item.is_admin_reply ? colors.text : '#FFFFFF' }
      ]}>
        {item.message}
      </Text>
    </View>
  );

  if (selectedConversation) {
    return (
      <ThemedBackground>
        <PageHeader 
          title={selectedConversation.subject}
          rightAction={
            <Pressable onPress={() => setSelectedConversation(null)} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
          }
        />
        <KeyboardAvoidingView 
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={100}
        >
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
              placeholder="Type your message..."
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
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <PageHeader title="Help & Support" />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Support Tickets</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Have a question or need help? Create a support ticket and our team will respond.
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={item => item.id.toString()}
            renderItem={renderConversation}
            contentContainerStyle={styles.listContent}
            refreshing={loading}
            onRefresh={fetchConversations}
          />
        )}
        
        <Pressable
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => setShowNewTicket(true)}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      </View>
      
      <Modal visible={showNewTicket} transparent animationType="fade" onRequestClose={() => setShowNewTicket(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewTicket(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>New Support Ticket</Text>
              <Pressable onPress={() => setShowNewTicket(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Subject</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Brief description of your issue"
                placeholderTextColor={colors.textSecondary}
                value={newSubject}
                onChangeText={setNewSubject}
                maxLength={255}
              />
              
              <Text style={[styles.inputLabel, { color: colors.text }]}>Priority</Text>
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
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              
              <Text style={[styles.inputLabel, { color: colors.text }]}>Message</Text>
              <TextInput
                style={[styles.textInput, styles.textArea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Describe your issue in detail..."
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
              style={[styles.submitButton, { backgroundColor: colors.primary, opacity: creating || !newSubject.trim() || !newTicketMessage.trim() ? 0.5 : 1 }]}
              onPress={handleCreateTicket}
              disabled={creating || !newSubject.trim() || !newTicketMessage.trim()}
            >
              {creating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Ticket</Text>
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
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
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
    alignItems: 'center',
    marginBottom: 8,
  },
  conversationSubject: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  lastMessage: {
    fontSize: 14,
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
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  adminMessage: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
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
  backButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
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
});
