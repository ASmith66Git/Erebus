/**
 * Erebus Database Backup & Restore Service
 *
 * Dumps all Postgres tables to a gzipped JSON file and uploads to S3.
 * Restore reads the file from S3 and re-inserts all rows in dependency order.
 *
 * S3 keys:  backups/YYYY-MM-DD_HH-mm-ss_UTC.json.gz
 * Retention: keeps last 30 backups automatically.
 */

const { gzip, gunzip } = require('zlib');
const { promisify } = require('util');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const BACKUP_PREFIX = 'backups/';
const MAX_BACKUPS = 30;

// Tables in dependency order (parents before children) so restore inserts correctly.
const TABLE_ORDER = [
  'users',
  'training_agencies',
  'training_courses',
  'gear_profiles',
  'equipment_inventory',
  'gear_profile_equipment',
  'gear_cylinders',
  'gear_weights',
  'cylinders',
  'cylinder_test_records',
  'cylinder_notifications_sent',
  'compressors',
  'compressor_service_logs',
  'compressor_usage_logs',
  'dive_sites',
  'dive_site_images',
  'dive_trips',
  'dive_logs',
  'dive_log_gases',
  'dive_log_settings',
  'dive_log_samples',
  'dive_log_tank_pressures',
  'dive_log_events',
  'dive_log_imports',
  'dive_photos',
  'dive_trip_logs',
  'dive_plan_dives',
  'dive_plan_gases',
  'dive_plans',
  'dive_buddies',
  'dive_log_buddies',
  'user_certifications',
  'certification_images',
  'user_course_wishlist',
  'user_dive_computers',
  'dive_computer_catalog',
  'push_tokens',
  'support_conversations',
  'support_messages',
  'dive_messages',
  'roadmap_features',
  'dev_log',
  'dev_log_notes',
];

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function getBackupKey() {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `${BACKUP_PREFIX}${ts}_UTC.json.gz`;
}

/**
 * Dump all tables to S3. Returns the S3 key of the new backup.
 */
async function runBackup(pool) {
  const s3 = getS3Client();
  const bucket = process.env.AWS_BUCKET;

  const snapshot = { createdAt: new Date().toISOString(), tables: {} };

  for (const table of TABLE_ORDER) {
    try {
      const result = await pool.query(`SELECT * FROM "${table}"`);
      snapshot.tables[table] = result.rows;
    } catch {
      snapshot.tables[table] = []; // table may not exist yet
    }
  }

  const json = JSON.stringify(snapshot);
  const compressed = await gzipAsync(Buffer.from(json, 'utf8'));
  const key = getBackupKey();

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: compressed,
    ContentType: 'application/gzip',
    ContentEncoding: 'gzip',
  }));

  console.log(`[Backup] Uploaded ${key} (${(compressed.length / 1024).toFixed(1)} KB)`);

  // Prune old backups
  await pruneOldBackups(s3, bucket);

  return key;
}

/**
 * Restore from a specific S3 key. Truncates all tables first (in reverse order).
 */
async function runRestore(pool, key) {
  const s3 = getS3Client();
  const bucket = process.env.AWS_BUCKET;

  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  const compressed = Buffer.concat(chunks);
  const json = await gunzipAsync(compressed);
  const snapshot = JSON.parse(json.toString('utf8'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET session_replication_role = replica'); // disables FK triggers

    // Truncate in reverse order
    for (const table of [...TABLE_ORDER].reverse()) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      } catch {
        // table may not exist
      }
    }

    // Re-insert in forward order
    for (const table of TABLE_ORDER) {
      const rows = snapshot.tables[table];
      if (!rows || rows.length === 0) continue;
      const cols = Object.keys(rows[0]);
      const colList = cols.map(c => `"${c}"`).join(', ');
      for (const row of rows) {
        const vals = cols.map((_, i) => `$${i + 1}`).join(', ');
        const values = cols.map(c => row[c]);
        try {
          await client.query(
            `INSERT INTO "${table}" (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING`,
            values,
          );
        } catch (err) {
          console.warn(`[Restore] Skipping row in ${table}: ${err.message}`);
        }
      }
    }

    await client.query('SET session_replication_role = DEFAULT');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`[Restore] Completed from ${key}`);
  return snapshot.createdAt;
}

/**
 * List available backups from S3, newest first.
 */
async function listBackups() {
  const s3 = getS3Client();
  const bucket = process.env.AWS_BUCKET;

  const response = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: BACKUP_PREFIX,
  }));

  const items = (response.Contents || [])
    .filter(o => o.Key !== BACKUP_PREFIX)
    .sort((a, b) => b.LastModified - a.LastModified)
    .map(o => ({
      key: o.Key,
      size: o.Size,
      createdAt: o.LastModified,
    }));

  return items;
}

/**
 * Delete oldest backups if we exceed MAX_BACKUPS.
 */
async function pruneOldBackups(s3, bucket) {
  const response = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: BACKUP_PREFIX,
  }));

  const items = (response.Contents || [])
    .filter(o => o.Key !== BACKUP_PREFIX)
    .sort((a, b) => a.LastModified - b.LastModified); // oldest first

  const toDelete = items.slice(0, Math.max(0, items.length - MAX_BACKUPS));
  for (const item of toDelete) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key }));
    console.log(`[Backup] Pruned old backup: ${item.Key}`);
  }
}

module.exports = { runBackup, runRestore, listBackups };
