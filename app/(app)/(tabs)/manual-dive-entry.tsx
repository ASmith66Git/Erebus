import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
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
import ThemedBackground from '@/components/ThemedBackground';

const TABS = ['Dive', 'Gas', 'Problems', 'Skills', 'Team', 'Notes'] as const;
type TabType = typeof TABS[number];

interface DiveSite {
  id: number;
  name: string;
}

interface DiveBuddy {
  id: number;
  name: string;
  photoUrl: string | null;
}

interface GearProfile {
  id: number;
  name: string;
  configType: string;
}

const SURFACE_CONDITIONS = ['Calm', 'Light chop', 'Moderate waves', 'Rough', 'Strong current'];
const WEATHER_CONDITIONS = ['Sunny', 'Partly cloudy', 'Overcast', 'Rainy', 'Windy'];
const WORKLOAD_OPTIONS = ['Light', 'Moderate', 'Heavy', 'Exhausting'];
const THERMAL_OPTIONS = ['Cold', 'Cool', 'Comfortable', 'Warm', 'Hot'];
const DIVE_MODES = ['Open Circuit', 'CCR', 'SCR', 'Sidemount', 'Freedive'];
const EQUIPMENT_OPTIONS = [
  'None', 'First Stages', 'Second Stages', 'Gas Hoses', 'Wing', 'Harness',
  'Torches', 'Weights', 'SMBs', 'Reels', 'Suit Inflation', 'Suit Venting',
  'Fins', 'Masks', 'CCR O2', 'CCR Dil', 'CCR CO2', 'Dive Computer', 'Other'
];

