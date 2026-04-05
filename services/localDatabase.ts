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

export interface LocalCompressor {
  id: number;
  serverId: number | null;
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
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  isSynced: boolean;
}

export async function getAllLocalCompressors(): Promise<LocalCompressor[]> {
  return [];
}

export async function getLocalCompressorById(id: number): Promise<LocalCompressor | null> {
  return null;
}

export async function getLocalCompressorByServerId(serverId: number): Promise<LocalCompressor | null> {
  return null;
}

export async function upsertLocalCompressor(compressor: Partial<LocalCompressor> & { serverId?: number; id?: number }): Promise<number> {
  return 0;
}

export async function markLocalCompressorDeleted(id: number): Promise<void> {
}

export interface LocalCompressorServiceLog {
  id: number;
  serverId: number | null;
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
  createdAt: string | null;
  updatedAt: string | null;
  isSynced: boolean;
}

export async function getServiceLogsByCompressorId(compressorId: number): Promise<LocalCompressorServiceLog[]> {
  return [];
}

export async function upsertLocalServiceLog(log: Partial<LocalCompressorServiceLog> & { serverId?: number }): Promise<number> {
  return 0;
}

export interface LocalCompressorUsageLog {
  id: number;
  serverId: number | null;
  compressorId: number;
  userId: number | null;
  usageDate: string;
  hoursUsed: number;
  fillsCount: number | null;
  notes: string | null;
  createdAt: string | null;
  isSynced: boolean;
}

export async function getUsageLogsByCompressorId(compressorId: number): Promise<LocalCompressorUsageLog[]> {
  return [];
}

export async function upsertLocalUsageLog(log: Partial<LocalCompressorUsageLog> & { serverId?: number }): Promise<number> {
  return 0;
}

export async function clearLocalDatabase(): Promise<void> {
}

export function generateClientMutationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
