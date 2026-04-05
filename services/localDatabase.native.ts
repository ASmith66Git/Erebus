import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
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
const MAX_INIT_ATTEMPTS = 3;

// Use simple database name without subdirectory - avoids conflict with old SQLite file
// Using underscore prefix to store in app root, not SQLite subdirectory
const DB_NAME = 'erebus_dive_v5.db';

// Database initialization promise - ensures we don't call getDatabase() concurrently
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let dbReady = false;

export function isDatabaseAvailable(): boolean {
  return db !== null && !dbInitFailed;
}

export function isDatabaseReady(): boolean {
  return dbReady;
}

// Call this once at app startup to pre-initialize the database
export async function initializeDatabaseAsync(): Promise<boolean> {
  if (dbReady && db) return true;
  
  try {
    console.log('Pre-initializing database...');
    await getDatabase();
    dbReady = true;
    console.log('Database pre-initialization complete');
    return true;
  } catch (error: any) {
    console.error('Database pre-initialization failed:', error?.message);
    return false;
  }
}

async function closeDatabase(): Promise<void> {
  if (db) {
    try {
      await db.closeAsync();
      console.log('Database closed successfully');
    } catch (closeError: any) {
      console.warn('Error closing database:', closeError?.message);
    }
    db = null;
  }
}

