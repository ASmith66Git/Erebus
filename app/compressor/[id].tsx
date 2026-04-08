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
  Modal,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { getApiUrl } from '@/utils/apiConfig';
import {
  getDatabase,
  getLocalCompressorById,
  getLocalCompressorByServerId,
  upsertLocalCompressor,
  markLocalCompressorDeleted,
  getServiceLogsByCompressorId,
  upsertLocalServiceLog,
  getUsageLogsByCompressorId,
  upsertLocalUsageLog,
  addPendingMutation,
  generateClientMutationId,
} from '@/services/localDatabase';
import type { LocalCompressor } from '@/services/localDatabase';
import { useTranslation } from 'react-i18next';
import ThemedBackground from '@/components/ThemedBackground';
import DateTimePicker from 'react-native-ui-datepicker';
import dayjs from 'dayjs';

const isNative = Platform.OS !== 'web';

type TabType = 'overview' | 'service' | 'usage' | 'testing';

interface ServiceLogPayload {
  service_type: string;
  service_date: string;
  hours_at_service: number | null;
  filter_type: string | null;
  test_result: string | null;
  test_certificate_number: string | null;
  next_due_date: string | null;
  cost: number | null;
  technician: string | null;
  notes: string | null;
}

interface UsageLogPayload {
  usage_date: string;
  hours_used: number;
  fills_count: number | null;
  notes: string | null;
}

interface CompressorData {
  id: number | string;
  name: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  total_hours: number;
  oil_change_interval_hours: number;
  filter_change_interval_hours: number;
  independent_test_interval_months: number;
  notes: string | null;
  status: string;
  last_oil_change_date: string | null;
  last_oil_change_hours: number | null;
  last_filter_change_date: string | null;
  last_filter_change_hours: number | null;
  last_test_date: string | null;
  last_test_result: string | null;
  next_test_due_date: string | null;
}

interface ServiceLog {
  id: number;
  service_type: string;
  service_date: string;
  hours_at_service: number | null;
  filter_type: string | null;
  test_result: string | null;
  test_certificate_number: string | null;
  next_due_date: string | null;
  cost: number | null;
  technician: string | null;
  notes: string | null;
}

interface UsageLog {
  id: number;
  usage_date: string;
  hours_used: number;
  fills_count: number | null;
  notes: string | null;
}

const SERVICE_TYPES = ['oil_change', 'filter_change', 'independent_test', 'general_service', 'other'] as const;
const FILTER_TYPES = ['intake', 'separator', 'coalescent', 'molecular_sieve', 'activated_carbon', 'other'] as const;

