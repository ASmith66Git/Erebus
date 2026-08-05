import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

interface Backup {
  key: string;
  size: number;
  createdAt: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function filenameFromKey(key: string) {
  return key.split('/').pop() ?? key;
}

export default function AdminBackupScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();

  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  // Two-step restore confirmation modal
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<Backup | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const CONFIRM_WORD = 'RESTORE';

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/backups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups);
      }
    } catch (err) {
      console.error('Failed to fetch backups:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  // ── Manual backup ──────────────────────────────────────────────────────────
  const handleBackup = async () => {
    Alert.alert(
      'Create Backup',
      'This will snapshot the entire database to S3. It may take a few seconds.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create Backup',
          onPress: async () => {
            setBackingUp(true);
            try {
              const res = await fetch(`${getApiUrl()}/api/admin/backup`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
              const data = await res.json();
              if (res.ok) {
                Alert.alert('Backup Complete', `Saved to S3:\n${filenameFromKey(data.key)}`);
                await fetchBackups();
              } else {
                Alert.alert('Backup Failed', data.error || 'Unknown error');
              }
            } catch (err: any) {
              Alert.alert('Backup Failed', err.message);
            } finally {
              setBackingUp(false);
            }
          },
        },
      ],
    );
  };

  // ── Step 1: first warning alert ────────────────────────────────────────────
  const handleRestorePress = (backup: Backup) => {
    Alert.alert(
      '⚠️ Warning — Destructive Action',
      `Restoring a backup will:\n\n• Delete ALL current data in the database\n• Replace it with the snapshot from ${formatDate(backup.createdAt)}\n• This CANNOT be undone\n\nAny data added since that backup will be permanently lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I understand — continue',
          style: 'destructive',
          onPress: () => {
            // Step 2: show confirmation modal requiring typed word
            setPendingRestore(backup);
            setConfirmText('');
            setConfirmModalVisible(true);
          },
        },
      ],
    );
  };

  // ── Step 2: typed-confirmation modal ──────────────────────────────────────
  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    setConfirmModalVisible(false);
    setRestoringKey(pendingRestore.key);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/restore`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: pendingRestore.key }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert(
          '✅ Restore Complete',
          `Database restored from:\n${formatDate(data.backupCreatedAt)}`,
        );
        await fetchBackups();
      } else {
        Alert.alert('Restore Failed', data.error || 'Unknown error');
      }
    } catch (err: any) {
      Alert.alert('Restore Failed', err.message);
    } finally {
      setRestoringKey(null);
      setPendingRestore(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ThemedBackground>
      <SafeAreaView style={styles.container} edges={['top']}>
        <PageHeader title="Database Backups" />

        <ScrollView
          style={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchBackups(); }}
              tintColor={colors.primary}
            />
          }
        >
          {/* Info banner */}
          <View style={[styles.infoCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.text }]}>
              Backups run automatically every day at 02:00 UTC. Up to 30 backups are kept.
              You can also trigger a manual backup below.
            </Text>
          </View>

          {/* Manual backup button */}
          <Pressable
            style={[styles.backupButton, { backgroundColor: colors.primary }, backingUp && styles.buttonDisabled]}
            onPress={handleBackup}
            disabled={backingUp}
          >
            {backingUp ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
            )}
            <Text style={styles.backupButtonText}>
              {backingUp ? 'Creating Backup…' : 'Create Manual Backup'}
            </Text>
          </Pressable>

          {/* Restore warning notice */}
          <View style={[styles.warningCard, { backgroundColor: '#FF3B3015', borderColor: '#FF3B3040' }]}>
            <Ionicons name="warning-outline" size={18} color="#FF3B30" />
            <Text style={[styles.warningText, { color: colors.text }]}>
              Restoring a backup permanently deletes all current data. A two-step
              confirmation is required before any restore can proceed.
            </Text>
          </View>

          {/* Backup list */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            AVAILABLE BACKUPS ({backups.length})
          </Text>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
          ) : backups.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Ionicons name="archive-outline" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No backups yet</Text>
            </View>
          ) : (
            backups.map((backup) => {
              const isRestoring = restoringKey === backup.key;
              return (
                <View
                  key={backup.key}
                  style={[styles.backupRow, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                >
                  <View style={styles.backupInfo}>
                    <Ionicons name="archive-outline" size={22} color={colors.primary} />
                    <View style={styles.backupMeta}>
                      <Text style={[styles.backupDate, { color: colors.text }]}>
                        {formatDate(backup.createdAt)}
                      </Text>
                      <Text style={[styles.backupFilename, { color: colors.textSecondary }]} numberOfLines={1}>
                        {filenameFromKey(backup.key)}
                      </Text>
                      <Text style={[styles.backupSize, { color: colors.textSecondary }]}>
                        {formatBytes(backup.size)}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    style={[
                      styles.restoreButton,
                      { borderColor: '#FF3B30' },
                      isRestoring && styles.buttonDisabled,
                    ]}
                    onPress={() => handleRestorePress(backup)}
                    disabled={isRestoring || restoringKey !== null}
                  >
                    {isRestoring ? (
                      <ActivityIndicator size="small" color="#FF3B30" />
                    ) : (
                      <Ionicons name="arrow-undo-outline" size={15} color="#FF3B30" />
                    )}
                    <Text style={[styles.restoreText, { color: '#FF3B30' }]}>
                      {isRestoring ? 'Restoring…' : 'Restore'}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ── Step 2 confirmation modal ── */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.cardBackground, borderColor: '#FF3B30' }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="alert-circle" size={28} color="#FF3B30" />
              <Text style={[styles.modalTitle, { color: '#FF3B30' }]}>Final Confirmation</Text>
            </View>

            <Text style={[styles.modalBody, { color: colors.text }]}>
              You are about to restore the database to:
            </Text>
            {pendingRestore && (
              <Text style={[styles.modalDate, { color: colors.primary }]}>
                {formatDate(pendingRestore.createdAt)}
              </Text>
            )}
            <Text style={[styles.modalBody, { color: colors.text, marginTop: 8 }]}>
              All current data will be <Text style={{ color: '#FF3B30', fontWeight: '700' }}>permanently deleted</Text>.
              This cannot be undone.
            </Text>

            <Text style={[styles.modalPrompt, { color: colors.textSecondary }]}>
              Type <Text style={{ color: '#FF3B30', fontWeight: '700' }}>{CONFIRM_WORD}</Text> to enable the restore button:
            </Text>

            <TextInput
              style={[styles.confirmInput, { borderColor: confirmText === CONFIRM_WORD ? '#FF3B30' : colors.border, color: colors.text, backgroundColor: colors.surface }]}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={CONFIRM_WORD}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setConfirmModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalRestoreBtn,
                  confirmText !== CONFIRM_WORD && styles.modalRestoreBtnDisabled,
                ]}
                onPress={handleConfirmRestore}
                disabled={confirmText !== CONFIRM_WORD}
              >
                <Ionicons name="arrow-undo-outline" size={16} color="#fff" />
                <Text style={styles.modalRestoreText}>Restore Now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
  },
  warningText: { flex: 1, fontSize: 13, lineHeight: 18 },
  backupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  backupButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    padding: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  emptyText: { fontSize: 14 },
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 8,
  },
  backupInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  backupMeta: { flex: 1, gap: 2 },
  backupDate: { fontSize: 13, fontWeight: '500' },
  backupFilename: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  backupSize: { fontSize: 11 },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    minWidth: 80,
    justifyContent: 'center',
  },
  restoreText: { fontSize: 13, fontWeight: '600' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 2,
    padding: 24,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { fontSize: 14, lineHeight: 20 },
  modalDate: { fontSize: 15, fontWeight: '600' },
  modalPrompt: { fontSize: 13, marginTop: 4 },
  confirmInput: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '500' },
  modalRestoreBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
  },
  modalRestoreBtnDisabled: { backgroundColor: '#FF3B3060' },
  modalRestoreText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
