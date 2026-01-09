import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '@/contexts/SyncContext';
import { useTheme } from '@/contexts/ThemeContext';

interface SyncStatusBadgeProps {
  compact?: boolean;
  onPress?: () => void;
}

export default function SyncStatusBadge({ compact = false, onPress }: SyncStatusBadgeProps) {
  const { isSyncing, isOnline, pendingChanges, lastSyncTime, triggerSync } = useSync();
  const { colors } = useTheme();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (isOnline && !isSyncing) {
      triggerSync();
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return '#FF6B6B';
    if (isSyncing) return '#4ECDC4';
    if (pendingChanges > 0) return '#FFE66D';
    return '#2ECC71';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (isSyncing) return 'Syncing...';
    if (pendingChanges > 0) return `${pendingChanges} pending`;
    return 'Synced';
  };

  const getIconName = (): keyof typeof Ionicons.glyphMap => {
    if (!isOnline) return 'cloud-offline-outline';
    if (isSyncing) return 'sync-outline';
    if (pendingChanges > 0) return 'cloud-upload-outline';
    return 'cloud-done-outline';
  };

  if (compact) {
    return (
      <Pressable onPress={handlePress} style={styles.compactContainer}>
        {isSyncing ? (
          <ActivityIndicator size="small" color={getStatusColor()} />
        ) : (
          <Ionicons name={getIconName()} size={20} color={getStatusColor()} />
        )}
      </Pressable>
    );
  }

  return (
    <Pressable 
      onPress={handlePress} 
      style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.indicator, { backgroundColor: getStatusColor() }]} />
      
      {isSyncing ? (
        <ActivityIndicator size="small" color={getStatusColor()} style={styles.icon} />
      ) : (
        <Ionicons name={getIconName()} size={18} color={getStatusColor()} style={styles.icon} />
      )}
      
      <Text style={[styles.text, { color: colors.text }]}>{getStatusText()}</Text>
      
      {isOnline && !isSyncing && pendingChanges === 0 && lastSyncTime && (
        <Text style={[styles.subtext, { color: colors.textSecondary }]}>
          {formatLastSync(lastSyncTime)}
        </Text>
      )}
    </Pressable>
  );
}

function formatLastSync(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  compactContainer: {
    padding: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  icon: {
    marginRight: 2,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
  },
  subtext: {
    fontSize: 11,
    marginLeft: 4,
  },
});