// Fix for expo-sqlite directory conflict: ensure SQLite directory exists properly
async function ensureSQLiteDirectory(): Promise<void> {
  const sqliteDir = FileSystem.documentDirectory + 'SQLite';
  
  try {
    const info = await FileSystem.getInfoAsync(sqliteDir);
    console.log('SQLite directory check:', JSON.stringify(info));
    
    if (info.exists && !info.isDirectory) {
      // Path exists but is a FILE, not a directory - delete it
      console.warn('Found file at SQLite directory path, removing it...');
      await FileSystem.deleteAsync(sqliteDir, { idempotent: true });
      console.log('Removed conflicting file at SQLite path');
    }
    
    // expo-sqlite will create the directory itself, but let's ensure it exists
    if (!info.exists) {
      console.log('Creating SQLite directory...');
      await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
      console.log('SQLite directory created');
    }
  } catch (error: any) {
    console.warn('SQLite directory check error (non-fatal):', error?.message);
    // Non-fatal: expo-sqlite may still be able to create it
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (dbInitFailed && dbInitAttempts >= MAX_INIT_ATTEMPTS) {
    throw new Error('Local database initialization failed. The app will work in online-only mode.');
  }
  
  // If initialization is already in progress, wait for it
  if (dbInitPromise) {
    return dbInitPromise;
  }
  
  dbInitAttempts++;
  
  // Create a promise that resolves when initialization is complete
  // This prevents concurrent initialization attempts
  dbInitPromise = (async (): Promise<SQLite.SQLiteDatabase> => {
    try {
      console.log(`Attempting to open database: ${DB_NAME} (attempt ${dbInitAttempts})`);
      
      // CRITICAL: Fix SQLite directory conflict before opening database
      await ensureSQLiteDirectory();
      
      // Modern expo-sqlite API (SDK 51+): just pass the database name
      // The library handles directory creation automatically in the default SQLite location
      const newDb = await SQLite.openDatabaseAsync(DB_NAME);
      
      if (!newDb) {
        throw new Error('Database open returned null');
      }
      
      console.log('Database opened, initializing tables...');
      await initializeLocalDatabase(newDb);
      
      db = newDb;
      dbInitFailed = false;
      dbReady = true;
      console.log(`Database initialized successfully: ${DB_NAME}`);
      return db;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error(`SQLite initialization attempt ${dbInitAttempts} failed:`, errorMessage);
      console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      
      // Clear the promise so retry can create a new one
      dbInitPromise = null;
      
      if (dbInitAttempts < MAX_INIT_ATTEMPTS) {
        console.log('Retrying database initialization...');
        await closeDatabase();
        // Small delay before retry
        await new Promise(resolve => setTimeout(resolve, 500));
        return getDatabase();
      }
      
      if (dbInitAttempts >= MAX_INIT_ATTEMPTS) {
        dbInitFailed = true;
        console.error('Database initialization failed permanently after', MAX_INIT_ATTEMPTS, 'attempts. App will run in online-only mode.');
      }
      throw error;
    }
  })();
  
  return dbInitPromise;
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

    CREATE TABLE IF NOT EXISTS compressors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER UNIQUE,
      user_id INTEGER,
      name TEXT NOT NULL,
      make TEXT,
      model TEXT,
      serial_number TEXT,
      purchase_date TEXT,
      total_hours REAL DEFAULT 0,
      oil_change_interval_hours INTEGER DEFAULT 100,
      filter_change_interval_hours INTEGER DEFAULT 500,
      independent_test_interval_months INTEGER DEFAULT 12,
      notes TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT,
      is_synced INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS compressor_service_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER UNIQUE,
      compressor_id INTEGER,
      user_id INTEGER,
      service_type TEXT NOT NULL,
      service_date TEXT NOT NULL,
      hours_at_service REAL,
      filter_type TEXT,
      test_result TEXT,
      test_certificate_number TEXT,
      next_due_date TEXT,
      cost REAL,
      technician TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      is_synced INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS compressor_usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER UNIQUE,
      compressor_id INTEGER,
      user_id INTEGER,
      usage_date TEXT NOT NULL,
      hours_used REAL NOT NULL,
      fills_count INTEGER,
      notes TEXT,
      created_at TEXT,
      is_synced INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_compressors_server_id ON compressors(server_id);
    CREATE INDEX IF NOT EXISTS idx_compressor_service_logs_compressor_id ON compressor_service_logs(compressor_id);
    CREATE INDEX IF NOT EXISTS idx_compressor_usage_logs_compressor_id ON compressor_usage_logs(compressor_id);
  `);
}

export async function getLastSyncTime(): Promise<string | null> {
  try {
    // Always try to get database - this will initialize it if needed
    const database = await getDatabase();
    const result = await database.getFirstAsync<{ value: string }>(
      'SELECT value FROM sync_meta WHERE key = ?',
      ['last_sync_time']
    );
    return result?.value || null;
  } catch (error: any) {
    console.error('Error getting last sync time:', error?.message || error);
    return null;
  }
}

export async function setLastSyncTime(timestamp: string): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(
      'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
      ['last_sync_time', timestamp]
    );
  } catch (error: any) {
    console.error('Error setting last sync time:', error?.message || error);
  }
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
  try {
    // Always try to get database - this will initialize it if needed
    const database = await getDatabase();
    const rows = await database.getAllAsync<any>(
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
  } catch (error: any) {
    console.error('Error getting pending mutations:', error?.message || error);
    return [];
  }
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

function mapRowToLocalCompressor(row: any): LocalCompressor {
  return {
    id: row.id,
    serverId: row.server_id,
    userId: row.user_id,
    name: row.name,
    make: row.make,
    model: row.model,
    serialNumber: row.serial_number,
    purchaseDate: row.purchase_date,
    totalHours: row.total_hours || 0,
    oilChangeIntervalHours: row.oil_change_interval_hours || 100,
    filterChangeIntervalHours: row.filter_change_interval_hours || 500,
    independentTestIntervalMonths: row.independent_test_interval_months || 12,
    notes: row.notes,
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    isSynced: !!row.is_synced,
  };
}

export async function getAllLocalCompressors(): Promise<LocalCompressor[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM compressors WHERE deleted_at IS NULL ORDER BY created_at DESC'
  );
  return rows.map(mapRowToLocalCompressor);
}

export async function getLocalCompressorById(id: number): Promise<LocalCompressor | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM compressors WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? mapRowToLocalCompressor(row) : null;
}

export async function getLocalCompressorByServerId(serverId: number): Promise<LocalCompressor | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM compressors WHERE server_id = ?',
    [serverId]
  );
  return row ? mapRowToLocalCompressor(row) : null;
}

export async function upsertLocalCompressor(compressor: Partial<LocalCompressor> & { serverId?: number; id?: number }): Promise<number> {
  const db = await getDatabase();

  if (compressor.serverId) {
    const existing = await getLocalCompressorByServerId(compressor.serverId);
    if (existing) {
      await db.runAsync(`
        UPDATE compressors SET
          user_id = ?, name = ?, make = ?, model = ?, serial_number = ?,
          purchase_date = ?, total_hours = ?, oil_change_interval_hours = ?,
          filter_change_interval_hours = ?, independent_test_interval_months = ?,
          notes = ?, status = ?, created_at = ?, updated_at = ?, deleted_at = ?, is_synced = 1
        WHERE server_id = ?
      `, [
        compressor.userId ?? null, compressor.name ?? '', compressor.make ?? null,
        compressor.model ?? null, compressor.serialNumber ?? null,
        compressor.purchaseDate ?? null, compressor.totalHours ?? 0,
        compressor.oilChangeIntervalHours ?? 100, compressor.filterChangeIntervalHours ?? 500,
        compressor.independentTestIntervalMonths ?? 12, compressor.notes ?? null,
        compressor.status ?? 'active', compressor.createdAt ?? null,
        compressor.updatedAt ?? null, compressor.deletedAt ?? null,
        compressor.serverId
      ]);
      return existing.id;
    }
  }

  if (compressor.id) {
    const existing = await getLocalCompressorById(compressor.id);
    if (existing) {
      await db.runAsync(`
        UPDATE compressors SET
          user_id = ?, name = ?, make = ?, model = ?, serial_number = ?,
          purchase_date = ?, total_hours = ?, oil_change_interval_hours = ?,
          filter_change_interval_hours = ?, independent_test_interval_months = ?,
          notes = ?, status = ?, updated_at = ?, is_synced = 0
        WHERE id = ?
      `, [
        compressor.userId ?? existing.userId ?? null, compressor.name ?? '', compressor.make ?? null,
        compressor.model ?? null, compressor.serialNumber ?? null,
        compressor.purchaseDate ?? null, compressor.totalHours ?? 0,
        compressor.oilChangeIntervalHours ?? 100, compressor.filterChangeIntervalHours ?? 500,
        compressor.independentTestIntervalMonths ?? 12, compressor.notes ?? null,
        compressor.status ?? 'active', compressor.updatedAt ?? new Date().toISOString(),
        compressor.id
      ]);
      return compressor.id;
    }
  }

  const result = await db.runAsync(`
    INSERT INTO compressors (
      server_id, user_id, name, make, model, serial_number, purchase_date,
      total_hours, oil_change_interval_hours, filter_change_interval_hours,
      independent_test_interval_months, notes, status, created_at, updated_at,
      deleted_at, is_synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    compressor.serverId ?? null, compressor.userId ?? null, compressor.name ?? '',
    compressor.make ?? null, compressor.model ?? null, compressor.serialNumber ?? null,
    compressor.purchaseDate ?? null, compressor.totalHours ?? 0,
    compressor.oilChangeIntervalHours ?? 100, compressor.filterChangeIntervalHours ?? 500,
    compressor.independentTestIntervalMonths ?? 12, compressor.notes ?? null,
    compressor.status ?? 'active', compressor.createdAt ?? null,
    compressor.updatedAt ?? null, compressor.deletedAt ?? null,
    compressor.serverId ? 1 : 0
  ]);

  return result.lastInsertRowId;
}

