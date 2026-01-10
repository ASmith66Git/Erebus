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

interface DiveLog {
  id: number;
  notes: string | null;
  rating: number | null;
  buddy: string | null;
  surfaceConditions: string | null;
  weatherConditions: string | null;
  workload: string | null;
  thermalComfort: string | null;
  equipmentIssues: string[] | null;
  skillsPracticed: string[] | null;
  decompressionSymptoms: boolean | null;
  problemNotes: string | null;
}

export default function EditDiveLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<number>(0);
  const [buddy, setBuddy] = useState('');
  const [surfaceConditions, setSurfaceConditions] = useState('');
  const [weatherConditions, setWeatherConditions] = useState('');
  const [workload, setWorkload] = useState('');
  const [thermalComfort, setThermalComfort] = useState('');
  const [equipmentIssues, setEquipmentIssues] = useState<string[]>([]);
  const [skillsPracticed, setSkillsPracticed] = useState<string[]>([]);
  const [decompressionSymptoms, setDecompressionSymptoms] = useState(false);
  const [problemNotes, setProblemNotes] = useState('');

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
      
      setNotes(data.notes || '');
      setRating(data.rating || 0);
      setBuddy(data.buddy || '');
      setSurfaceConditions(data.surfaceConditions || '');
      setWeatherConditions(data.weatherConditions || '');
      setWorkload(data.workload || '');
      setThermalComfort(data.thermalComfort || '');
      setEquipmentIssues(data.equipmentIssues || []);
      setSkillsPracticed(data.skillsPracticed || []);
      setDecompressionSymptoms(data.decompressionSymptoms || false);
      setProblemNotes(data.problemNotes || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    fetchDiveLog();
  }, [fetchDiveLog]);

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
          notes: notes || null,
          rating: rating || null,
          buddy: buddy || null,
          surfaceConditions: surfaceConditions || null,
          weatherConditions: weatherConditions || null,
          workload: workload || null,
          thermalComfort: thermalComfort || null,
          equipmentIssues: equipmentIssues.length > 0 ? equipmentIssues : null,
          skillsPracticed: skillsPracticed.length > 0 ? skillsPracticed : null,
          decompressionSymptoms,
          problemNotes: problemNotes || null,
        }),
      });
      
      if (response.ok) {
        router.back();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save changes';
      if (Platform.OS === 'web') {
        alert(errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleEquipmentIssue = (option: string) => {
    setEquipmentIssues(prev => 
      prev.includes(option) 
        ? prev.filter(e => e !== option) 
        : [...prev, option]
    );
  };

  const toggleSkill = (option: string) => {
    setSkillsPracticed(prev => 
      prev.includes(option) 
        ? prev.filter(s => s !== option) 
        : [...prev, option]
    );
  };

  const renderStarRating = () => {
    return (
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => setRating(star)}>
            <Feather
              name={star <= rating ? 'star' : 'star'}
              size={32}
              color={star <= rating ? '#FFD700' : colors.border}
              style={{ marginHorizontal: 4 }}
            />
          </Pressable>
        ))}
      </View>
    );
  };

  const renderOptionPicker = (
    label: string,
    options: string[],
    value: string,
    onChange: (val: string) => void
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.optionsRow}>
        {options.map((option) => (
          <Pressable
            key={option}
            style={[
              styles.optionButton,
              { borderColor: colors.border },
              value === option && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
            ]}
            onPress={() => onChange(value === option ? '' : option)}
          >
            <Text style={[styles.optionText, { color: value === option ? colors.primary : colors.text }]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
            placeholder="Add dive notes..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

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
          <Text style={[styles.cardTitle, { color: colors.text }]}>Conditions</Text>
          {renderOptionPicker('Surface Conditions', SURFACE_CONDITIONS_OPTIONS, surfaceConditions, setSurfaceConditions)}
          {renderOptionPicker('Weather', WEATHER_OPTIONS, weatherConditions, setWeatherConditions)}
          {renderOptionPicker('Workload', WORKLOAD_OPTIONS, workload, setWorkload)}
          {renderOptionPicker('Thermal Comfort', THERMAL_OPTIONS, thermalComfort, setThermalComfort)}
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
          
          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>Problem Notes</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={problemNotes}
            onChangeText={setProblemNotes}
            placeholder="Describe any problems encountered..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
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
  content: {
    flex: 1,
    padding: 16,
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
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  textArea: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    minHeight: 100,
    fontSize: 15,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    marginBottom: 8,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  optionText: {
    fontSize: 13,
  },
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    paddingVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: 8,
  },
  radioLabel: {
    fontSize: 14,
  },
  errorText: {
    fontSize: 16,
    marginTop: 12,
  },
});
