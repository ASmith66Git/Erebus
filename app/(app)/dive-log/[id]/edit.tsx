import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';

const TABS = ['Dive', 'Profile', 'Computer', 'Notes', 'Team', 'Problems'] as const;
type TabType = typeof TABS[number];

const EQUIPMENT_OPTIONS = [
  'None', 'First Stages', 'Second Stages', 'Gas Hoses', 'Wing', 'Harness',
  'Torches', 'Weights', 'SMBs', 'Reels', 'Suit Inflation', 'Suit Venting',
  'Fins', 'Masks', 'CCR O2', 'CCR Dil', 'CCR CO2', 'Dive Computer', 'Other'
];

const SKILLS_OPTIONS = [
  'Bailout', 'Gas switch', 'SMB launch', 'Mask clearing', 'Backward manoeuvring',
  'Buoyancy', 'Breathing', 'Gas Shut down', 'High PO2', 'Low PO2',
  'Manual PO2', 'Line laying with markers'
];

const WORKLOAD_OPTIONS = ['Light', 'Moderate', 'Heavy', 'Exhausting'];
const THERMAL_OPTIONS = ['Cold', 'Cool', 'Comfortable', 'Warm', 'Hot'];
const SURFACE_CONDITIONS_OPTIONS = ['Calm', 'Slight waves', 'Moderate waves', 'Rough', 'Very rough'];
const WEATHER_OPTIONS = ['Clear', 'Partly cloudy', 'Overcast', 'Light rain', 'Heavy rain', 'Storm'];
const DIVE_MODES = ['Open Circuit', 'CCR', 'SCR', 'Sidemount', 'Freedive'];

interface DiveLog {
  id: number;
  diveNumber: number | null;
  diveSiteId: number | null;
  diveSiteName: string | null;
  diveDateTime: string;
  startTime: string | null;
  endTime: string | null;
  durationSeconds: number | null;
  maxDepthMeters: number | null;
  avgDepthMeters: number | null;
  minTemperatureCelsius: number | null;
  maxTemperatureCelsius: number | null;
  deviceManufacturer: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  deviceFirmware: string | null;
  notes: string | null;
  rating: number | null;
  buddy: string | null;
  diveMode: string | null;
  surfaceConditions: string | null;
  weatherConditions: string | null;
  workload: string | null;
  thermalComfort: string | null;
  visibility: string | null;
  equipmentIssues: string[] | null;
  skillsPracticed: string[] | null;
  decompressionSymptoms: boolean | null;
  problemNotes: string | null;
  gearProfileId: number | null;
  samples: any[] | null;
}

interface DiveBuddy {
  id: number;
  name: string;
  photoUrl: string | null;
}

