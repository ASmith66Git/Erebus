import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

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

let db: SQLite.SQLiteDatabase | null = null;
let dbInitFailed = false;
let dbInitAttempts = 0;
let hasAttemptedCleanup = false;
const MAX_INIT_ATTEMPTS = 3;
const DB_NAME = 'erebus_local.db';

export function isDatabaseAvailable(): boolean {
  return db !== null && !dbInitFailed;
}

async function cleanupCorruptedDatabase(): Promise<boolean> {
  if (hasAttemptedCleanup) {
    return false;
  }
  hasAttemptedCleanup = true;
  
  try {
    console.log('Attempting to cleanup corrupted database file...');
    await SQLite.deleteDatabaseAsync(DB_NAME);
    console.log('Database file cleanup successful');
    return true;
  } catch (cleanupError: any) {
    console.error('Database cleanup failed:', cleanupError?.message || cleanupError);
    return false;
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (dbInitFailed && dbInitAttempts >= MAX_INIT_ATTEMPTS) {
    throw new Error('Local database initialization failed after multiple attempts. Please clear app data and restart.');
  }
  
  dbInitAttempts++;
  
  try {
    const newDb = await SQLite.openDatabaseAsync(DB_NAME);
    if (!newDb) {
      throw new Error('Database open returned null');
    }
    await initializeLocalDatabase(newDb);
    db = newDb;
    dbInitFailed = false;
    return db;
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    console.error(`SQLite initialization attempt ${dbInitAttempts} failed:`, errorMessage);
    
    const isConflictError = errorMessage.includes('Path already points to a non-normal file') || 
        errorMessage.includes("Couldn't create directory") ||
        errorMessage.includes('unexpected file') ||
        errorMessage.includes('NullPointerException');
    
    if (isConflictError && !hasAttemptedCleanup) {
      console.log('Detected database conflict, attempting automatic cleanup...');
      const cleanupSuccess = await cleanupCorruptedDatabase();
      
      if (cleanupSuccess) {
        dbInitAttempts = 0;
        return getDatabase();
      }
    }
    
    if (dbInitAttempts >= MAX_INIT_ATTEMPTS) {
      dbInitFailed = true;
      if (isConflictError) {
        throw new Error('Database storage conflict. Please go to Settings > Apps > Erebus > Clear Data, then reopen the app.');
      }
    }
    throw error;
  }
}

async function initializeLocalDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS dive_sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER UNIQUE,
      user_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      site_type TEXT DEFAULT 'reef',
      latitude REAL,
      longitude REAL,
      country TEXT,
      region TEXT,
      water_type TEXT DEFAULT 'marine',
      depth_min REAL,
      depth_max REAL,
      visibility_min REAL,
      visibility_max REAL,
      difficulty TEXT DEFAULT 'intermediate',
      current_strength TEXT,
      access_notes TEXT,
      facilities TEXT DEFAULT '[]',
      hazards TEXT DEFAULT '[]',
      best_season TEXT,
      rating_avg REAL DEFAULT 0,
      ratings_count INTEGER DEFAULT 0,
      wikipedia_url TEXT,
      external_info TEXT,
      image_url TEXT,
      is_archived INTEGER DEFAULT 0,
      is_wreck INTEGER DEFAULT 0,
      wreck_info TEXT,
      wreck_name TEXT,
      wreck_url TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT,
      is_synced INTEGER DEFAULT 1
    );
    
    CREATE TABLE IF NOT EXISTS pending_mutations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_mutation_id TEXT UNIQUE NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      retry_count INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_dive_sites_server_id ON dive_sites(server_id);
    CREATE INDEX IF NOT EXISTS idx_dive_sites_is_synced ON dive_sites(is_synced);
    CREATE INDEX IF NOT EXISTS idx_pending_mutations_entity ON pending_mutations(entity_type, entity_id);
  `);
}

export async function getLastSyncTime(): Promise<string | null> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    ['last_sync_time']
  );
  return result?.value || null;
}

export async function setLastSyncTime(timestamp: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
    ['last_sync_time', timestamp]
  );
}

export async function getAllLocalDiveSites(): Promise<LocalDiveSite[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM dive_sites WHERE deleted_at IS NULL ORDER BY name ASC'
  );
  return rows.map(mapRowToLocalDiveSite);
}

export async function getLocalDiveSiteById(id: number): Promise<LocalDiveSite | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM dive_sites WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? mapRowToLocalDiveSite(row) : null;
}

export async function getLocalDiveSiteByServerId(serverId: number): Promise<LocalDiveSite | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM dive_sites WHERE server_id = ?',
    [serverId]
  );
  return row ? mapRowToLocalDiveSite(row) : null;
}

export async function upsertLocalDiveSite(site: Partial<LocalDiveSite> & { serverId?: number }): Promise<number> {
  const db = await getDatabase();
  
  if (site.serverId) {
    const existing = await getLocalDiveSiteByServerId(site.serverId);
    if (existing) {
      await db.runAsync(`
        UPDATE dive_sites SET
          user_id = ?, name = ?, description = ?, site_type = ?, latitude = ?,
          longitude = ?, country = ?, region = ?, water_type = ?, depth_min = ?,
          depth_max = ?, visibility_min = ?, visibility_max = ?, difficulty = ?,
          current_strength = ?, access_notes = ?, facilities = ?, hazards = ?,
          best_season = ?, rating_avg = ?, ratings_count = ?, wikipedia_url = ?,
          external_info = ?, image_url = ?, is_archived = ?, is_wreck = ?,
          wreck_info = ?, wreck_name = ?, wreck_url = ?, created_at = ?,
          updated_at = ?, deleted_at = ?, is_synced = 1
        WHERE server_id = ?
      `, [
        site.userId ?? null, site.name ?? '', site.description ?? null,
        site.siteType ?? 'reef', site.latitude ?? null, site.longitude ?? null,
        site.country ?? null, site.region ?? null, site.waterType ?? 'marine',
        site.depthMin ?? null, site.depthMax ?? null, site.visibilityMin ?? null,
        site.visibilityMax ?? null, site.difficulty ?? 'intermediate',
        site.currentStrength ?? null, site.accessNotes ?? null,
        site.facilities ?? '[]', site.hazards ?? '[]', site.bestSeason ?? null,
        site.ratingAvg ?? 0, site.ratingsCount ?? 0, site.wikipediaUrl ?? null,
        site.externalInfo ?? null, site.imageUrl ?? null,
        site.isArchived ? 1 : 0, site.isWreck ? 1 : 0,
        site.wreckInfo ?? null, site.wreckName ?? null, site.wreckUrl ?? null,
        site.createdAt ?? null, site.updatedAt ?? null, site.deletedAt ?? null,
        site.serverId
      ]);
      return existing.id;
    }
  }
  
  const result = await db.runAsync(`
    INSERT INTO dive_sites (
      server_id, user_id, name, description, site_type, latitude, longitude,
      country, region, water_type, depth_min, depth_max, visibility_min,
      visibility_max, difficulty, current_strength, access_notes, facilities,
      hazards, best_season, rating_avg, ratings_count, wikipedia_url,
      external_info, image_url, is_archived, is_wreck, wreck_info, wreck_name,
      wreck_url, created_at, updated_at, deleted_at, is_synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    site.serverId ?? null, site.userId ?? null, site.name ?? '',
    site.description ?? null, site.siteType ?? 'reef', site.latitude ?? null,
    site.longitude ?? null, site.country ?? null, site.region ?? null,
    site.waterType ?? 'marine', site.depthMin ?? null, site.depthMax ?? null,
    site.visibilityMin ?? null, site.visibilityMax ?? null,
    site.difficulty ?? 'intermediate', site.currentStrength ?? null,
    site.accessNotes ?? null, site.facilities ?? '[]', site.hazards ?? '[]',
    site.bestSeason ?? null, site.ratingAvg ?? 0, site.ratingsCount ?? 0,
    site.wikipediaUrl ?? null, site.externalInfo ?? null, site.imageUrl ?? null,
    site.isArchived ? 1 : 0, site.isWreck ? 1 : 0, site.wreckInfo ?? null,
    site.wreckName ?? null, site.wreckUrl ?? null, site.createdAt ?? null,
    site.updatedAt ?? null, site.deletedAt ?? null,
    site.serverId ? 1 : 0
  ]);
  
  return result.lastInsertRowId;
}

