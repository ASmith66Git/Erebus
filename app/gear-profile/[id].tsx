import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { getApiUrl } from '@/utils/apiConfig';
import { useTranslation } from 'react-i18next';
import ThemedBackground from '@/components/ThemedBackground';
import { getTankIcon } from '@/components/TankIcons';

interface Cylinder {
  id?: number;
  cylinderSize: string;
  cylinderMaterial: string;
  cylinderRole: string;
  gasMix: string;
  o2Percent: number;
  hePercent: number;
  startPressure: number | null;
  workingPressure: number | null;
  nickname: string;
}

interface Weight {
  id?: number;
  placement: string;
  weightKg: number;
}

interface Equipment {
  id: number;
  equipmentType: string;
  name: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  quantity: number;
  purchaseDate?: string;
  lastServiceDate?: string;
  notes?: string;
}

interface EquipmentType {
  value: string;
  label: string;
}

interface GearProfile {
  id?: number;
  name: string;
  configType: string;
  suitType: string | null;
  suitThickness: string | null;
  undersuit: string | null;
  suitNickname: string | null;
  glovesType: string | null;
  glovesThickness: string | null;
  glovesNickname: string | null;
  bootsType: string | null;
  bootsThickness: string | null;
  bootsNickname: string | null;
  hoodType: string | null;
  hoodThickness: string | null;
  hoodNickname: string | null;
  bcdType: string | null;
  bcdNickname: string | null;
  finsType: string | null;
  finsNickname: string | null;
  maskNickname: string | null;
  notes: string | null;
  status: 'live' | 'archived';
  cylinders: Cylinder[];
  weights: Weight[];
}

const CONFIG_TYPES = [
  { value: 'single_tank', label: 'Single Tank' },
  { value: 'twinset', label: 'Twinset' },
  { value: 'sidemount', label: 'Sidemount' },
  { value: 'ccr', label: 'CCR' },
];

const SUIT_TYPES = ['Wetsuit', 'Drysuit', 'Rash Suit'];
const WETSUIT_THICKNESS = ['2mm', '3mm', '5mm', '7mm', '10mm'];
const GLOVES_TYPES = ['Dry', 'Wet'];
const THICKNESS_OPTIONS = ['2mm', '3mm', '5mm', '7mm', '9mm'];
const CYLINDER_SIZES = ['3L', '5L', '7L', '10L', '12L', '15L', 'AL80'];
const CYLINDER_MATERIALS = ['Steel', 'Aluminum'];
const CYLINDER_ROLES = [
  { value: 'bottom_gas', label: 'Bottom Gas' },
  { value: 'travel_gas', label: 'Travel Gas' },
  { value: 'deco_gas', label: 'Deco Gas' },
  { value: 'diluent', label: 'Diluent' },
  { value: 'oxygen', label: 'Oxygen' },
  { value: 'bailout', label: 'Bailout' },
];
const GAS_MIXES = ['Air', 'Nitrox', 'Trimix', 'Heliox', 'Oxygen'];

const WEIGHT_PLACEMENTS: { [key: string]: string[] } = {
  single_tank: ['Belt', 'BCD Pockets', 'Trim Weights', 'Ankle Weights'],
  twinset: ['V-Weight', 'Tail Weight', 'P-Weight', 'Belt'],
  sidemount: ['Spine Top', 'Spine Middle', 'Spine Bottom', 'Harness', 'Belt'],
  ccr: ['On-board Cylinders', 'Harness', 'Weight Belt', 'Trim'],
};

const getDefaultCylinders = (configType: string): Cylinder[] => {
  const defaultCylinder: Cylinder = {
    cylinderSize: '12L',
    cylinderMaterial: 'Steel',
    cylinderRole: 'bottom_gas',
    gasMix: 'Air',
    o2Percent: 21,
    hePercent: 0,
    startPressure: 200,
    workingPressure: 232,
    nickname: '',
  };

  switch (configType) {
    case 'single_tank':
      return [{ ...defaultCylinder }];
    case 'twinset':
      return [
        { ...defaultCylinder, cylinderRole: 'bottom_gas', nickname: 'Left' },
        { ...defaultCylinder, cylinderRole: 'bottom_gas', nickname: 'Right' },
      ];
    case 'sidemount':
      return [
        { ...defaultCylinder, cylinderRole: 'bottom_gas', nickname: 'Left Side' },
        { ...defaultCylinder, cylinderRole: 'bottom_gas', nickname: 'Right Side' },
      ];
    case 'ccr':
      return [
        { ...defaultCylinder, cylinderSize: '3L', cylinderRole: 'diluent', gasMix: 'Air', nickname: 'Diluent' },
        { ...defaultCylinder, cylinderSize: '3L', cylinderRole: 'oxygen', gasMix: 'Oxygen', o2Percent: 100, nickname: 'O2' },
      ];
    default:
      return [{ ...defaultCylinder }];
  }
};