export async function markLocalCompressorDeleted(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE compressors SET deleted_at = ?, is_synced = 0 WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

export async function clearLocalDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM dive_sites;
    DELETE FROM compressors;
    DELETE FROM compressor_service_logs;
    DELETE FROM compressor_usage_logs;
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

function mapRowToServiceLog(row: any): LocalCompressorServiceLog {
  return {
    id: row.id,
    serverId: row.server_id,
    compressorId: row.compressor_id,
    userId: row.user_id,
    serviceType: row.service_type,
    serviceDate: row.service_date,
    hoursAtService: row.hours_at_service,
    filterType: row.filter_type,
    testResult: row.test_result,
    testCertificateNumber: row.test_certificate_number,
    nextDueDate: row.next_due_date,
    cost: row.cost,
    technician: row.technician,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isSynced: !!row.is_synced,
  };
}

export async function getServiceLogsByCompressorId(compressorId: number): Promise<LocalCompressorServiceLog[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM compressor_service_logs WHERE compressor_id = ? ORDER BY service_date DESC',
    [compressorId]
  );
  return rows.map(mapRowToServiceLog);
}

export async function upsertLocalServiceLog(log: Partial<LocalCompressorServiceLog> & { serverId?: number }): Promise<number> {
  const db = await getDatabase();

  if (log.serverId) {
    const existing = await db.getFirstAsync<any>(
      'SELECT id FROM compressor_service_logs WHERE server_id = ?',
      [log.serverId]
    );
    if (existing) {
      await db.runAsync(`
        UPDATE compressor_service_logs SET
          compressor_id = ?, user_id = ?, service_type = ?, service_date = ?,
          hours_at_service = ?, filter_type = ?, test_result = ?,
          test_certificate_number = ?, next_due_date = ?, cost = ?,
          technician = ?, notes = ?, created_at = ?, updated_at = ?, is_synced = 1
        WHERE server_id = ?
      `, [
        log.compressorId ?? null, log.userId ?? null, log.serviceType ?? '',
        log.serviceDate ?? '', log.hoursAtService ?? null, log.filterType ?? null,
        log.testResult ?? null, log.testCertificateNumber ?? null,
        log.nextDueDate ?? null, log.cost ?? null, log.technician ?? null,
        log.notes ?? null, log.createdAt ?? null, log.updatedAt ?? null,
        log.serverId
      ]);
      return existing.id;
    }
  }

  const result = await db.runAsync(`
    INSERT INTO compressor_service_logs (
      server_id, compressor_id, user_id, service_type, service_date,
      hours_at_service, filter_type, test_result, test_certificate_number,
      next_due_date, cost, technician, notes, created_at, updated_at, is_synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    log.serverId ?? null, log.compressorId ?? null, log.userId ?? null,
    log.serviceType ?? '', log.serviceDate ?? '', log.hoursAtService ?? null,
    log.filterType ?? null, log.testResult ?? null,
    log.testCertificateNumber ?? null, log.nextDueDate ?? null,
    log.cost ?? null, log.technician ?? null, log.notes ?? null,
    log.createdAt ?? null, log.updatedAt ?? null, log.serverId ? 1 : 0
  ]);

  return result.lastInsertRowId;
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

function mapRowToUsageLog(row: any): LocalCompressorUsageLog {
  return {
    id: row.id,
    serverId: row.server_id,
    compressorId: row.compressor_id,
    userId: row.user_id,
    usageDate: row.usage_date,
    hoursUsed: row.hours_used || 0,
    fillsCount: row.fills_count,
    notes: row.notes,
    createdAt: row.created_at,
    isSynced: !!row.is_synced,
  };
}

export async function getUsageLogsByCompressorId(compressorId: number): Promise<LocalCompressorUsageLog[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM compressor_usage_logs WHERE compressor_id = ? ORDER BY usage_date DESC',
    [compressorId]
  );
  return rows.map(mapRowToUsageLog);
}

export async function upsertLocalUsageLog(log: Partial<LocalCompressorUsageLog> & { serverId?: number }): Promise<number> {
  const db = await getDatabase();

  if (log.serverId) {
    const existing = await db.getFirstAsync<any>(
      'SELECT id FROM compressor_usage_logs WHERE server_id = ?',
      [log.serverId]
    );
    if (existing) {
      await db.runAsync(`
        UPDATE compressor_usage_logs SET
          compressor_id = ?, user_id = ?, usage_date = ?, hours_used = ?,
          fills_count = ?, notes = ?, created_at = ?, is_synced = 1
        WHERE server_id = ?
      `, [
        log.compressorId ?? null, log.userId ?? null, log.usageDate ?? '',
        log.hoursUsed ?? 0, log.fillsCount ?? null, log.notes ?? null,
        log.createdAt ?? null, log.serverId
      ]);
      return existing.id;
    }
  }

  const result = await db.runAsync(`
    INSERT INTO compressor_usage_logs (
      server_id, compressor_id, user_id, usage_date, hours_used,
      fills_count, notes, created_at, is_synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    log.serverId ?? null, log.compressorId ?? null, log.userId ?? null,
    log.usageDate ?? '', log.hoursUsed ?? 0, log.fillsCount ?? null,
    log.notes ?? null, log.createdAt ?? null, log.serverId ? 1 : 0
  ]);

  return result.lastInsertRowId;
}

export function generateClientMutationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
