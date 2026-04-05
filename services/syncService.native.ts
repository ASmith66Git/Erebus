import {
  getDatabase,
  getLastSyncTime,
  setLastSyncTime,
  upsertLocalDiveSite,
  getPendingMutations,
  removePendingMutation,
  incrementMutationRetryCount,
  updateLocalSiteServerId,
  markLocalSiteSynced,
  upsertLocalCompressor,
  getLocalCompressorByServerId,
  getLocalCompressorById,
  upsertLocalServiceLog,
  upsertLocalUsageLog,
  LocalDiveSite,
  LocalCompressor,
  LocalCompressorServiceLog,
  LocalCompressorUsageLog,
  PendingMutation
} from './localDatabase';
import { getApiUrl } from '@/utils/apiConfig';

interface SyncResult {
  success: boolean;
  sitesUpdated: number;
  sitesPushed: number;
  compressorsUpdated: number;
  serviceLogsUpdated: number;
  usageLogsUpdated: number;
  errors: string[];
}

interface ServerDiveSite {
  id: number;
  userId: number | null;
  name: string;
  description: string | null;
  siteType: string;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  region: string | null;
  waterType: string;
  depthMin: number | null;
  depthMax: number | null;
  visibilityMin: number | null;
  visibilityMax: number | null;
  difficulty: string;
  currentStrength: string | null;
  accessNotes: string | null;
  facilities: any[];
  hazards: any[];
  bestSeason: string | null;
  ratingAvg: number;
  ratingsCount: number;
  wikipediaUrl: string | null;
  externalInfo: string | null;
  imageUrl: string | null;
  isArchived: boolean;
  isWreck: boolean;
  wreckInfo: string | null;
  wreckName: string | null;
  wreckUrl: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface ServerCompressor {
  id: number;
  userId: number | null;
  name: string;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  purchaseDate: string | null;
  totalHours: number;
  oilChangeIntervalHours: number;
  filterChangeIntervalHours: number;
  independentTestIntervalMonths: number;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface ServerServiceLog {
  id: number;
  compressorId: number;
  userId: number | null;
  serviceType: string;
  serviceDate: string;
  hoursAtService: number | null;
  filterType: string | null;
  testResult: string | null;
  testCertificateNumber: string | null;
  nextDueDate: string | null;
  cost: number | null;
  technician: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ServerUsageLog {
  id: number;
  compressorId: number;
  userId: number | null;
  usageDate: string;
  hoursUsed: number;
  fillsCount: number | null;
  notes: string | null;
  createdAt: string;
}

export async function performFullSync(token: string): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    sitesUpdated: 0,
    sitesPushed: 0,
    compressorsUpdated: 0,
    serviceLogsUpdated: 0,
    usageLogsUpdated: 0,
    errors: []
  };

  try {
    const pushResult = await pushPendingMutations(token);
    result.sitesPushed = pushResult.pushed;
    result.errors.push(...pushResult.errors);

    const syncSince = await getLastSyncTime();

    const pullResult = await pullServerChanges(token, syncSince);
    result.sitesUpdated = pullResult.updated;
    result.errors.push(...pullResult.errors);

    const compressorResult = await pullCompressorChanges(token, syncSince);
    result.compressorsUpdated = compressorResult.updated;
    result.errors.push(...compressorResult.errors);

    const serviceLogResult = await pullServiceLogChanges(token, syncSince);
    result.serviceLogsUpdated = serviceLogResult.updated;
    result.errors.push(...serviceLogResult.errors);

    const usageLogResult = await pullUsageLogChanges(token, syncSince);
    result.usageLogsUpdated = usageLogResult.updated;
    result.errors.push(...usageLogResult.errors);

    if (pullResult.serverTime) {
      await setLastSyncTime(pullResult.serverTime);
    }

    result.success = result.errors.length === 0;
  } catch (error: any) {
    result.success = false;
    result.errors.push(error.message || 'Unknown sync error');
  }

  return result;
}

async function pushPendingMutations(token: string): Promise<{ pushed: number; errors: string[] }> {
  const mutations = await getPendingMutations();
  const errors: string[] = [];
  let pushed = 0;

  if (mutations.length === 0) {
    return { pushed: 0, errors: [] };
  }

  const siteMutations = mutations.filter(m => m.entityType === 'dive_site');
  const compressorMutations = mutations.filter(m =>
    m.entityType === 'compressor' || m.entityType === 'compressor_service' || m.entityType === 'compressor_usage'
  );

  if (siteMutations.length > 0) {
    const result = await pushSiteMutations(siteMutations, token);
    pushed += result.pushed;
    errors.push(...result.errors);
  }

  if (compressorMutations.length > 0) {
    const result = await pushCompressorMutations(compressorMutations, token);
    pushed += result.pushed;
    errors.push(...result.errors);
  }

  return { pushed, errors };
}

async function pushSiteMutations(mutations: PendingMutation[], token: string): Promise<{ pushed: number; errors: string[] }> {
  const errors: string[] = [];
  let pushed = 0;

  const mutationsToSend = mutations.map(m => ({
    clientMutationId: m.clientMutationId,
    action: m.action,
    data: JSON.parse(m.data)
  }));

  try {
    const response = await fetch(`${getApiUrl()}/api/sync/dive-sites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ mutations: mutationsToSend })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();

    for (const result of data.results) {
      if (result.success) {
        const mutation = mutations.find(m => m.clientMutationId === result.clientMutationId);
        if (mutation) {
          if (result.serverId && mutation.action === 'create') {
            await updateLocalSiteServerId(mutation.entityId, result.serverId);
          } else {
            await markLocalSiteSynced(mutation.entityId);
          }
          await removePendingMutation(result.clientMutationId);
          pushed++;
        }
      } else {
        const mutation = mutations.find(m => m.clientMutationId === result.clientMutationId);
        if (mutation) {
          await incrementMutationRetryCount(result.clientMutationId);
          errors.push(`Failed to sync ${mutation.action} for entity ${mutation.entityId}: ${result.error}`);
        }
      }
    }
  } catch (error: any) {
    errors.push(`Site push failed: ${error.message}`);
    for (const mutation of mutations) {
      await incrementMutationRetryCount(mutation.clientMutationId);
    }
  }

  return { pushed, errors };
}

async function pushCompressorMutations(mutations: PendingMutation[], token: string): Promise<{ pushed: number; errors: string[] }> {
  const errors: string[] = [];
  let pushed = 0;

  for (const mutation of mutations) {
    try {
      const payload = JSON.parse(mutation.data);
      let url = '';
      let method = 'POST';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      if (mutation.entityType === 'compressor') {
        if (mutation.action === 'create') {
          url = `${getApiUrl()}/api/compressors`;
          method = 'POST';
        } else if (mutation.action === 'update') {
          const local = await getLocalCompressorById(mutation.entityId);
          const serverId = local?.serverId;
          if (!serverId) {
            url = `${getApiUrl()}/api/compressors`;
            method = 'POST';
          } else {
            url = `${getApiUrl()}/api/compressors/${serverId}`;
            method = 'PUT';
          }
        } else if (mutation.action === 'delete') {
          const local = await getLocalCompressorById(mutation.entityId);
          const deleteId = local?.serverId || payload.id;
          if (!deleteId) {
            await removePendingMutation(mutation.clientMutationId);
            pushed++;
            continue;
          }
          url = `${getApiUrl()}/api/compressors/${deleteId}`;
          method = 'DELETE';
        }
      } else if (mutation.entityType === 'compressor_service') {
        let compressorServerId = payload._compressorServerId;
        delete payload._compressorServerId;
        if (!compressorServerId && payload._compressorLocalId) {
          const localComp = await getLocalCompressorById(payload._compressorLocalId);
          compressorServerId = localComp?.serverId;
          delete payload._compressorLocalId;
        }
        if (!compressorServerId) {
          continue;
        }
        url = `${getApiUrl()}/api/compressors/${compressorServerId}/services`;
        method = 'POST';
      } else if (mutation.entityType === 'compressor_usage') {
        let compressorServerId = payload._compressorServerId;
        delete payload._compressorServerId;
        if (!compressorServerId && payload._compressorLocalId) {
          const localComp = await getLocalCompressorById(payload._compressorLocalId);
          compressorServerId = localComp?.serverId;
          delete payload._compressorLocalId;
        }
        if (!compressorServerId) {
          continue;
        }
        url = `${getApiUrl()}/api/compressors/${compressorServerId}/usage`;
        method = 'POST';
      }

      if (!url) {
        await removePendingMutation(mutation.clientMutationId);
        continue;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: method !== 'DELETE' ? JSON.stringify(payload) : undefined,
      });

      if (response.ok) {
        const db = await getDatabase();
        if (mutation.entityType === 'compressor' && method === 'POST') {
          const data = await response.json();
          if (data.id) {
            await db.runAsync(
              'UPDATE compressors SET server_id = ?, is_synced = 1 WHERE id = ?',
              [data.id, mutation.entityId]
            );
          }
        } else if (mutation.entityType === 'compressor') {
          await db.runAsync('UPDATE compressors SET is_synced = 1 WHERE id = ?', [mutation.entityId]);
        } else if (mutation.entityType === 'compressor_service') {
          const data = await response.json();
          if (data.id) {
            await db.runAsync(
              'UPDATE compressor_service_logs SET server_id = ?, is_synced = 1 WHERE id = ?',
              [data.id, mutation.entityId]
            );
          }
        } else if (mutation.entityType === 'compressor_usage') {
          const data = await response.json();
          if (data.id) {
            await db.runAsync(
              'UPDATE compressor_usage_logs SET server_id = ?, is_synced = 1 WHERE id = ?',
              [data.id, mutation.entityId]
            );
          }
        }
        await removePendingMutation(mutation.clientMutationId);
        pushed++;
      } else {
        await incrementMutationRetryCount(mutation.clientMutationId);
        errors.push(`Failed to push ${mutation.entityType} ${mutation.action}: server ${response.status}`);
      }
    } catch (error: any) {
      await incrementMutationRetryCount(mutation.clientMutationId);
      errors.push(`Push ${mutation.entityType} failed: ${error.message}`);
    }
  }

  return { pushed, errors };
}

async function pullServerChanges(token: string, lastSync: string | null): Promise<{ updated: number; errors: string[]; serverTime?: string }> {
  const errors: string[] = [];
  let updated = 0;
  let serverTime: string | undefined;

  try {
    const url = lastSync 
      ? `${getApiUrl()}/api/sync/dive-sites?since=${encodeURIComponent(lastSync)}`
      : `${getApiUrl()}/api/sync/dive-sites`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    const sites: ServerDiveSite[] = data.sites;

    for (const site of sites) {
      await upsertLocalDiveSite({
        serverId: site.id,
        userId: site.userId,
        name: site.name,
        description: site.description,
        siteType: site.siteType,
        latitude: site.latitude,
        longitude: site.longitude,
        country: site.country,
        region: site.region,
        waterType: site.waterType,
        depthMin: site.depthMin,
        depthMax: site.depthMax,
        visibilityMin: site.visibilityMin,
        visibilityMax: site.visibilityMax,
        difficulty: site.difficulty,
        currentStrength: site.currentStrength,
        accessNotes: site.accessNotes,
        facilities: JSON.stringify(site.facilities || []),
        hazards: JSON.stringify(site.hazards || []),
        bestSeason: site.bestSeason,
        ratingAvg: site.ratingAvg,
        ratingsCount: site.ratingsCount,
        wikipediaUrl: site.wikipediaUrl,
        externalInfo: site.externalInfo,
        imageUrl: site.imageUrl,
        isArchived: site.isArchived,
        isWreck: site.isWreck,
        wreckInfo: site.wreckInfo,
        wreckName: site.wreckName,
        wreckUrl: site.wreckUrl,
        createdAt: site.createdAt,
        updatedAt: site.updatedAt,
        deletedAt: site.deletedAt
      });
      updated++;
    }

    serverTime = data.serverTime;
  } catch (error: any) {
    errors.push(`Pull failed: ${error.message}`);
  }

  return { updated, errors, serverTime };
}

async function pullCompressorChanges(token: string, lastSync: string | null): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    const url = lastSync
      ? `${getApiUrl()}/api/sync/compressors?since=${encodeURIComponent(lastSync)}`
      : `${getApiUrl()}/api/sync/compressors`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    const compressors: ServerCompressor[] = data.compressors;

    for (const compressor of compressors) {
      await upsertLocalCompressor({
        serverId: compressor.id,
        userId: compressor.userId,
        name: compressor.name,
        make: compressor.make,
        model: compressor.model,
        serialNumber: compressor.serialNumber,
        purchaseDate: compressor.purchaseDate,
        totalHours: compressor.totalHours,
        oilChangeIntervalHours: compressor.oilChangeIntervalHours,
        filterChangeIntervalHours: compressor.filterChangeIntervalHours,
        independentTestIntervalMonths: compressor.independentTestIntervalMonths,
        notes: compressor.notes,
        status: compressor.status,
        createdAt: compressor.createdAt,
        updatedAt: compressor.updatedAt,
        deletedAt: compressor.deletedAt
      });
      updated++;
    }
  } catch (error: any) {
    errors.push(`Compressor pull failed: ${error.message}`);
  }

  return { updated, errors };
}

async function pullServiceLogChanges(token: string, lastSync: string | null): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    const url = lastSync
      ? `${getApiUrl()}/api/sync/compressor-service-logs?since=${encodeURIComponent(lastSync)}`
      : `${getApiUrl()}/api/sync/compressor-service-logs`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    const logs: ServerServiceLog[] = data.serviceLogs;

    for (const log of logs) {
      const localCompressor = await getLocalCompressorByServerId(log.compressorId);
      const localCompressorId = localCompressor ? localCompressor.id : log.compressorId;
      await upsertLocalServiceLog({
        serverId: log.id,
        compressorId: localCompressorId,
        userId: log.userId,
        serviceType: log.serviceType,
        serviceDate: log.serviceDate,
        hoursAtService: log.hoursAtService,
        filterType: log.filterType,
        testResult: log.testResult,
        testCertificateNumber: log.testCertificateNumber,
        nextDueDate: log.nextDueDate,
        cost: log.cost,
        technician: log.technician,
        notes: log.notes,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt
      });
      updated++;
    }
  } catch (error: any) {
    errors.push(`Service log pull failed: ${error.message}`);
  }

  return { updated, errors };
}

async function pullUsageLogChanges(token: string, lastSync: string | null): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    const url = lastSync
      ? `${getApiUrl()}/api/sync/compressor-usage-logs?since=${encodeURIComponent(lastSync)}`
      : `${getApiUrl()}/api/sync/compressor-usage-logs`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    const logs: ServerUsageLog[] = data.usageLogs;

    for (const log of logs) {
      const localCompressor = await getLocalCompressorByServerId(log.compressorId);
      const localCompressorId = localCompressor ? localCompressor.id : log.compressorId;
      await upsertLocalUsageLog({
        serverId: log.id,
        compressorId: localCompressorId,
        userId: log.userId,
        usageDate: log.usageDate,
        hoursUsed: log.hoursUsed,
        fillsCount: log.fillsCount,
        notes: log.notes,
        createdAt: log.createdAt
      });
      updated++;
    }
  } catch (error: any) {
    errors.push(`Usage log pull failed: ${error.message}`);
  }

  return { updated, errors };
}

export async function getSyncStatus(token: string): Promise<{ serverTime: string; diveSites: { lastUpdated: string; count: number } } | null> {
  try {
    const response = await fetch(`${getApiUrl()}/api/sync/status`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}
