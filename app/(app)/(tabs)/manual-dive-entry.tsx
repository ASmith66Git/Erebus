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

interface DiveSite {
  id: number;
  name: string;
}

export default function ManualDiveEntryScreen() {
  const { colors } = useTheme();
  const { token } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [diveSites, setDiveSites] = useState<DiveSite[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);

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

  useEffect(() => {
    loadDiveSites();
  }, []);

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

  const renderStarRating = () => {
    return (
      <View style={styles.ratingContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => setRating(rating === star ? null : star)}>
            <Feather
              name={rating && rating >= star ? 'star' : 'star'}
              size={32}
              color={rating && rating >= star ? '#F59E0B' : colors.border}
              style={{ opacity: rating && rating >= star ? 1 : 0.4 }}
            />
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>When</Text>
          
          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Date *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={diveDate}
                onChangeText={setDiveDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Time *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={diveTime}
                onChangeText={setDiveTime}
                placeholder="HH:MM"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Duration (minutes)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={duration}
              onChangeText={setDuration}
              placeholder="e.g. 45"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Depth</Text>
          
          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Max Depth (m)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
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
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={avgDepth}
                onChangeText={setAvgDepth}
                placeholder="e.g. 18.0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Temperature</Text>
          
          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Min Temp (°C)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
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
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={maxTemp}
                onChangeText={setMaxTemp}
                placeholder="e.g. 26"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Rating</Text>
          {renderStarRating()}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes about your dive..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
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
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 100,
  },
  ratingContainer: {
    flexDirection: 'row',
    gap: 8,
  },
});
