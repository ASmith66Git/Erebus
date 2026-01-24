import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Platform, Linking, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { notificationService } from '@/services/notificationService';

interface RegisteredDevice {
  id: number;
  platform: string;
  device_name: string;
  is_active: boolean;
  created_at: string;
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [loading, setLoading] = useState(true);
  const [registeredDevices, setRegisteredDevices] = useState<RegisteredDevice[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [togglingPush, setTogglingPush] = useState(false);

  const checkPermissionStatus = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPermissionStatus('undetermined');
      setLoading(false);
      return;
    }

    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status as 'granted' | 'denied' | 'undetermined');
    setPushEnabled(status === 'granted');
    setLoading(false);
  }, []);

  const fetchRegisteredDevices = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/push-tokens`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setRegisteredDevices(Array.isArray(data) ? data : (data.devices || []));
      }
    } catch (error) {
      console.error('Error fetching registered devices:', error);
    }
  }, [token]);

  useEffect(() => {
    checkPermissionStatus();
    fetchRegisteredDevices();
  }, [checkPermissionStatus, fetchRegisteredDevices]);

  const handleEnableNotifications = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Push notifications are only available on mobile devices.');
      return;
    }

    setTogglingPush(true);
    
    try {
      if (permissionStatus === 'denied') {
        Alert.alert(
          'Notifications Disabled',
          'Please enable notifications in your device settings to receive alerts.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        setTogglingPush(false);
        return;
      }

      const result = await notificationService.initialize();
      
      if (result.permission === 'granted' && result.token && token) {
        await notificationService.registerTokenWithServer(token);
        await fetchRegisteredDevices();
        setPushEnabled(true);
        setPermissionStatus('granted');
      } else if (result.permission === 'denied') {
        setPermissionStatus('denied');
        Alert.alert(
          'Permission Denied',
          'Notifications permission was denied. You can enable it in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      Alert.alert('Error', 'Failed to enable notifications. Please try again.');
    } finally {
      setTogglingPush(false);
    }
  };

  const handleDisableNotifications = async () => {
    setTogglingPush(true);
    
    try {
      if (token) {
        await notificationService.unregisterTokenFromServer(token);
        await fetchRegisteredDevices();
      }
      setPushEnabled(false);
    } catch (error) {
      console.error('Error disabling notifications:', error);
      Alert.alert('Error', 'Failed to disable notifications. Please try again.');
    } finally {
      setTogglingPush(false);
    }
  };

  const handleTogglePush = async (value: boolean) => {
    if (value) {
      await handleEnableNotifications();
    } else {
      await handleDisableNotifications();
    }
  };

  const handleRemoveDevice = async (deviceId: number) => {
    Alert.alert(
      'Remove Device',
      'This device will no longer receive notifications. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${getApiUrl()}/api/push-tokens/${deviceId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              
              if (response.ok) {
                await fetchRegisteredDevices();
              }
            } catch (error) {
              console.error('Error removing device:', error);
            }
          },
        },
      ]
    );
  };

  const getPermissionStatusText = () => {
    switch (permissionStatus) {
      case 'granted':
        return 'Enabled';
      case 'denied':
        return 'Denied - Tap to open settings';
      default:
        return Platform.OS === 'web' ? 'Not available on web' : 'Not requested';
    }
  };

  const getPermissionStatusColor = () => {
    switch (permissionStatus) {
      case 'granted':
        return '#22C55E';
      case 'denied':
        return colors.primary;
      default:
        return colors.textSecondary;
    }
  };

  const getPlatformIcon = (platform: string): keyof typeof Ionicons.glyphMap => {
    switch (platform.toLowerCase()) {
      case 'ios':
        return 'phone-portrait-outline';
      case 'android':
        return 'phone-portrait-outline';
      default:
        return 'desktop-outline';
    }
  };

  if (loading) {
    return (
      <ThemedBackground>
        <PageHeader title="Notifications" showBack />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <PageHeader title="Notifications" showBack />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Push Notifications</Text>
          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            Receive alerts about support replies, dive reminders, and important updates
          </Text>
          
          <View style={[styles.settingRow, { borderTopColor: colors.border }]}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications-outline" size={24} color={colors.primary} />
              <View style={styles.settingText}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Enable Push Notifications</Text>
                <Text style={[styles.settingStatus, { color: getPermissionStatusColor() }]}>
                  {getPermissionStatusText()}
                </Text>
              </View>
            </View>
            {Platform.OS !== 'web' && (
              <Switch
                value={pushEnabled && permissionStatus === 'granted'}
                onValueChange={handleTogglePush}
                disabled={togglingPush}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={pushEnabled ? '#FFF' : '#F4F3F4'}
              />
            )}
          </View>

          {permissionStatus === 'denied' && Platform.OS !== 'web' && (
            <Pressable 
              style={[styles.openSettingsButton, { backgroundColor: colors.primary }]}
              onPress={() => Linking.openSettings()}
            >
              <Ionicons name="settings-outline" size={18} color="#FFF" />
              <Text style={styles.openSettingsText}>Open Device Settings</Text>
            </Pressable>
          )}
        </View>

        {Platform.OS !== 'web' && (
          <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Notification Types</Text>
            <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
              Types of notifications you'll receive
            </Text>
            
            <View style={styles.notificationTypes}>
              <View style={[styles.notificationType, { borderBottomColor: colors.border }]}>
                <Ionicons name="chatbubble-outline" size={22} color={colors.primary} />
                <View style={styles.notificationTypeText}>
                  <Text style={[styles.notificationTypeLabel, { color: colors.text }]}>Support Messages</Text>
                  <Text style={[styles.notificationTypeDesc, { color: colors.textSecondary }]}>
                    Replies to your support tickets
                  </Text>
                </View>
              </View>
              
              <View style={[styles.notificationType, { borderBottomColor: colors.border }]}>
                <Ionicons name="time-outline" size={22} color={colors.primary} />
                <View style={styles.notificationTypeText}>
                  <Text style={[styles.notificationTypeLabel, { color: colors.text }]}>Dive Reminders</Text>
                  <Text style={[styles.notificationTypeDesc, { color: colors.textSecondary }]}>
                    Upcoming dive trip alerts
                  </Text>
                </View>
              </View>
              
              <View style={[styles.notificationType, { borderBottomColor: 'transparent' }]}>
                <Ionicons name="sync-outline" size={22} color={colors.primary} />
                <View style={styles.notificationTypeText}>
                  <Text style={[styles.notificationTypeLabel, { color: colors.text }]}>Sync Updates</Text>
                  <Text style={[styles.notificationTypeDesc, { color: colors.textSecondary }]}>
                    Dive log sync status notifications
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {registeredDevices.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Registered Devices</Text>
            <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
              Devices that receive push notifications
            </Text>
            
            {registeredDevices.map((device, index) => (
              <View 
                key={device.id} 
                style={[
                  styles.deviceRow, 
                  { borderBottomColor: index < registeredDevices.length - 1 ? colors.border : 'transparent' }
                ]}
              >
                <View style={styles.deviceInfo}>
                  <Ionicons name={getPlatformIcon(device.platform)} size={24} color={colors.textSecondary} />
                  <View style={styles.deviceText}>
                    <Text style={[styles.deviceName, { color: colors.text }]}>
                      {device.device_name || 'Unknown Device'}
                    </Text>
                    <Text style={[styles.devicePlatform, { color: colors.textSecondary }]}>
                      {device.platform.charAt(0).toUpperCase() + device.platform.slice(1)}
                      {device.is_active ? '' : ' (Inactive)'}
                    </Text>
                  </View>
                </View>
                <Pressable 
                  onPress={() => handleRemoveDevice(device.id)}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.primary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {Platform.OS === 'web' && (
          <View style={[styles.infoCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Push notifications are available on the Erebus mobile app for iOS and Android. Download the app to receive real-time alerts.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingStatus: {
    fontSize: 13,
    marginTop: 2,
  },
  openSettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  openSettingsText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  notificationTypes: {
    marginTop: 8,
  },
  notificationType: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  notificationTypeText: {
    marginLeft: 12,
    flex: 1,
  },
  notificationTypeLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  notificationTypeDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceText: {
    marginLeft: 12,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '500',
  },
  devicePlatform: {
    fontSize: 13,
    marginTop: 2,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
