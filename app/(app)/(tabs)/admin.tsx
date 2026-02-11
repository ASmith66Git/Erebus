import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, RefreshControl, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { authFetch } from '@/utils/authFetch';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

interface UserData {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'user' | 'admin';
  isBlocked: boolean;
  isArchived: boolean;
  createdAt: string;
}

interface UserStats {
  user: {
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isBlocked: boolean;
    isArchived: boolean;
    createdAt: string;
    lastLoginAt: string | null;
  };
  stats: {
    diveLogs: number;
    diveSites: number;
    diveTrips: number;
    gearProfiles: number;
    equipment: number;
    photos: number;
    certifications: number;
    buddies: number;
  };
}

export default function AdminScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { token, isAdmin, user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetLoading, setResetLoading] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserStats | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingUser, setLoadingUser] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
      const response = await authFetch('/api/admin/users', token);

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else if (response.status !== 401) {
        setError(t('admin.failedToLoadUsers'));
      }
    } catch (err) {
      setError(t('common.networkError'));
    } finally {
      setIsLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  }, []);

  async function fetchUserStats(userId: number) {
    setLoadingUser(userId);
    try {
      const response = await authFetch(`/api/admin/users/${userId}/stats`, token);
      if (response.ok) {
        const data = await response.json();
        setSelectedUser(data);
        setModalVisible(true);
      } else {
        showAlert(t('common.error'), t('admin.failedToLoadUserDetails'));
      }
    } catch (err) {
      showAlert(t('common.error'), t('common.networkError'));
    } finally {
      setLoadingUser(null);
    }
  }

  function showAlert(title: string, message: string) {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  function showConfirm(title: string, message: string, onConfirm: () => void, destructive = false) {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), style: destructive ? 'destructive' : 'default', onPress: onConfirm }
      ]);
    }
  }

  async function toggleUserRole(userId: number, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    
    if (userId === user?.id) {
      showAlert(t('common.error'), t('admin.cannotChangeOwnRole'));
      return;
    }

    try {
      const response = await authFetch(`/api/admin/users/${userId}/role`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
        if (selectedUser?.user.id === userId) {
          setSelectedUser({ ...selectedUser, user: { ...selectedUser.user, role: newRole } });
        }
      } else if (response.status !== 401) {
        showAlert(t('common.error'), t('admin.failedToUpdateRole'));
      }
    } catch (err) {
      showAlert(t('common.error'), t('common.networkError'));
    }
  }

  async function toggleBlockUser(userId: number, currentlyBlocked: boolean) {
    if (userId === user?.id) {
      showAlert(t('common.error'), t('admin.cannotBlockSelf'));
      return;
    }

    const action = currentlyBlocked ? 'unblock' : 'block';
    
    showConfirm(
      t('admin.confirmAction', { action }),
      t('admin.confirmActionMessage', { action }),
      async () => {
        setActionLoading('block');
        try {
          const response = await authFetch(`/api/admin/users/${userId}/block`, token, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocked: !currentlyBlocked }),
          });

          if (response.ok) {
            setUsers(users.map(u => u.id === userId ? { ...u, isBlocked: !currentlyBlocked } : u));
            if (selectedUser?.user.id === userId) {
              setSelectedUser({ ...selectedUser, user: { ...selectedUser.user, isBlocked: !currentlyBlocked } });
            }
          } else if (response.status !== 401) {
            showAlert(t('common.error'), t('admin.failedToBlockUser', { action }));
          }
        } catch (err) {
          showAlert(t('common.error'), t('common.networkError'));
        } finally {
          setActionLoading(null);
        }
      },
      !currentlyBlocked
    );
  }

  async function toggleArchiveUser(userId: number, currentlyArchived: boolean) {
    if (userId === user?.id) {
      showAlert(t('common.error'), t('admin.cannotArchiveSelf'));
      return;
    }

    const action = currentlyArchived ? 'unarchive' : 'archive';
    
    showConfirm(
      t('admin.confirmAction', { action }),
      t('admin.confirmActionMessage', { action }),
      async () => {
        setActionLoading('archive');
        try {
          const response = await authFetch(`/api/admin/users/${userId}/archive`, token, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: !currentlyArchived }),
          });

          if (response.ok) {
            setUsers(users.map(u => u.id === userId ? { ...u, isArchived: !currentlyArchived } : u));
            if (selectedUser?.user.id === userId) {
              setSelectedUser({ ...selectedUser, user: { ...selectedUser.user, isArchived: !currentlyArchived } });
            }
          } else if (response.status !== 401) {
            showAlert(t('common.error'), t('admin.failedToBlockUser', { action }));
          }
        } catch (err) {
          showAlert(t('common.error'), t('common.networkError'));
        } finally {
          setActionLoading(null);
        }
      },
      !currentlyArchived
    );
  }

  async function sendPasswordResetEmail(userData: UserData | UserStats['user']) {
    showConfirm(
      t('admin.sendPasswordResetEmail'),
      t('admin.sendResetEmailConfirm', { email: userData.email }),
      async () => {
        setResetLoading(userData.id);
        setActionLoading('reset');
        try {
          const response = await authFetch(`/api/admin/users/${userData.id}/reset-password`, token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });

          const data = await response.json();
          
          if (response.ok) {
            showAlert(t('admin.success'), t('admin.passwordResetEmailSent'));
          } else if (response.status !== 401) {
            showAlert(t('common.error'), data.error || t('admin.failedToSendResetEmail'));
          }
        } catch (err) {
          showAlert(t('common.error'), t('common.networkError'));
        } finally {
          setResetLoading(null);
          setActionLoading(null);
        }
      }
    );
  }

  async function deleteUser(userId: number) {
    if (userId === user?.id) {
      showAlert(t('common.error'), t('admin.cannotDeleteSelf'));
      return;
    }

    showConfirm(
      t('admin.confirmDelete'),
      t('admin.confirmDeleteMessage'),
      async () => {
        try {
          const response = await authFetch(`/api/admin/users/${userId}`, token, {
            method: 'DELETE',
          });

          if (response.ok) {
            setUsers(users.filter(u => u.id !== userId));
            setModalVisible(false);
            setSelectedUser(null);
          } else if (response.status !== 401) {
            showAlert(t('common.error'), t('admin.failedToDeleteUser'));
          }
        } catch (err) {
          showAlert(t('common.error'), t('common.networkError'));
        }
      },
      true
    );
  }

  function closeModal() {
    setModalVisible(false);
    setSelectedUser(null);
  }

  if (!isAdmin) {
    return null;
  }

  const StatCard = ({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) => (
    <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={[styles.statCardValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statCardLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );

  return (
    <ThemedBackground>
      <PageHeader title={t('admin.title')} />
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="settings" size={24} color="#FFFFFF" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{t('admin.adminPanel')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('admin.manageUsersSettings')}
          </Text>
        </View>

      <View style={[styles.statsCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>{users.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('admin.totalUsers')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {users.filter(u => u.role === 'admin').length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('admin.admins')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.error }]}>
            {users.filter(u => u.isBlocked).length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('admin.blocked')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#FF9500' }]}>
            {users.filter(u => u.isArchived).length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('admin.archived')}</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('admin.userManagement')}</Text>
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
          <Pressable
            key={userData.id}
            onPress={() => fetchUserStats(userData.id)}
            style={[
              styles.userCard, 
              { backgroundColor: colors.cardBackground, borderColor: colors.border },
              (userData.isBlocked || userData.isArchived) && { opacity: 0.7 }
            ]}
          >
            <View style={styles.userInfo}>
              <View style={styles.avatarContainer}>
                <View style={[styles.userAvatar, { backgroundColor: userData.role === 'admin' ? colors.primary : colors.textSecondary }]}>
                  {loadingUser === userData.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.userAvatarText}>
                      {userData.firstName?.[0]?.toUpperCase() || userData.email[0].toUpperCase()}
                    </Text>
                  )}
                </View>
                {(userData.isBlocked || userData.isArchived) && (
                  <View style={styles.statusIconsOverlay}>
                    {userData.isBlocked && (
                      <View style={[styles.statusIconBadge, { backgroundColor: colors.error }]}>
                        <Ionicons name="lock-closed" size={10} color="#FFFFFF" />
                      </View>
                    )}
                    {userData.isArchived && (
                      <View style={[styles.statusIconBadge, { backgroundColor: '#FF9500' }]}>
                        <Ionicons name="archive" size={10} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                )}
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
                      <Text style={styles.roleBadgeText}>{t('admin.roleBadgeAdmin')}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{userData.email}</Text>
                <Text style={[styles.userDate, { color: colors.textSecondary }]}>
                  {t('admin.joined', { date: new Date(userData.createdAt).toLocaleDateString() })}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        ))
      )}

      <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('admin.userDetails')}</Text>
              <Pressable onPress={closeModal} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            {selectedUser && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.userProfileSection}>
                  <View style={[styles.largeAvatar, { backgroundColor: selectedUser.user.role === 'admin' ? colors.primary : colors.textSecondary }]}>
                    <Text style={styles.largeAvatarText}>
                      {selectedUser.user.firstName?.[0]?.toUpperCase() || selectedUser.user.email[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.profileName, { color: colors.text }]}>
                    {selectedUser.user.firstName && selectedUser.user.lastName
                      ? `${selectedUser.user.firstName} ${selectedUser.user.lastName}`
                      : selectedUser.user.email.split('@')[0]}
                  </Text>
                  <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{selectedUser.user.email}</Text>
                  
                  <View style={styles.badgesRow}>
                    {selectedUser.user.role === 'admin' && (
                      <View style={[styles.roleBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.roleBadgeText}>{t('admin.roleBadgeAdmin')}</Text>
                      </View>
                    )}
                    {selectedUser.user.isBlocked && (
                      <View style={[styles.roleBadge, { backgroundColor: colors.error }]}>
                        <Ionicons name="lock-closed" size={10} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.roleBadgeText}>{t('admin.roleBadgeBlocked')}</Text>
                      </View>
                    )}
                    {selectedUser.user.isArchived && (
                      <View style={[styles.roleBadge, { backgroundColor: '#FF9500' }]}>
                        <Ionicons name="archive" size={10} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.roleBadgeText}>{t('admin.roleBadgeArchived')}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.infoSection}>
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('admin.createdAt')}</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {new Date(selectedUser.user.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('admin.lastLogin')}</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {selectedUser.user.lastLoginAt 
                        ? new Date(selectedUser.user.lastLoginAt).toLocaleDateString()
                        : t('admin.never')}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.statsHeader, { color: colors.text }]}>{t('admin.userStatistics')}</Text>
                <View style={styles.statsGrid}>
                  <StatCard icon="water" label={t('admin.diveLogs')} value={selectedUser.stats.diveLogs} color={colors.primary} />
                  <StatCard icon="location" label={t('admin.diveSites')} value={selectedUser.stats.diveSites} color="#34C759" />
                  <StatCard icon="airplane" label={t('admin.diveTrips')} value={selectedUser.stats.diveTrips} color="#5856D6" />
                  <StatCard icon="settings" label={t('admin.gearProfiles')} value={selectedUser.stats.gearProfiles} color="#FF9500" />
                  <StatCard icon="build" label={t('admin.equipment')} value={selectedUser.stats.equipment} color="#FF2D55" />
                  <StatCard icon="camera" label={t('admin.photos')} value={selectedUser.stats.photos} color="#007AFF" />
                  <StatCard icon="ribbon" label={t('admin.certifications')} value={selectedUser.stats.certifications} color="#AF52DE" />
                  <StatCard icon="people" label={t('admin.buddies')} value={selectedUser.stats.buddies} color="#00C7BE" />
                </View>

                {selectedUser.user.id !== user?.id && (
                  <View style={styles.actionsSection}>
                    <Text style={[styles.actionsHeader, { color: colors.text }]}>{t('admin.actions')}</Text>
                    
                    <Pressable
                      style={[styles.actionRow, { borderColor: colors.border }]}
                      onPress={() => sendPasswordResetEmail(selectedUser.user)}
                      disabled={actionLoading === 'reset'}
                    >
                      <View style={[styles.actionIconWrapper, { backgroundColor: '#FF9500' + '20' }]}>
                        {actionLoading === 'reset' ? (
                          <ActivityIndicator size="small" color="#FF9500" />
                        ) : (
                          <Ionicons name="mail" size={20} color="#FF9500" />
                        )}
                      </View>
                      <Text style={[styles.actionLabel, { color: colors.text }]}>{t('admin.sendPasswordResetEmail')}</Text>
                      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                    </Pressable>

                    <Pressable
                      style={[styles.actionRow, { borderColor: colors.border }]}
                      onPress={() => toggleBlockUser(selectedUser.user.id, selectedUser.user.isBlocked)}
                      disabled={actionLoading === 'block'}
                    >
                      <View style={[styles.actionIconWrapper, { backgroundColor: (selectedUser.user.isBlocked ? colors.primary : colors.error) + '20' }]}>
                        {actionLoading === 'block' ? (
                          <ActivityIndicator size="small" color={selectedUser.user.isBlocked ? colors.primary : colors.error} />
                        ) : (
                          <Ionicons 
                            name={selectedUser.user.isBlocked ? 'lock-open' : 'lock-closed'} 
                            size={20} 
                            color={selectedUser.user.isBlocked ? colors.primary : colors.error} 
                          />
                        )}
                      </View>
                      <Text style={[styles.actionLabel, { color: colors.text }]}>
                        {selectedUser.user.isBlocked ? t('admin.unblockUser') : t('admin.blockUser')}
                      </Text>
                      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                    </Pressable>

                    <Pressable
                      style={[styles.actionRow, { borderColor: colors.border }]}
                      onPress={() => toggleArchiveUser(selectedUser.user.id, selectedUser.user.isArchived)}
                      disabled={actionLoading === 'archive'}
                    >
                      <View style={[styles.actionIconWrapper, { backgroundColor: '#FF9500' + '20' }]}>
                        {actionLoading === 'archive' ? (
                          <ActivityIndicator size="small" color="#FF9500" />
                        ) : (
                          <Ionicons 
                            name={selectedUser.user.isArchived ? 'arrow-undo' : 'archive'} 
                            size={20} 
                            color="#FF9500" 
                          />
                        )}
                      </View>
                      <Text style={[styles.actionLabel, { color: colors.text }]}>
                        {selectedUser.user.isArchived ? t('admin.unarchiveUser') : t('admin.archiveUser')}
                      </Text>
                      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                    </Pressable>

                    <Pressable
                      style={[styles.actionRow, { borderColor: colors.border }]}
                      onPress={() => toggleUserRole(selectedUser.user.id, selectedUser.user.role)}
                    >
                      <View style={[styles.actionIconWrapper, { backgroundColor: colors.primary + '20' }]}>
                        <Ionicons 
                          name={selectedUser.user.role === 'admin' ? 'person' : 'shield'} 
                          size={20} 
                          color={colors.primary} 
                        />
                      </View>
                      <Text style={[styles.actionLabel, { color: colors.text }]}>
                        {selectedUser.user.role === 'admin' ? t('admin.removeAdminRole') : t('admin.makeAdmin')}
                      </Text>
                      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                    </Pressable>

                    <Pressable
                      style={[styles.actionRow, styles.deleteAction, { borderColor: colors.error + '40' }]}
                      onPress={() => deleteUser(selectedUser.user.id)}
                    >
                      <View style={[styles.actionIconWrapper, { backgroundColor: colors.error + '20' }]}>
                        <Ionicons name="trash" size={20} color={colors.error} />
                      </View>
                      <Text style={[styles.actionLabel, { color: colors.error }]}>{t('admin.deleteUser')}</Text>
                      <Ionicons name="chevron-forward" size={20} color={colors.error} />
                    </Pressable>
                  </View>
                )}

                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ThemedBackground>
  );
}

const { width } = Dimensions.get('window');

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
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  statusIconsOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    flexDirection: 'row',
    gap: 2,
  },
  statusIconBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userDetails: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginTop: 2,
  },
  userDate: {
    fontSize: 11,
    marginTop: 2,
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
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  userProfileSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  largeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  largeAvatarText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '600',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    marginBottom: 12,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  infoSection: {
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  statsHeader: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: (width - 56) / 2,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  statCardValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statCardLabel: {
    fontSize: 12,
  },
  actionsSection: {
    marginTop: 8,
  },
  actionsHeader: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  actionIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  deleteAction: {
    marginTop: 16,
  },
});