export default function EditDiveLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useAuth();
  
  const [activeTab, setActiveTab] = useState<TabType>('Dive');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [diveNumber, setDiveNumber] = useState('');
  const [diveSiteName, setDiveSiteName] = useState('');
  const [diveDateTime, setDiveDateTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [maxDepth, setMaxDepth] = useState('');
  const [avgDepth, setAvgDepth] = useState('');
  const [waterTemp, setWaterTemp] = useState('');
  
  const [diveMode, setDiveMode] = useState('');
  
  const [deviceManufacturer, setDeviceManufacturer] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');
  const [deviceFirmware, setDeviceFirmware] = useState('');
  
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<number>(0);
  const [visibility, setVisibility] = useState('');
  const [surfaceConditions, setSurfaceConditions] = useState('');
  const [weatherConditions, setWeatherConditions] = useState('');
  const [workload, setWorkload] = useState('');
  const [thermalComfort, setThermalComfort] = useState('');
  const [equipmentIssues, setEquipmentIssues] = useState<string[]>([]);
  const [skillsPracticed, setSkillsPracticed] = useState<string[]>([]);
  const [decompressionSymptoms, setDecompressionSymptoms] = useState(false);
  const [problemNotes, setProblemNotes] = useState('');
  
  const [buddy, setBuddy] = useState('');
  const [buddies, setBuddies] = useState<DiveBuddy[]>([]);
  const [selectedBuddyIds, setSelectedBuddyIds] = useState<number[]>([]);
  const [loadingBuddies, setLoadingBuddies] = useState(true);
  
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [gearProfileId, setGearProfileId] = useState<number | null>(null);
  const [gearProfiles, setGearProfiles] = useState<{ id: number; name: string }[]>([]);
  const [diveSites, setDiveSites] = useState<{ id: number; name: string }[]>([]);
  const [diveSiteId, setDiveSiteId] = useState<number | null>(null);
  const [isFromComputer, setIsFromComputer] = useState(false);

  const fetchDiveLog = useCallback(async () => {
    if (!id || !token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch dive log');
      }
      
      const data: DiveLog = await response.json();
      
      setDiveNumber(data.diveNumber?.toString() || '');
      setDiveSiteName(data.diveSiteName || '');
      setDiveSiteId(data.diveSiteId);
      setDiveDateTime(data.diveDateTime || '');
      setStartTime(data.startTime || '');
      setEndTime(data.endTime || '');
      setDurationMinutes(data.durationSeconds ? Math.round(data.durationSeconds / 60).toString() : '');
      setMaxDepth(data.maxDepthMeters?.toString() || '');
      setAvgDepth(data.avgDepthMeters?.toString() || '');
      setWaterTemp(data.minTemperatureCelsius?.toString() || '');
      setDiveMode(data.diveMode || '');
      setDeviceManufacturer(data.deviceManufacturer || '');
      setDeviceModel(data.deviceModel || '');
      setDeviceSerial(data.deviceSerial || '');
      setDeviceFirmware(data.deviceFirmware || '');
      setNotes(data.notes || '');
      setRating(data.rating || 0);
      setVisibility(data.visibility || '');
      setBuddy(data.buddy || '');
      setSurfaceConditions(data.surfaceConditions || '');
      setWeatherConditions(data.weatherConditions || '');
      setWorkload(data.workload || '');
      setThermalComfort(data.thermalComfort || '');
      setEquipmentIssues(data.equipmentIssues || []);
      setSkillsPracticed(data.skillsPracticed || []);
      setDecompressionSymptoms(data.decompressionSymptoms || false);
      setProblemNotes(data.problemNotes || '');
      setGearProfileId(data.gearProfileId);
      
      // Check if data is from computer (has samples or device info)
      const fromComputer = !!(data.samples && data.samples.length > 0) || !!data.deviceManufacturer;
      setIsFromComputer(fromComputer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  const fetchBuddies = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-buddies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setBuddies(data);
      }
    } catch (err) {
      console.error('Error fetching buddies:', err);
    } finally {
      setLoadingBuddies(false);
    }
  }, [token]);

  const fetchGearProfiles = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/gear-profiles`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const profiles = data.profiles || [];
        setGearProfiles(profiles.map((p: any) => ({ id: p.id, name: p.name })));
      }
    } catch (err) {
      console.error('Error fetching gear profiles:', err);
    }
  }, [token]);

  const fetchDiveSites = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-sites`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const sites = data.sites || [];
        setDiveSites(sites.map((s: any) => ({ id: s.id, name: s.name })));
      }
    } catch (err) {
      console.error('Error fetching dive sites:', err);
    }
  }, [token]);

  useEffect(() => {
    if (token && id) {
      fetchDiveLog();
      fetchBuddies();
      fetchGearProfiles();
      fetchDiveSites();
    }
  }, [token, id, fetchDiveLog, fetchBuddies, fetchGearProfiles, fetchDiveSites]);

  const handleSave = async () => {
    if (!id || !token) return;
    
    setSaving(true);
    
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          diveNumber: diveNumber ? parseInt(diveNumber) : null,
          diveSiteId,
          startTime: startTime || null,
          endTime: endTime || null,
          durationSeconds: durationMinutes ? parseInt(durationMinutes) * 60 : null,
          maxDepthMeters: maxDepth ? parseFloat(maxDepth) : null,
          avgDepthMeters: avgDepth ? parseFloat(avgDepth) : null,
          minTemperatureCelsius: waterTemp ? parseFloat(waterTemp) : null,
          diveMode: diveMode || null,
          deviceManufacturer: deviceManufacturer || null,
          deviceModel: deviceModel || null,
          deviceSerial: deviceSerial || null,
          deviceFirmware: deviceFirmware || null,
          notes: notes || null,
          rating: rating > 0 ? rating : null,
          visibility: visibility || null,
          buddy: buddy || null,
          surfaceConditions: surfaceConditions || null,
          weatherConditions: weatherConditions || null,
          workload: workload || null,
          thermalComfort: thermalComfort || null,
          equipmentIssues: equipmentIssues.length > 0 ? equipmentIssues : null,
          skillsPracticed: skillsPracticed.length > 0 ? skillsPracticed : null,
          decompressionSymptoms,
          problemNotes: problemNotes || null,
          gearProfileId,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save dive log');
      }
      
      router.back();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleEquipmentIssue = (issue: string) => {
    setEquipmentIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue]
    );
  };

  const toggleSkill = (skill: string) => {
    setSkillsPracticed((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const toggleBuddy = (buddyId: number) => {
    setSelectedBuddyIds((prev) =>
      prev.includes(buddyId) ? prev.filter((id) => id !== buddyId) : [...prev, buddyId]
    );
  };

  const renderStarRating = () => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => setRating(star)}>
          <Feather
            name="star"
            size={32}
            color={star <= rating ? '#FFD700' : colors.border}
            style={{ marginHorizontal: 4 }}
          />
        </Pressable>
      ))}
    </View>
  );

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

  const renderDiveTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Info</Text>
        
        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Dive #</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={diveNumber}
              onChangeText={setDiveNumber}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 2 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Date</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={diveDateTime ? new Date(diveDateTime).toLocaleDateString() : ''}
              editable={false}
              placeholder="Select date"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Start Time</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="09:30"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>End Time</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="10:15"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>
      </View>

      {isFromComputer && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Computer Data</Text>
            <View style={[styles.readOnlyBadge, { backgroundColor: colors.textSecondary + '30' }]}>
              <Feather name="lock" size={12} color={colors.textSecondary} />
              <Text style={[styles.readOnlyText, { color: colors.textSecondary }]}>Read-only</Text>
            </View>
          </View>
          
          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Duration (min)</Text>
              <TextInput
                style={[styles.input, styles.readOnlyInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textSecondary }]}
                value={durationMinutes}
                editable={false}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Max Depth (m)</Text>
              <TextInput
                style={[styles.input, styles.readOnlyInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textSecondary }]}
                value={maxDepth}
                editable={false}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Avg Depth (m)</Text>
              <TextInput
                style={[styles.input, styles.readOnlyInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textSecondary }]}
                value={avgDepth}
                editable={false}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Water Temp (°C)</Text>
              <TextInput
                style={[styles.input, styles.readOnlyInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.textSecondary }]}
                value={waterTemp}
                editable={false}
              />
            </View>
          </View>
        </View>
      )}

      {!isFromComputer && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Data</Text>
          
          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Duration (min)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={durationMinutes}
                onChangeText={setDurationMinutes}
                keyboardType="numeric"
                placeholder="45"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Max Depth (m)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={maxDepth}
                onChangeText={setMaxDepth}
                keyboardType="decimal-pad"
                placeholder="18.5"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Avg Depth (m)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={avgDepth}
                onChangeText={setAvgDepth}
                keyboardType="decimal-pad"
                placeholder="12.0"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Water Temp (°C)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={waterTemp}
                onChangeText={setWaterTemp}
                keyboardType="decimal-pad"
                placeholder="22"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Conditions</Text>
        {renderChipSelector('Surface Conditions', SURFACE_CONDITIONS_OPTIONS, surfaceConditions, setSurfaceConditions)}
        {renderChipSelector('Weather', WEATHER_OPTIONS, weatherConditions, setWeatherConditions)}
        
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Visibility</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={visibility}
            onChangeText={setVisibility}
            placeholder="e.g., 15m, Good, Poor"
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Site</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipsRow}>
            {diveSites.map((site) => (
              <Pressable
                key={site.id}
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  diveSiteId === site.id && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                ]}
                onPress={() => {
                  setDiveSiteId(diveSiteId === site.id ? null : site.id);
                  setDiveSiteName(diveSiteId === site.id ? '' : site.name);
                }}
              >
                <Text style={[styles.chipText, { color: diveSiteId === site.id ? colors.primary : colors.text }]}>
                  {site.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        {diveSites.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No dive sites available</Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Gear Profile</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipsRow}>
            {gearProfiles.map((profile) => (
              <Pressable
                key={profile.id}
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  gearProfileId === profile.id && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                ]}
                onPress={() => setGearProfileId(gearProfileId === profile.id ? null : profile.id)}
              >
                <Text style={[styles.chipText, { color: gearProfileId === profile.id ? colors.primary : colors.text }]}>
                  {profile.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        {gearProfiles.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No gear profiles available</Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Rating</Text>
        {renderStarRating()}
      </View>
    </ScrollView>
  );

  const renderProfileTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Mode</Text>
        <View style={styles.chipsRow}>
          {DIVE_MODES.map((mode) => (
            <Pressable
              key={mode}
              style={[
                styles.chip,
                { borderColor: colors.border },
                diveMode === mode && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
              ]}
              onPress={() => setDiveMode(diveMode === mode ? '' : mode)}
            >
              <Text style={[styles.chipText, { color: diveMode === mode ? colors.primary : colors.text }]}>
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Skills Practiced</Text>
        <View style={styles.checkboxGrid}>
          {SKILLS_OPTIONS.map((skill) => {
            const isChecked = skillsPracticed.includes(skill);
            return (
              <Pressable key={skill} style={styles.checkboxItem} onPress={() => toggleSkill(skill)}>
                <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: isChecked ? colors.primary + '20' : 'transparent' }]}>
                  {isChecked && <Feather name="check" size={12} color={colors.primary} />}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.text }]}>{skill}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );

  const renderComputerTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Computer</Text>
          {isFromComputer && (
            <View style={[styles.readOnlyBadge, { backgroundColor: colors.textSecondary + '30' }]}>
              <Feather name="lock" size={12} color={colors.textSecondary} />
              <Text style={[styles.readOnlyText, { color: colors.textSecondary }]}>Read-only</Text>
            </View>
          )}
        </View>
        
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Brand</Text>
          <TextInput
            style={[styles.input, isFromComputer && styles.readOnlyInput, { backgroundColor: colors.background, borderColor: colors.border, color: isFromComputer ? colors.textSecondary : colors.text }]}
            value={deviceManufacturer}
            onChangeText={setDeviceManufacturer}
            editable={!isFromComputer}
            placeholder="Shearwater, Suunto, etc."
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Model</Text>
          <TextInput
            style={[styles.input, isFromComputer && styles.readOnlyInput, { backgroundColor: colors.background, borderColor: colors.border, color: isFromComputer ? colors.textSecondary : colors.text }]}
            value={deviceModel}
            onChangeText={setDeviceModel}
            editable={!isFromComputer}
            placeholder="Perdix, D5, etc."
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Serial #</Text>
            <TextInput
              style={[styles.input, isFromComputer && styles.readOnlyInput, { backgroundColor: colors.background, borderColor: colors.border, color: isFromComputer ? colors.textSecondary : colors.text }]}
              value={deviceSerial}
              onChangeText={setDeviceSerial}
              editable={!isFromComputer}
              placeholder="ABC123"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Firmware</Text>
            <TextInput
              style={[styles.input, isFromComputer && styles.readOnlyInput, { backgroundColor: colors.background, borderColor: colors.border, color: isFromComputer ? colors.textSecondary : colors.text }]}
              value={deviceFirmware}
              onChangeText={setDeviceFirmware}
              editable={!isFromComputer}
              placeholder="v2.0"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderNotesTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Notes</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Add dive notes..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
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

  const renderTeamTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Buddy / Team</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
          value={buddy}
          onChangeText={setBuddy}
          placeholder="Add buddy or team members..."
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Select from Buddies</Text>
        {loadingBuddies ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : buddies.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No buddies added yet. Add buddies from the Buddies screen.
          </Text>
        ) : (
          <View style={styles.buddyList}>
            {buddies.map((b) => {
              const isSelected = selectedBuddyIds.includes(b.id);
              return (
                <Pressable
                  key={b.id}
                  style={[
                    styles.buddyItem,
                    { borderColor: colors.border },
                    isSelected && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                  ]}
                  onPress={() => toggleBuddy(b.id)}
                >
                  <View style={[styles.buddyAvatar, { backgroundColor: colors.border }]}>
                    <Text style={[styles.buddyInitial, { color: colors.text }]}>
                      {b.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.buddyName, { color: colors.text }]}>{b.name}</Text>
                  {isSelected && (
                    <Feather name="check" size={18} color={colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Dive':
        return renderDiveTab();
      case 'Profile':
        return renderProfileTab();
      case 'Computer':
        return renderComputerTab();
      case 'Notes':
        return renderNotesTab();
      case 'Team':
        return renderTeamTab();
      case 'Problems':
        return renderProblemsTab();
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="x" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Dive</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={[styles.centered, { flex: 1 }]}>
          <Feather name="alert-circle" size={48} color={colors.textSecondary} />
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Dive</Text>
        <Pressable 
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
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
      </View>

      {renderTabContent()}
    </KeyboardAvoidingView>
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
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 72,
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
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
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
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
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
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
    fontSize: 15,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  buddyList: {
    gap: 8,
  },
  buddyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  buddyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buddyInitial: {
    fontSize: 16,
    fontWeight: '600',
  },
  buddyName: {
    flex: 1,
    fontSize: 15,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  readOnlyText: {
    fontSize: 11,
    fontWeight: '500',
  },
  readOnlyInput: {
    opacity: 0.7,
  },
});
