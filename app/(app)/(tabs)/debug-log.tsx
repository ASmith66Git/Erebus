import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useTheme } from '@/contexts/ThemeContext';
import { errorLogger, LogEntry, LogLevel } from '@/services/errorLogger';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '#888888',
  info: '#3498db',
  warn: '#f39c12',
  error: '#e74c3c',
};

export default function DebugLogScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const loadLogs = useCallback(() => {
    const allLogs = errorLogger.getLogs();
    setLogs(filter === 'all' ? allLogs : allLogs.filter(l => l.level === filter));
  }, [filter]);

  useEffect(() => {
    loadLogs();
    const unsubscribe = errorLogger.subscribe(loadLogs);
    return unsubscribe;
  }, [loadLogs]);

  const handleClear = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to clear all logs?')) {
        await errorLogger.clearLogs();
        setLogs([]);
      }
    } else {
      Alert.alert(
        'Clear Logs',
        'Are you sure you want to clear all logs?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear',
            style: 'destructive',
            onPress: async () => {
              await errorLogger.clearLogs();
              setLogs([]);
            },
          },
        ]
      );
    }
  };

  const handleShare = async () => {
    try {
      const exported = errorLogger.exportLogs();
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(exported);
        Alert.alert('Copied', 'Logs copied to clipboard');
      } else {
        await Share.share({
          message: exported,
          title: 'Erebus Debug Logs',
        });
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to share logs');
    }
  };

  const handleDownloadToFile = async () => {
    try {
      const exported = errorLogger.exportLogs();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `erebus-logs-${timestamp}.txt`;
      
      if (Platform.OS === 'web') {
        // Web: Create a download link
        const blob = new Blob([exported], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert('Downloaded', `Logs saved as ${filename}`);
      } else {
        // Native: Save to Downloads folder and share
        const fileUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, exported, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        
        // Check if sharing is available
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/plain',
            dialogTitle: 'Save Debug Logs',
            UTI: 'public.plain-text',
          });
        } else {
          Alert.alert('Saved', `Logs saved to: ${fileUri}`);
        }
      }
    } catch (e: any) {
      console.error('Failed to download logs:', e);
      Alert.alert('Error', `Failed to save logs: ${e?.message || 'Unknown error'}`);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString() + '.' + date.getMilliseconds().toString().padStart(3, '0');
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString();
  };

  const filterButtons: { label: string; value: LogLevel | 'all' }[] = [
    { label: 'All', value: 'all' },
    { label: 'Error', value: 'error' },
    { label: 'Warn', value: 'warn' },
    { label: 'Info', value: 'info' },
    { label: 'Debug', value: 'debug' },
  ];

  return (
    <ThemedBackground>
      <PageHeader 
        title="Debug Logs" 
        rightAction={
          <View style={styles.headerActions}>
            <Pressable onPress={handleDownloadToFile} style={styles.actionButton}>
              <Ionicons name="download-outline" size={22} color={colors.primary} />
            </Pressable>
            <Pressable onPress={handleShare} style={styles.actionButton}>
              <Ionicons name="share-outline" size={22} color={colors.primary} />
            </Pressable>
            <Pressable onPress={handleClear} style={styles.actionButton}>
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </Pressable>
          </View>
        }
      />

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {filterButtons.map(btn => (
            <Pressable
              key={btn.value}
              style={[
                styles.filterButton,
                {
                  backgroundColor: filter === btn.value ? colors.primary : colors.cardBackground,
                  borderColor: filter === btn.value ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilter(btn.value)}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: filter === btn.value ? '#FFFFFF' : colors.text },
                ]}
              >
                {btn.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <Text style={[styles.logCount, { color: colors.textSecondary }]}>
        {logs.length} log{logs.length !== 1 ? 's' : ''}
        {filter !== 'all' && ` (filtered by ${filter})`}
      </Text>

      <ScrollView style={styles.logList} contentContainerStyle={styles.logListContent}>
        {logs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No logs to display
            </Text>
          </View>
        ) : (
          logs.map((log, index) => {
            const isExpanded = expandedIds.has(log.id);
            const showDateHeader = index === 0 || 
              formatDate(logs[index - 1].timestamp) !== formatDate(log.timestamp);

            return (
              <React.Fragment key={log.id}>
                {showDateHeader && (
                  <Text style={[styles.dateHeader, { color: colors.textSecondary }]}>
                    {formatDate(log.timestamp)}
                  </Text>
                )}
                <Pressable
                  style={[
                    styles.logEntry,
                    {
                      backgroundColor: colors.cardBackground,
                      borderColor: colors.border,
                      borderLeftColor: LOG_COLORS[log.level],
                    },
                  ]}
                  onPress={() => toggleExpand(log.id)}
                >
                  <View style={styles.logHeader}>
                    <View style={styles.logMeta}>
                      <View style={[styles.levelBadge, { backgroundColor: LOG_COLORS[log.level] + '20' }]}>
                        <Text style={[styles.levelText, { color: LOG_COLORS[log.level] }]}>
                          {log.level.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
                        {formatTime(log.timestamp)}
                      </Text>
                      {log.source && (
                        <Text style={[styles.source, { color: colors.textSecondary }]}>
                          [{log.source}]
                        </Text>
                      )}
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </View>
                  <Text
                    style={[styles.logMessage, { color: colors.text }]}
                    numberOfLines={isExpanded ? undefined : 2}
                  >
                    {log.message}
                  </Text>
                  {isExpanded && log.details && (
                    <View style={[styles.detailsBox, { backgroundColor: colors.background }]}>
                      <Text style={[styles.detailsText, { color: colors.textSecondary }]}>
                        {log.details}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </React.Fragment>
            );
          })
        )}
      </ScrollView>
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
    paddingVertical: 12,
    paddingTop: 50,
    borderBottomWidth: 1,
  },
  menuButton: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  filterRow: {
    paddingVertical: 12,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
  },
  logCount: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 13,
  },
  logList: {
    flex: 1,
  },
  logListContent: {
    padding: 16,
    paddingTop: 0,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
  },
  dateHeader: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  logEntry: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: 8,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  logMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  source: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  logMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  detailsBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 4,
  },
  detailsText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
