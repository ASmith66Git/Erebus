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
  Switch,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { getApiUrl } from '@/utils/apiConfig';
import DatePickerField from '@/components/DatePickerField';
import PageHeader from '@/components/PageHeader';
import ThemedBackground from '@/components/ThemedBackground';
import { useTranslation } from 'react-i18next';

interface TestRecord {
  id: number;
  cylinderId: number;
  testDate: string;
  testType: string;
  result: string;
  facilityName: string | null;
  notes: string | null;
  createdAt: string;
}

const CYLINDER_TYPES = ['steel', 'aluminium', 'composite'];
const TESTING_STANDARDS = ['UK', 'US', 'EU', 'custom'];
const TEST_TYPES = ['visual', 'hydrostatic', 'oxygen_clean'];
const TEST_RESULTS = ['pass', 'fail'];

const STATUS_COLORS: Record<string, { bg: string; label: string }> = {
  green: { bg: '#059669', label: 'In Test' },
  amber: { bg: '#D97706', label: 'Due Soon' },
  red: { bg: '#DC2626', label: 'Overdue' },
};

export default function CylinderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useAuth();
  const { formatVolume, formatPressure, formatDate, getVolumeUnit, getPressureUnit, units, convertVolumeToMetric, convertVolumeFromMetric } = useSettings();
  const { t } = useTranslation();

  const convertPressureToMetric = (psi: number) => psi / 14.5038;
  const convertPressureFromMetric = (bar: number) => bar * 14.5038;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testRecords, setTestRecords] = useState<TestRecord[]>([]);
  const [showAddTestModal, setShowAddTestModal] = useState(false);
  const [gearProfiles, setGearProfiles] = useState<{ id: number; name: string }[]>([]);

  const [form, setForm] = useState({
    nickname: '',
    cylinderType: 'steel',
    sizeLiters: '',
    serialNumber: '',
    workingPressure: '',
    manufactureDate: '',
    testingStandard: 'UK',
    customVisualIntervalMonths: '',
    customHydroIntervalMonths: '',
    isEnrichedGas: false,
    oxygenCleanIntervalMonths: '15',
    lastVisualDate: '',
    lastHydroDate: '',
    lastOxygenCleanDate: '',
    reminderEnabled: true,
    reminderDaysBefore: '30',
    gearProfileId: null as number | null,
  });

  const [status, setStatus] = useState<string>('green');
  const [nextVisualDue, setNextVisualDue] = useState<string | null>(null);
  const [nextHydroDue, setNextHydroDue] = useState<string | null>(null);
  const [nextOxygenCleanDue, setNextOxygenCleanDue] = useState<string | null>(null);

  const [testForm, setTestForm] = useState({
    testDate: new Date().toISOString().split('T')[0],
    testType: 'visual',
    result: 'pass',
    facilityName: '',
    notes: '',
  });

  const fetchGearProfiles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/gear-profiles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGearProfiles((data.profiles || []).map((p: any) => ({ id: p.id, name: p.name })));
      }
    } catch (error) {
      console.error('Error fetching gear profiles:', error);
    }
  }, [token]);

  const fetchCylinder = useCallback(async () => {
    if (isNew || !token) return;
    try {
      const [cylRes, recordsRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/cylinders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/cylinders/${id}/test-records`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (cylRes.ok) {
        const data = await cylRes.json();
        const displaySize = data.sizeLiters != null
          ? (units === 'imperial' ? convertVolumeFromMetric(data.sizeLiters).toFixed(1) : data.sizeLiters.toString())
          : '';
        const displayPressure = data.workingPressure != null
          ? (units === 'imperial' ? convertPressureFromMetric(data.workingPressure).toFixed(0) : data.workingPressure.toString())
          : '';
        setForm({
          nickname: data.nickname || '',
          cylinderType: data.cylinderType || 'steel',
          sizeLiters: displaySize,
          serialNumber: data.serialNumber || '',
          workingPressure: displayPressure,
          manufactureDate: data.manufactureDate ? data.manufactureDate.split('T')[0] : '',
          testingStandard: data.testingStandard || 'UK',
          customVisualIntervalMonths: data.customVisualIntervalMonths?.toString() || '',
          customHydroIntervalMonths: data.customHydroIntervalMonths?.toString() || '',
          isEnrichedGas: data.isEnrichedGas || false,
          oxygenCleanIntervalMonths: data.oxygenCleanIntervalMonths?.toString() || '15',
          lastVisualDate: data.lastVisualDate ? data.lastVisualDate.split('T')[0] : '',
          lastHydroDate: data.lastHydroDate ? data.lastHydroDate.split('T')[0] : '',
          lastOxygenCleanDate: data.lastOxygenCleanDate ? data.lastOxygenCleanDate.split('T')[0] : '',
          reminderEnabled: data.reminderEnabled !== false,
          reminderDaysBefore: data.reminderDaysBefore?.toString() || '30',
          gearProfileId: data.gearProfileId || null,
        });
        setStatus(data.status || 'green');
        setNextVisualDue(data.nextVisualDue);
        setNextHydroDue(data.nextHydroDue);
        setNextOxygenCleanDue(data.nextOxygenCleanDue);
      }

      if (recordsRes.ok) {
        const data = await recordsRes.json();
        setTestRecords(data.records || []);
      }
    } catch (error) {
      console.error('Error fetching cylinder:', error);
    } finally {
      setLoading(false);
    }
  }, [id, isNew, token]);

  useEffect(() => {
    fetchCylinder();
    fetchGearProfiles();
  }, [fetchCylinder, fetchGearProfiles]);

  const handleSave = async () => {
    if (!form.nickname.trim()) {
      Alert.alert(t('common.error'), t('cylinders.nicknameRequired'));
      return;
    }

    setSaving(true);
    try {
      const sizeValue = form.sizeLiters ? parseFloat(form.sizeLiters) : null;
      const pressureValue = form.workingPressure ? parseFloat(form.workingPressure) : null;
      const sizeLiters = sizeValue != null ? (units === 'imperial' ? convertVolumeToMetric(sizeValue) : sizeValue) : null;
      const workingPressureBar = pressureValue != null ? (units === 'imperial' ? convertPressureToMetric(pressureValue) : pressureValue) : null;

      const body = {
        nickname: form.nickname,
        cylinderType: form.cylinderType,
        sizeLiters,
        serialNumber: form.serialNumber || null,
        workingPressure: workingPressureBar,
        manufactureDate: form.manufactureDate || null,
        testingStandard: form.testingStandard,
        customVisualIntervalMonths: form.customVisualIntervalMonths ? parseInt(form.customVisualIntervalMonths) : null,
        customHydroIntervalMonths: form.customHydroIntervalMonths ? parseInt(form.customHydroIntervalMonths) : null,
        isEnrichedGas: form.isEnrichedGas,
        oxygenCleanIntervalMonths: form.oxygenCleanIntervalMonths ? parseInt(form.oxygenCleanIntervalMonths) : 15,
        lastVisualDate: form.lastVisualDate || null,
        lastHydroDate: form.lastHydroDate || null,
        lastOxygenCleanDate: form.lastOxygenCleanDate || null,
        reminderEnabled: form.reminderEnabled,
        reminderDaysBefore: form.reminderDaysBefore ? parseInt(form.reminderDaysBefore) : 30,
        gearProfileId: form.gearProfileId,
      };

      const url = isNew
        ? `${getApiUrl()}/api/cylinders`
        : `${getApiUrl()}/api/cylinders/${id}`;

      const response = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const msg = isNew ? t('cylinders.cylinderAdded') : t('cylinders.cylinderUpdated');
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert(t('common.success'), msg);
        }
        router.back();
      } else {
        const err = await response.json();
        Alert.alert(t('common.error'), err.error || t('cylinders.failedToSave'));
      }
    } catch (error) {
      console.error('Error saving cylinder:', error);
      Alert.alert(t('common.error'), t('cylinders.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddTestRecord = async () => {
    if (!testForm.testDate || !testForm.testType) {
      Alert.alert(t('common.error'), t('cylinders.testDateTypeRequired'));
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/cylinders/${id}/test-records`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          testDate: testForm.testDate,
          testType: testForm.testType,
          result: testForm.result,
          facilityName: testForm.facilityName || null,
          notes: testForm.notes || null,
        }),
      });

      if (response.ok) {
        setShowAddTestModal(false);
        setTestForm({ testDate: new Date().toISOString().split('T')[0], testType: 'visual', result: 'pass', facilityName: '', notes: '' });
        fetchCylinder();
      }
    } catch (error) {
      console.error('Error adding test record:', error);
      Alert.alert(t('common.error'), t('cylinders.failedToAddTest'));
    }
  };

  const handleDeleteTestRecord = async (recordId: number) => {
    const doDelete = async () => {
      try {
        await fetch(`${getApiUrl()}/api/cylinders/${id}/test-records/${recordId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        fetchCylinder();
      } catch (error) {
        console.error('Error deleting test record:', error);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(t('cylinders.deleteTestConfirm'))) doDelete();
    } else {
      Alert.alert(t('cylinders.deleteTest'), t('cylinders.deleteTestConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const renderOptionPicker = (
    label: string,
    value: string,
    options: string[],
    onChange: (v: string) => void,
    labelMap?: Record<string, string>,
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map(opt => (
          <Pressable
            key={opt}
            style={[
              styles.optionChip,
              {
                backgroundColor: value === opt ? colors.primary : colors.surface,
                borderColor: value === opt ? colors.primary : colors.border,
              },
            ]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.optionText, { color: value === opt ? '#FFF' : colors.text }]}>
              {labelMap ? labelMap[opt] : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (loading) {
    return (
      <ThemedBackground>
        <PageHeader title={t('cylinders.cylinderDetails')} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ThemedBackground>
    );
  }

  const scheduleInfo = form.testingStandard === 'UK' || form.testingStandard === 'EU'
    ? t('cylinders.scheduleUKEU')
    : form.testingStandard === 'US'
    ? t('cylinders.scheduleUS')
    : t('cylinders.scheduleCustom');

  return (
    <ThemedBackground>
      <PageHeader title={isNew ? t('cylinders.addCylinder') : t('cylinders.cylinderDetails')} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {!isNew && (
          <View style={[styles.statusCard, { backgroundColor: (STATUS_COLORS[status]?.bg || '#059669') + '15', borderColor: STATUS_COLORS[status]?.bg || '#059669' }]}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status]?.bg }]} />
            <Text style={[styles.statusText, { color: STATUS_COLORS[status]?.bg }]}>
              {t(`cylinders.status_${status}`)}
            </Text>
            <View style={styles.statusDetails}>
              {nextVisualDue && (
                <Text style={[styles.statusDetail, { color: colors.textSecondary }]}>
                  {t('cylinders.nextVisual')}: {formatDate(nextVisualDue)}
                </Text>
              )}
              {nextHydroDue && (
                <Text style={[styles.statusDetail, { color: colors.textSecondary }]}>
                  {t('cylinders.nextHydro')}: {formatDate(nextHydroDue)}
                </Text>
              )}
              {nextOxygenCleanDue && (
                <Text style={[styles.statusDetail, { color: colors.textSecondary }]}>
                  {t('cylinders.nextOxygenClean')}: {formatDate(nextOxygenCleanDue)}
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('cylinders.cylinderInfo')}</Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.nickname')} *</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={form.nickname}
              onChangeText={v => setForm(f => ({ ...f, nickname: v }))}
              placeholder={t('cylinders.nicknamePlaceholder')}
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {renderOptionPicker(t('cylinders.cylinderType'), form.cylinderType, CYLINDER_TYPES, v => setForm(f => ({ ...f, cylinderType: v })))}

          <View style={styles.row}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.size')} ({getVolumeUnit()})</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={form.sizeLiters}
                onChangeText={v => setForm(f => ({ ...f, sizeLiters: v }))}
                keyboardType="decimal-pad"
                placeholder="12"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.workingPressure')} ({getPressureUnit()})</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={form.workingPressure}
                onChangeText={v => setForm(f => ({ ...f, workingPressure: v }))}
                keyboardType="decimal-pad"
                placeholder="232"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.serialNumber')}</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={form.serialNumber}
              onChangeText={v => setForm(f => ({ ...f, serialNumber: v }))}
              placeholder={t('cylinders.serialNumberPlaceholder')}
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.manufactureDate')}</Text>
            <DatePickerField
              value={form.manufactureDate}
              onChange={v => setForm(f => ({ ...f, manufactureDate: v }))}
              placeholder={t('cylinders.selectDate')}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.linkedGearProfile')}</Text>
            <View style={styles.optionRow}>
              <Pressable
                style={[
                  styles.optionChip,
                  {
                    backgroundColor: form.gearProfileId === null ? colors.primary : colors.surface,
                    borderColor: form.gearProfileId === null ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setForm(f => ({ ...f, gearProfileId: null }))}
              >
                <Text style={[styles.optionText, { color: form.gearProfileId === null ? '#FFF' : colors.text }]}>
                  {t('common.none')}
                </Text>
              </Pressable>
              {gearProfiles.map(gp => (
                <Pressable
                  key={gp.id}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor: form.gearProfileId === gp.id ? colors.primary : colors.surface,
                      borderColor: form.gearProfileId === gp.id ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setForm(f => ({ ...f, gearProfileId: gp.id }))}
                >
                  <Text style={[styles.optionText, { color: form.gearProfileId === gp.id ? '#FFF' : colors.text }]}>
                    {gp.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('cylinders.testingSchedule')}</Text>

          {renderOptionPicker(
            t('cylinders.testingStandard'),
            form.testingStandard,
            TESTING_STANDARDS,
            v => setForm(f => ({ ...f, testingStandard: v })),
          )}

          <Text style={[styles.scheduleInfo, { color: colors.textSecondary }]}>{scheduleInfo}</Text>

          {form.testingStandard === 'custom' && (
            <View style={styles.row}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.visualInterval')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={form.customVisualIntervalMonths}
                  onChangeText={v => setForm(f => ({ ...f, customVisualIntervalMonths: v }))}
                  keyboardType="number-pad"
                  placeholder="30"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.hydroInterval')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={form.customHydroIntervalMonths}
                  onChangeText={v => setForm(f => ({ ...f, customHydroIntervalMonths: v }))}
                  keyboardType="number-pad"
                  placeholder="60"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.lastVisualInspection')}</Text>
            <DatePickerField
              value={form.lastVisualDate}
              onChange={v => setForm(f => ({ ...f, lastVisualDate: v }))}
              placeholder={t('cylinders.selectDate')}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.lastHydroTest')}</Text>
            <DatePickerField
              value={form.lastHydroDate}
              onChange={v => setForm(f => ({ ...f, lastHydroDate: v }))}
              placeholder={t('cylinders.selectDate')}
            />
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>{t('cylinders.enrichedGas')}</Text>
              <Text style={[styles.switchDescription, { color: colors.textSecondary }]}>{t('cylinders.enrichedGasDescription')}</Text>
            </View>
            <Switch
              value={form.isEnrichedGas}
              onValueChange={v => setForm(f => ({ ...f, isEnrichedGas: v }))}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={form.isEnrichedGas ? colors.primary : '#f4f4f4'}
            />
          </View>

          {form.isEnrichedGas && (
            <>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.oxygenCleanInterval')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={form.oxygenCleanIntervalMonths}
                  onChangeText={v => setForm(f => ({ ...f, oxygenCleanIntervalMonths: v }))}
                  keyboardType="number-pad"
                  placeholder="15"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.lastOxygenClean')}</Text>
                <DatePickerField
                  value={form.lastOxygenCleanDate}
                  onChange={v => setForm(f => ({ ...f, lastOxygenCleanDate: v }))}
                  placeholder={t('cylinders.selectDate')}
                />
              </View>
            </>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('cylinders.notifications')}</Text>
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.text }]}>{t('cylinders.enableReminders')}</Text>
            <Switch
              value={form.reminderEnabled}
              onValueChange={v => setForm(f => ({ ...f, reminderEnabled: v }))}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={form.reminderEnabled ? colors.primary : '#f4f4f4'}
            />
          </View>
          {form.reminderEnabled && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.remindDaysBefore')}</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={form.reminderDaysBefore}
                onChangeText={v => setForm(f => ({ ...f, reminderDaysBefore: v }))}
                keyboardType="number-pad"
                placeholder="30"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          )}
        </View>

        {!isNew && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>{t('cylinders.testHistory')}</Text>
              <Pressable
                style={[styles.addTestButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowAddTestModal(true)}
              >
                <Feather name="plus" size={16} color="#FFF" />
                <Text style={styles.addTestButtonText}>{t('cylinders.addTest')}</Text>
              </Pressable>
            </View>

            {testRecords.length === 0 ? (
              <Text style={[styles.noRecords, { color: colors.textSecondary }]}>{t('cylinders.noTestRecords')}</Text>
            ) : (
              testRecords.map(record => (
                <View key={record.id} style={[styles.testRecord, { borderColor: colors.border }]}>
                  <View style={styles.testRecordHeader}>
                    <View style={[
                      styles.testTypeBadge,
                      { backgroundColor: record.result === 'pass' ? '#059669' + '20' : '#DC2626' + '20' },
                    ]}>
                      <Text style={[
                        styles.testTypeBadgeText,
                        { color: record.result === 'pass' ? '#059669' : '#DC2626' },
                      ]}>
                        {t(`cylinders.testType_${record.testType}`)} - {t(`cylinders.result_${record.result}`)}
                      </Text>
                    </View>
                    <Pressable onPress={() => handleDeleteTestRecord(record.id)}>
                      <Feather name="trash-2" size={16} color={colors.error} />
                    </Pressable>
                  </View>
                  <Text style={[styles.testRecordDate, { color: colors.textSecondary }]}>
                    {formatDate(record.testDate)}
                  </Text>
                  {record.facilityName && (
                    <Text style={[styles.testRecordFacility, { color: colors.textSecondary }]}>
                      {record.facilityName}
                    </Text>
                  )}
                  {record.notes && (
                    <Text style={[styles.testRecordNotes, { color: colors.textSecondary }]}>
                      {record.notes}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isNew ? t('cylinders.addCylinder') : t('common.save')}
            </Text>
          )}
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showAddTestModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddTestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('cylinders.addTestRecord')}</Text>
              <Pressable onPress={() => setShowAddTestModal(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.testDate')}</Text>
                <DatePickerField
                  value={testForm.testDate}
                  onChange={v => setTestForm(f => ({ ...f, testDate: v }))}
                  placeholder={t('cylinders.selectDate')}
                />
              </View>

              {renderOptionPicker(
                t('cylinders.testType'),
                testForm.testType,
                TEST_TYPES,
                v => setTestForm(f => ({ ...f, testType: v })),
                { visual: t('cylinders.testType_visual'), hydrostatic: t('cylinders.testType_hydrostatic'), oxygen_clean: t('cylinders.testType_oxygen_clean') },
              )}

              {renderOptionPicker(
                t('cylinders.testResult'),
                testForm.result,
                TEST_RESULTS,
                v => setTestForm(f => ({ ...f, result: v })),
                { pass: t('cylinders.result_pass'), fail: t('cylinders.result_fail') },
              )}

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('cylinders.facilityName')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={testForm.facilityName}
                  onChangeText={v => setTestForm(f => ({ ...f, facilityName: v }))}
                  placeholder={t('cylinders.facilityPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('common.notes')}</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={testForm.notes}
                  onChangeText={v => setTestForm(f => ({ ...f, notes: v }))}
                  placeholder={t('cylinders.testNotesPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            <Pressable
              style={[styles.saveButton, { backgroundColor: colors.primary, margin: 16 }]}
              onPress={handleAddTestRecord}
            >
              <Text style={styles.saveButtonText}>{t('cylinders.addTest')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusDetails: {
    width: '100%',
    marginTop: 4,
    gap: 4,
  },
  statusDetail: {
    fontSize: 13,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  switchDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  scheduleInfo: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  addTestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addTestButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  noRecords: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  testRecord: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  testRecordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  testTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  testTypeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  testRecordDate: {
    fontSize: 13,
  },
  testRecordFacility: {
    fontSize: 12,
  },
  testRecordNotes: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    paddingHorizontal: 16,
    gap: 12,
  },
});