export default function ManualDiveEntryScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<TabType>('Dive');
  const [saving, setSaving] = useState(false);
  const [diveSites, setDiveSites] = useState<DiveSite[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [buddies, setBuddies] = useState<DiveBuddy[]>([]);
  const [loadingBuddies, setLoadingBuddies] = useState(true);
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const [gearProfiles, setGearProfiles] = useState<GearProfile[]>([]);
  const [loadingGearProfiles, setLoadingGearProfiles] = useState(true);
  const [showGearProfileDropdown, setShowGearProfileDropdown] = useState(false);
  const [selectedGearProfileId, setSelectedGearProfileId] = useState<number | null>(null);
  const [selectedGearProfileName, setSelectedGearProfileName] = useState<string>('');

  const [diveDate, setDiveDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });
  const [diveTime, setDiveTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });
  const [duration, setDuration] = useState('');
  const [maxDepth, setMaxDepth] = useState('');
  const [avgDepth, setAvgDepth] = useState('');
  const [minTemp, setMinTemp] = useState('');
  const [maxTemp, setMaxTemp] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [selectedSiteName, setSelectedSiteName] = useState<string>('');
  
  const [surfaceConditions, setSurfaceConditions] = useState<string>('');
  const [weatherConditions, setWeatherConditions] = useState<string>('');
  const [workload, setWorkload] = useState<string>('');
  const [thermalComfort, setThermalComfort] = useState<string>('');
  const [diveMode, setDiveMode] = useState<string>('Open Circuit');
  
  const [deviceManufacturer, setDeviceManufacturer] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [startPressure, setStartPressure] = useState('');
  const [endPressure, setEndPressure] = useState('');
  const [o2Percent, setO2Percent] = useState('21');
  const [hePercent, setHePercent] = useState('0');
  
  const [selectedBuddyIds, setSelectedBuddyIds] = useState<number[]>([]);
  const [buddyNotes, setBuddyNotes] = useState('');
  const [equipmentIssues, setEquipmentIssues] = useState<string[]>([]);
  const [decompressionSymptoms, setDecompressionSymptoms] = useState(false);
  const [problemNotes, setProblemNotes] = useState('');
  const [skillsNotes, setSkillsNotes] = useState('');

  useEffect(() => {
    if (token) {
      loadDiveSites();
      loadBuddies();
      loadGearProfiles();
    }
  }, [token]);

  const loadDiveSites = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-sites`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setDiveSites(data.diveSites || []);
    } catch (error) {
      console.error('Error loading dive sites:', error);
    } finally {
      setLoadingSites(false);
    }
  };

  const loadBuddies = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-buddies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setBuddies(data.buddies || []);
    } catch (error) {
      console.error('Error loading buddies:', error);
    } finally {
      setLoadingBuddies(false);
    }
  };

  const loadGearProfiles = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/gear-profiles`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setGearProfiles(data.profiles || []);
    } catch (error) {
      console.error('Error loading gear profiles:', error);
    } finally {
      setLoadingGearProfiles(false);
    }
  };

  const handleSave = async () => {
    if (!diveDate || !diveTime) {
      Alert.alert('Required Field', 'Please enter the dive date and time.');
      return;
    }

    setSaving(true);
    try {
      const diveDateTime = new Date(`${diveDate}T${diveTime}:00`).toISOString();
      
      const payload: any = {
        diveDateTime,
        durationSeconds: duration ? parseInt(duration) * 60 : null,
        maxDepthMeters: maxDepth ? parseFloat(maxDepth) : null,
        avgDepthMeters: avgDepth ? parseFloat(avgDepth) : null,
        minTemperatureCelsius: minTemp ? parseFloat(minTemp) : null,
        maxTemperatureCelsius: maxTemp ? parseFloat(maxTemp) : null,
        notes: notes || null,
        rating: rating,
        diveSiteId: selectedSiteId,
        surfaceConditions: surfaceConditions || null,
        weatherConditions: weatherConditions || null,
        workload: workload || null,
        thermalComfort: thermalComfort || null,
        diveMode: diveMode || null,
        deviceManufacturer: deviceManufacturer || null,
        deviceModel: deviceModel || null,
        gasMixes: o2Percent ? [{ name: 'Primary', o2: parseInt(o2Percent), he: parseInt(hePercent) || 0 }] : null,
        gasPressures: startPressure || endPressure ? [{
          tankId: '1',
          label: 'Primary',
          startBar: parseFloat(startPressure) || 0,
          endBar: parseFloat(endPressure) || 0,
          o2Percent: parseInt(o2Percent) || 21,
          hePercent: parseInt(hePercent) || 0,
        }] : null,
        buddyIds: selectedBuddyIds.length > 0 ? selectedBuddyIds : null,
        gearProfileId: selectedGearProfileId,
      };

      const response = await fetch(`${getApiUrl()}/api/dive-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save dive log');
      }

      if (Platform.OS === 'web') {
        alert('Dive log saved successfully!');
        router.back();
      } else {
        Alert.alert('Success', 'Dive log saved successfully!', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save dive log');
    } finally {
      setSaving(false);
    }
  };

  const toggleEquipmentIssue = (issue: string) => {
    if (issue === 'None') {
      setEquipmentIssues(equipmentIssues.includes('None') ? [] : ['None']);
    } else {
      const withoutNone = equipmentIssues.filter(i => i !== 'None');
      if (withoutNone.includes(issue)) {
        setEquipmentIssues(withoutNone.filter(i => i !== issue));
      } else {
        setEquipmentIssues([...withoutNone, issue]);
      }
    }
  };

  const renderChipSelector = (
    label: string,
    options: string[],
    value: string,
    onChange: (val: string) => void
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.chipsRow}>
        {options.map((option) => (
          <Pressable
            key={option}
            style={[
              styles.chip,
              { borderColor: colors.border },
              value === option && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
            ]}
            onPress={() => onChange(value === option ? '' : option)}
          >
            <Text style={[styles.chipText, { color: value === option ? colors.primary : colors.text }]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderStarRating = () => {
    return (
      <View style={styles.ratingContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => setRating(rating === star ? null : star)}>
            <Feather
              name="star"
              size={32}
              color={rating && rating >= star ? '#F59E0B' : colors.border}
              style={{ opacity: rating && rating >= star ? 1 : 0.4 }}
            />
          </Pressable>
        ))}
      </View>
    );
  };

  const renderDiveTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>When & Where</Text>
        
        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Date *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={diveDate}
              onChangeText={setDiveDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Time *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={diveTime}
              onChangeText={setDiveTime}
              placeholder="HH:MM"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        <View style={[styles.inputGroup, showSiteDropdown && { zIndex: 1001 }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Dive Site</Text>
          <Pressable
            style={[styles.input, styles.dropdown, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => {
              setShowGearProfileDropdown(false);
              setShowSiteDropdown(!showSiteDropdown);
            }}
          >
            <Text style={[styles.dropdownText, { color: selectedSiteName ? colors.text : colors.textSecondary }]}>
              {selectedSiteName || 'Select dive site...'}
            </Text>
            <Feather name={showSiteDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </Pressable>
          {showSiteDropdown && (
            <View style={[styles.dropdownList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                <Pressable
                  style={[styles.dropdownItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setSelectedSiteId(null);
                    setSelectedSiteName('');
                    setShowSiteDropdown(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, { color: colors.textSecondary }]}>No site selected</Text>
                </Pressable>
                <Pressable
                  style={[styles.dropdownItem, { borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }]}
                  onPress={() => {
                    setShowSiteDropdown(false);
                    router.push('/dive-site/new' as any);
                  }}
                >
                  <Feather name="plus-circle" size={16} color={colors.primary} />
                  <Text style={[styles.dropdownItemText, { color: colors.primary, fontWeight: '600' }]}>Add New Dive Site</Text>
                </Pressable>
                {diveSites.map((site) => (
                  <Pressable
                    key={site.id}
                    style={[
                      styles.dropdownItem,
                      { borderBottomColor: colors.border },
                      selectedSiteId === site.id && { backgroundColor: colors.primary + '15' }
                    ]}
                    onPress={() => {
                      setSelectedSiteId(site.id);
                      setSelectedSiteName(site.name);
                      setShowSiteDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, { color: colors.text }]}>{site.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={[styles.inputGroup, showGearProfileDropdown && { zIndex: 1001 }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Gear Profile</Text>
          <Pressable
            style={[styles.input, styles.dropdown, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => {
              setShowSiteDropdown(false);
              setShowGearProfileDropdown(!showGearProfileDropdown);
            }}
          >
            <Text style={[styles.dropdownText, { color: selectedGearProfileName ? colors.text : colors.textSecondary }]}>
              {selectedGearProfileName || 'Select gear profile...'}
            </Text>
            <Feather name={showGearProfileDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </Pressable>
          {showGearProfileDropdown && (
            <View style={[styles.dropdownList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                <Pressable
                  style={[styles.dropdownItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setSelectedGearProfileId(null);
                    setSelectedGearProfileName('');
                    setShowGearProfileDropdown(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, { color: colors.textSecondary }]}>No gear profile selected</Text>
                </Pressable>
                {gearProfiles.map((profile) => (
                  <Pressable
                    key={profile.id}
                    style={[
                      styles.dropdownItem,
                      { borderBottomColor: colors.border },
                      selectedGearProfileId === profile.id && { backgroundColor: colors.primary + '15' }
                    ]}
                    onPress={() => {
                      setSelectedGearProfileId(profile.id);
                      setSelectedGearProfileName(profile.name);
                      setShowGearProfileDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, { color: colors.text }]}>{profile.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Statistics</Text>
        
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Duration (minutes)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={duration}
            onChangeText={setDuration}
            placeholder="e.g. 45"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Max Depth (m)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={maxDepth}
              onChangeText={setMaxDepth}
              placeholder="e.g. 25.5"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Avg Depth (m)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={avgDepth}
              onChangeText={setAvgDepth}
              placeholder="e.g. 18.0"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Min Temp (°C)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={minTemp}
              onChangeText={setMinTemp}
              placeholder="e.g. 22"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Max Temp (°C)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={maxTemp}
              onChangeText={setMaxTemp}
              placeholder="e.g. 26"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Conditions</Text>
        {renderChipSelector('Surface Conditions', SURFACE_CONDITIONS, surfaceConditions, setSurfaceConditions)}
        {renderChipSelector('Weather', WEATHER_CONDITIONS, weatherConditions, setWeatherConditions)}
      </View>
    </ScrollView>
  );

  const renderGasTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Mode</Text>
        {renderChipSelector('Dive Mode', DIVE_MODES, diveMode, setDiveMode)}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Device Information</Text>
        
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Manufacturer</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={deviceManufacturer}
            onChangeText={setDeviceManufacturer}
            placeholder="e.g. Shearwater, Suunto"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Model</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={deviceModel}
            onChangeText={setDeviceModel}
            placeholder="e.g. Perdix AI, D5"
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Gas Mix</Text>
        
        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>O2 %</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={o2Percent}
              onChangeText={setO2Percent}
              placeholder="21"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>He %</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={hePercent}
              onChangeText={setHePercent}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Start Pressure (bar)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={startPressure}
              onChangeText={setStartPressure}
              placeholder="e.g. 200"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>End Pressure (bar)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={endPressure}
              onChangeText={setEndPressure}
              placeholder="e.g. 50"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderProblemsTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Physical State</Text>
        {renderChipSelector('Workload', WORKLOAD_OPTIONS, workload, setWorkload)}
        {renderChipSelector('Thermal Comfort', THERMAL_OPTIONS, thermalComfort, setThermalComfort)}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Equipment Issues</Text>
        <View style={styles.checkboxGrid}>
          {EQUIPMENT_OPTIONS.map((equip) => {
            const isChecked = equipmentIssues.includes(equip);
            return (
              <Pressable key={equip} style={styles.checkboxItem} onPress={() => toggleEquipmentIssue(equip)}>
                <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: isChecked ? colors.primary + '20' : 'transparent' }]}>
                  {isChecked && <Feather name="check" size={12} color={colors.primary} />}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.text }]}>{equip}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Decompression Symptoms</Text>
        <View style={styles.radioRow}>
          <Pressable style={styles.radioItem} onPress={() => setDecompressionSymptoms(false)}>
            <View style={[styles.radio, { borderColor: colors.border, backgroundColor: !decompressionSymptoms ? colors.primary : 'transparent' }]} />
            <Text style={[styles.radioLabel, { color: colors.text }]}>No</Text>
          </Pressable>
          <Pressable style={styles.radioItem} onPress={() => setDecompressionSymptoms(true)}>
            <View style={[styles.radio, { borderColor: colors.border, backgroundColor: decompressionSymptoms ? colors.primary : 'transparent' }]} />
            <Text style={[styles.radioLabel, { color: colors.text }]}>Yes</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Problem Notes</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
          value={problemNotes}
          onChangeText={setProblemNotes}
          placeholder="Describe any problems encountered during the dive..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>
    </ScrollView>
  );

  const renderSkillsTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.fieldRow}>
          <Feather name="award" size={16} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Skills Practised</Text>
        </View>
        <TextInput
          style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, minHeight: 150 }]}
          value={skillsNotes}
          onChangeText={setSkillsNotes}
          placeholder={`Record the skills you practised on this dive, for example:
• Buoyancy control and trim
• SMB deployment
• Mask clearing
• Gas switching procedures
• Backwards finning
• Line laying with markers
• Emergency drills (bailout, valve shutdown)`}
          placeholderTextColor={colors.textSecondary}
          multiline
          textAlignVertical="top"
        />
      </View>
    </ScrollView>
  );

  const renderNotesTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Rating</Text>
        {renderStarRating()}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Notes</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Add notes about your dive..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
      </View>
    </ScrollView>
  );

  const renderTeamTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Buddies</Text>
        
        {loadingBuddies ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : buddies.length === 0 ? (
          <View style={styles.emptyBuddies}>
            <Feather name="users" size={32} color={colors.textSecondary} />
            <Text style={[styles.emptyBuddiesText, { color: colors.textSecondary }]}>
              No dive buddies added yet
            </Text>
            <Pressable
              style={[styles.addBuddyButton, { borderColor: colors.primary }]}
              onPress={() => router.push('/(app)/(tabs)/dive-buddies')}
            >
              <Feather name="plus" size={16} color={colors.primary} />
              <Text style={[styles.addBuddyButtonText, { color: colors.primary }]}>Add Buddies</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.buddyList}>
            {buddies.map((buddy) => (
              <Pressable
                key={buddy.id}
                style={[
                  styles.buddyItem,
                  { borderColor: colors.border },
                  selectedBuddyIds.includes(buddy.id) && { backgroundColor: colors.primary + '15', borderColor: colors.primary }
                ]}
                onPress={() => {
                  if (selectedBuddyIds.includes(buddy.id)) {
                    setSelectedBuddyIds(selectedBuddyIds.filter(id => id !== buddy.id));
                  } else {
                    setSelectedBuddyIds([...selectedBuddyIds, buddy.id]);
                  }
                }}
              >
                <View style={[styles.buddyAvatar, { backgroundColor: colors.primary + '20' }]}>
                  <Feather name="user" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.buddyName, { color: colors.text }]}>{buddy.name}</Text>
                {selectedBuddyIds.includes(buddy.id) && (
                  <Feather name="check-circle" size={20} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Team Notes</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
          value={buddyNotes}
          onChangeText={setBuddyNotes}
          placeholder="Notes about your dive team..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>
    </ScrollView>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Dive':
        return renderDiveTab();
      case 'Gas':
        return renderGasTab();
      case 'Problems':
        return renderProblemsTab();
      case 'Skills':
        return renderSkillsTab();
      case 'Team':
        return renderTeamTab();
      case 'Notes':
        return renderNotesTab();
      default:
        return null;
    }
  };

  return (
    <ThemedBackground>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Log Dive</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.tabItem,
                activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab ? colors.primary : colors.textSecondary },
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {renderTabContent()}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  tabBar: {
    borderBottomWidth: 1,
  },
  tabScrollContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  tabItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    minWidth: 48,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tabContent: {
    flex: 1,
  },
  tabContentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: 16,
  },
  dropdownList: {
    position: 'absolute',
    top: 75,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 10,
    zIndex: 1000,
    elevation: 5,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  dropdownItemText: {
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 120,
  },
  ratingContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  chipSection: {
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBuddies: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyBuddiesText: {
    fontSize: 14,
    marginTop: 12,
    marginBottom: 16,
  },
  addBuddyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  addBuddyButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  buddyList: {
    gap: 8,
  },
  buddyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  buddyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buddyName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '50%',
    paddingVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 13,
    flex: 1,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 24,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  radioLabel: {
    fontSize: 14,
  },
});
