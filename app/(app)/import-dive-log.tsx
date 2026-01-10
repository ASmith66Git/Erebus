import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import * as DocumentPicker from 'expo-document-picker';

interface DiveComputerCapabilities {
  brand: { id: string; name: string } | null;
  model: {
    id: string;
    name: string;
    has_ble: boolean;
    export_formats: string[];
    note?: string;
  } | null;
}

export default function ImportDiveLogScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [capabilities, setCapabilities] = useState<DiveComputerCapabilities | null>(null);
  const [loadingCapabilities, setLoadingCapabilities] = useState(true);

  const hasBleSupport = capabilities?.model?.has_ble === true;
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    loadDiveComputerCapabilities();
  }, []);

  const loadDiveComputerCapabilities = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/user/dive-computer`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setCapabilities(data.capabilities);
    } catch (error) {
      console.error('Error loading dive computer capabilities:', error);
    } finally {
      setLoadingCapabilities(false);
    }
  };

  const handleBluetoothConnect = () => {
    router.push('/ble-connect');
  };

  const handleWebFileSelect = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);

      const uploadResponse = await fetch(`${getApiUrl()}/api/dive-logs/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(data.error || 'Import failed');
      }

      const importedCount = data.dives?.length || 0;
      alert(`Imported ${importedCount} dive${importedCount !== 1 ? 's' : ''} from ${file.name}`);
      router.back();
    } catch (error: any) {
      alert(`Import Error: ${error.message || 'Failed to import dive logs'}`);
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const handleImportFile = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '*/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e) => {
        handleWebFileSelect(e);
        document.body.removeChild(input);
      };
      input.click();
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const file = result.assets[0];
      setImporting(true);

      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream',
      } as any);

      const uploadResponse = await fetch(`${getApiUrl()}/api/dive-logs/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(data.error || 'Import failed');
      }

      const importedCount = data.dives?.length || 0;
      Alert.alert('Import Successful', `Imported ${importedCount} dive${importedCount !== 1 ? 's' : ''} from ${file.name}`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Alert.alert('Import Error', error.message || 'Failed to import dive logs');
    } finally {
      setImporting(false);
    }
  };

  const handleManualEntry = () => {
    router.push('/manual-dive-entry');
  };

  const getImportGuidance = () => {
    if (!capabilities?.brand || !capabilities?.model) {
      return "Set up your dive computer in Profile settings to get personalized import guidance.";
    }
    
    const model = capabilities.model;
    const formats = model.export_formats?.join(', ') || 'Unknown formats';
    
    if (model.has_ble) {
      return `Your ${capabilities.brand.name} ${model.name} supports Bluetooth sync! You can also export ${formats} files from your computer's software.`;
    }
    
    return `Export dive logs from your ${capabilities.brand.name} software as ${formats}, then import here.`;
  };

  if (loadingCapabilities) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Add Dive Log</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Choose how you'd like to add your dive data
        </Text>

        <View style={styles.optionsContainer}>
          {hasBleSupport && !isWeb && (
            <Pressable
              style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={handleBluetoothConnect}
            >
              <View style={[styles.optionIcon, { backgroundColor: '#3B82F620' }]}>
                <Feather name="bluetooth" size={32} color="#3B82F6" />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  Connect via Bluetooth
                </Text>
                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                  Sync directly from your {capabilities?.brand?.name} {capabilities?.model?.name}
                </Text>
              </View>
              <Feather name="chevron-right" size={24} color={colors.textSecondary} />
            </Pressable>
          )}

          {hasBleSupport && isWeb && (
            <View style={[styles.optionCard, styles.disabledCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.optionIcon, { backgroundColor: '#9CA3AF20' }]}>
                <Feather name="bluetooth" size={32} color="#9CA3AF" />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, { color: colors.textSecondary }]}>
                  Connect via Bluetooth
                </Text>
                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                  Bluetooth sync requires the native mobile app
                </Text>
              </View>
            </View>
          )}

          <Pressable
            style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleImportFile}
            disabled={importing}
          >
            <View style={[styles.optionIcon, { backgroundColor: colors.primary + '20' }]}>
              {importing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="upload" size={32} color={colors.primary} />
              )}
            </View>
            <View style={styles.optionContent}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                Import from File
              </Text>
              <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                Upload UDDF, Subsurface XML, or CSV files
              </Text>
            </View>
            <Feather name="chevron-right" size={24} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleManualEntry}
          >
            <View style={[styles.optionIcon, { backgroundColor: '#10B98120' }]}>
              <Feather name="edit-3" size={32} color="#10B981" />
            </View>
            <View style={styles.optionContent}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                Manual Entry
              </Text>
              <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                Log a dive manually with details
              </Text>
            </View>
            <Feather name="chevron-right" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={[styles.guidanceBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="info" size={16} color={colors.textSecondary} />
          <Text style={[styles.guidanceText, { color: colors.textSecondary }]}>
            {getImportGuidance()}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  optionsContainer: {
    gap: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
  },
  disabledCard: {
    opacity: 0.6,
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  guidanceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  guidanceText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