export default function CompressorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const isLocalOnly = id.startsWith('local_');
  const localDbId = isLocalOnly ? parseInt(id.replace('local_', ''), 10) : NaN;
  const serverIdNum = !isLocalOnly ? parseInt(id, 10) : NaN;
  const { colors } = useTheme();
  const { token } = useAuth();
  const { isOnline } = useSync();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(isNew);
  const [compressor, setCompressor] = useState<CompressorData | null>(null);
  const [serviceLogs, setServiceLogs] = useState<ServiceLog[]>([]);
  const [testingLogs, setTestingLogs] = useState<ServiceLog[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string>('all');

  const [formData, setFormData] = useState({
    name: '',
    make: '',
    model: '',
    serial_number: '',
    purchase_date: '',
    total_hours: '0',
    oil_change_interval_hours: '100',
    filter_change_interval_hours: '500',
    independent_test_interval_months: '12',
    notes: '',
    status: 'active',
  });

  const [serviceForm, setServiceForm] = useState({
    service_type: 'oil_change' as string,
    service_date: new Date().toISOString().split('T')[0],
    hours_at_service: '',
    filter_type: '',
    test_result: '',
    test_certificate_number: '',
    next_due_date: '',
    cost: '',
    technician: '',
    notes: '',
  });

  const [usageForm, setUsageForm] = useState({
    usage_date: new Date().toISOString().split('T')[0],
    hours_used: '',
    fills_count: '',
    notes: '',
  });

  const resolveLocalCompressor = useCallback(async (): Promise<LocalCompressor | null> => {
    if (!isNative) return null;
    if (isLocalOnly && !isNaN(localDbId)) {
      return getLocalCompressorById(localDbId);
    }
    if (!isNaN(serverIdNum)) {
      return getLocalCompressorByServerId(serverIdNum);
    }
    return null;
  }, [isLocalOnly, localDbId, serverIdNum]);

  const loadCompressorFromLocal = useCallback(async () => {
    if (!isNative) return false;
    try {
      const local = await resolveLocalCompressor();
      if (local) {
        const data: CompressorData = {
          id: local.serverId || `local_${local.id}`,
          name: local.name,
          make: local.make,
          model: local.model,
          serial_number: local.serialNumber,
          purchase_date: local.purchaseDate,
          total_hours: local.totalHours,
          oil_change_interval_hours: local.oilChangeIntervalHours,
          filter_change_interval_hours: local.filterChangeIntervalHours,
          independent_test_interval_months: local.independentTestIntervalMonths,
          notes: local.notes,
          status: local.status,
          last_oil_change_date: null,
          last_oil_change_hours: null,
          last_filter_change_date: null,
          last_filter_change_hours: null,
          last_test_date: null,
          last_test_result: null,
          next_test_due_date: null,
        };
        setCompressor(data);
        setFormData({
          name: data.name || '',
          make: data.make || '',
          model: data.model || '',
          serial_number: data.serial_number || '',
          purchase_date: data.purchase_date ? data.purchase_date.split('T')[0] : '',
          total_hours: String(data.total_hours || 0),
          oil_change_interval_hours: String(data.oil_change_interval_hours || 100),
          filter_change_interval_hours: String(data.filter_change_interval_hours || 500),
          independent_test_interval_months: String(data.independent_test_interval_months || 12),
          notes: data.notes || '',
          status: data.status || 'active',
        });
        return true;
      }
    } catch (err) {
      console.error('Load compressor from local DB error:', err);
    }
    return false;
  }, [resolveLocalCompressor]);

  const fetchCompressor = useCallback(async () => {
    if (!token || isNew) return;
    if (isLocalOnly) {
      await loadCompressorFromLocal();
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${getApiUrl()}/api/compressors/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCompressor(data);
        setFormData({
          name: data.name || '',
          make: data.make || '',
          model: data.model || '',
          serial_number: data.serial_number || '',
          purchase_date: data.purchase_date ? data.purchase_date.split('T')[0] : '',
          total_hours: String(data.total_hours || 0),
          oil_change_interval_hours: String(data.oil_change_interval_hours || 100),
          filter_change_interval_hours: String(data.filter_change_interval_hours || 500),
          independent_test_interval_months: String(data.independent_test_interval_months || 12),
          notes: data.notes || '',
          status: data.status || 'active',
        });
        if (isNative) {
          upsertLocalCompressor({
            serverId: data.id,
            name: data.name,
            make: data.make,
            model: data.model,
            serialNumber: data.serial_number,
            purchaseDate: data.purchase_date,
            totalHours: data.total_hours,
            oilChangeIntervalHours: data.oil_change_interval_hours,
            filterChangeIntervalHours: data.filter_change_interval_hours,
            independentTestIntervalMonths: data.independent_test_interval_months,
            notes: data.notes,
            status: data.status,
          }).catch(() => {});
        }
      } else {
        await loadCompressorFromLocal();
      }
    } catch (error) {
      console.error('Fetch compressor error:', error);
      await loadCompressorFromLocal();
    } finally {
      setLoading(false);
    }
  }, [token, id, isNew, loadCompressorFromLocal]);

  const loadServiceLogsFromLocal = useCallback(async (filter?: string) => {
    if (!isNative) return;
    try {
      const local = await resolveLocalCompressor();
      if (!local) return;
      const allLogs = await getServiceLogsByCompressorId(local.id);
      const mapped: ServiceLog[] = allLogs.map(l => ({
        id: l.serverId || l.id,
        service_type: l.serviceType,
        service_date: l.serviceDate,
        hours_at_service: l.hoursAtService,
        filter_type: l.filterType,
        test_result: l.testResult,
        test_certificate_number: l.testCertificateNumber,
        next_due_date: l.nextDueDate,
        cost: l.cost,
        technician: l.technician,
        notes: l.notes,
      }));
      if (filter && filter !== 'all') {
        return mapped.filter(l => l.service_type === filter);
      }
      return mapped;
    } catch (err) {
      console.error('Load service logs from local error:', err);
    }
    return undefined;
  }, [resolveLocalCompressor]);

  const loadUsageLogsFromLocal = useCallback(async () => {
    if (!isNative) return;
    try {
      const local = await resolveLocalCompressor();
      if (!local) return;
      const allLogs = await getUsageLogsByCompressorId(local.id);
      return allLogs.map(l => ({
        id: l.serverId || l.id,
        usage_date: l.usageDate,
        hours_used: l.hoursUsed,
        fills_count: l.fillsCount,
        notes: l.notes,
      })) as UsageLog[];
    } catch (err) {
      console.error('Load usage logs from local error:', err);
    }
    return undefined;
  }, [resolveLocalCompressor]);

  const fetchServiceLogs = useCallback(async () => {
    if (!token || isNew) return;
    if (isLocalOnly) {
      const local = await loadServiceLogsFromLocal(serviceFilter);
      if (local) setServiceLogs(local.filter(l => l.service_type !== 'independent_test'));
      return;
    }
    try {
      const url = serviceFilter !== 'all'
        ? `${getApiUrl()}/api/compressors/${id}/services?service_type=${serviceFilter}`
        : `${getApiUrl()}/api/compressors/${id}/services`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setServiceLogs(data);
      } else {
        const local = await loadServiceLogsFromLocal(serviceFilter);
        if (local) setServiceLogs(local.filter(l => l.service_type !== 'independent_test'));
      }
    } catch (error) {
      console.error('Fetch service logs error:', error);
      const local = await loadServiceLogsFromLocal(serviceFilter);
      if (local) setServiceLogs(local.filter(l => l.service_type !== 'independent_test'));
    }
  }, [token, id, isNew, serviceFilter, loadServiceLogsFromLocal]);

  const fetchTestingLogs = useCallback(async () => {
    if (!token || isNew) return;
    if (isLocalOnly) {
      const local = await loadServiceLogsFromLocal('independent_test');
      if (local) setTestingLogs(local);
      return;
    }
    try {
      const response = await fetch(`${getApiUrl()}/api/compressors/${id}/services?service_type=independent_test`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTestingLogs(data);
      } else {
        const local = await loadServiceLogsFromLocal('independent_test');
        if (local) setTestingLogs(local);
      }
    } catch (error) {
      console.error('Fetch testing logs error:', error);
      const local = await loadServiceLogsFromLocal('independent_test');
      if (local) setTestingLogs(local);
    }
  }, [token, id, isNew, loadServiceLogsFromLocal]);

  const fetchUsageLogs = useCallback(async () => {
    if (!token || isNew) return;
    if (isLocalOnly) {
      const local = await loadUsageLogsFromLocal();
      if (local) setUsageLogs(local);
      return;
    }
    try {
      const response = await fetch(`${getApiUrl()}/api/compressors/${id}/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUsageLogs(data);
      } else {
        const local = await loadUsageLogsFromLocal();
        if (local) setUsageLogs(local);
      }
    } catch (error) {
      console.error('Fetch usage logs error:', error);
      const local = await loadUsageLogsFromLocal();
      if (local) setUsageLogs(local);
    }
  }, [token, id, isNew, loadUsageLogsFromLocal]);

  useEffect(() => {
    fetchCompressor();
  }, [fetchCompressor]);

  useEffect(() => {
    if (!isNew) {
      fetchServiceLogs();
      fetchTestingLogs();
      fetchUsageLogs();
    }
  }, [fetchServiceLogs, fetchTestingLogs, fetchUsageLogs, isNew]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert(t('common.error'), t('compressors.nameRequired'));
      return;
    }
    setSaving(true);
    const payload = {
      name: formData.name.trim(),
      make: formData.make.trim() || null,
      model: formData.model.trim() || null,
      serial_number: formData.serial_number.trim() || null,
      purchase_date: formData.purchase_date || null,
      total_hours: parseFloat(formData.total_hours) || 0,
      oil_change_interval_hours: parseInt(formData.oil_change_interval_hours) || 100,
      filter_change_interval_hours: parseInt(formData.filter_change_interval_hours) || 500,
      independent_test_interval_months: parseInt(formData.independent_test_interval_months) || 12,
      notes: formData.notes.trim() || null,
      status: formData.status,
    };
    const existingServerId = isNew ? undefined : (isLocalOnly ? undefined : serverIdNum);
    const saveLocally = async () => {
      const existingLocal = isLocalOnly ? await getLocalCompressorById(localDbId) : null;
      const localId = await upsertLocalCompressor({
        ...(existingLocal ? { id: existingLocal.id } : {}),
        serverId: existingServerId,
        name: payload.name,
        make: payload.make,
        model: payload.model,
        serialNumber: payload.serial_number,
        purchaseDate: payload.purchase_date,
        totalHours: payload.total_hours,
        oilChangeIntervalHours: payload.oil_change_interval_hours,
        filterChangeIntervalHours: payload.filter_change_interval_hours,
        independentTestIntervalMonths: payload.independent_test_interval_months,
        notes: payload.notes,
        status: payload.status,
      });
      const mutationAction = (isNew || isLocalOnly) ? 'create' : 'update';
      await addPendingMutation({
        clientMutationId: generateClientMutationId(),
        entityType: 'compressor',
        entityId: localId,
        action: mutationAction,
        data: JSON.stringify(payload),
      });
      if (isNew) {
        router.back();
      } else {
        setIsEditing(false);
        loadCompressorFromLocal();
      }
    };
    if (isLocalOnly) {
      try {
        await saveLocally();
      } catch (localErr) {
        Alert.alert(t('common.error'), t('errors.saveFailed'));
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      const url = isNew ? `${getApiUrl()}/api/compressors` : `${getApiUrl()}/api/compressors/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const data = await response.json();
        if (isNative) {
          upsertLocalCompressor({
            serverId: data.id,
            name: payload.name,
            make: payload.make,
            model: payload.model,
            serialNumber: payload.serial_number,
            purchaseDate: payload.purchase_date,
            totalHours: payload.total_hours,
            oilChangeIntervalHours: payload.oil_change_interval_hours,
            filterChangeIntervalHours: payload.filter_change_interval_hours,
            independentTestIntervalMonths: payload.independent_test_interval_months,
            notes: payload.notes,
            status: payload.status,
          }).catch(() => {});
        }
        if (isNew) {
          router.replace(`/compressor/${data.id}` as Href);
        } else {
          setIsEditing(false);
          fetchCompressor();
        }
      } else {
        if (isNative) {
          await saveLocally();
        } else {
          Alert.alert(t('common.error'), t('errors.saveFailed'));
        }
      }
    } catch (error) {
      if (isNative) {
        try {
          await saveLocally();
        } catch (localErr) {
          Alert.alert(t('common.error'), t('errors.saveFailed'));
        }
      } else {
        Alert.alert(t('common.error'), t('errors.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(t('common.confirm'), t('compressors.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          try {
            if (!isLocalOnly) {
              await fetch(`${getApiUrl()}/api/compressors/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
            }
            if (isNative) {
              const local = await resolveLocalCompressor();
              if (local) await markLocalCompressorDeleted(local.id);
            }
            router.back();
          } catch (error) {
            if (isNative) {
              try {
                const local = await resolveLocalCompressor();
                if (local) {
                  await markLocalCompressorDeleted(local.id);
                  await addPendingMutation({
                    clientMutationId: generateClientMutationId(),
                    entityType: 'compressor',
                    entityId: local.id,
                    action: 'delete',
                    data: JSON.stringify({ id: local.serverId || local.id }),
                  });
                  router.back();
                  return;
                }
              } catch (localErr) {
                // fall through
              }
            }
            Alert.alert(t('common.error'), t('errors.deleteFailed'));
          }
        },
      },
    ]);
  };

  const resetServiceForm = () => {
    setServiceForm({
      service_type: 'oil_change',
      service_date: new Date().toISOString().split('T')[0],
      hours_at_service: '',
      filter_type: '',
      test_result: '',
      test_certificate_number: '',
      next_due_date: '',
      cost: '',
      technician: '',
      notes: '',
    });
  };

  const handleAddService = async () => {
    if (!serviceForm.service_date) {
      Alert.alert(t('common.error'), t('compressors.dateRequired'));
      return;
    }
    const payload: ServiceLogPayload = {
      service_type: serviceForm.service_type,
      service_date: serviceForm.service_date,
      hours_at_service: serviceForm.hours_at_service ? parseFloat(serviceForm.hours_at_service) : null,
      filter_type: serviceForm.filter_type || null,
      test_result: serviceForm.test_result || null,
      test_certificate_number: serviceForm.test_certificate_number || null,
      next_due_date: serviceForm.next_due_date || null,
      cost: serviceForm.cost ? parseFloat(serviceForm.cost) : null,
      technician: serviceForm.technician || null,
      notes: serviceForm.notes || null,
    };
    if (isLocalOnly) {
      if (isNative) {
        try {
          await saveServiceLogLocally(payload);
          setShowServiceModal(false);
          resetServiceForm();
          loadServiceLogsFromLocal().then(l => { if (l) setServiceLogs(l.filter(x => x.service_type !== 'independent_test')); });
          loadServiceLogsFromLocal('independent_test').then(l => { if (l) setTestingLogs(l); });
        } catch (localErr) {
          Alert.alert(t('common.error'), t('errors.saveFailed'));
        }
      }
      return;
    }
    try {
      const response = await fetch(`${getApiUrl()}/api/compressors/${id}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        if (isNative) {
          const local = await resolveLocalCompressor();
          if (local) {
            const data = await response.json();
            await upsertLocalServiceLog({
              serverId: data.id,
              compressorId: local.id,
              serviceType: payload.service_type,
              serviceDate: payload.service_date,
              hoursAtService: payload.hours_at_service,
              filterType: payload.filter_type,
              testResult: payload.test_result,
              testCertificateNumber: payload.test_certificate_number,
              nextDueDate: payload.next_due_date,
              cost: payload.cost,
              technician: payload.technician,
              notes: payload.notes,
            });
          }
        }
        setShowServiceModal(false);
        resetServiceForm();
        fetchServiceLogs();
        fetchTestingLogs();
        fetchCompressor();
      } else {
        if (isNative) {
          await saveServiceLogLocally(payload);
          setShowServiceModal(false);
          resetServiceForm();
          loadServiceLogsFromLocal().then(l => { if (l) setServiceLogs(l.filter(x => x.service_type !== 'independent_test')); });
          loadServiceLogsFromLocal('independent_test').then(l => { if (l) setTestingLogs(l); });
        } else {
          Alert.alert(t('common.error'), t('errors.saveFailed'));
        }
      }
    } catch (error) {
      if (isNative) {
        try {
          await saveServiceLogLocally(payload);
          setShowServiceModal(false);
          resetServiceForm();
          loadServiceLogsFromLocal().then(l => { if (l) setServiceLogs(l.filter(x => x.service_type !== 'independent_test')); });
          loadServiceLogsFromLocal('independent_test').then(l => { if (l) setTestingLogs(l); });
        } catch (localErr) {
          Alert.alert(t('common.error'), t('errors.saveFailed'));
        }
      } else {
        Alert.alert(t('common.error'), t('errors.saveFailed'));
      }
    }
  };

  const saveServiceLogLocally = async (payload: ServiceLogPayload) => {
    const local = await resolveLocalCompressor();
    if (!local) throw new Error('No local compressor');
    const localLogId = await upsertLocalServiceLog({
      compressorId: local.id,
      serviceType: payload.service_type,
      serviceDate: payload.service_date,
      hoursAtService: payload.hours_at_service,
      filterType: payload.filter_type,
      testResult: payload.test_result,
      testCertificateNumber: payload.test_certificate_number,
      nextDueDate: payload.next_due_date,
      cost: payload.cost,
      technician: payload.technician,
      notes: payload.notes,
    });
    const mutationData = local.serverId
      ? { ...payload, _compressorServerId: local.serverId }
      : { ...payload, _compressorLocalId: local.id };
    await addPendingMutation({
      clientMutationId: generateClientMutationId(),
      entityType: 'compressor_service',
      entityId: localLogId,
      action: 'create',
      data: JSON.stringify(mutationData),
    });
  };

  const resetUsageForm = () => {
    setUsageForm({ usage_date: new Date().toISOString().split('T')[0], hours_used: '', fills_count: '', notes: '' });
  };

  const handleAddUsage = async () => {
    if (!usageForm.usage_date || !usageForm.hours_used) {
      Alert.alert(t('common.error'), t('compressors.hoursRequired'));
      return;
    }
    const payload: UsageLogPayload = {
      usage_date: usageForm.usage_date,
      hours_used: parseFloat(usageForm.hours_used),
      fills_count: usageForm.fills_count ? parseInt(usageForm.fills_count) : null,
      notes: usageForm.notes || null,
    };
    if (isLocalOnly) {
      if (isNative) {
        try {
          await saveUsageLogLocally(payload);
          setShowUsageModal(false);
          resetUsageForm();
          loadUsageLogsFromLocal().then(l => { if (l) setUsageLogs(l); });
          loadCompressorFromLocal();
        } catch (localErr) {
          Alert.alert(t('common.error'), t('errors.saveFailed'));
        }
      }
      return;
    }
    try {
      const response = await fetch(`${getApiUrl()}/api/compressors/${id}/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        if (isNative) {
          const local = await resolveLocalCompressor();
          if (local) {
            const data = await response.json();
            await upsertLocalUsageLog({
              serverId: data.id,
              compressorId: local.id,
              usageDate: payload.usage_date,
              hoursUsed: payload.hours_used,
              fillsCount: payload.fills_count,
              notes: payload.notes,
            });
          }
        }
        setShowUsageModal(false);
        resetUsageForm();
        fetchUsageLogs();
        fetchCompressor();
      } else {
        if (isNative) {
          await saveUsageLogLocally(payload);
          setShowUsageModal(false);
          resetUsageForm();
          loadUsageLogsFromLocal().then(l => { if (l) setUsageLogs(l); });
          loadCompressorFromLocal();
        } else {
          Alert.alert(t('common.error'), t('errors.saveFailed'));
        }
      }
    } catch (error) {
      if (isNative) {
        try {
          await saveUsageLogLocally(payload);
          setShowUsageModal(false);
          resetUsageForm();
          loadUsageLogsFromLocal().then(l => { if (l) setUsageLogs(l); });
          loadCompressorFromLocal();
        } catch (localErr) {
          Alert.alert(t('common.error'), t('errors.saveFailed'));
        }
      } else {
        Alert.alert(t('common.error'), t('errors.saveFailed'));
      }
    }
  };

  const saveUsageLogLocally = async (payload: UsageLogPayload) => {
    const local = await resolveLocalCompressor();
    if (!local) throw new Error('No local compressor');
    const localLogId = await upsertLocalUsageLog({
      compressorId: local.id,
      usageDate: payload.usage_date,
      hoursUsed: payload.hours_used,
      fillsCount: payload.fills_count,
      notes: payload.notes,
    });
    if (isNative) {
      try {
        const db = await getDatabase();
        if (db) {
          await db.runAsync(
            'UPDATE compressors SET total_hours = total_hours + ?, is_synced = 0 WHERE id = ?',
            [payload.hours_used, local.id]
          );
        }
      } catch (e) {}
    }
    const mutationData = local.serverId
      ? { ...payload, _compressorServerId: local.serverId }
      : { ...payload, _compressorLocalId: local.id };
    await addPendingMutation({
      clientMutationId: generateClientMutationId(),
      entityType: 'compressor_usage',
      entityId: localLogId,
      action: 'create',
      data: JSON.stringify(mutationData),
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const getServiceStatusInfo = (type: string) => {
    if (!compressor) return { color: '#4CAF50', label: t('compressors.statusCurrent') };
    const totalHours = parseFloat(String(compressor.total_hours)) || 0;

    if (type === 'oil') {
      const lastHours = compressor.last_oil_change_hours ? parseFloat(String(compressor.last_oil_change_hours)) : 0;
      const hoursSince = totalHours - lastHours;
      const interval = compressor.oil_change_interval_hours;
      if (hoursSince >= interval) return { color: '#F44336', label: t('compressors.statusOverdue') };
      if (hoursSince >= interval * 0.9) return { color: '#FF9800', label: t('compressors.statusDueSoon') };
      return { color: '#4CAF50', label: `${(interval - hoursSince).toFixed(0)}h ${t('compressors.remaining')}` };
    }
    if (type === 'filter') {
      const lastHours = compressor.last_filter_change_hours ? parseFloat(String(compressor.last_filter_change_hours)) : 0;
      const hoursSince = totalHours - lastHours;
      const interval = compressor.filter_change_interval_hours;
      if (hoursSince >= interval) return { color: '#F44336', label: t('compressors.statusOverdue') };
      if (hoursSince >= interval * 0.9) return { color: '#FF9800', label: t('compressors.statusDueSoon') };
      return { color: '#4CAF50', label: `${(interval - hoursSince).toFixed(0)}h ${t('compressors.remaining')}` };
    }
    if (type === 'test') {
      let dueDate: Date | null = null;
      if (compressor.next_test_due_date) {
        dueDate = new Date(compressor.next_test_due_date);
      } else if (compressor.last_test_date && compressor.independent_test_interval_months > 0) {
        dueDate = new Date(compressor.last_test_date);
        dueDate.setMonth(dueDate.getMonth() + compressor.independent_test_interval_months);
      }
      if (dueDate) {
        const now = new Date();
        const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 0) return { color: '#F44336', label: t('compressors.statusOverdue') };
        if (daysUntil <= 30) return { color: '#FF9800', label: t('compressors.statusDueSoon') };
        return { color: '#4CAF50', label: `${daysUntil} ${t('compressors.daysRemaining')}` };
      }
      if (!compressor.last_test_date) return { color: '#FF9800', label: t('compressors.noTestRecorded') };
      return { color: '#4CAF50', label: t('compressors.statusCurrent') };
    }
    return { color: '#4CAF50', label: t('compressors.statusCurrent') };
  };

  const renderOverviewTab = () => {
    if (!compressor && !isNew) return null;
    const totalHours = compressor ? parseFloat(String(compressor.total_hours)) || 0 : 0;
    const oilStatus = getServiceStatusInfo('oil');
    const filterStatus = getServiceStatusInfo('filter');
    const testStatus = getServiceStatusInfo('test');

    return (
      <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 40 }}>
        {isEditing ? (
          <View style={styles.formSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('compressors.details')}</Text>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.name')} *</Text>
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={formData.name} onChangeText={(v) => setFormData({ ...formData, name: v })} placeholder={t('compressors.namePlaceholder')} placeholderTextColor={colors.textSecondary} />
            </View>
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.make')}</Text>
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={formData.make} onChangeText={(v) => setFormData({ ...formData, make: v })} placeholder={t('compressors.makePlaceholder')} placeholderTextColor={colors.textSecondary} />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.model')}</Text>
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={formData.model} onChangeText={(v) => setFormData({ ...formData, model: v })} placeholder={t('compressors.modelPlaceholder')} placeholderTextColor={colors.textSecondary} />
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.serialNumber')}</Text>
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={formData.serial_number} onChangeText={(v) => setFormData({ ...formData, serial_number: v })} placeholderTextColor={colors.textSecondary} />
            </View>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.purchaseDate')}</Text>
              <Pressable onPress={() => setShowDatePicker('purchase')} style={[styles.input, { justifyContent: 'center', borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={{ color: formData.purchase_date ? colors.text : colors.textSecondary }}>{formData.purchase_date ? formatDate(formData.purchase_date) : t('compressors.selectDate')}</Text>
              </Pressable>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>{t('compressors.serviceIntervals')}</Text>
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.oilChangeEvery')}</Text>
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={formData.oil_change_interval_hours} onChangeText={(v) => setFormData({ ...formData, oil_change_interval_hours: v })} keyboardType="numeric" />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.filterChangeEvery')}</Text>
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={formData.filter_change_interval_hours} onChangeText={(v) => setFormData({ ...formData, filter_change_interval_hours: v })} keyboardType="numeric" />
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.testIntervalMonths')}</Text>
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={formData.independent_test_interval_months} onChangeText={(v) => setFormData({ ...formData, independent_test_interval_months: v })} keyboardType="numeric" />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.status')}</Text>
              <View style={styles.statusRow}>
                {['active', 'retired'].map((s) => (
                  <Pressable key={s} onPress={() => setFormData({ ...formData, status: s })} style={[styles.statusOption, { borderColor: formData.status === s ? colors.primary : colors.border, backgroundColor: formData.status === s ? colors.primary + '15' : colors.surface }]}>
                    <Text style={{ color: formData.status === s ? colors.primary : colors.textSecondary }}>{t(`compressors.${s}`)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.notes')}</Text>
              <TextInput style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={formData.notes} onChangeText={(v) => setFormData({ ...formData, notes: v })} multiline numberOfLines={3} placeholderTextColor={colors.textSecondary} />
            </View>
          </View>
        ) : (
          <>
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('compressors.totalHours')}</Text>
                <Text style={[styles.infoValueLarge, { color: colors.primary }]}>{totalHours.toFixed(1)}h</Text>
              </View>
              {compressor?.make && <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('compressors.make')}</Text><Text style={[styles.infoValue, { color: colors.text }]}>{compressor.make}</Text></View>}
              {compressor?.model && <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('compressors.model')}</Text><Text style={[styles.infoValue, { color: colors.text }]}>{compressor.model}</Text></View>}
              {compressor?.serial_number && <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('compressors.serialNumber')}</Text><Text style={[styles.infoValue, { color: colors.text }]}>{compressor.serial_number}</Text></View>}
              {compressor?.purchase_date && <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('compressors.purchaseDate')}</Text><Text style={[styles.infoValue, { color: colors.text }]}>{formatDate(compressor.purchase_date)}</Text></View>}
              {compressor?.notes && <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('compressors.notes')}</Text><Text style={[styles.infoValue, { color: colors.text }]}>{compressor.notes}</Text></View>}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('compressors.serviceStatus')}</Text>
            <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.statusItem}>
                <View style={[styles.statusIndicator, { backgroundColor: oilStatus.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusTitle, { color: colors.text }]}>{t('compressors.oilChange')}</Text>
                  <Text style={[styles.statusDetail, { color: colors.textSecondary }]}>
                    {compressor?.last_oil_change_date ? `${t('compressors.last')}: ${formatDate(compressor.last_oil_change_date)}` : t('compressors.noRecords')}
                  </Text>
                </View>
                <Text style={[styles.statusLabel, { color: oilStatus.color }]}>{oilStatus.label}</Text>
              </View>

              <View style={[styles.statusDivider, { backgroundColor: colors.border }]} />

              <View style={styles.statusItem}>
                <View style={[styles.statusIndicator, { backgroundColor: filterStatus.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusTitle, { color: colors.text }]}>{t('compressors.filterChange')}</Text>
                  <Text style={[styles.statusDetail, { color: colors.textSecondary }]}>
                    {compressor?.last_filter_change_date ? `${t('compressors.last')}: ${formatDate(compressor.last_filter_change_date)}` : t('compressors.noRecords')}
                  </Text>
                </View>
                <Text style={[styles.statusLabel, { color: filterStatus.color }]}>{filterStatus.label}</Text>
              </View>

              <View style={[styles.statusDivider, { backgroundColor: colors.border }]} />

              <View style={styles.statusItem}>
                <View style={[styles.statusIndicator, { backgroundColor: testStatus.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusTitle, { color: colors.text }]}>{t('compressors.independentTest')}</Text>
                  <Text style={[styles.statusDetail, { color: colors.textSecondary }]}>
                    {compressor?.last_test_date ? `${t('compressors.last')}: ${formatDate(compressor.last_test_date)} (${compressor.last_test_result === 'pass' ? t('compressors.pass') : t('compressors.fail')})` : t('compressors.noRecords')}
                  </Text>
                </View>
                <Text style={[styles.statusLabel, { color: testStatus.color }]}>{testStatus.label}</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    );
  };

  const renderServiceTab = () => {
    const otherLogs = serviceLogs.filter(l => l.service_type !== 'independent_test');
    const filteredServiceLogs = serviceFilter === 'all' ? otherLogs : serviceLogs.filter(l => l.service_type === serviceFilter);
    const displayLogs = activeTab === 'testing' ? testingLogs : filteredServiceLogs;

    return (
      <View style={styles.tabContent}>
        {activeTab === 'service' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
            {['all', ...SERVICE_TYPES.filter(t => t !== 'independent_test')].map((type) => (
              <Pressable key={type} onPress={() => setServiceFilter(type)} style={[styles.filterChip, { backgroundColor: serviceFilter === type ? colors.primary : colors.surface, borderColor: serviceFilter === type ? colors.primary : colors.border }]}>
                <Text style={{ color: serviceFilter === type ? '#FFF' : colors.text, fontSize: 12 }}>{type === 'all' ? t('common.all') : t(`compressors.serviceTypes.${type}`)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <FlatList
          style={{ flex: 1 }}
          data={displayLogs}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={[styles.listContent, displayLogs.length === 0 && styles.emptyContainer]}
          renderItem={({ item }) => (
            <View style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.logHeader}>
                <Text style={[styles.logType, { color: colors.primary }]}>{t(`compressors.serviceTypes.${item.service_type}`)}</Text>
                <Text style={[styles.logDate, { color: colors.textSecondary }]}>{formatDate(item.service_date)}</Text>
              </View>
              {item.hours_at_service != null && <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{t('compressors.atHours')}: {item.hours_at_service}h</Text>}
              {item.filter_type && <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{t('compressors.filterType')}: {t(`compressors.filterTypes.${item.filter_type}`)}</Text>}
              {item.test_result && <Text style={[styles.logDetail, { color: item.test_result === 'pass' ? '#4CAF50' : '#F44336' }]}>{t('compressors.result')}: {item.test_result === 'pass' ? t('compressors.pass') : t('compressors.fail')}</Text>}
              {item.test_certificate_number && <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{t('compressors.certificate')}: {item.test_certificate_number}</Text>}
              {item.next_due_date && <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{t('compressors.nextDue')}: {formatDate(item.next_due_date)}</Text>}
              {item.technician && <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{t('compressors.technician')}: {item.technician}</Text>}
              {item.cost != null && <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{t('compressors.cost')}: ${item.cost}</Text>}
              {item.notes && <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{item.notes}</Text>}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <Ionicons name="construct-outline" size={40} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {activeTab === 'testing' ? t('compressors.noTestRecords') : t('compressors.noServiceRecords')}
              </Text>
            </View>
          }
        />

        <Pressable style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={() => {
          if (activeTab === 'testing') {
            setServiceForm({ ...serviceForm, service_type: 'independent_test' });
          }
          setShowServiceModal(true);
        }}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addButtonText}>{activeTab === 'testing' ? t('compressors.addTest') : t('compressors.addService')}</Text>
        </Pressable>
      </View>
    );
  };

  const renderUsageTab = () => (
    <View style={styles.tabContent}>
      <FlatList
        style={{ flex: 1 }}
        data={usageLogs}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContent, usageLogs.length === 0 && styles.emptyContainer]}
        renderItem={({ item }) => (
          <View style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.logHeader}>
              <Text style={[styles.logType, { color: colors.primary }]}>{parseFloat(String(item.hours_used)).toFixed(1)}h</Text>
              <Text style={[styles.logDate, { color: colors.textSecondary }]}>{formatDate(item.usage_date)}</Text>
            </View>
            {item.fills_count != null && <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{t('compressors.fills')}: {item.fills_count}</Text>}
            {item.notes && <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{item.notes}</Text>}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Ionicons name="time-outline" size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('compressors.noUsageRecords')}</Text>
          </View>
        }
      />

      <Pressable style={[styles.addButton, { backgroundColor: colors.primary }]} onPress={() => setShowUsageModal(true)}>
        <Ionicons name="add" size={20} color="#FFF" />
        <Text style={styles.addButtonText}>{t('compressors.logUsage')}</Text>
      </Pressable>
    </View>
  );

  const renderServiceModal = () => (
    <Modal visible={showServiceModal} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{serviceForm.service_type === 'independent_test' ? t('compressors.addTest') : t('compressors.addService')}</Text>
            <Pressable onPress={() => setShowServiceModal(false)}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
            {serviceForm.service_type !== 'independent_test' && (
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.serviceType')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {SERVICE_TYPES.filter(st => st !== 'independent_test').map((st) => (
                    <Pressable key={st} onPress={() => setServiceForm({ ...serviceForm, service_type: st })} style={[styles.filterChip, { backgroundColor: serviceForm.service_type === st ? colors.primary : colors.surface, borderColor: serviceForm.service_type === st ? colors.primary : colors.border }]}>
                      <Text style={{ color: serviceForm.service_type === st ? '#FFF' : colors.text, fontSize: 12 }}>{t(`compressors.serviceTypes.${st}`)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.serviceDate')}</Text>
              <Pressable onPress={() => setShowDatePicker('service')} style={[styles.input, { justifyContent: 'center', borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.text }}>{formatDate(serviceForm.service_date)}</Text>
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.hoursAtService')}</Text>
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={serviceForm.hours_at_service} onChangeText={(v) => setServiceForm({ ...serviceForm, hours_at_service: v })} keyboardType="numeric" placeholder={compressor ? String(compressor.total_hours) : '0'} placeholderTextColor={colors.textSecondary} />
            </View>

            {serviceForm.service_type === 'filter_change' && (
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.filterType')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {FILTER_TYPES.map((ft) => (
                    <Pressable key={ft} onPress={() => setServiceForm({ ...serviceForm, filter_type: ft })} style={[styles.filterChip, { backgroundColor: serviceForm.filter_type === ft ? colors.primary : colors.surface, borderColor: serviceForm.filter_type === ft ? colors.primary : colors.border }]}>
                      <Text style={{ color: serviceForm.filter_type === ft ? '#FFF' : colors.text, fontSize: 12 }}>{t(`compressors.filterTypes.${ft}`)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {serviceForm.service_type === 'independent_test' && (
              <>
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.testResult')}</Text>
                  <View style={styles.statusRow}>
                    {['pass', 'fail'].map((r) => (
                      <Pressable key={r} onPress={() => setServiceForm({ ...serviceForm, test_result: r })} style={[styles.statusOption, { borderColor: serviceForm.test_result === r ? (r === 'pass' ? '#4CAF50' : '#F44336') : colors.border, backgroundColor: serviceForm.test_result === r ? (r === 'pass' ? '#4CAF5015' : '#F4433615') : colors.surface }]}>
                        <Text style={{ color: serviceForm.test_result === r ? (r === 'pass' ? '#4CAF50' : '#F44336') : colors.textSecondary }}>{r === 'pass' ? t('compressors.pass') : t('compressors.fail')}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.certificateNumber')}</Text>
                  <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={serviceForm.test_certificate_number} onChangeText={(v) => setServiceForm({ ...serviceForm, test_certificate_number: v })} placeholderTextColor={colors.textSecondary} />
                </View>
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.nextDueDate')}</Text>
                  <Pressable onPress={() => setShowDatePicker('nextDue')} style={[styles.input, { justifyContent: 'center', borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Text style={{ color: serviceForm.next_due_date ? colors.text : colors.textSecondary }}>{serviceForm.next_due_date ? formatDate(serviceForm.next_due_date) : t('compressors.selectDate')}</Text>
                  </Pressable>
                </View>
              </>
            )}

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.cost')}</Text>
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={serviceForm.cost} onChangeText={(v) => setServiceForm({ ...serviceForm, cost: v })} keyboardType="numeric" placeholderTextColor={colors.textSecondary} />
            </View>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.technician')}</Text>
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={serviceForm.technician} onChangeText={(v) => setServiceForm({ ...serviceForm, technician: v })} placeholderTextColor={colors.textSecondary} />
            </View>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.notes')}</Text>
              <TextInput style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={serviceForm.notes} onChangeText={(v) => setServiceForm({ ...serviceForm, notes: v })} multiline numberOfLines={3} placeholderTextColor={colors.textSecondary} />
            </View>
          </ScrollView>
          <Pressable style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleAddService}>
            <Text style={styles.saveButtonText}>{t('common.save')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  const renderUsageModal = () => (
    <Modal visible={showUsageModal} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('compressors.logUsage')}</Text>
            <Pressable onPress={() => setShowUsageModal(false)}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.usageDate')}</Text>
              <Pressable onPress={() => setShowDatePicker('usage')} style={[styles.input, { justifyContent: 'center', borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.text }}>{formatDate(usageForm.usage_date)}</Text>
              </Pressable>
            </View>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.hoursUsed')} *</Text>
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={usageForm.hours_used} onChangeText={(v) => setUsageForm({ ...usageForm, hours_used: v })} keyboardType="numeric" placeholderTextColor={colors.textSecondary} />
            </View>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.fillsCount')}</Text>
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={usageForm.fills_count} onChangeText={(v) => setUsageForm({ ...usageForm, fills_count: v })} keyboardType="numeric" placeholderTextColor={colors.textSecondary} />
            </View>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('compressors.notes')}</Text>
              <TextInput style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={usageForm.notes} onChangeText={(v) => setUsageForm({ ...usageForm, notes: v })} multiline numberOfLines={3} placeholderTextColor={colors.textSecondary} />
            </View>
          </ScrollView>
          <Pressable style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleAddUsage}>
            <Text style={styles.saveButtonText}>{t('common.save')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  const renderDatePickerModal = () => (
    <Modal visible={showDatePicker !== null} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.datePickerContainer, { backgroundColor: colors.background }]}>
          <DateTimePicker
            mode="single"
            date={(() => {
              if (showDatePicker === 'purchase') return formData.purchase_date ? dayjs(formData.purchase_date) : dayjs();
              if (showDatePicker === 'service') return dayjs(serviceForm.service_date);
              if (showDatePicker === 'nextDue') return serviceForm.next_due_date ? dayjs(serviceForm.next_due_date) : dayjs();
              if (showDatePicker === 'usage') return dayjs(usageForm.usage_date);
              return dayjs();
            })()}
            onChange={(params: { date: dayjs.Dayjs }) => {
              if (params.date) {
                const dateStr = dayjs(params.date).format('YYYY-MM-DD');
                if (showDatePicker === 'purchase') setFormData({ ...formData, purchase_date: dateStr });
                else if (showDatePicker === 'service') setServiceForm({ ...serviceForm, service_date: dateStr });
                else if (showDatePicker === 'nextDue') setServiceForm({ ...serviceForm, next_due_date: dateStr });
                else if (showDatePicker === 'usage') setUsageForm({ ...usageForm, usage_date: dateStr });
                setShowDatePicker(null);
              }
            }}
            selectedItemColor={colors.primary}
            calendarTextStyle={{ color: colors.text }}
            headerTextStyle={{ color: colors.text }}
            weekDaysTextStyle={{ color: colors.textSecondary }}
            headerButtonColor={colors.primary}
          />
          <Pressable onPress={() => setShowDatePicker(null)} style={[styles.cancelButton, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text }}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <ThemedBackground style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </ThemedBackground>
    );
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'overview', label: t('compressors.overview') },
    { key: 'service', label: t('compressors.service') },
    { key: 'usage', label: t('compressors.usage') },
    { key: 'testing', label: t('compressors.testing') },
  ];

  return (
    <ThemedBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {isNew ? t('compressors.addCompressor') : (compressor?.name || '')}
        </Text>
        <View style={styles.headerActions}>
          {!isNew && !isEditing && (
            <>
              <Pressable onPress={() => setIsEditing(true)} style={styles.headerBtn}>
                <Ionicons name="create-outline" size={22} color={colors.primary} />
              </Pressable>
              <Pressable onPress={handleDelete} style={styles.headerBtn}>
                <Ionicons name="trash-outline" size={22} color="#F44336" />
              </Pressable>
            </>
          )}
          {isEditing && (
            <>
              {!isNew && (
                <Pressable onPress={() => { setIsEditing(false); fetchCompressor(); }} style={styles.headerBtn}>
                  <Text style={{ color: colors.textSecondary }}>{t('common.cancel')}</Text>
                </Pressable>
              )}
              <Pressable onPress={handleSave} disabled={saving} style={[styles.saveHeaderBtn, { backgroundColor: colors.primary }]}>
                {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '600' }}>{t('common.save')}</Text>}
              </Pressable>
            </>
          )}
        </View>
      </View>

      {!isNew && !isEditing && (
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          {tabs.map((tab) => (
            <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={[styles.tab, activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
              <Text style={[styles.tabText, { color: activeTab === tab.key ? colors.primary : colors.textSecondary }]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {(activeTab === 'overview' || isEditing) && renderOverviewTab()}
      {activeTab === 'service' && !isEditing && renderServiceTab()}
      {activeTab === 'usage' && !isEditing && renderUsageTab()}
      {activeTab === 'testing' && !isEditing && renderServiceTab()}

      {renderServiceModal()}
      {renderUsageModal()}
      {renderDatePickerModal()}
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  backButton: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: { padding: 4 },
  saveHeaderBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '500' },
  tabContent: { flex: 1 },
  formSection: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, paddingHorizontal: 16 },
  formGroup: { marginBottom: 16 },
  formRow: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 13, marginBottom: 6, fontWeight: '500' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, minHeight: 44 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  statusRow: { flexDirection: 'row', gap: 12 },
  statusOption: { flex: 1, paddingVertical: 10, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
  infoCard: { margin: 16, borderRadius: 12, borderWidth: 1, padding: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '500' },
  infoValueLarge: { fontSize: 24, fontWeight: '700' },
  statusCard: { marginHorizontal: 16, borderRadius: 12, borderWidth: 1, padding: 16 },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  statusIndicator: { width: 8, height: 8, borderRadius: 4 },
  statusTitle: { fontSize: 14, fontWeight: '500' },
  statusDetail: { fontSize: 12, marginTop: 2 },
  statusLabel: { fontSize: 12, fontWeight: '600' },
  statusDivider: { height: 1, marginVertical: 4 },
  filterBar: { paddingVertical: 4, flexGrow: 0, flexShrink: 0 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  listContent: { padding: 16 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  emptyList: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, marginTop: 12 },
  logCard: { borderRadius: 10, borderWidth: 1, padding: 14, marginBottom: 10 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  logType: { fontSize: 14, fontWeight: '600' },
  logDate: { fontSize: 12 },
  logDetail: { fontSize: 12, marginTop: 2 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, paddingVertical: 14, borderRadius: 10 },
  addButtonText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  datePickerContainer: { margin: 20, borderRadius: 16, padding: 16 },
  cancelButton: { alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderRadius: 8, marginTop: 8 },
  saveButton: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
