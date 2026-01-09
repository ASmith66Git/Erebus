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
  LocalDiveSite,
  PendingMutation
} from './localDatabase';
import { getApiUrl } from '@/utils/apiConfig';

interface SyncResult {
  success: boolean;
  sitesUpdated: number;
  sitesPushed: number;
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

export async function performFullSync(token: string): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    sitesUpdated: 0,
    sitesPushed: 0,
    errors: []
  };

  try {
    const pushResult = await pushPendingMutations(token);
    result.sitesPushed = pushResult.pushed;
    result.errors.push(...pushResult.errors);

    const pullResult = await pullServerChanges(token);
    result.sitesUpdated = pullResult.updated;
    result.errors.push(...pullResult.errors);

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
    errors.push(`Push failed: ${error.message}`);
    for (const mutation of mutations) {
      await incrementMutationRetryCount(mutation.clientMutationId);
    }
  }

  return { pushed, errors };
}

async function pullServerChanges(token: string): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    const lastSync = await getLastSyncTime();
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

    await setLastSyncTime(data.serverTime);
  } catch (error: any) {
    errors.push(`Pull failed: ${error.message}`);
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