export default function GearProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { colors } = useTheme();
  const { token, logout } = useAuth();
  const { t } = useTranslation();
  const { getWeightUnit, convertWeightFromMetric, convertWeightToMetric } = useSettings();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(isNew);
  const [activeTab, setActiveTab] = useState<'config' | 'exposure' | 'gas' | 'weight' | 'equipment'>('config');
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([]);
  const [profileEquipment, setProfileEquipment] = useState<Equipment[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [showSelectEquipment, setShowSelectEquipment] = useState(false);
  const [newEquipment, setNewEquipment] = useState({ type: '', name: '', quantity: 1, customType: '' });
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [profile, setProfile] = useState<GearProfile>({
    name: '',
    configType: 'single_tank',
    suitType: null,
    suitThickness: null,
    undersuit: null,
    suitNickname: null,
    glovesType: null,
    glovesThickness: null,
    glovesNickname: null,
    bootsType: null,
    bootsThickness: null,
    bootsNickname: null,
    hoodType: null,
    hoodThickness: null,
    hoodNickname: null,
    bcdType: null,
    bcdNickname: null,
    finsType: null,
    finsNickname: null,
    maskNickname: null,
    notes: null,
    status: 'live',
    cylinders: getDefaultCylinders('single_tank'),
    weights: [],
  });

  const fetchProfile = useCallback(async () => {
    if (isNew) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/gear-profiles/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        logout();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  }, [id, isNew, token, logout]);

  useEffect(() => {
    fetchProfile();
    fetchAllEquipment();
    fetchEquipmentTypes();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile.id && !isNew) {
      fetchProfileEquipment();
    }
  }, [profile.id, isNew]);

  const fetchAllEquipment = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/equipment`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAllEquipment(data.equipment || []);
      }
    } catch (error) {
      console.error('Error fetching equipment:', error);
    }
  };

  const fetchProfileEquipment = async () => {
    if (!profile.id) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/gear-profiles/${profile.id}/equipment`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setProfileEquipment(data.equipment || []);
      }
    } catch (error) {
      console.error('Error fetching profile equipment:', error);
    }
  };

  const fetchEquipmentTypes = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/equipment-types`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setEquipmentTypes(data);
      }
    } catch (error) {
      console.error('Error fetching equipment types:', error);
    }
  };

  const handleAddEquipment = async () => {
    if (!newEquipment.type || !newEquipment.name.trim()) {
      Alert.alert(t('common.error'), t('gearProfiles.selectTypeRequired'));
      return;
    }
    if (newEquipment.type === 'other' && !newEquipment.customType.trim()) {
      Alert.alert(t('common.error'), t('gearProfiles.enterCustomType'));
      return;
    }

    const equipmentType = newEquipment.type === 'other' && newEquipment.customType.trim()
      ? newEquipment.customType.trim().toLowerCase().replace(/\s+/g, '_')
      : newEquipment.type;

    try {
      const response = await fetch(`${getApiUrl()}/api/equipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          equipmentType,
          name: newEquipment.name.trim(),
          quantity: newEquipment.quantity,
        }),
      });

      if (response.ok) {
        await fetchAllEquipment();
        setNewEquipment({ type: '', name: '', quantity: 1, customType: '' });
        setShowAddEquipment(false);
        setShowTypePicker(false);
      } else {
        const error = await response.json();
        Alert.alert(t('common.error'), error.error || t('gearProfiles.failedToAddEquipment'));
      }
    } catch (error) {
      console.error('Error adding equipment:', error);
      Alert.alert(t('common.error'), t('gearProfiles.failedToAddEquipment'));
    }
  };

  const handleDeleteEquipment = async (equipmentId: number) => {
    Alert.alert(t('gearProfiles.deleteEquipment'), t('gearProfiles.deleteEquipmentConfirmLong'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await fetch(`${getApiUrl()}/api/equipment/${equipmentId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
              await fetchAllEquipment();
              if (profile.id) await fetchProfileEquipment();
            } else {
              Alert.alert(t('common.error'), t('gearProfiles.failedToDeleteEquipment'));
            }
          } catch (error) {
            console.error('Error deleting equipment:', error);
            Alert.alert(t('common.error'), t('gearProfiles.failedToDeleteEquipment'));
          }
        },
      },
    ]);
  };

  const handleAddToProfile = async (equipmentId: number) => {
    if (!profile.id) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/gear-profiles/${profile.id}/equipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ equipmentId }),
      });
      if (response.ok) {
        await fetchProfileEquipment();
        setShowSelectEquipment(false);
      } else {
        const error = await response.json();
        Alert.alert(t('common.error'), error.error || t('gearProfiles.failedToAddToProfile'));
      }
    } catch (error) {
      console.error('Error adding to profile:', error);
      Alert.alert(t('common.error'), t('gearProfiles.failedToAddToProfile'));
    }
  };

  const handleRemoveFromProfile = async (equipmentId: number) => {
    if (!profile.id) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/gear-profiles/${profile.id}/equipment/${equipmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        await fetchProfileEquipment();
      } else {
        const error = await response.json();
        Alert.alert(t('common.error'), error.error || t('gearProfiles.failedToRemoveFromProfile'));
      }
    } catch (error) {
      console.error('Error removing from profile:', error);
      Alert.alert(t('common.error'), t('gearProfiles.failedToRemoveFromProfile'));
    }
  };

  const getEquipmentTypeLabel = (value: string) => {
    const found = equipmentTypes.find(t => t.value === value);
    if (found) return found.label;
    return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const handleConfigTypeChange = (newType: string) => {
    setProfile(prev => ({
      ...prev,
      configType: newType,
      cylinders: getDefaultCylinders(newType),
      weights: WEIGHT_PLACEMENTS[newType]?.map(placement => ({ placement, weightKg: 0 })) || [],
    }));
  };

  const handleSave = async () => {
    if (!profile.name.trim()) {
      Alert.alert(t('common.error'), t('gearProfiles.enterProfileName'));
      return;
    }

    setSaving(true);
    try {
      const url = isNew
        ? `${getApiUrl()}/api/gear-profiles`
        : `${getApiUrl()}/api/gear-profiles/${id}`;

      const response = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profile),
      });

      if (response.ok) {
        router.back();
      } else {
        const error = await response.json();
        Alert.alert(t('common.error'), error.error || t('gearProfiles.failedToSaveProfile'));
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert(t('common.error'), t('gearProfiles.failedToSaveProfile'));
    } finally {
      setSaving(false);
    }
  };

  const calculateMOD = (o2Percent: number): number => {
    const ppo2Max = 1.4;
    return Math.floor(((ppo2Max / (o2Percent / 100)) - 1) * 10);
  };

  const updateCylinder = (index: number, field: keyof Cylinder, value: any) => {
    setProfile(prev => {
      const newCylinders = [...prev.cylinders];
      newCylinders[index] = { ...newCylinders[index], [field]: value };
      return { ...prev, cylinders: newCylinders };
    });
  };

  const addCylinder = () => {
    setProfile(prev => ({
      ...prev,
      cylinders: [
        ...prev.cylinders,
        {
          cylinderSize: '10L',
          cylinderMaterial: 'Steel',
          cylinderRole: 'deco_gas',
          gasMix: 'Nitrox',
          o2Percent: 50,
          hePercent: 0,
          startPressure: 200,
          workingPressure: 232,
          nickname: `Stage ${prev.cylinders.length + 1}`,
        },
      ],
    }));
  };

  const removeCylinder = (index: number) => {
    setProfile(prev => ({
      ...prev,
      cylinders: prev.cylinders.filter((_, i) => i !== index),
    }));
  };

  const updateWeight = (index: number, value: number) => {
    setProfile(prev => {
      const newWeights = [...prev.weights];
      newWeights[index] = { ...newWeights[index], weightKg: value };
      return { ...prev, weights: newWeights };
    });
  };

  const Stepper = ({ value, onValueChange, min = 0, max = 100, step = 0.5 }: {
    value: number;
    onValueChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
  }) => (
    <View style={styles.stepper}>
      <Pressable
        style={[styles.stepperButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => onValueChange(Math.max(min, value - step))}
      >
        <Feather name="minus" size={16} color={colors.text} />
      </Pressable>
      <Text style={[styles.stepperValue, { color: colors.text }]}>{value.toFixed(1)}</Text>
      <Pressable
        style={[styles.stepperButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => onValueChange(Math.min(max, value + step))}
      >
        <Feather name="plus" size={16} color={colors.text} />
      </Pressable>
    </View>
  );

  const SelectOption = ({ options, value, onChange, label }: {
    options: string[] | { value: string; label: string }[];
    value: string | null;
    onChange: (v: string) => void;
    label: string;
  }) => {
    const opts = typeof options[0] === 'string'
      ? (options as string[]).map(o => ({ value: o, label: o }))
      : (options as { value: string; label: string }[]);

    return (
      <View style={styles.selectContainer}>
        <Text style={[styles.selectLabel, { color: colors.textSecondary }]}>{label}</Text>
        <View style={styles.selectOptions}>
          {opts.map(opt => (
            <Pressable
              key={opt.value}
              style={[
                styles.selectOption,
                {
                  backgroundColor: value === opt.value ? colors.primary : colors.surface,
                  borderColor: value === opt.value ? colors.primary : colors.border,
                },
              ]}
              onPress={() => onChange(opt.value)}
            >
              <Text
                style={[
                  styles.selectOptionText,
                  { color: value === opt.value ? '#FFFFFF' : colors.text },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const DetailRow = ({ label, value, icon }: { label: string; value: string | null; icon?: string }) => (
    value ? (
      <View style={styles.detailRow}>
        {icon && <Feather name={icon as any} size={14} color={colors.primary} />}
        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
      </View>
    ) : null
  );

  const renderConfigViewTab = () => {
    const configTypeLabel = t(`gearProfiles.configTypes.${profile.configType === 'single_tank' ? 'singleTank' : profile.configType}`);
    return (
      <View style={styles.tabContent}>
        <View style={[styles.viewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.viewCardHeader}>
            <Feather name="settings" size={16} color={colors.primary} />
            <Text style={[styles.viewCardTitle, { color: colors.text }]}>{t('gearProfiles.configuration')}</Text>
          </View>
          <DetailRow label="Name" value={profile.name} />
          <DetailRow label="Type" value={configTypeLabel} />
          {profile.notes && <DetailRow label="Notes" value={profile.notes} />}
        </View>
      </View>
    );
  };

  const renderExposureViewTab = () => (
    <View style={styles.tabContent}>
      <View style={[styles.viewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.viewCardHeader}>
          <Feather name="thermometer" size={16} color={colors.primary} />
          <Text style={[styles.viewCardTitle, { color: colors.text }]}>{t('gearProfiles.exposureProtection')}</Text>
        </View>
        <DetailRow label="Suit Type" value={profile.suitType} />
        {profile.suitThickness && <DetailRow label="Thickness" value={profile.suitThickness} />}
        {profile.undersuit && <DetailRow label="Undersuit" value={profile.undersuit} />}
        {profile.suitNickname && <DetailRow label="Suit Name" value={profile.suitNickname} />}
      </View>
      
      {(profile.glovesType || profile.bootsType || profile.hoodType) && (
        <View style={[styles.viewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.viewCardHeader}>
            <Feather name="shield" size={16} color={colors.primary} />
            <Text style={[styles.viewCardTitle, { color: colors.text }]}>{t('gearProfiles.accessories')}</Text>
          </View>
          {profile.glovesType && <DetailRow label="Gloves" value={`${profile.glovesType}${profile.glovesThickness ? ` (${profile.glovesThickness})` : ''}`} />}
          {profile.bootsType && <DetailRow label="Boots" value={`${profile.bootsType}${profile.bootsThickness ? ` (${profile.bootsThickness})` : ''}`} />}
          {profile.hoodType && <DetailRow label="Hood" value={`${profile.hoodType}${profile.hoodThickness ? ` (${profile.hoodThickness})` : ''}`} />}
        </View>
      )}

      {(profile.bcdType || profile.finsType || profile.maskNickname) && (
        <View style={[styles.viewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.viewCardHeader}>
            <Feather name="box" size={16} color={colors.primary} />
            <Text style={[styles.viewCardTitle, { color: colors.text }]}>{t('gearProfiles.otherEquipment')}</Text>
          </View>
          {profile.bcdType && <DetailRow label="BCD" value={`${profile.bcdType}${profile.bcdNickname ? ` - ${profile.bcdNickname}` : ''}`} />}
          {profile.finsType && <DetailRow label="Fins" value={`${profile.finsType}${profile.finsNickname ? ` - ${profile.finsNickname}` : ''}`} />}
          {profile.maskNickname && <DetailRow label="Mask" value={profile.maskNickname} />}
        </View>
      )}
    </View>
  );

  const renderGasViewTab = () => (
    <View style={styles.tabContent}>
      {profile.cylinders.map((cyl, index) => {
        const roleLabel = t(`gearProfiles.cylinderRoles.${cyl.cylinderRole}`);
        return (
          <View key={index} style={[styles.viewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.viewCardHeader}>
              <Feather name="database" size={16} color={colors.primary} />
              <Text style={[styles.viewCardTitle, { color: colors.text }]}>
                {cyl.nickname || `Cylinder ${index + 1}`}
              </Text>
            </View>
            <DetailRow label="Size" value={cyl.cylinderSize} />
            <DetailRow label="Material" value={cyl.cylinderMaterial} />
            <DetailRow label="Role" value={roleLabel} />
            <DetailRow label="Gas Mix" value={`${cyl.gasMix} (${cyl.o2Percent}% O2${cyl.hePercent > 0 ? `, ${cyl.hePercent}% He` : ''})`} />
            <DetailRow label="Working Pressure" value={cyl.workingPressure ? `${cyl.workingPressure} bar` : null} />
          </View>
        );
      })}
    </View>
  );

  const renderWeightViewTab = () => {
    const totalWeight = profile.weights.reduce((sum, w) => sum + (w.weightKg || 0), 0);
    const weightsWithValues = profile.weights.filter(w => w.weightKg > 0);
    
    return (
      <View style={styles.tabContent}>
        <View style={[styles.totalWeightCard, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
          <Feather name="anchor" size={24} color={colors.primary} />
          <View>
            <Text style={[styles.totalWeightLabel, { color: colors.primary }]}>{t('gearProfiles.totalWeight')}</Text>
            <Text style={[styles.totalWeightValue, { color: colors.primary }]}>{convertWeightFromMetric(totalWeight).toFixed(1)} {getWeightUnit()}</Text>
          </View>
        </View>

        {weightsWithValues.length > 0 && (
          <View style={[styles.viewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.viewCardHeader}>
              <Feather name="anchor" size={16} color={colors.primary} />
              <Text style={[styles.viewCardTitle, { color: colors.text }]}>{t('gearProfiles.weightDistribution')}</Text>
            </View>
            {weightsWithValues.map((weight, index) => (
              <DetailRow 
                key={index} 
                label={weight.placement} 
                value={`${convertWeightFromMetric(weight.weightKg).toFixed(1)} ${getWeightUnit()}`} 
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderConfigTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.profileName')}</Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={profile.name}
          onChangeText={name => setProfile(prev => ({ ...prev, name }))}
          placeholder={t("gearProfiles.profileNamePlaceholderExample")}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.configurationType')}</Text>
        <View style={styles.configTypeGrid}>
          {CONFIG_TYPES.map(type => (
            <Pressable
              key={type.value}
              style={[
                styles.configTypeCard,
                {
                  backgroundColor: profile.configType === type.value ? colors.primary : colors.surface,
                  borderColor: profile.configType === type.value ? colors.primary : colors.border,
                },
              ]}
              onPress={() => handleConfigTypeChange(type.value)}
            >
              {React.createElement(getTankIcon(type.value), {
                size: 48,
                color: profile.configType === type.value ? '#FFFFFF' : colors.text,
              })}
              <Text
                style={[
                  styles.configTypeLabel,
                  { color: profile.configType === type.value ? '#FFFFFF' : colors.text },
                ]}
              >
                {t(`gearProfiles.configTypes.${type.value === 'single_tank' ? 'singleTank' : type.value}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.notes')}</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={profile.notes || ''}
          onChangeText={notes => setProfile(prev => ({ ...prev, notes }))}
          placeholder={t("gearProfiles.notesPlaceholder")}
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={4}
        />
      </View>
    </View>
  );

  const renderExposureTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.suitType')}</Text>
        <SelectOption
          options={SUIT_TYPES}
          value={profile.suitType}
          onChange={v => setProfile(prev => ({ ...prev, suitType: v, suitThickness: null, undersuit: null }))}
          label=""
        />
      </View>

      {profile.suitType === 'Wetsuit' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.wetsuitThickness')}</Text>
          <SelectOption
            options={WETSUIT_THICKNESS}
            value={profile.suitThickness}
            onChange={v => setProfile(prev => ({ ...prev, suitThickness: v }))}
            label=""
          />
        </View>
      )}

      {profile.suitType === 'Drysuit' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.undersuit')}</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            value={profile.undersuit || ''}
            onChangeText={undersuit => setProfile(prev => ({ ...prev, undersuit }))}
            placeholder={t("gearProfiles.undersuitPlaceholder")}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.suitNickname')}</Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={profile.suitNickname || ''}
          onChangeText={suitNickname => setProfile(prev => ({ ...prev, suitNickname }))}
          placeholder={t("gearProfiles.suitNicknamePlaceholder")}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.gloves')}</Text>
        <SelectOption
          options={GLOVES_TYPES}
          value={profile.glovesType}
          onChange={v => setProfile(prev => ({ ...prev, glovesType: v, glovesThickness: v === 'Dry' ? null : profile.glovesThickness }))}
          label={t('gearProfiles.typeLabel')}
        />
        {profile.glovesType === 'Wet' && (
          <SelectOption
            options={THICKNESS_OPTIONS}
            value={profile.glovesThickness}
            onChange={v => setProfile(prev => ({ ...prev, glovesThickness: v }))}
            label={t('gearProfiles.thickness')}
          />
        )}
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, marginTop: 8 }]}
          value={profile.glovesNickname || ''}
          onChangeText={glovesNickname => setProfile(prev => ({ ...prev, glovesNickname }))}
          placeholder={t("gearProfiles.glovesPlaceholder")}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.boots')}</Text>
        <SelectOption
          options={['Dry', 'Neoprene']}
          value={profile.bootsType}
          onChange={v => setProfile(prev => ({ ...prev, bootsType: v, bootsThickness: v === 'Dry' ? null : profile.bootsThickness }))}
          label={t('gearProfiles.typeLabel')}
        />
        {profile.bootsType === 'Neoprene' && (
          <SelectOption
            options={THICKNESS_OPTIONS}
            value={profile.bootsThickness}
            onChange={v => setProfile(prev => ({ ...prev, bootsThickness: v }))}
            label={t('gearProfiles.thickness')}
          />
        )}
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, marginTop: 8 }]}
          value={profile.bootsNickname || ''}
          onChangeText={bootsNickname => setProfile(prev => ({ ...prev, bootsNickname }))}
          placeholder={t("gearProfiles.bootsPlaceholder")}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.hood')}</Text>
        <SelectOption
          options={THICKNESS_OPTIONS}
          value={profile.hoodThickness}
          onChange={v => setProfile(prev => ({ ...prev, hoodThickness: v }))}
          label={t('gearProfiles.thickness')}
        />
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, marginTop: 8 }]}
          value={profile.hoodNickname || ''}
          onChangeText={hoodNickname => setProfile(prev => ({ ...prev, hoodNickname }))}
          placeholder={t("gearProfiles.hoodPlaceholder")}
          placeholderTextColor={colors.textSecondary}
        />
      </View>
    </View>
  );

  const renderGasTab = () => (
    <View style={styles.tabContent}>
      {profile.cylinders.map((cylinder, index) => (
        <View key={index} style={[styles.cylinderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cylinderHeader}>
            <Text style={[styles.cylinderTitle, { color: colors.text }]}>
              Cylinder {index + 1}
            </Text>
            {profile.cylinders.length > 1 && (
              <Pressable
                style={[styles.removeButton, { backgroundColor: colors.error + '20' }]}
                onPress={() => removeCylinder(index)}
              >
                <Feather name="trash-2" size={16} color={colors.error} />
              </Pressable>
            )}
          </View>

          <TextInput
            style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={cylinder.nickname}
            onChangeText={v => updateCylinder(index, 'nickname', v)}
            placeholder={t("gearProfiles.nicknamePlaceholder")}
            placeholderTextColor={colors.textSecondary}
          />

          <View style={styles.cylinderRow}>
            <View style={styles.cylinderField}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('gearProfiles.size')}</Text>
              <View style={styles.selectOptions}>
                {CYLINDER_SIZES.map(size => (
                  <Pressable
                    key={size}
                    style={[
                      styles.selectOptionSmall,
                      {
                        backgroundColor: cylinder.cylinderSize === size ? colors.primary : colors.background,
                        borderColor: cylinder.cylinderSize === size ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => updateCylinder(index, 'cylinderSize', size)}
                  >
                    <Text style={{ color: cylinder.cylinderSize === size ? '#FFFFFF' : colors.text, fontSize: 12 }}>
                      {size}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.cylinderRow}>
            <View style={styles.cylinderField}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('gearProfiles.material')}</Text>
              <View style={styles.selectOptions}>
                {CYLINDER_MATERIALS.map(mat => (
                  <Pressable
                    key={mat}
                    style={[
                      styles.selectOptionSmall,
                      {
                        backgroundColor: cylinder.cylinderMaterial === mat ? colors.primary : colors.background,
                        borderColor: cylinder.cylinderMaterial === mat ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => updateCylinder(index, 'cylinderMaterial', mat)}
                  >
                    <Text style={{ color: cylinder.cylinderMaterial === mat ? '#FFFFFF' : colors.text, fontSize: 12 }}>
                      {mat}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.cylinderRow}>
            <View style={styles.cylinderField}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('gearProfiles.role')}</Text>
              <View style={styles.selectOptions}>
                {CYLINDER_ROLES.map(role => (
                  <Pressable
                    key={role.value}
                    style={[
                      styles.selectOptionSmall,
                      {
                        backgroundColor: cylinder.cylinderRole === role.value ? colors.primary : colors.background,
                        borderColor: cylinder.cylinderRole === role.value ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => updateCylinder(index, 'cylinderRole', role.value)}
                  >
                    <Text style={{ color: cylinder.cylinderRole === role.value ? '#FFFFFF' : colors.text, fontSize: 11 }}>
                      {t(`gearProfiles.cylinderRoles.${role.value}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={[styles.subsectionTitle, { color: colors.text }]}>{t('gearProfiles.gasMix')}</Text>

          <View style={styles.selectOptions}>
            {GAS_MIXES.map(mix => (
              <Pressable
                key={mix}
                style={[
                  styles.selectOptionSmall,
                  {
                    backgroundColor: cylinder.gasMix === mix ? colors.primary : colors.background,
                    borderColor: cylinder.gasMix === mix ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  updateCylinder(index, 'gasMix', mix);
                  if (mix === 'Air') {
                    updateCylinder(index, 'o2Percent', 21);
                    updateCylinder(index, 'hePercent', 0);
                  } else if (mix === 'Oxygen') {
                    updateCylinder(index, 'o2Percent', 100);
                    updateCylinder(index, 'hePercent', 0);
                  }
                }}
              >
                <Text style={{ color: cylinder.gasMix === mix ? '#FFFFFF' : colors.text, fontSize: 12 }}>
                  {mix}
                </Text>
              </Pressable>
            ))}
          </View>

          {cylinder.gasMix !== 'Air' && cylinder.gasMix !== 'Oxygen' && (
            <View style={styles.gasPercentRow}>
              <View style={styles.gasPercentField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>O2 %</Text>
                <Stepper
                  value={cylinder.o2Percent}
                  onValueChange={v => updateCylinder(index, 'o2Percent', v)}
                  min={21}
                  max={100}
                  step={1}
                />
              </View>
              {(cylinder.gasMix === 'Trimix' || cylinder.gasMix === 'Heliox') && (
                <View style={styles.gasPercentField}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('diveLogs.hePercent')}</Text>
                  <Stepper
                    value={cylinder.hePercent}
                    onValueChange={v => updateCylinder(index, 'hePercent', v)}
                    min={0}
                    max={80}
                    step={1}
                  />
                </View>
              )}
            </View>
          )}

          <View style={[styles.modBadge, { backgroundColor: colors.primary + '20' }]}>
            <Feather name="alert-triangle" size={14} color={colors.primary} />
            <Text style={[styles.modText, { color: colors.primary }]}>
              MOD: {calculateMOD(cylinder.o2Percent)}m (PPO2 1.4)
            </Text>
          </View>
        </View>
      ))}

      <Pressable
        style={[styles.addCylinderButton, { borderColor: colors.primary }]}
        onPress={addCylinder}
      >
        <Feather name="plus" size={18} color={colors.primary} />
        <Text style={[styles.addCylinderText, { color: colors.primary }]}>{t('gearProfiles.addStageCylinder')}</Text>
      </Pressable>
    </View>
  );

  const renderWeightTab = () => {
    const placements = WEIGHT_PLACEMENTS[profile.configType] || [];
    const totalWeight = profile.weights.reduce((sum, w) => sum + (w.weightKg || 0), 0);

    if (profile.weights.length === 0 && placements.length > 0) {
      setProfile(prev => ({
        ...prev,
        weights: placements.map(placement => ({ placement, weightKg: 0 })),
      }));
    }

    return (
      <View style={styles.tabContent}>
        <View style={[styles.totalWeightCard, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
          <Feather name="anchor" size={24} color={colors.primary} />
          <View>
            <Text style={[styles.totalWeightLabel, { color: colors.primary }]}>{t('gearProfiles.totalWeight')}</Text>
            <Text style={[styles.totalWeightValue, { color: colors.primary }]}>{convertWeightFromMetric(totalWeight).toFixed(1)} {getWeightUnit()}</Text>
          </View>
        </View>

        {profile.weights.map((weight, index) => (
          <View key={weight.placement} style={[styles.weightRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.weightPlacement, { color: colors.text }]}>{weight.placement}</Text>
            <Stepper
              value={weight.weightKg}
              onValueChange={v => updateWeight(index, v)}
              min={0}
              max={20}
              step={0.5}
            />
            <Text style={[styles.weightUnit, { color: colors.textSecondary }]}>{getWeightUnit()}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderEquipmentViewTab = () => {
    return (
      <View style={styles.tabContent}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.equipmentForProfile')}</Text>
        
        {profileEquipment.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="briefcase" size={32} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('gearProfiles.noEquipmentLinked')}</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>{t('gearProfiles.addEquipmentEditHint')}</Text>
          </View>
        ) : (
          <View style={[styles.equipmentListContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {profileEquipment.map((item, index) => (
              <View 
                key={item.id} 
                style={[
                  styles.equipmentRow,
                  { borderBottomColor: colors.border },
                  index === profileEquipment.length - 1 && { borderBottomWidth: 0 }
                ]}
              >
                <Text style={[styles.equipmentRowType, { color: colors.textSecondary }]}>
                  {getEquipmentTypeLabel(item.equipmentType)}
                </Text>
                <Text style={[styles.equipmentRowName, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.quantity > 1 && (
                  <Text style={[styles.equipmentRowQty, { color: colors.textSecondary }]}>x{item.quantity}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: 24 }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.myEquipmentInventory')}</Text>
          <Text style={[{ color: colors.textSecondary, fontSize: 13, marginBottom: 12 }]}>
            All your saved equipment. Switch to edit mode to link items to this profile.
          </Text>
          
          {allEquipment.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="package" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('gearProfiles.noEquipmentInventory')}</Text>
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>{t('gearProfiles.addEquipmentInventoryHint')}</Text>
            </View>
          ) : (
            <View style={[styles.equipmentListContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {allEquipment.map((item, index) => (
                <View 
                  key={item.id} 
                  style={[
                    styles.equipmentRow,
                    { borderBottomColor: colors.border },
                    index === allEquipment.length - 1 && { borderBottomWidth: 0 }
                  ]}
                >
                  <Text style={[styles.equipmentRowType, { color: colors.textSecondary }]}>
                    {getEquipmentTypeLabel(item.equipmentType)}
                  </Text>
                  <Text style={[styles.equipmentRowName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.quantity > 1 && (
                    <Text style={[styles.equipmentRowQty, { color: colors.textSecondary }]}>x{item.quantity}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderEquipmentTab = () => {
    const groupedProfileEquipment = profileEquipment.reduce((acc, item) => {
      if (!acc[item.equipmentType]) {
        acc[item.equipmentType] = [];
      }
      acc[item.equipmentType].push(item);
      return acc;
    }, {} as Record<string, Equipment[]>);

    const profileEquipmentIds = new Set(profileEquipment.map(e => e.id));
    const availableEquipment = allEquipment.filter(e => !profileEquipmentIds.has(e.id));
    const groupedAvailable = availableEquipment.reduce((acc, item) => {
      if (!acc[item.equipmentType]) {
        acc[item.equipmentType] = [];
      }
      acc[item.equipmentType].push(item);
      return acc;
    }, {} as Record<string, Equipment[]>);

    return (
      <View style={styles.tabContent}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('gearProfiles.profileEquipment')}</Text>

        {showSelectEquipment ? (
          <View style={[styles.addEquipmentForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.formLabel, { color: colors.text, marginBottom: 0 }]}>{t('gearProfiles.selectFromInventory')}</Text>
              <Pressable onPress={() => setShowSelectEquipment(false)}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            
            {availableEquipment.length === 0 ? (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 16 }}>
                No equipment available. Add items to your inventory first.
              </Text>
            ) : (
              <View style={[styles.equipmentListContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {availableEquipment.map((item, index) => (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.equipmentRow,
                      { borderBottomColor: colors.border },
                      index === availableEquipment.length - 1 && { borderBottomWidth: 0 }
                    ]}
                    onPress={() => handleAddToProfile(item.id)}
                  >
                    <Text style={[styles.equipmentRowType, { color: colors.textSecondary }]}>
                      {getEquipmentTypeLabel(item.equipmentType)}
                    </Text>
                    <Text style={[styles.equipmentRowName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.quantity > 1 && (
                      <Text style={[styles.equipmentRowQty, { color: colors.textSecondary }]}>x{item.quantity}</Text>
                    )}
                    <Feather name="plus" size={16} color={colors.primary} style={{ marginLeft: 8 }} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : showAddEquipment ? (
          <View style={[styles.addEquipmentForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formLabel, { color: colors.text }]}>{t('common.type')}</Text>
            <Pressable
              style={[styles.dropdownButton, { backgroundColor: colors.background, borderColor: colors.border }]}
              onPress={() => setShowTypePicker(true)}
            >
              <Text style={{ color: newEquipment.type ? colors.text : colors.textSecondary, flex: 1 }}>
                {newEquipment.type 
                  ? (newEquipment.type === 'other' && newEquipment.customType 
                      ? newEquipment.customType 
                      : equipmentTypes.find(t => t.value === newEquipment.type)?.label || newEquipment.type)
                  : t('gearProfiles.selectEquipmentType')}
              </Text>
              <Feather name="chevron-down" size={18} color={colors.textSecondary} />
            </Pressable>

            {showTypePicker && (
              <View style={[styles.pickerDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled>
                  {equipmentTypes.map(type => (
                    <Pressable
                      key={type.value}
                      style={[
                        styles.pickerItem,
                        { borderBottomColor: colors.border },
                        newEquipment.type === type.value && { backgroundColor: colors.primary + '15' },
                      ]}
                      onPress={() => {
                        setNewEquipment(prev => ({ ...prev, type: type.value, customType: '' }));
                        if (type.value !== 'other') setShowTypePicker(false);
                      }}
                    >
                      <Text style={{ color: newEquipment.type === type.value ? colors.primary : colors.text }}>
                        {type.label}
                      </Text>
                      {newEquipment.type === type.value && (
                        <Feather name="check" size={16} color={colors.primary} />
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable
                  style={[styles.pickerDoneButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowTypePicker(false)}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '500' }}>{t('common.done')}</Text>
                </Pressable>
              </View>
            )}

            {newEquipment.type === 'other' && (
              <>
                <Text style={[styles.formLabel, { color: colors.text, marginTop: 12 }]}>{t('gearProfiles.customTypeName')}</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                  placeholder="Enter custom equipment type..."
                  placeholderTextColor={colors.textSecondary}
                  value={newEquipment.customType}
                  onChangeText={text => setNewEquipment(prev => ({ ...prev, customType: text }))}
                />
              </>
            )}

            <Text style={[styles.formLabel, { color: colors.text, marginTop: 12 }]}>Name</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g., My Main Regulator"
              placeholderTextColor={colors.textSecondary}
              value={newEquipment.name}
              onChangeText={text => setNewEquipment(prev => ({ ...prev, name: text }))}
            />

            <Text style={[styles.formLabel, { color: colors.text }]}>Quantity</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Pressable
                style={[styles.qtyButton, { borderColor: colors.border }]}
                onPress={() => setNewEquipment(prev => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
              >
                <Feather name="minus" size={18} color={colors.text} />
              </Pressable>
              <Text style={[styles.qtyValue, { color: colors.text }]}>{newEquipment.quantity}</Text>
              <Pressable
                style={[styles.qtyButton, { borderColor: colors.border }]}
                onPress={() => setNewEquipment(prev => ({ ...prev, quantity: prev.quantity + 1 }))}
              >
                <Feather name="plus" size={18} color={colors.text} />
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                style={[styles.cancelButton, { borderColor: colors.border }]}
                onPress={() => {
                  setShowAddEquipment(false);
                  setShowTypePicker(false);
                  setNewEquipment({ type: '', name: '', quantity: 1, customType: '' });
                }}
              >
                <Text style={{ color: colors.text }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.addButton, { backgroundColor: colors.primary }]}
                onPress={handleAddEquipment}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Add to Inventory</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              style={[styles.addEquipmentButton, { borderColor: colors.primary, flex: 1 }]}
              onPress={() => setShowSelectEquipment(true)}
            >
              <Feather name="check-circle" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '500' }}>{t('gearProfiles.selectFromInventory')}</Text>
            </Pressable>
            <Pressable
              style={[styles.addEquipmentButton, { borderColor: colors.border, flex: 1 }]}
              onPress={() => setShowAddEquipment(true)}
            >
              <Feather name="plus" size={18} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '500' }}>Add New</Text>
            </Pressable>
          </View>
        )}

        {profileEquipment.length > 0 && (
          <View style={[styles.equipmentListContainer, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 16 }]}>
            {profileEquipment.map((item, index) => (
              <View 
                key={item.id} 
                style={[
                  styles.equipmentRow,
                  { borderBottomColor: colors.border },
                  index === profileEquipment.length - 1 && { borderBottomWidth: 0 }
                ]}
              >
                <Text style={[styles.equipmentRowType, { color: colors.textSecondary }]}>
                  {getEquipmentTypeLabel(item.equipmentType)}
                </Text>
                <Text style={[styles.equipmentRowName, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.quantity > 1 && (
                  <Text style={[styles.equipmentRowQty, { color: colors.textSecondary }]}>x{item.quantity}</Text>
                )}
                <Pressable
                  style={{ marginLeft: 8, padding: 4 }}
                  onPress={() => handleRemoveFromProfile(item.id)}
                >
                  <Feather name="x" size={16} color={colors.error || '#FF4444'} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <ThemedBackground style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ThemedBackground>
    );
  }

  const tabs = [
    { key: 'config' as const, label: t('gearProfiles.tabs.config'), icon: 'settings' },
    { key: 'exposure' as const, label: t('gearProfiles.tabs.exposure'), icon: 'thermometer' },
    { key: 'gas' as const, label: t('gearProfiles.tabs.gas'), icon: 'database' },
    { key: 'weight' as const, label: t('gearProfiles.tabs.weight'), icon: 'anchor' },
    { key: 'equipment' as const, label: t('gearProfiles.tabs.equipment'), icon: 'briefcase' },
  ];

  const handleClose = () => {
    if (isEditing && !isNew) {
      setIsEditing(false);
      fetchProfile();
    } else {
      router.back();
    }
  };

  return (
    <ThemedBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
        <Pressable style={styles.backButton} onPress={handleClose}>
          <Feather name={isEditing ? "x" : "arrow-left"} size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isNew ? t('gearProfiles.newGearProfile') : isEditing ? t('gearProfiles.editGearProfile') : profile.name || t('gearProfiles.gearProfile')}
        </Text>
        {isEditing ? (
          <Pressable
            style={[styles.saveButton, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>{t('common.save')}</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={styles.backButton}
            onPress={() => setIsEditing(true)}
          >
            <Feather name="edit-2" size={20} color={colors.primary} />
          </Pressable>
        )}
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {tabs.map(tab => (
          <Pressable
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Feather
              name={tab.icon as any}
              size={18}
              color={activeTab === tab.key ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.key ? colors.primary : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'config' && (isEditing ? renderConfigTab() : renderConfigViewTab())}
        {activeTab === 'exposure' && (isEditing ? renderExposureTab() : renderExposureViewTab())}
        {activeTab === 'gas' && (isEditing ? renderGasTab() : renderGasViewTab())}
        {activeTab === 'weight' && (isEditing ? renderWeightTab() : renderWeightViewTab())}
        {activeTab === 'equipment' && (isEditing ? renderEquipmentTab() : renderEquipmentViewTab())}
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  tabContent: {
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 8,
  },
  textInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
  },
  numberInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    width: 100,
    textAlign: 'center',
  },
  textArea: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  configTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  configTypeCard: {
    width: '47%',
    aspectRatio: 1.5,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  configTypeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  planningRow: {
    flexDirection: 'row',
    gap: 16,
  },
  planningField: {
    flex: 1,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  selectContainer: {
    gap: 8,
  },
  selectLabel: {
    fontSize: 13,
  },
  selectOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectOptionSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  selectOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  cylinderCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  cylinderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cylinderTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cylinderRow: {
    gap: 8,
  },
  cylinderField: {
    gap: 6,
  },
  gasPercentRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 8,
  },
  gasPercentField: {
    flex: 1,
    gap: 6,
  },
  modBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginTop: 8,
  },
  modText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addCylinderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 8,
  },
  addCylinderText: {
    fontSize: 14,
    fontWeight: '500',
  },
  totalWeightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 16,
  },
  totalWeightLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  totalWeightValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  viewCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  viewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  viewCardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    minWidth: 100,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  weightPlacement: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  weightUnit: {
    fontSize: 14,
    width: 24,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
  },
  equipmentTypeHeader: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  equipmentListContainer: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  equipmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  equipmentRowType: {
    fontSize: 12,
    width: 100,
    marginRight: 8,
  },
  equipmentRowName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  equipmentRowQty: {
    fontSize: 12,
    marginLeft: 8,
  },
  equipmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  equipmentInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  equipmentName: {
    fontSize: 15,
    fontWeight: '500',
  },
  equipmentQty: {
    fontSize: 13,
  },
  deleteEquipmentButton: {
    padding: 8,
  },
  addEquipmentForm: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  pickerDropdown: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  pickerDoneButton: {
    alignItems: 'center',
    padding: 12,
  },
  textInput: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    marginBottom: 16,
  },
  qtyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    fontSize: 18,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  addButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addEquipmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 8,
    marginBottom: 8,
  },
});
