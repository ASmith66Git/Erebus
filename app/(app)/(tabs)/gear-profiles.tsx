import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { getApiUrl } from '@/utils/apiConfig';
import { DrawerActions, useNavigation, useFocusEffect } from '@react-navigation/native';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';
import { getTankIcon } from '@/components/TankIcons';

interface GearProfile {
  id: number;
  name: string;
  configType: string;
  suitType: string | null;
  suitThickness: string | null;
  cylinderCount: number;
  totalWeight: number;
  status: 'live' | 'archived';
  updatedAt: string;
}

const CONFIG_TYPE_LABELS: { [key: string]: string } = {
  single_tank: 'Single Tank',
  twinset: 'Twinset',
  sidemount: 'Sidemount',
  ccr: 'CCR',
};

export default function GearProfilesScreen() {
  const { colors } = useTheme();
  const { token, logout } = useAuth();
  const { formatWeight } = useSettings();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [profiles, setProfiles] = useState<GearProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfiles = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/gear-profiles`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        logout();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setProfiles(data.profiles || []);
      }
    } catch (error) {
      console.error('Error fetching gear profiles:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, logout]);

  useFocusEffect(
    useCallback(() => {
      fetchProfiles();
    }, [fetchProfiles])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfiles();
  };

  const handleDelete = async (profile: GearProfile) => {
    const doDelete = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/gear-profiles/${profile.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          setProfiles(prev => prev.filter(p => p.id !== profile.id));
        }
      } catch (error) {
        console.error('Error deleting profile:', error);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete "${profile.name}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Profile',
        `Are you sure you want to delete "${profile.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const handleDuplicate = async (profile: GearProfile) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/gear-profiles/${profile.id}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: `${profile.name} (copy)` }),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/gear-profile/${data.id}` as any);
      }
    } catch (error) {
      console.error('Error duplicating profile:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to duplicate profile');
      } else {
        Alert.alert('Error', 'Failed to duplicate profile');
      }
    }
  };

  const handleToggleStatus = async (profile: GearProfile) => {
    const newStatus = profile.status === 'live' ? 'archived' : 'live';
    try {
      const response = await fetch(`${getApiUrl()}/api/gear-profiles/${profile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setProfiles(prev => prev.map(p => 
          p.id === profile.id ? { ...p, status: newStatus } : p
        ));
      }
    } catch (error) {
      console.error('Error updating profile status:', error);
    }
  };

  const renderProfileCard = (profile: GearProfile) => {
    const configLabel = CONFIG_TYPE_LABELS[profile.configType] || profile.configType;
    const TankIcon = getTankIcon(profile.configType);

    return (
      <Pressable
        key={profile.id}
        style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push(`/gear-profile/${profile.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.configIcon, { backgroundColor: colors.primary + '20' }]}>
            <TankIcon size={36} color={colors.primary} />
          </View>
          <View style={styles.cardTitleSection}>
            <Text style={[styles.profileName, { color: colors.text }]}>{profile.name}</Text>
            <Text style={[styles.configLabel, { color: colors.textSecondary }]}>{configLabel}</Text>
          </View>
          <View style={styles.cardActions}>
            <Pressable
              style={[styles.actionButton, { backgroundColor: colors.primary + '20' }]}
              onPress={(e) => {
                e.stopPropagation();
                handleDuplicate(profile);
              }}
            >
              <Feather name="copy" size={16} color={colors.primary} />
            </Pressable>
            <Pressable
              style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
              onPress={(e) => {
                e.stopPropagation();
                handleDelete(profile);
              }}
            >
              <Feather name="trash-2" size={16} color={colors.error} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

        <View style={styles.cardDetails}>
          {profile.suitType && (
            <View style={styles.detailRow}>
              <Feather name="thermometer" size={14} color={colors.textSecondary} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {profile.suitType}{profile.suitThickness ? ` (${profile.suitThickness})` : ''}
              </Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Feather name="database" size={14} color={colors.textSecondary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>
              {profile.cylinderCount} cylinder{profile.cylinderCount !== 1 ? 's' : ''}
            </Text>
          </View>
          {profile.totalWeight > 0 && (
            <View style={styles.detailRow}>
              <Feather name="anchor" size={14} color={colors.textSecondary} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                {formatWeight(profile.totalWeight)} total weight
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={[
            styles.statusBadge,
            { backgroundColor: profile.status === 'live' ? colors.success + '20' : colors.textSecondary + '20' }
          ]}
          onPress={(e) => {
            e.stopPropagation();
            handleToggleStatus(profile);
          }}
        >
          <Feather
            name={profile.status === 'live' ? 'check-circle' : 'archive'}
            size={12}
            color={profile.status === 'live' ? colors.success : colors.textSecondary}
          />
          <Text style={[
            styles.statusBadgeText,
            { color: profile.status === 'live' ? colors.success : colors.textSecondary }
          ]}>
            {profile.status === 'live' ? 'Live' : 'Archived'}
          </Text>
        </Pressable>
      </Pressable>
    );
  };

  return (
    <ThemedBackground>
      <PageHeader title="Gear Profiles" />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading profiles...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {profiles.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="tool" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Gear Profiles Yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Create your first gear profile to save your equipment configurations
              </Text>
              <Pressable
                style={[styles.createButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/gear-profile/new' as any)}
              >
                <Feather name="plus" size={18} color="#FFFFFF" />
                <Text style={styles.createButtonText}>Create Profile</Text>
              </Pressable>
            </View>
          ) : (
            profiles.map(renderProfileCard)
          )}
        </ScrollView>
      )}

      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/gear-profile/new' as any)}
      >
        <Feather name="plus" size={24} color="#FFFFFF" />
      </Pressable>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  menuButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  profileCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  configIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleSection: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
  },
  configLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDivider: {
    height: 1,
    marginVertical: 12,
  },
  cardDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
    marginTop: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 16,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