export async function markLocalDiveSiteDeleted(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE dive_sites SET deleted_at = ?, is_synced = 0 WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

export async function getUnsyncedDiveSites(): Promise<LocalDiveSite[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM dive_sites WHERE is_synced = 0'
  );
  return rows.map(mapRowToLocalDiveSite);
}

export async function addPendingMutation(mutation: Omit<PendingMutation, 'id' | 'createdAt' | 'retryCount'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO pending_mutations (client_mutation_id, entity_type, entity_id, action, data)
     VALUES (?, ?, ?, ?, ?)`,
    [mutation.clientMutationId, mutation.entityType, mutation.entityId, mutation.action, mutation.data]
  );
  return result.lastInsertRowId;
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM pending_mutations ORDER BY created_at ASC'
  );
  return rows.map(row => ({
    id: row.id,
    clientMutationId: row.client_mutation_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    data: row.data,
    createdAt: row.created_at,
    retryCount: row.retry_count
  }));
}

export async function removePendingMutation(clientMutationId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM pending_mutations WHERE client_mutation_id = ?',
    [clientMutationId]
  );
}

export async function incrementMutationRetryCount(clientMutationId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE pending_mutations SET retry_count = retry_count + 1 WHERE client_mutation_id = ?',
    [clientMutationId]
  );
}

export async function updateLocalSiteServerId(localId: number, serverId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE dive_sites SET server_id = ?, is_synced = 1 WHERE id = ?',
    [serverId, localId]
  );
}

export async function markLocalSiteSynced(localId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE dive_sites SET is_synced = 1 WHERE id = ?',
    [localId]
  );
}

export async function clearLocalDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM dive_sites;
    DELETE FROM pending_mutations;
    DELETE FROM sync_meta;
  `);
}

function mapRowToLocalDiveSite(row: any): LocalDiveSite {
  return {
    id: row.id,
    serverId: row.server_id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    siteType: row.site_type,
    latitude: row.latitude,
    longitude: row.longitude,
    country: row.country,
    region: row.region,
    waterType: row.water_type,
    depthMin: row.depth_min,
    depthMax: row.depth_max,
    visibilityMin: row.visibility_min,
    visibilityMax: row.visibility_max,
    difficulty: row.difficulty,
    currentStrength: row.current_strength,
    accessNotes: row.access_notes,
    facilities: row.facilities,
    hazards: row.hazards,
    bestSeason: row.best_season,
    ratingAvg: row.rating_avg,
    ratingsCount: row.ratings_count,
    wikipediaUrl: row.wikipedia_url,
    externalInfo: row.external_info,
    imageUrl: row.image_url,
    isArchived: !!row.is_archived,
    isWreck: !!row.is_wreck,
    wreckInfo: row.wreck_info,
    wreckName: row.wreck_name,
    wreckUrl: row.wreck_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isSynced: !!row.is_synced
  };
}

export function generateClientMutationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
