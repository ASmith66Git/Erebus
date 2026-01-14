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
import { getApiUrl } from '@/utils/apiConfig';

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
  isTemplate: boolean;
  plannedDepth: number | null;
  plannedBottomTime: number | null;
  cylinders: Cylinder[];
  weights: Weight[];
}

const CONFIG_TYPES = [
  { value: 'single_tank', label: 'Single Tank', icon: 'disc' },
  { value: 'twinset', label: 'Twinset', icon: 'columns' },
  { value: 'sidemount', label: 'Sidemount', icon: 'sidebar' },
  { value: 'ccr', label: 'CCR', icon: 'cpu' },
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

export default function GearProfileEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { colors } = useTheme();
  const { token, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'exposure' | 'gas' | 'weight'>('config');
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
    isTemplate: true,
    plannedDepth: null,
    plannedBottomTime: null,
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
  }, [fetchProfile]);

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
      Alert.alert('Error', 'Please enter a profile name');
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
        Alert.alert('Error', error.error || 'Failed to save profile');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile');
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

  const renderConfigTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile Name</Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={profile.name}
          onChangeText={name => setProfile(prev => ({ ...prev, name }))}
          placeholder="e.g., UK Cold Water Drysuit"
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Configuration Type</Text>
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
              <Feather
                name={type.icon as any}
                size={28}
                color={profile.configType === type.value ? '#FFFFFF' : colors.text}
              />
              <Text
                style={[
                  styles.configTypeLabel,
                  { color: profile.configType === type.value ? '#FFFFFF' : colors.text },
                ]}
              >
                {type.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Planning</Text>
        <View style={styles.planningRow}>
          <View style={styles.planningField}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Planned Depth (m)</Text>
            <TextInput
              style={[styles.numberInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={profile.plannedDepth?.toString() || ''}
              onChangeText={v => setProfile(prev => ({ ...prev, plannedDepth: v ? parseFloat(v) : null }))}
              keyboardType="numeric"
              placeholder="30"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.planningField}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Bottom Time (min)</Text>
            <TextInput
              style={[styles.numberInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={profile.plannedBottomTime?.toString() || ''}
              onChangeText={v => setProfile(prev => ({ ...prev, plannedBottomTime: v ? parseInt(v) : null }))}
              keyboardType="numeric"
              placeholder="45"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={profile.notes || ''}
          onChangeText={notes => setProfile(prev => ({ ...prev, notes }))}
          placeholder="Additional notes about this configuration..."
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
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Suit Type</Text>
        <SelectOption
          options={SUIT_TYPES}
          value={profile.suitType}
          onChange={v => setProfile(prev => ({ ...prev, suitType: v, suitThickness: null, undersuit: null }))}
          label=""
        />
      </View>

      {profile.suitType === 'Wetsuit' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Wetsuit Thickness</Text>
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Undersuit</Text>
          <TextInput
            style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            value={profile.undersuit || ''}
            onChangeText={undersuit => setProfile(prev => ({ ...prev, undersuit }))}
            placeholder="e.g., Fourth Element Halo"
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Suit Nickname</Text>
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={profile.suitNickname || ''}
          onChangeText={suitNickname => setProfile(prev => ({ ...prev, suitNickname }))}
          placeholder="e.g., My O3 Trilaminate"
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Gloves</Text>
        <SelectOption
          options={GLOVES_TYPES}
          value={profile.glovesType}
          onChange={v => setProfile(prev => ({ ...prev, glovesType: v }))}
          label="Type"
        />
        {profile.glovesType && (
          <SelectOption
            options={THICKNESS_OPTIONS}
            value={profile.glovesThickness}
            onChange={v => setProfile(prev => ({ ...prev, glovesThickness: v }))}
            label="Thickness"
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Boots</Text>
        <SelectOption
          options={['Dry', 'Neoprene']}
          value={profile.bootsType}
          onChange={v => setProfile(prev => ({ ...prev, bootsType: v }))}
          label="Type"
        />
        {profile.bootsType && (
          <SelectOption
            options={THICKNESS_OPTIONS}
            value={profile.bootsThickness}
            onChange={v => setProfile(prev => ({ ...prev, bootsThickness: v }))}
            label="Thickness"
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Hood</Text>
        <SelectOption
          options={THICKNESS_OPTIONS}
          value={profile.hoodThickness}
          onChange={v => setProfile(prev => ({ ...prev, hoodThickness: v }))}
          label="Thickness"
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
            placeholder="Nickname (optional)"
            placeholderTextColor={colors.textSecondary}
          />

          <View style={styles.cylinderRow}>
            <View style={styles.cylinderField}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Size</Text>
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
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Material</Text>
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
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Role</Text>
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
                      {role.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={[styles.subsectionTitle, { color: colors.text }]}>Gas Mix</Text>

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
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>He %</Text>
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
        <Text style={[styles.addCylinderText, { color: colors.primary }]}>Add Stage/Deco Cylinder</Text>
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
            <Text style={[styles.totalWeightLabel, { color: colors.primary }]}>Total Weight</Text>
            <Text style={[styles.totalWeightValue, { color: colors.primary }]}>{totalWeight.toFixed(1)} kg</Text>
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
            <Text style={[styles.weightUnit, { color: colors.textSecondary }]}>kg</Text>
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  const tabs = [
    { key: 'config' as const, label: 'Config', icon: 'settings' },
    { key: 'exposure' as const, label: 'Exposure', icon: 'thermometer' },
    { key: 'gas' as const, label: 'Gas', icon: 'database' },
    { key: 'weight' as const, label: 'Weight', icon: 'anchor' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isNew ? 'New Gear Profile' : 'Edit Profile'}
        </Text>
        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>
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
        {activeTab === 'config' && renderConfigTab()}
        {activeTab === 'exposure' && renderExposureTab()}
        {activeTab === 'gas' && renderGasTab()}
        {activeTab === 'weight' && renderWeightTab()}
      </ScrollView>
    </View>
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
});
