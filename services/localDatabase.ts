export function isDatabaseAvailable(): boolean {
  return false;
}

export function isDatabaseReady(): boolean {
  return false;
}

export async function initializeDatabaseAsync(): Promise<boolean> {
  return false;
}

export interface LocalDiveSite {
  id: number;
  serverId: number | null;
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
  facilities: string;
  hazards: string;
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
  isSynced: boolean;
}

export interface PendingMutation {
  id: number;
  clientMutationId: string;
  entityType: string;
  entityId: number;
  action: 'create' | 'update' | 'delete';
  data: string;
  createdAt: string;
  retryCount: number;
}

export interface SyncMeta {
  key: string;
  value: string;
}

export async function getDatabase(): Promise<null> {
  return null;
}

export async function getLastSyncTime(): Promise<string | null> {
  return null;
}

export async function setLastSyncTime(timestamp: string): Promise<void> {
}

export async function getAllLocalDiveSites(): Promise<LocalDiveSite[]> {
  return [];
}

export async function getLocalDiveSiteById(id: number): Promise<LocalDiveSite | null> {
  return null;
}

export async function getLocalDiveSiteByServerId(serverId: number): Promise<LocalDiveSite | null> {
  return null;
}

export async function upsertLocalDiveSite(site: Partial<LocalDiveSite> & { serverId?: number }): Promise<number> {
  return 0;
}

export async function markLocalDiveSiteDeleted(id: number): Promise<void> {
}

export async function getUnsyncedDiveSites(): Promise<LocalDiveSite[]> {
  return [];
}

export async function addPendingMutation(mutation: Omit<PendingMutation, 'id' | 'createdAt' | 'retryCount'>): Promise<number> {
  return 0;
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  return [];
}

export async function removePendingMutation(clientMutationId: string): Promise<void> {
}

export async function incrementMutationRetryCount(clientMutationId: string): Promise<void> {
}

export async function updateLocalSiteServerId(localId: number, serverId: number): Promise<void> {
}

export async function markLocalSiteSynced(localId: number): Promise<void> {
}

export async function clearLocalDatabase(): Promise<void> {
}

export function generateClientMutationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
