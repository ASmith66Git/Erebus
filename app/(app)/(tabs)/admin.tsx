import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';

interface UserData {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'user' | 'admin';
  isBlocked: boolean;
  createdAt: string;
}

function getApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return 'https://56fa4c0f-d24e-42d1-a9d5-89c79bbd28d6-00-3nhmxvxgj4wxs.spock.replit.dev';
}

export default function AdminScreen() {
  const { colors } = useTheme();
  const { token, isAdmin, user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [resetLoading, setResetLoading] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/' as any);
      return;
    }
    fetchUsers();
  }, [isAdmin]);

  async function fetchUsers() {
    try {
      setIsLoading(true);
      const response = await fetch(`${getApiUrl()}/api/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        setError('Failed to load users');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleUserRole(userId: number, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    
    if (userId === user?.id) {
      Alert.alert('Error', 'You cannot change your own role');
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
      } else {
        Alert.alert('Error', 'Failed to update user role');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
    }
  }

  async function toggleBlockUser(userId: number, currentlyBlocked: boolean) {
    if (userId === user?.id) {
      Alert.alert('Error', 'You cannot block your own account');
      return;
    }

    const action = currentlyBlocked ? 'unblock' : 'block';
    
    Alert.alert(
      `Confirm ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      `Are you sure you want to ${action} this user?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: currentlyBlocked ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${getApiUrl()}/api/admin/users/${userId}/block`, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ blocked: !currentlyBlocked }),
              });

              if (response.ok) {
                setUsers(users.map(u => u.id === userId ? { ...u, isBlocked: !currentlyBlocked } : u));
              } else {
                Alert.alert('Error', `Failed to ${action} user`);
              }
            } catch (err) {
              Alert.alert('Error', 'Network error');
            }
          },
        },
      ]
    );
  }

  async function sendPasswordResetEmail(userData: UserData) {
    Alert.alert(
      'Send Password Reset Email',
      `Send a password reset email to ${userData.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setResetLoading(userData.id);
            try {
              const response = await fetch(`${getApiUrl()}/api/admin/users/${userData.id}/reset-password`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });

              const data = await response.json();
              
              if (response.ok) {
                Alert.alert('Success', 'Password reset email has been sent to the user');
              } else {
                Alert.alert('Error', data.error || 'Failed to send password reset email');
              }
            } catch (err) {
              Alert.alert('Error', 'Network error');
            } finally {
              setResetLoading(null);
            }
          },
        },
      ]
    );
  }

  async function deleteUser(userId: number) {
    if (userId === user?.id) {
      Alert.alert('Error', 'You cannot delete your own account');
      return;
    }

    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this user? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${getApiUrl()}/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });

              if (response.ok) {
                setUsers(users.filter(u => u.id !== userId));
              } else {
                Alert.alert('Error', 'Failed to delete user');
              }
            } catch (err) {
              Alert.alert('Error', 'Network error');
            }
          },
        },
      ]
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.primary }]}>
          <Ionicons name="settings" size={24} color="#FFFFFF" />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Admin Panel</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Manage users and app settings
        </Text>
      </View>

      <View style={[styles.statsCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>{users.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Users</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {users.filter(u => u.role === 'admin').length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Admins</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.error }]}>
            {users.filter(u => u.isBlocked).length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Blocked</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>User Management</Text>
        <Pressable onPress={fetchUsers}>
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
          <Ionicons name="alert-circle" size={20} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : (
        users.map((userData) => (
          <View
            key={userData.id}
            style={[
              styles.userCard, 
              { backgroundColor: colors.cardBackground, borderColor: colors.border },
              userData.isBlocked && { opacity: 0.7 }
            ]}
          >
            <View style={styles.userInfo}>
              <View style={[styles.userAvatar, { backgroundColor: userData.role === 'admin' ? colors.primary : colors.textSecondary }]}>
                <Text style={styles.userAvatarText}>
                  {userData.firstName?.[0]?.toUpperCase() || userData.email[0].toUpperCase()}
                </Text>
              </View>
              <View style={styles.userDetails}>
                <View style={styles.userNameRow}>
                  <Text style={[styles.userName, { color: colors.text }]}>
                    {userData.firstName && userData.lastName
                      ? `${userData.firstName} ${userData.lastName}`
                      : userData.email.split('@')[0]}
                  </Text>
                  {userData.role === 'admin' && (
                    <View style={[styles.roleBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.roleBadgeText}>Admin</Text>
                    </View>
                  )}
                  {userData.isBlocked && (
                    <View style={[styles.roleBadge, { backgroundColor: colors.error }]}>
                      <Text style={styles.roleBadgeText}>Blocked</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{userData.email}</Text>
                <Text style={[styles.userDate, { color: colors.textSecondary }]}>
                  Joined {new Date(userData.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>

            {userData.id !== user?.id && (
              <View style={styles.userActions}>
                <Pressable
                  style={[styles.actionButton, { backgroundColor: colors.primary + '20' }]}
                  onPress={() => toggleUserRole(userData.id, userData.role)}
                >
                  <Ionicons
                    name={userData.role === 'admin' ? 'person' : 'shield'}
                    size={18}
                    color={colors.primary}
                  />
                </Pressable>
                <Pressable
                  style={[styles.actionButton, { backgroundColor: '#FF9500' + '20' }]}
                  onPress={() => sendPasswordResetEmail(userData)}
                  disabled={resetLoading === userData.id}
                >
                  {resetLoading === userData.id ? (
                    <ActivityIndicator size="small" color="#FF9500" />
                  ) : (
                    <Ionicons name="mail" size={18} color="#FF9500" />
                  )}
                </Pressable>
                <Pressable
                  style={[styles.actionButton, { backgroundColor: (userData.isBlocked ? colors.primary : '#FF3B30') + '20' }]}
                  onPress={() => toggleBlockUser(userData.id, userData.isBlocked)}
                >
                  <Ionicons
                    name={userData.isBlocked ? 'lock-open' : 'lock-closed'}
                    size={18}
                    color={userData.isBlocked ? colors.primary : '#FF3B30'}
                  />
                </Pressable>
                <Pressable
                  style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
                  onPress={() => deleteUser(userData.id)}
                >
                  <Ionicons name="archive" size={18} color={colors.error} />
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
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
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    marginVertical: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
  },
  userCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 13,
    marginBottom: 2,
  },
  userDate: {
    fontSize: 11,
  },
  userActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
