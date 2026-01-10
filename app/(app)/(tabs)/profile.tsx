import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Modal, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

interface Manufacturer {
  id: string;
  name: string;
}

interface DiveComputerModel {
  id: string;
  name: string;
  has_ble: boolean;
  note?: string;
}

interface DiveComputerCapabilities {
  brand: { id: string; name: string };
  model: {
    id: string;
    name: string;
    has_ble: boolean;
    export_formats: string[];
    note?: string;
  };
}

export default function ProfileScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout, isAdmin, token } = useAuth();
  
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [models, setModels] = useState<DiveComputerModel[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<DiveComputerCapabilities | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  useEffect(() => {
    loadManufacturers();
    loadUserDiveComputer();
  }, []);

  useEffect(() => {
    if (selectedBrand) {
      loadModels(selectedBrand);
    } else {
      setModels([]);
    }
  }, [selectedBrand]);

  const loadManufacturers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/dive-computers`);
      const data = await response.json();
      setManufacturers(data.manufacturers || []);
    } catch (error) {
      console.error('Error loading manufacturers:', error);
    }
  };

  const loadModels = async (brandId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/dive-computers/${brandId}/models`);
      const data = await response.json();
      setModels(data.models || []);
    } catch (error) {
      console.error('Error loading models:', error);
    }
  };

  const loadUserDiveComputer = async () => {
    try {
      const response = await fetch(`${API_URL}/api/user/dive-computer`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setSelectedBrand(data.dive_computer_brand);
      setSelectedModel(data.dive_computer_model);
      setCapabilities(data.capabilities);
    } catch (error) {
      console.error('Error loading user dive computer:', error);
    }
  };

  const saveDiveComputer = async (brand: string | null, model: string | null) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/user/dive-computer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ brand, model })
      });
      const data = await response.json();
      setCapabilities(data.capabilities);
    } catch (error) {
      console.error('Error saving dive computer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBrandSelect = (brand: Manufacturer) => {
    setSelectedBrand(brand.id);
    setSelectedModel(null);
    setCapabilities(null);
    setShowBrandPicker(false);
  };

  const handleModelSelect = (model: DiveComputerModel) => {
    setSelectedModel(model.id);
    setShowModelPicker(false);
    saveDiveComputer(selectedBrand, model.id);
  };

  const clearDiveComputer = () => {
    setSelectedBrand(null);
    setSelectedModel(null);
    setCapabilities(null);
    saveDiveComputer(null, null);
  };

  const getDisplayName = () => {
    if (capabilities) {
      return `${capabilities.brand.name} ${capabilities.model.name}`;
    }
    return 'Not selected';
  };

  const menuItems = [
    { icon: 'person-outline', title: 'Edit Profile', description: 'Update your information' },
    { icon: 'notifications-outline', title: 'Notifications', description: 'Manage your alerts' },
    { icon: 'shield-checkmark-outline', title: 'Privacy', description: 'Control your data' },
    { icon: 'help-circle-outline', title: 'Help & Support', description: 'Get assistance' },
    { icon: 'document-text-outline', title: 'Terms & Conditions', description: 'Legal information' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.profileHeader, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>
            {user?.firstName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'D'}
          </Text>
        </View>
        <Text style={[styles.userName, { color: colors.text }]}>
          {user?.firstName && user?.lastName
            ? `${user.firstName} ${user.lastName}`
            : user?.firstName || user?.email?.split('@')[0] || 'Diver'}
        </Text>
        <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
        {isAdmin && (
          <View style={[styles.adminBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
            <Text style={styles.adminText}>Administrator</Text>
          </View>
        )}
      </View>

      <View style={[styles.statsRow, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Dives</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0h</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Bottom Time</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Certifications</Text>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferences</Text>
        
        <View style={styles.themeRow}>
          <View style={styles.themeLeft}>
            <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.menuTitle, { color: colors.text }]}>Dark Mode</Text>
              <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                {isDark ? 'Dark theme active' : 'Light theme active'}
              </Text>
            </View>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Dive Computer</Text>
        
        <Pressable style={styles.menuRow} onPress={() => setShowBrandPicker(true)}>
          <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="hardware-chip-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.menuContent}>
            <Text style={[styles.menuTitle, { color: colors.text }]}>Brand</Text>
            <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
              {manufacturers.find(m => m.id === selectedBrand)?.name || 'Select manufacturer'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <Pressable 
          style={[styles.menuRow, { opacity: selectedBrand ? 1 : 0.5 }]} 
          onPress={() => selectedBrand && setShowModelPicker(true)}
          disabled={!selectedBrand}
        >
          <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="watch-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.menuContent}>
            <Text style={[styles.menuTitle, { color: colors.text }]}>Model</Text>
            <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
              {models.find(m => m.id === selectedModel)?.name || 'Select model'}
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          )}
        </Pressable>

        {capabilities && (
          <View style={[styles.capabilityBadge, { backgroundColor: capabilities.model.has_ble ? '#10B98120' : '#F5920020' }]}>
            <Ionicons 
              name={capabilities.model.has_ble ? 'bluetooth' : 'document-outline'} 
              size={16} 
              color={capabilities.model.has_ble ? '#10B981' : '#F59200'} 
            />
            <Text style={[styles.capabilityText, { color: capabilities.model.has_ble ? '#10B981' : '#F59200' }]}>
              {capabilities.model.has_ble 
                ? 'Bluetooth sync supported' 
                : 'File import only'}
            </Text>
          </View>
        )}

        {capabilities?.model.note && (
          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            {capabilities.model.note}
          </Text>
        )}

        {selectedBrand && (
          <Pressable style={styles.clearButton} onPress={clearDiveComputer}>
            <Ionicons name="close-circle-outline" size={18} color={colors.error} />
            <Text style={[styles.clearButtonText, { color: colors.error }]}>Clear selection</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>
        
        {menuItems.map((item, index) => (
          <Pressable key={index} style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name={item.icon as any} size={20} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>{item.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.logoutButton, { borderColor: colors.error }]}
        onPress={logout}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.error} />
        <Text style={[styles.logoutText, { color: colors.error }]}>Logout</Text>
      </Pressable>

      <Text style={[styles.version, { color: colors.textSecondary }]}>Erebus v1.0.0</Text>

      <Modal
        visible={showBrandPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBrandPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Brand</Text>
              <Pressable onPress={() => setShowBrandPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {manufacturers.map((manufacturer) => (
                <Pressable
                  key={manufacturer.id}
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: colors.border },
                    selectedBrand === manufacturer.id && { backgroundColor: colors.primary + '20' }
                  ]}
                  onPress={() => handleBrandSelect(manufacturer)}
                >
                  <Text style={[styles.pickerItemText, { color: colors.text }]}>
                    {manufacturer.name}
                  </Text>
                  {selectedBrand === manufacturer.id && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showModelPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModelPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Model</Text>
              <Pressable onPress={() => setShowModelPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {models.map((model) => (
                <Pressable
                  key={model.id}
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: colors.border },
                    selectedModel === model.id && { backgroundColor: colors.primary + '20' }
                  ]}
                  onPress={() => handleModelSelect(model)}
                >
                  <View style={styles.pickerItemContent}>
                    <Text style={[styles.pickerItemText, { color: colors.text }]}>
                      {model.name}
                    </Text>
                    <View style={styles.pickerItemBadges}>
                      {model.has_ble && (
                        <View style={[styles.bleBadge, { backgroundColor: '#10B98120' }]}>
                          <Ionicons name="bluetooth" size={12} color="#10B981" />
                          <Text style={styles.bleBadgeText}>BLE</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {selectedModel === model.id && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  adminText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    marginVertical: 8,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  menuDescription: {
    fontSize: 13,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 24,
  },
  capabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  capabilityText: {
    fontSize: 13,
    fontWeight: '500',
  },
  noteText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
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
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerItemContent: {
    flex: 1,
  },
  pickerItemText: {
    fontSize: 16,
  },
  pickerItemBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  bleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  bleBadgeText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
  },
});
