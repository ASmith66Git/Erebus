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
  FlatList,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';
import * as DocumentPicker from 'expo-document-picker';
import ThemedBackground from '@/components/ThemedBackground';
import { useTranslation } from 'react-i18next';

interface BatchUploadResult {
  fileName: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  divesImported?: number;
  error?: string;
}

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

interface UserDiveComputer {
  id: number;
  brand: string;
  model: string;
  nickname: string | null;
  capabilities: DiveComputerCapabilities | null;
}

export default function ImportDiveLogScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [userComputers, setUserComputers] = useState<UserDiveComputer[]>([]);
  const [selectedComputer, setSelectedComputer] = useState<UserDiveComputer | null>(null);
  const [loadingCapabilities, setLoadingCapabilities] = useState(true);
  const [batchResults, setBatchResults] = useState<BatchUploadResult[]>([]);
  const [showBatchResults, setShowBatchResults] = useState(false);
  const [showComputerPicker, setShowComputerPicker] = useState(false);

  const capabilities = selectedComputer?.capabilities || null;
  const hasBleSupport = capabilities?.model?.has_ble === true;
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    loadUserComputers();
  }, []);

  const loadUserComputers = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/user/dive-computers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      const computers: UserDiveComputer[] = data.computers || [];
      setUserComputers(computers);
      if (computers.length === 1) {
        setSelectedComputer(computers[0]);
      }
    } catch (error) {
      console.error('Error loading user dive computers:', error);
    } finally {
      setLoadingCapabilities(false);
    }
  };

  const handleBluetoothConnect = () => {
    if (requiresComputerSelection) {
      promptComputerSelection();
      return;
    }
    router.push('/ble-connect');
  };

  const uploadSingleFile = async (file: File | { uri: string; name: string; type: string }): Promise<{ divesImported: number; error?: string }> => {
    try {
      const formData = new FormData();
      if ('uri' in file) {
        formData.append('file', file as any);
      } else {
        formData.append('file', file, file.name);
      }

      const importUrl = selectedComputer
        ? `${getApiUrl()}/api/dive-logs/import?user_dive_computer_id=${selectedComputer.id}`
        : `${getApiUrl()}/api/dive-logs/import`;

      const uploadResponse = await fetch(importUrl, {
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

      return { divesImported: data.dives?.length || 0 };
    } catch (error: any) {
      return { divesImported: 0, error: error.message || 'Import failed' };
    }
  };

  const requiresComputerSelection = userComputers.length > 1 && !selectedComputer;

  const promptComputerSelection = () => {
    if (Platform.OS === 'web') {
      alert(t('importDiveLog.selectComputerFirst'));
    } else {
      Alert.alert(t('importDiveLog.selectComputer'), t('importDiveLog.selectComputerFirst'));
    }
    setShowComputerPicker(true);
  };

  const handleWebFileSelect = async (event: any) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files) as File[];
    
    if (fileArray.length === 1) {
      setImporting(true);
      const result = await uploadSingleFile(fileArray[0]);
      setImporting(false);
      
      if (result.error) {
        alert(`${t('importDiveLog.importErrorTitle')}: ${result.error}`);
      } else {
        alert(t('importDiveLog.importedFromFile', { count: result.divesImported, fileName: fileArray[0].name }));
        router.back();
      }
      event.target.value = '';
      return;
    }
    
    setImporting(true);
    setShowBatchResults(true);
    const results: BatchUploadResult[] = fileArray.map(f => ({
      fileName: f.name,
      status: 'pending' as const,
    }));
    setBatchResults(results);
    
    let totalDives = 0;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < fileArray.length; i++) {
      setBatchResults(prev => prev.map((r, idx) => 
        idx === i ? { ...r, status: 'uploading' } : r
      ));
      
      const result = await uploadSingleFile(fileArray[i]);
      
      setBatchResults(prev => prev.map((r, idx) => 
        idx === i ? {
          ...r,
          status: result.error ? 'error' : 'success',
          divesImported: result.divesImported,
          error: result.error,
        } : r
      ));
      
      if (result.error) {
        errorCount++;
      } else {
        successCount++;
        totalDives += result.divesImported;
      }
    }
    
    setImporting(false);
    event.target.value = '';
    
    setTimeout(() => {
      alert(`${t('importDiveLog.batchImportComplete')}\n\n${t('importDiveLog.batchSuccessSummary', { successCount, totalDives })}${errorCount > 0 ? `\n${t('importDiveLog.batchErrorSummary', { errorCount })}` : ''}`);
      router.back();
    }, 500);
  };

  const handleImportFile = async () => {
    if (requiresComputerSelection) {
      promptComputerSelection();
      return;
    }

    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.uddf,.xml,.csv,.ssrf,.zip,.log,.txt,application/xml,application/octet-stream';
      input.multiple = true;
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
        multiple: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const files = result.assets;
      
      if (files.length === 1) {
        const file = files[0];
        setImporting(true);
        
        const result = await uploadSingleFile({
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
        });
        
        setImporting(false);
        
        if (result.error) {
          Alert.alert(t('importDiveLog.importErrorTitle'), result.error);
        } else {
          Alert.alert(t('importDiveLog.importSuccessful'), t('importDiveLog.importedFromFile', { count: result.divesImported, fileName: file.name }), [
            { text: t('common.ok'), onPress: () => router.back() }
          ]);
        }
        return;
      }
      
      setImporting(true);
      setShowBatchResults(true);
      const results: BatchUploadResult[] = files.map(f => ({
        fileName: f.name,
        status: 'pending' as const,
      }));
      setBatchResults(results);
      
      let totalDives = 0;
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < files.length; i++) {
        setBatchResults(prev => prev.map((r, idx) => 
          idx === i ? { ...r, status: 'uploading' } : r
        ));
        
        const file = files[i];
        const result = await uploadSingleFile({
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
        });
        
        setBatchResults(prev => prev.map((r, idx) => 
          idx === i ? {
            ...r,
            status: result.error ? 'error' : 'success',
            divesImported: result.divesImported,
            error: result.error,
          } : r
        ));
        
        if (result.error) {
          errorCount++;
        } else {
          successCount++;
          totalDives += result.divesImported;
        }
      }
      
      setImporting(false);
      
      Alert.alert(
        t('importDiveLog.batchImportComplete'),
        `${t('importDiveLog.batchSuccessSummary', { successCount, totalDives })}${errorCount > 0 ? `\n${t('importDiveLog.batchErrorSummary', { errorCount })}` : ''}`,
        [{ text: t('common.ok'), onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert(t('importDiveLog.importErrorTitle'), error.message || t('importDiveLog.importError'));
      setImporting(false);
    }
  };

  const handleManualEntry = () => {
    router.push('/manual-dive-entry');
  };

  const getImportGuidance = () => {
    if (!capabilities?.brand || !capabilities?.model) {
      return t('importDiveLog.setupGuidance');
    }
    
    const model = capabilities.model;
    const formats = model.export_formats?.join(', ') || 'Unknown formats';
    
    if (model.has_ble) {
      return t('importDiveLog.bleImportGuidance', { brand: capabilities.brand.name, model: model.name, formats });
    }
    
    return t('importDiveLog.fileImportGuidance', { brand: capabilities.brand.name, formats });
  };

  const getComputerDisplayName = (computer: UserDiveComputer) => {
    const brandName = computer.capabilities?.brand?.name || computer.brand;
    const modelName = computer.capabilities?.model?.name || computer.model;
    return `${brandName} ${modelName}`;
  };

  if (loadingCapabilities) {
    return (
      <ThemedBackground style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{t('importDiveLog.addDiveLog')}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('importDiveLog.chooseHowToAdd')}
        </Text>

        {userComputers.length > 1 && (
          <Pressable
            style={[styles.computerSelector, { backgroundColor: colors.surface, borderColor: selectedComputer ? colors.primary : colors.border }]}
            onPress={() => setShowComputerPicker(true)}
          >
            <View style={[styles.computerSelectorIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="hardware-chip-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.computerSelectorLabel, { color: colors.textSecondary }]}>
                {t('importDiveLog.importingWith')}
              </Text>
              <Text style={[styles.computerSelectorValue, { color: colors.text }]}>
                {selectedComputer ? getComputerDisplayName(selectedComputer) : t('importDiveLog.selectComputer')}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
          </Pressable>
        )}

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
                  {t('importDiveLog.connectViaBluetooth')}
                </Text>
                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                  {t('importDiveLog.syncFromComputer', { brand: capabilities?.brand?.name, model: capabilities?.model?.name })}
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
                  {t('importDiveLog.connectViaBluetooth')}
                </Text>
                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                  {t('importDiveLog.bluetoothRequiresNative')}
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
              {importing && !showBatchResults ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="upload" size={32} color={colors.primary} />
              )}
            </View>
            <View style={styles.optionContent}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                {t('importDiveLog.importFromFile')}
              </Text>
              <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                {t('importDiveLog.importFromFileDesc')}
              </Text>
            </View>
            <Feather name="chevron-right" size={24} color={colors.textSecondary} />
          </Pressable>

          {showBatchResults && batchResults.length > 0 && (
            <View style={[styles.batchResultsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.batchHeader}>
                <Ionicons name="documents-outline" size={20} color={colors.primary} />
                <Text style={[styles.batchTitle, { color: colors.text }]}>
                  {t('importDiveLog.batchImportProgress')}
                </Text>
                {!importing && (
                  <Pressable onPress={() => { setShowBatchResults(false); setBatchResults([]); }}>
                    <Ionicons name="close-circle" size={22} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>
              {batchResults.map((result, index) => (
                <View key={index} style={[styles.batchResultRow, { borderTopColor: colors.border }]}>
                  <View style={styles.batchResultIcon}>
                    {result.status === 'pending' && (
                      <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                    )}
                    {result.status === 'uploading' && (
                      <ActivityIndicator size="small" color={colors.primary} />
                    )}
                    {result.status === 'success' && (
                      <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    )}
                    {result.status === 'error' && (
                      <Ionicons name="close-circle" size={18} color="#EF4444" />
                    )}
                  </View>
                  <View style={styles.batchResultContent}>
                    <Text style={[styles.batchFileName, { color: colors.text }]} numberOfLines={1}>
                      {result.fileName}
                    </Text>
                    {result.status === 'success' && (
                      <Text style={[styles.batchResultText, { color: '#10B981' }]}>
                        {t('importDiveLog.divesImportedCount', { count: result.divesImported })}
                      </Text>
                    )}
                    {result.status === 'error' && (
                      <Text style={[styles.batchResultText, { color: '#EF4444' }]} numberOfLines={1}>
                        {result.error}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          <Pressable
            style={[styles.optionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleManualEntry}
          >
            <View style={[styles.optionIcon, { backgroundColor: '#10B98120' }]}>
              <Feather name="edit-3" size={32} color="#10B981" />
            </View>
            <View style={styles.optionContent}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                {t('importDiveLog.manualEntry')}
              </Text>
              <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                {t('importDiveLog.manualEntryDesc')}
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

      <Modal
        visible={showComputerPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowComputerPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('importDiveLog.selectComputer')}</Text>
              <Pressable onPress={() => setShowComputerPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {userComputers.map((computer) => (
                <Pressable
                  key={computer.id}
                  style={[
                    styles.computerPickerItem,
                    { borderBottomColor: colors.border },
                    selectedComputer?.id === computer.id && { backgroundColor: colors.primary + '20' }
                  ]}
                  onPress={() => {
                    setSelectedComputer(computer);
                    setShowComputerPicker(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.computerPickerName, { color: colors.text }]}>
                      {getComputerDisplayName(computer)}
                    </Text>
                    <View style={styles.computerPickerBadge}>
                      <Ionicons
                        name={computer.capabilities?.model?.has_ble ? 'bluetooth' : 'document-outline'}
                        size={12}
                        color={computer.capabilities?.model?.has_ble ? '#10B981' : '#F59200'}
                      />
                      <Text style={{ fontSize: 12, color: computer.capabilities?.model?.has_ble ? '#10B981' : '#F59200' }}>
                        {computer.capabilities?.model?.has_ble
                          ? t('profile.bluetoothSyncSupported')
                          : t('profile.fileImportOnly')}
                      </Text>
                    </View>
                  </View>
                  {selectedComputer?.id === computer.id && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedBackground>
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
  batchResultsCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 8,
  },
  batchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  batchTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  batchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
  },
  batchResultIcon: {
    width: 24,
    alignItems: 'center',
  },
  batchResultContent: {
    flex: 1,
    gap: 2,
  },
  batchFileName: {
    fontSize: 13,
    fontWeight: '500',
  },
  batchResultText: {
    fontSize: 12,
  },
  computerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
    marginBottom: 20,
  },
  computerSelectorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  computerSelectorLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  computerSelectorValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalScroll: {
    paddingHorizontal: 16,
  },
  computerPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  computerPickerName: {
    fontSize: 16,
    fontWeight: '500',
  },
  computerPickerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
});
