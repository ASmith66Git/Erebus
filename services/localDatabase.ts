export interface DiveSiteLocal {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  siteType: string | null;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  region: string | null;
  waterType: string | null;
  depthMin: number | null;
  depthMax: number | null;
  visibilityMin: number | null;
  visibilityMax: number | null;
  difficulty: string | null;
  currentStrength: string | null;
  accessNotes: string | null;
  facilities: any | null;
  hazards: any | null;
  bestSeason: string | null;
  ratingAvg: number | null;
  ratingsCount: number;
  wikipediaUrl: string | null;
  externalInfo: string | null;
  imageUrl: string | null;
  isWreck: boolean;
  wreckName: string | null;
  wreckUrl: string | null;
  wreckInfo: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  localId?: string;
  syncStatus: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete';
}

export interface PendingMutation {
  id: number;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: string;
  createdAt: string;
}

export async function getDatabase(): Promise<null> {
  return null;
}

export async function initializeDatabase(): Promise<void> {
}

export async function getAllDiveSites(): Promise<DiveSiteLocal[]> {
  return [];
}

export async function getDiveSiteById(id: number): Promise<DiveSiteLocal | null> {
  return null;
}

export async function saveDiveSites(sites: DiveSiteLocal[]): Promise<void> {
}

export async function upsertDiveSite(site: Partial<DiveSiteLocal>): Promise<void> {
}

export async function deleteDiveSiteLocally(id: number): Promise<void> {
}

export async function queueMutation(
  entityType: string,
  entityId: string,
  operation: 'create' | 'update' | 'delete',
  payload: any
): Promise<void> {
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  return [];
}

export async function removePendingMutation(id: number): Promise<void> {
}

export async function clearAllPendingMutations(): Promise<void> {
}

export async function getLastSyncTime(): Promise<string | null> {
  return null;
}

export async function setLastSyncTime(timestamp: string): Promise<void> {
}

export async function clearLocalData(): Promise<void> {
}
