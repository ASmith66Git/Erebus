const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const { Resend } = require('resend');
const { Expo } = require('expo-server-sdk');
const diveLogParser = require('./services/diveLogParser');
const diveLogParserV2 = require('./services/diveLogParserV2');
const DiveLogPersistenceService = require('./services/diveLogPersistence');
const diveComputerCatalog = require('./data/diveComputerCatalog');
const archiver = require('archiver');
const fs = require('fs');
const sharp = require('sharp');
const { encode: encodeBlurhash } = require('blurhash');

const expo = new Expo();

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const app = express();
const isProduction = process.env.NODE_ENV === 'production' || process.env.REPL_DEPLOYMENT === '1';
const PORT = isProduction ? 5000 : (process.env.PORT || 3001);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const diveLogPersistence = new DiveLogPersistenceService(pool);

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

let resendConnectionSettings = null;

async function getResendCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  resendConnectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!resendConnectionSettings || (!resendConnectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: resendConnectionSettings.settings.api_key, 
    fromEmail: resendConnectionSettings.settings.from_email
  };
}

async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getResendCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}

function generateWelcomeEmailHtml(firstName) {
  const displayName = firstName || 'Diver';
  const baseUrl = 'https://erebus.nammu-tech.com';
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Welcome to Erebus</title>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px;">
    <h1 style="color: #D22F00; margin-bottom: 24px;">Welcome to Erebus</h1>
    
    <p style="color: #333333; font-size: 16px; line-height: 1.6;">
      Hello ${displayName},
    </p>
    
    <p style="color: #333333; font-size: 16px; line-height: 1.6;">
      Thank you for joining Erebus - your comprehensive dive management companion.
    </p>
    
    <p style="color: #333333; font-size: 16px; line-height: 1.6;">
      With Erebus, you can:
    </p>
    
    <ul style="color: #333333; font-size: 16px; line-height: 1.8;">
      <li>Log detailed dive profiles and sync from your dive computer</li>
      <li>Explore dive sites worldwide with weather forecasts</li>
      <li>Plan technical dives with decompression calculations</li>
      <li>Manage your gear and certifications</li>
    </ul>
    
    <p style="color: #333333; font-size: 16px; line-height: 1.6;">
      We've added sample dive logs and sites to help you get started. Feel free to explore!
    </p>
    
    <p style="margin: 32px 0; text-align: center;">
      <a href="${baseUrl}" style="display: inline-block; padding: 14px 32px; background-color: #D22F00; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 6px;">Open Erebus</a>
    </p>
    
    <p style="color: #666666; font-size: 14px; line-height: 1.6;">
      Dive safe,<br>
      The Erebus Team
    </p>
    
    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 32px 0;">
    
    <p style="color: #999999; font-size: 12px; text-align: center;">
      Erebus by Nammu Tech
    </p>
  </div>
</body>
</html>`;
}

async function sendWelcomeEmail(email, firstName) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const result = await client.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Welcome to Erebus - Your Dive Journey Begins!',
      html: generateWelcomeEmailHtml(firstName),
    });
    return { success: true, result, fromEmail };
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return { success: false, error: error.message };
  }
}

async function sendPushNotification(userId, title, body, data = {}) {
  try {
    const tokenResult = await pool.query(
      'SELECT token FROM push_tokens WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    
    if (tokenResult.rows.length === 0) {
      console.log(`No active push tokens for user ${userId}`);
      return { success: false, reason: 'no_tokens' };
    }
    
    const messages = [];
    for (const row of tokenResult.rows) {
      if (!Expo.isExpoPushToken(row.token)) {
        console.log(`Invalid Expo push token: ${row.token}`);
        continue;
      }
      
      messages.push({
        to: row.token,
        sound: 'default',
        title,
        body,
        data,
      });
    }
    
    if (messages.length === 0) {
      return { success: false, reason: 'no_valid_tokens' };
    }
    
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending push notification chunk:', error);
      }
    }
    
    console.log(`Sent ${tickets.length} push notifications to user ${userId}`);
    return { success: true, tickets };
  } catch (error) {
    console.error('Error in sendPushNotification:', error);
    return { success: false, reason: 'error', error: error.message };
  }
}

app.use(cors());
app.use(express.json());

// Serve email assets (icons, images for email templates)
app.use('/email-assets', express.static(path.join(__dirname, '../public/email-assets')));

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role VARCHAR(20) DEFAULT 'user',
        is_blocked BOOLEAN DEFAULT FALSE,
        password_reset_token VARCHAR(255),
        password_reset_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS dive_computer_brand VARCHAR(100);
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS dive_computer_model VARCHAR(100);
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER;
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS sex VARCHAR(20);
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image VARCHAR(500);
    `).catch(() => {});

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
    `).catch(() => {});


    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
    `).catch(() => {});

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS searchable_profile BOOLEAN DEFAULT FALSE;
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS dive_sites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        site_type VARCHAR(50) DEFAULT 'reef',
        latitude DECIMAL(9,6),
        longitude DECIMAL(9,6),
        country VARCHAR(100),
        region VARCHAR(100),
        water_type VARCHAR(20) DEFAULT 'marine',
        depth_min NUMERIC(6,2),
        depth_max NUMERIC(6,2),
        visibility_min NUMERIC(5,2),
        visibility_max NUMERIC(5,2),
        difficulty VARCHAR(20) DEFAULT 'intermediate',
        current_strength VARCHAR(20),
        access_notes TEXT,
        facilities JSONB DEFAULT '[]',
        hazards JSONB DEFAULT '[]',
        best_season VARCHAR(100),
        rating_avg NUMERIC(3,2) DEFAULT 0,
        ratings_count INTEGER DEFAULT 0,
        wikipedia_url VARCHAR(500),
        external_info TEXT,
        image_url VARCHAR(500),
        is_archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS dive_site_images (
        id SERIAL PRIMARY KEY,
        dive_site_id INTEGER REFERENCES dive_sites(id) ON DELETE CASCADE,
        image_url VARCHAR(500) NOT NULL,
        caption VARCHAR(255),
        is_primary BOOLEAN DEFAULT FALSE,
        is_stock BOOLEAN DEFAULT FALSE,
        attribution TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      ALTER TABLE dive_site_images ADD COLUMN IF NOT EXISTS is_stock BOOLEAN DEFAULT FALSE;
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE dive_site_images ADD COLUMN IF NOT EXISTS attribution TEXT;
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE dive_sites ADD COLUMN IF NOT EXISTS is_wreck BOOLEAN DEFAULT FALSE;
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE dive_sites ADD COLUMN IF NOT EXISTS wreck_info TEXT;
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE dive_sites ADD COLUMN IF NOT EXISTS wreck_name VARCHAR(255);
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE dive_sites ADD COLUMN IF NOT EXISTS wreck_url VARCHAR(500);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_sites_name ON dive_sites(name);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_sites_type ON dive_sites(site_type);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_sites_location ON dive_sites(country, region);
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE dive_sites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE dive_site_images ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `).catch(() => {});
    
    await client.query(`
      ALTER TABLE dive_site_images ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_sites_updated_at ON dive_sites(updated_at);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_sites_deleted_at ON dive_sites(deleted_at);
    `).catch(() => {});
    
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_dive_sites_updated_at ON dive_sites;
      CREATE TRIGGER update_dive_sites_updated_at
        BEFORE UPDATE ON dive_sites
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_dive_site_images_updated_at ON dive_site_images;
      CREATE TRIGGER update_dive_site_images_updated_at
        BEFORE UPDATE ON dive_site_images
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});
    
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS dive_number INTEGER;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS surface_interval_seconds INTEGER;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS surface_pressure_mbar INTEGER;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS dive_mode VARCHAR(50);`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS surface_conditions TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS weather_conditions TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS workload VARCHAR(50);`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS thermal_comfort VARCHAR(50);`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS gas_pressures JSONB DEFAULT '[]';`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS equipment_issues JSONB DEFAULT '[]';`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS skills_practiced JSONB DEFAULT '[]';`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS skills_notes TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS buddy TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS decompression_symptoms BOOLEAN DEFAULT FALSE;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS problem_notes TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS gear_profile_id INTEGER REFERENCES gear_profiles(id) ON DELETE SET NULL;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS source_file_url TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS source_file_name TEXT;`).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS dive_log_samples (
        id SERIAL PRIMARY KEY,
        dive_log_id INTEGER REFERENCES dive_logs(id) ON DELETE CASCADE,
        sample_time_seconds INTEGER,
        depth_meters NUMERIC,
        temperature_celsius NUMERIC,
        metrics JSONB
      );
    `).catch(() => {});
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dive_log_samples_dive_log_id ON dive_log_samples(dive_log_id);`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS sample_time_seconds INTEGER;`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS depth_meters NUMERIC;`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS temperature_celsius NUMERIC;`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS ndl_seconds INTEGER;`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS gf99_percent NUMERIC;`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS ceiling_meters NUMERIC;`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS tts_seconds INTEGER;`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS ppo2_bar NUMERIC;`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS sac_lpm NUMERIC;`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS heartrate_bpm INTEGER;`).catch(() => {});
    await client.query(`ALTER TABLE dive_log_samples ADD COLUMN IF NOT EXISTS cns_percent NUMERIC;`).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_dive_computers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        brand VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        nickname VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_dive_computers_user_id ON user_dive_computers(user_id);
    `).catch(() => {});

    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS user_dive_computer_id INTEGER REFERENCES user_dive_computers(id) ON DELETE SET NULL;`).catch(() => {});

    await client.query(`
      INSERT INTO user_dive_computers (user_id, brand, model)
      SELECT id, dive_computer_brand, dive_computer_model
      FROM users
      WHERE dive_computer_brand IS NOT NULL
        AND dive_computer_model IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_dive_computers udc
          WHERE udc.user_id = users.id
            AND udc.brand = users.dive_computer_brand
            AND udc.model = users.dive_computer_model
        );
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        platform VARCHAR(20) NOT NULL,
        device_name VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, token)
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS dev_log (
        id SERIAL PRIMARY KEY,
        task TEXT NOT NULL,
        page_name VARCHAR(255),
        page_type VARCHAR(50) DEFAULT 'card',
        status VARCHAR(50) DEFAULT 'todo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dev_log_status ON dev_log(status);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dev_log_page_name ON dev_log(page_name);
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_dev_log_updated_at ON dev_log;
      CREATE TRIGGER update_dev_log_updated_at
        BEFORE UPDATE ON dev_log
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    await client.query(`
      ALTER TABLE dev_log ADD COLUMN IF NOT EXISTS device VARCHAR(255);
      ALTER TABLE dev_log ADD COLUMN IF NOT EXISTS task_ref VARCHAR(20);
      ALTER TABLE dev_log ADD COLUMN IF NOT EXISTS screenshots TEXT[] DEFAULT '{}';
      ALTER TABLE dev_log ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP;
      ALTER TABLE dev_log ADD COLUMN IF NOT EXISTS agent_draft_content TEXT;
      ALTER TABLE dev_log ADD COLUMN IF NOT EXISTS agent_draft_pending BOOLEAN DEFAULT FALSE;
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS dev_log_notes (
        id SERIAL PRIMARY KEY,
        dev_log_id INTEGER NOT NULL REFERENCES dev_log(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    // Gear Profiles tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS gear_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        config_type VARCHAR(50) NOT NULL DEFAULT 'single_tank',
        suit_type VARCHAR(50),
        suit_thickness VARCHAR(20),
        undersuit VARCHAR(255),
        suit_nickname VARCHAR(255),
        gloves_type VARCHAR(50),
        gloves_thickness VARCHAR(20),
        gloves_nickname VARCHAR(255),
        boots_type VARCHAR(50),
        boots_thickness VARCHAR(20),
        boots_nickname VARCHAR(255),
        hood_type VARCHAR(50),
        hood_thickness VARCHAR(20),
        hood_nickname VARCHAR(255),
        bcd_type VARCHAR(100),
        bcd_nickname VARCHAR(255),
        fins_type VARCHAR(100),
        fins_nickname VARCHAR(255),
        mask_nickname VARCHAR(255),
        notes TEXT,
        is_template BOOLEAN DEFAULT TRUE,
        planned_depth NUMERIC(6,2),
        planned_bottom_time INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS gear_cylinders (
        id SERIAL PRIMARY KEY,
        gear_profile_id INTEGER REFERENCES gear_profiles(id) ON DELETE CASCADE,
        cylinder_size VARCHAR(20) NOT NULL,
        cylinder_material VARCHAR(20) DEFAULT 'steel',
        cylinder_role VARCHAR(50) NOT NULL DEFAULT 'bottom_gas',
        gas_mix VARCHAR(50) DEFAULT 'air',
        o2_percent NUMERIC(4,1) DEFAULT 21.0,
        he_percent NUMERIC(4,1) DEFAULT 0.0,
        start_pressure INTEGER,
        working_pressure INTEGER,
        nickname VARCHAR(255),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS gear_weights (
        id SERIAL PRIMARY KEY,
        gear_profile_id INTEGER REFERENCES gear_profiles(id) ON DELETE CASCADE,
        placement VARCHAR(100) NOT NULL,
        weight_kg NUMERIC(5,2) NOT NULL DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gear_profiles_user_id ON gear_profiles(user_id);
    `).catch(() => {});
    
    // Add status column to gear_profiles (live/archived) to replace is_template
    await client.query(`
      ALTER TABLE gear_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'live';
    `).catch(() => {});
    
    // Migrate existing is_template to status - templates become 'live', non-templates become 'live'
    await client.query(`
      UPDATE gear_profiles SET status = 'live' WHERE status IS NULL;
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gear_cylinders_profile_id ON gear_cylinders(gear_profile_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gear_weights_profile_id ON gear_weights(gear_profile_id);
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_gear_profiles_updated_at ON gear_profiles;
      CREATE TRIGGER update_gear_profiles_updated_at
        BEFORE UPDATE ON gear_profiles
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS equipment_inventory (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        equipment_type VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        brand VARCHAR(255),
        model VARCHAR(255),
        serial_number VARCHAR(255),
        quantity INTEGER DEFAULT 1,
        purchase_date DATE,
        last_service_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_equipment_inventory_user_id ON equipment_inventory(user_id);
    `).catch(() => {});

    await client.query(`
      DROP TRIGGER IF EXISTS update_equipment_inventory_updated_at ON equipment_inventory;
      CREATE TRIGGER update_equipment_inventory_updated_at
        BEFORE UPDATE ON equipment_inventory
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS gear_profile_equipment (
        id SERIAL PRIMARY KEY,
        gear_profile_id INTEGER REFERENCES gear_profiles(id) ON DELETE CASCADE,
        equipment_id INTEGER REFERENCES equipment_inventory(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(gear_profile_id, equipment_id)
      );
    `).catch(() => {});

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gear_profile_equipment_profile_id ON gear_profile_equipment(gear_profile_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS dive_plans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        gf_low INTEGER NOT NULL DEFAULT 30,
        gf_high INTEGER NOT NULL DEFAULT 70,
        descent_rate NUMERIC(5,1) NOT NULL DEFAULT 20,
        ascent_rate NUMERIC(5,1) NOT NULL DEFAULT 10,
        last_stop_depth INTEGER NOT NULL DEFAULT 3,
        deco_stop_interval INTEGER NOT NULL DEFAULT 3,
        sac_rate_bottom NUMERIC(5,1) DEFAULT 20,
        sac_rate_deco NUMERIC(5,1) DEFAULT 15,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS dive_plan_dives (
        id SERIAL PRIMARY KEY,
        dive_plan_id INTEGER REFERENCES dive_plans(id) ON DELETE CASCADE,
        dive_order INTEGER NOT NULL DEFAULT 0,
        depth NUMERIC(6,1) NOT NULL,
        bottom_time INTEGER NOT NULL,
        surface_interval INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS dive_plan_gases (
        id SERIAL PRIMARY KEY,
        dive_plan_id INTEGER REFERENCES dive_plans(id) ON DELETE CASCADE,
        name VARCHAR(100),
        o2_percent NUMERIC(5,2) NOT NULL DEFAULT 21,
        he_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
        switch_depth NUMERIC(6,1),
        is_bottom_gas BOOLEAN DEFAULT FALSE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_plans_user_id ON dive_plans(user_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_plan_dives_plan_id ON dive_plan_dives(dive_plan_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_plan_gases_plan_id ON dive_plan_gases(dive_plan_id);
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_dive_plans_updated_at ON dive_plans;
      CREATE TRIGGER update_dive_plans_updated_at
        BEFORE UPDATE ON dive_plans
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});
    
    // Training Agencies and Certifications tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_agencies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        full_name VARCHAR(255),
        website VARCHAR(500),
        logo_url VARCHAR(500),
        description TEXT,
        founded_year INTEGER,
        headquarters VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_courses (
        id SERIAL PRIMARY KEY,
        agency_id INTEGER REFERENCES training_agencies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        level VARCHAR(50) NOT NULL DEFAULT 'recreational',
        category VARCHAR(100),
        description TEXT,
        prerequisites TEXT,
        min_age INTEGER,
        min_dives INTEGER,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agency_id, name)
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_certifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES training_courses(id) ON DELETE SET NULL,
        certification_date DATE,
        certification_number VARCHAR(100),
        instructor_name VARCHAR(255),
        instructor_number VARCHAR(100),
        dive_center VARCHAR(255),
        location VARCHAR(255),
        notes TEXT,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS certification_images (
        id SERIAL PRIMARY KEY,
        certification_id INTEGER REFERENCES user_certifications(id) ON DELETE CASCADE,
        image_url VARCHAR(500) NOT NULL,
        image_side VARCHAR(20) NOT NULL DEFAULT 'front',
        caption VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_course_wishlist (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES training_courses(id) ON DELETE CASCADE,
        priority INTEGER DEFAULT 0,
        target_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, course_id)
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_training_courses_agency_id ON training_courses(agency_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_certifications_user_id ON user_certifications(user_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_certifications_course_id ON user_certifications(course_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_certification_images_cert_id ON certification_images(certification_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_course_wishlist_user_id ON user_course_wishlist(user_id);
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_training_agencies_updated_at ON training_agencies;
      CREATE TRIGGER update_training_agencies_updated_at
        BEFORE UPDATE ON training_agencies
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_training_courses_updated_at ON training_courses;
      CREATE TRIGGER update_training_courses_updated_at
        BEFORE UPDATE ON training_courses
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_user_certifications_updated_at ON user_certifications;
      CREATE TRIGGER update_user_certifications_updated_at
        BEFORE UPDATE ON user_certifications
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_user_course_wishlist_updated_at ON user_course_wishlist;
      CREATE TRIGGER update_user_course_wishlist_updated_at
        BEFORE UPDATE ON user_course_wishlist
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});
    
    // Dive Trips tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS dive_trips (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        trip_type VARCHAR(50) DEFAULT 'dive_center',
        start_date DATE,
        end_date DATE,
        operator_name VARCHAR(255),
        vessel_name VARCHAR(255),
        dive_center_name VARCHAR(255),
        location VARCHAR(255),
        country VARCHAR(100),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        accommodation VARCHAR(255),
        total_dives INTEGER DEFAULT 0,
        notes TEXT,
        cover_image_key VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS dive_trip_logs (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER REFERENCES dive_trips(id) ON DELETE CASCADE,
        dive_log_id INTEGER REFERENCES dive_logs(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(trip_id, dive_log_id)
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_trips_user_id ON dive_trips(user_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_trips_dates ON dive_trips(start_date, end_date);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_trip_logs_trip_id ON dive_trip_logs(trip_id);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_trip_logs_dive_log_id ON dive_trip_logs(dive_log_id);
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_dive_trips_updated_at ON dive_trips;
      CREATE TRIGGER update_dive_trips_updated_at
        BEFORE UPDATE ON dive_trips
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});
    
    const adminCheck = await client.query("SELECT id FROM users WHERE email = 'admin@erebus.app'");
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        "INSERT INTO users (email, password, first_name, last_name, role) VALUES ('admin@erebus.app', $1, 'Admin', 'User', 'admin')",
        [hashedPassword]
      );
      console.log('Default admin user created: admin@erebus.app / admin123');
    }
    
    // Seed training agencies and courses
    const agencyCheck = await client.query("SELECT id FROM training_agencies LIMIT 1");
    if (agencyCheck.rows.length === 0) {
      console.log('Seeding training agencies and courses...');
      
      const agencies = [
        { name: 'PADI', full_name: 'Professional Association of Diving Instructors', website: 'https://www.padi.com', founded_year: 1966, headquarters: 'Rancho Santa Margarita, CA, USA' },
        { name: 'SSI', full_name: 'Scuba Schools International', website: 'https://www.divessi.com', founded_year: 1970, headquarters: 'Fort Collins, CO, USA' },
        { name: 'SDI', full_name: 'Scuba Diving International', website: 'https://www.tdisdi.com', founded_year: 1998, headquarters: 'Stuart, FL, USA' },
        { name: 'TDI', full_name: 'Technical Diving International', website: 'https://www.tdisdi.com', founded_year: 1994, headquarters: 'Stuart, FL, USA' },
        { name: 'NAUI', full_name: 'National Association of Underwater Instructors', website: 'https://www.naui.org', founded_year: 1959, headquarters: 'Tampa, FL, USA' },
        { name: 'IANTD', full_name: 'International Association of Nitrox and Technical Divers', website: 'https://www.iantd.com', founded_year: 1985, headquarters: 'Miami, FL, USA' },
        { name: 'PSAI', full_name: 'Professional Scuba Association International', website: 'https://www.psai.com', founded_year: 1962, headquarters: 'Jacksonville, FL, USA' },
        { name: 'GUE', full_name: 'Global Underwater Explorers', website: 'https://www.gue.com', founded_year: 1998, headquarters: 'High Springs, FL, USA' },
        { name: 'RAID', full_name: 'Rebreather Association of International Divers', website: 'https://www.diveraid.com', founded_year: 2007, headquarters: 'Sweden' },
        { name: 'BSAC', full_name: 'British Sub-Aqua Club', website: 'https://www.bsac.com', founded_year: 1953, headquarters: 'Ellesmere Port, UK' },
        { name: 'CMAS', full_name: 'Confederation Mondiale des Activites Subaquatiques', website: 'https://www.cmas.org', founded_year: 1959, headquarters: 'Rome, Italy' },
        { name: 'ANDI', full_name: 'American Nitrox Divers International', website: 'https://www.andihq.com', founded_year: 1988, headquarters: 'Freeport, NY, USA' },
        { name: 'SNSI', full_name: 'Scuba and Nitrox Safety International', website: 'https://www.snsi.eu', founded_year: 2010, headquarters: 'Italy' },
        { name: 'IDEA', full_name: 'International Diving Educators Association', website: 'https://www.idea-hq.com', founded_year: 1952, headquarters: 'Jacksonville, FL, USA' },
        { name: 'ACUC', full_name: 'American Canadian Underwater Certifications', website: 'https://www.acuc.es', founded_year: 1969, headquarters: 'Canada' },
      ];
      
      const agencyIds = {};
      for (const agency of agencies) {
        const result = await client.query(
          `INSERT INTO training_agencies (name, full_name, website, founded_year, headquarters) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [agency.name, agency.full_name, agency.website, agency.founded_year, agency.headquarters]
        );
        agencyIds[agency.name] = result.rows[0].id;
      }
      
      const courses = [
        // PADI Courses
        { agency: 'PADI', name: 'Scuba Diver', level: 'recreational', category: 'Recreational', sort_order: 1 },
        { agency: 'PADI', name: 'Open Water Diver', level: 'recreational', category: 'Recreational', sort_order: 2 },
        { agency: 'PADI', name: 'Adventure Diver', level: 'recreational', category: 'Recreational', sort_order: 3 },
        { agency: 'PADI', name: 'Advanced Open Water Diver', level: 'recreational', category: 'Recreational', sort_order: 4 },
        { agency: 'PADI', name: 'Rescue Diver', level: 'recreational', category: 'Recreational', sort_order: 5 },
        { agency: 'PADI', name: 'Master Scuba Diver', level: 'recreational', category: 'Recreational', sort_order: 6 },
        { agency: 'PADI', name: 'Enriched Air (Nitrox)', level: 'recreational', category: 'Specialty', sort_order: 10 },
        { agency: 'PADI', name: 'Deep Diver', level: 'recreational', category: 'Specialty', sort_order: 11 },
        { agency: 'PADI', name: 'Wreck Diver', level: 'recreational', category: 'Specialty', sort_order: 12 },
        { agency: 'PADI', name: 'Sidemount Diver', level: 'recreational', category: 'Specialty', sort_order: 13 },
        { agency: 'PADI', name: 'Divemaster', level: 'professional', category: 'Professional', sort_order: 20 },
        { agency: 'PADI', name: 'Open Water Scuba Instructor', level: 'professional', category: 'Professional', sort_order: 21 },
        { agency: 'PADI', name: 'Tec 40 / 45 / 50', level: 'technical', category: 'Technical', sort_order: 30 },
        { agency: 'PADI', name: 'Tec 65 / Trimix Diver', level: 'technical', category: 'Technical', sort_order: 31 },
        
        // SSI Courses
        { agency: 'SSI', name: 'Basic Diver', level: 'recreational', category: 'Recreational', sort_order: 1 },
        { agency: 'SSI', name: 'Open Water Diver', level: 'recreational', category: 'Recreational', sort_order: 2 },
        { agency: 'SSI', name: 'Advanced Adventurer', level: 'recreational', category: 'Recreational', sort_order: 3 },
        { agency: 'SSI', name: 'Diver Stress & Rescue', level: 'recreational', category: 'Recreational', sort_order: 4 },
        { agency: 'SSI', name: 'Science of Diving', level: 'recreational', category: 'Specialty', sort_order: 10 },
        { agency: 'SSI', name: 'Perfect Buoyancy', level: 'recreational', category: 'Specialty', sort_order: 11 },
        { agency: 'SSI', name: 'Dive Guide', level: 'professional', category: 'Professional', sort_order: 20 },
        { agency: 'SSI', name: 'Extended Range (XR)', level: 'technical', category: 'Technical', sort_order: 30 },
        { agency: 'SSI', name: 'Technical Extended Range', level: 'technical', category: 'Technical', sort_order: 31 },
        
        // SDI Courses
        { agency: 'SDI', name: 'Open Water Scuba Diver', level: 'recreational', category: 'Recreational', sort_order: 1 },
        { agency: 'SDI', name: 'Advanced Adventure Diver', level: 'recreational', category: 'Recreational', sort_order: 2 },
        { agency: 'SDI', name: 'Solo Diver', level: 'recreational', category: 'Specialty', sort_order: 10 },
        
        // TDI Courses
        { agency: 'TDI', name: 'Intro to Tech', level: 'technical', category: 'Technical', sort_order: 1 },
        { agency: 'TDI', name: 'Advanced Nitrox', level: 'technical', category: 'Technical', sort_order: 2 },
        { agency: 'TDI', name: 'Decompression Procedures', level: 'technical', category: 'Technical', sort_order: 3 },
        { agency: 'TDI', name: 'Extended Range', level: 'technical', category: 'Technical', sort_order: 4 },
        { agency: 'TDI', name: 'Trimix / Advanced Trimix', level: 'technical', category: 'Technical', sort_order: 5 },
        { agency: 'TDI', name: 'Cavern / Intro to Cave / Full Cave', level: 'technical', category: 'Overhead', sort_order: 10 },
        
        // NAUI Courses
        { agency: 'NAUI', name: 'Scuba Diver', level: 'recreational', category: 'Recreational', sort_order: 1 },
        { agency: 'NAUI', name: 'Master Scuba Diver', level: 'recreational', category: 'Recreational', sort_order: 2 },
        { agency: 'NAUI', name: 'Helitrox Diver', level: 'technical', category: 'Technical', sort_order: 10 },
        { agency: 'NAUI', name: 'Extreme Exposure Diver', level: 'technical', category: 'Technical', sort_order: 11 },
        
        // IANTD Courses
        { agency: 'IANTD', name: 'Open Water EANx Diver', level: 'recreational', category: 'Open Circuit', sort_order: 1 },
        { agency: 'IANTD', name: 'Advanced Recreational Trimix', level: 'recreational', category: 'Open Circuit', sort_order: 2 },
        { agency: 'IANTD', name: 'Technical Diver', level: 'technical', category: 'Technical', sort_order: 10 },
        { agency: 'IANTD', name: 'Normoxic Trimix', level: 'technical', category: 'Technical', sort_order: 11 },
        { agency: 'IANTD', name: 'Expedition Trimix', level: 'technical', category: 'Technical', sort_order: 12 },
        
        // PSAI Courses
        { agency: 'PSAI', name: 'Open Water Sport Diver', level: 'recreational', category: 'Recreational', sort_order: 1 },
        { agency: 'PSAI', name: 'Narcosis Management (Levels 1-7)', level: 'technical', category: 'Technical', sort_order: 10 },
        { agency: 'PSAI', name: 'Advanced Wreck Penetration', level: 'technical', category: 'Technical', sort_order: 11 },
        { agency: 'PSAI', name: 'Trimix Fundamentals (Level I)', level: 'technical', category: 'Technical', sort_order: 12 },
        { agency: 'PSAI', name: 'Explorer Trimix (Level III)', level: 'technical', category: 'Technical', sort_order: 13 },
        
        // GUE Courses
        { agency: 'GUE', name: 'GUE Fundamentals (Fundies)', level: 'recreational', category: 'Foundational', sort_order: 1 },
        { agency: 'GUE', name: 'Recreational 1 / 2 / 3', level: 'recreational', category: 'Recreational', sort_order: 2 },
        { agency: 'GUE', name: 'Technical 1 / 2 / 3', level: 'technical', category: 'Technical', sort_order: 10 },
        { agency: 'GUE', name: 'Cave 1 / 2 / 3', level: 'technical', category: 'Cave', sort_order: 20 },
        
        // RAID Courses
        { agency: 'RAID', name: 'Open Water 20', level: 'recreational', category: 'Core', sort_order: 1 },
        { agency: 'RAID', name: 'Explorer 30', level: 'recreational', category: 'Core', sort_order: 2 },
        { agency: 'RAID', name: 'Advanced 35', level: 'recreational', category: 'Core', sort_order: 3 },
        { agency: 'RAID', name: 'Deco 40 / 50 / 60', level: 'technical', category: 'Technical', sort_order: 10 },
        
        // BSAC Courses
        { agency: 'BSAC', name: 'Ocean Diver', level: 'recreational', category: 'Grades', sort_order: 1 },
        { agency: 'BSAC', name: 'Sports Diver', level: 'recreational', category: 'Grades', sort_order: 2 },
        { agency: 'BSAC', name: 'Dive Leader', level: 'recreational', category: 'Grades', sort_order: 3 },
        { agency: 'BSAC', name: 'Advanced Diver', level: 'recreational', category: 'Grades', sort_order: 4 },
        
        // CMAS Courses
        { agency: 'CMAS', name: '1-Star Diver', level: 'recreational', category: 'Diver', sort_order: 1 },
        { agency: 'CMAS', name: '2-Star Diver', level: 'recreational', category: 'Diver', sort_order: 2 },
        { agency: 'CMAS', name: '3-Star Diver', level: 'recreational', category: 'Diver', sort_order: 3 },
        
        // ANDI Courses
        { agency: 'ANDI', name: 'Limited SafeAir User (LSU)', level: 'recreational', category: 'SafeAir', sort_order: 1 },
        { agency: 'ANDI', name: 'Complete SafeAir User (CSU)', level: 'recreational', category: 'SafeAir', sort_order: 2 },
        { agency: 'ANDI', name: 'Technical SafeAir Diver', level: 'technical', category: 'Technical', sort_order: 10 },
        
        // SNSI Courses
        { agency: 'SNSI', name: 'Open Water Diver', level: 'recreational', category: 'Recreational', sort_order: 1 },
        { agency: 'SNSI', name: 'Master Buoyancy & Trim', level: 'recreational', category: 'Specialty', sort_order: 10 },
        
        // IDEA Courses
        { agency: 'IDEA', name: 'Open Water Pro Diver', level: 'recreational', category: 'Recreational', sort_order: 1 },
        
        // ACUC Courses
        { agency: 'ACUC', name: 'Open Water Diver', level: 'recreational', category: 'Core', sort_order: 1 },
      ];
      
      for (const course of courses) {
        const agencyId = agencyIds[course.agency];
        if (agencyId) {
          await client.query(
            `INSERT INTO training_courses (agency_id, name, level, category, sort_order) 
             VALUES ($1, $2, $3, $4, $5)`,
            [agencyId, course.name, course.level, course.category, course.sort_order]
          );
        }
      }
      
      console.log('Training agencies and courses seeded successfully');
    }
    
    // Dive Messages table for dynamic tips and taglines
    await client.query(`
      CREATE TABLE IF NOT EXISTS dive_messages (
        id SERIAL PRIMARY KEY,
        message_type VARCHAR(20) NOT NULL,
        text TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_messages_type ON dive_messages(message_type);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_messages_active ON dive_messages(is_active);
    `).catch(() => {});
    
    await client.query(`
      DROP TRIGGER IF EXISTS update_dive_messages_updated_at ON dive_messages;
      CREATE TRIGGER update_dive_messages_updated_at
        BEFORE UPDATE ON dive_messages
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});
    
    // Seed default dive messages if table is empty
    const messagesCount = await client.query('SELECT COUNT(*) FROM dive_messages');
    if (parseInt(messagesCount.rows[0].count) === 0) {
      const defaultMessages = [
        { type: 'tagline', text: 'Ready for your next underwater adventure?' },
        { type: 'tagline', text: 'Every dive is a new discovery!' },
        { type: 'tagline', text: 'The ocean is calling...' },
        { type: 'tagline', text: 'Explore the depths, discover yourself.' },
        { type: 'tagline', text: 'Life is better underwater!' },
        { type: 'tip', text: 'Always do a buddy check before every dive. Check your BCD, weights, releases, air, and final equipment.' },
        { type: 'tip', text: 'Never hold your breath while ascending. The most important rule of diving!' },
        { type: 'tip', text: 'Equalize early and often during descent to prevent ear injuries.' },
        { type: 'tip', text: 'Plan your dive and dive your plan. Know your limits and stick to them.' },
        { type: 'tip', text: 'Stay hydrated! Dehydration increases the risk of decompression sickness.' },
        { type: 'tip', text: 'Check your air frequently. Always surface with a reserve of at least 50 bar.' },
        { type: 'tip', text: 'Maintain neutral buoyancy to protect marine life and conserve energy.' },
      ];
      
      for (const msg of defaultMessages) {
        await client.query(
          'INSERT INTO dive_messages (message_type, text) VALUES ($1, $2)',
          [msg.type, msg.text]
        );
      }
      console.log('Default dive messages seeded successfully');
    }
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS compressors (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        make VARCHAR(255),
        model VARCHAR(255),
        serial_number VARCHAR(255),
        purchase_date DATE,
        total_hours NUMERIC(10,1) DEFAULT 0,
        oil_change_interval_hours INTEGER DEFAULT 100,
        filter_change_interval_hours INTEGER DEFAULT 500,
        independent_test_interval_months INTEGER DEFAULT 12,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `).catch(() => {});

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_compressors_user_id ON compressors(user_id);
    `).catch(() => {});

    await client.query(`
      DROP TRIGGER IF EXISTS update_compressors_updated_at ON compressors;
      CREATE TRIGGER update_compressors_updated_at
        BEFORE UPDATE ON compressors
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS compressor_service_logs (
        id SERIAL PRIMARY KEY,
        compressor_id INTEGER REFERENCES compressors(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        service_type VARCHAR(50) NOT NULL,
        service_date DATE NOT NULL,
        hours_at_service NUMERIC(10,1),
        filter_type VARCHAR(100),
        test_result VARCHAR(10),
        test_certificate_number VARCHAR(255),
        next_due_date DATE,
        cost NUMERIC(10,2),
        technician VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_compressor_service_logs_compressor_id ON compressor_service_logs(compressor_id);
    `).catch(() => {});

    await client.query(`
      DROP TRIGGER IF EXISTS update_compressor_service_logs_updated_at ON compressor_service_logs;
      CREATE TRIGGER update_compressor_service_logs_updated_at
        BEFORE UPDATE ON compressor_service_logs
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS compressor_usage_logs (
        id SERIAL PRIMARY KEY,
        compressor_id INTEGER REFERENCES compressors(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        usage_date DATE NOT NULL,
        hours_used NUMERIC(10,1) NOT NULL,
        fills_count INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_compressor_usage_logs_compressor_id ON compressor_usage_logs(compressor_id);
    `).catch(() => {});

    // Cylinders tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS cylinders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        nickname VARCHAR(255) NOT NULL,
        cylinder_type VARCHAR(50) NOT NULL DEFAULT 'steel',
        size_liters NUMERIC(6,2),
        serial_number VARCHAR(100),
        working_pressure NUMERIC(6,1),
        manufacture_date DATE,
        ownership_status VARCHAR(50) DEFAULT 'owned',
        testing_standard VARCHAR(20) NOT NULL DEFAULT 'UK',
        custom_visual_interval_months INTEGER,
        custom_hydro_interval_months INTEGER,
        is_enriched_gas BOOLEAN DEFAULT FALSE,
        oxygen_clean_interval_months INTEGER DEFAULT 15,
        last_visual_date DATE,
        last_hydro_date DATE,
        last_oxygen_clean_date DATE,
        reminder_enabled BOOLEAN DEFAULT TRUE,
        reminder_days_before INTEGER DEFAULT 30,
        last_notified_at TIMESTAMP,
        gear_profile_id INTEGER REFERENCES gear_profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS cylinder_test_records (
        id SERIAL PRIMARY KEY,
        cylinder_id INTEGER REFERENCES cylinders(id) ON DELETE CASCADE,
        test_date DATE NOT NULL,
        test_type VARCHAR(50) NOT NULL,
        result VARCHAR(20) NOT NULL DEFAULT 'pass',
        facility_name VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {});

    await client.query(`
      CREATE TABLE IF NOT EXISTS cylinder_notifications_sent (
        id SERIAL PRIMARY KEY,
        cylinder_id INTEGER REFERENCES cylinders(id) ON DELETE CASCADE,
        test_type VARCHAR(50) NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cylinder_id, test_type)
      );
    `).catch(() => {});

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cylinders_user_id ON cylinders(user_id);
    `).catch(() => {});

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cylinder_test_records_cylinder_id ON cylinder_test_records(cylinder_id);
    `).catch(() => {});

    await client.query(`
      DROP TRIGGER IF EXISTS update_cylinders_updated_at ON cylinders;
      CREATE TRIGGER update_cylinders_updated_at
        BEFORE UPDATE ON cylinders
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    await client.query(`
      DROP TRIGGER IF EXISTS update_cylinder_test_records_updated_at ON cylinder_test_records;
      CREATE TRIGGER update_cylinder_test_records_updated_at
        BEFORE UPDATE ON cylinder_test_records
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    await client.query(`
      ALTER TABLE dive_photos ADD COLUMN IF NOT EXISTS blurhash VARCHAR(100);
    `).catch(() => {});

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  } finally {
    client.release();
  }
}

async function downloadImageBuffer(imageUrl) {
  // Relative /objects/... paths: download directly from GCS (no external HTTP fetch)
  if (imageUrl && imageUrl.startsWith('/objects/')) {
    const entityId = imageUrl.slice('/objects/'.length);
    let entityDir = process.env.PRIVATE_OBJECT_DIR || '';
    if (entityDir && !entityDir.endsWith('/')) entityDir = `${entityDir}/`;
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const [buffer] = await objectStorageClient.bucket(bucketName).file(objectName).download();
    return buffer;
  }

  // Absolute GCS signed URLs: extract bucket/object and download via SDK (no SSRF risk)
  if (imageUrl && imageUrl.startsWith('https://storage.googleapis.com/')) {
    const url = new URL(imageUrl);
    const { bucketName, objectName } = parseObjectPath(url.pathname);
    const [buffer] = await objectStorageClient.bucket(bucketName).file(objectName).download();
    return buffer;
  }

  // All other URL forms are rejected — do not fetch arbitrary user-supplied URLs
  return null;
}

async function generateBlurhashFromUrl(imageUrl) {
  try {
    const buffer = await downloadImageBuffer(imageUrl);
    if (!buffer) return null;
    const { data, info } = await sharp(buffer)
      .resize(32, 32, { fit: 'cover' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8ClampedArray(data);
    return encodeBlurhash(pixels, info.width, info.height, 4, 3);
  } catch (err) {
    console.error('Blurhash generation failed:', err.message);
    return null;
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, firstName, lastName, age, sex, privacyAccepted, termsAccepted } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  if (password.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters' });
  }
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
  }
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one number' });
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one special character' });
  }

  if (!privacyAccepted || !termsAccepted) {
    return res.status(400).json({ error: 'You must accept the Privacy Policy and Terms & Conditions' });
  }
  
  try {
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();
    
    const result = await pool.query(
      'INSERT INTO users (email, password, first_name, last_name, age, sex, privacy_accepted_at, terms_accepted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, role, age, sex, trial_ends_at',
      [email.toLowerCase(), hashedPassword, firstName || null, lastName || null, age || null, sex || null, now, now]
    );
    
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    // Automatically populate new user with sample data from Onboard user
    cloneOnboardDataToUser(user.id).then(cloneResult => {
      if (cloneResult.success) {
        console.log(`Auto-populated sample data for new user ${user.id}:`, cloneResult.stats);
      }
    }).catch(err => {
      console.error(`Failed to auto-populate sample data for user ${user.id}:`, err);
    });
    
    // Send welcome email (non-blocking)
    sendWelcomeEmail(user.email, firstName).then(emailResult => {
      if (emailResult.success) {
        console.log(`Welcome email sent to ${user.email}`);
      } else {
        console.error(`Failed to send welcome email to ${user.email}:`, emailResult.error);
      }
    }).catch(err => {
      console.error(`Error sending welcome email to ${user.email}:`, err);
    });
    
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        trialEndsAt: user.trial_ends_at
      },
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// Clone onboard user data to a new user
const ONBOARD_EMAIL = 'anthony@clara-eu.co';

async function cloneOnboardDataToUser(targetUserId) {
  // Find onboard user
  const onboardResult = await pool.query('SELECT id FROM users WHERE email = $1', [ONBOARD_EMAIL]);
  if (onboardResult.rows.length === 0) {
    console.log('Onboard user not found, skipping data clone');
    return { success: false, message: 'Onboard user not found' };
  }
  const onboardUserId = onboardResult.rows[0].id;

  const stats = { diveSites: 0, diveLogs: 0, gearProfiles: 0, diveBuddies: 0, equipment: 0, certifications: 0 };

  try {
    // Clone dive sites (track ID mapping for dive logs)
    const diveSites = await pool.query('SELECT * FROM dive_sites WHERE user_id = $1 AND deleted_at IS NULL', [onboardUserId]);
    const siteIdMap = {};
    for (const site of diveSites.rows) {
      const result = await pool.query(`
        INSERT INTO dive_sites (user_id, name, description, site_type, latitude, longitude, country, region,
          water_type, depth_max, visibility_min, visibility_max, difficulty, current_strength, access_notes,
          facilities, hazards, best_season, wikipedia_url, external_info, is_wreck, wreck_info, wreck_name, wreck_url, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24, NOW())
        RETURNING id
      `, [targetUserId, site.name, site.description, site.site_type, site.latitude, site.longitude, site.country, site.region,
          site.water_type, site.depth_max, site.visibility_min, site.visibility_max, site.difficulty, site.current_strength, site.access_notes,
          site.facilities, site.hazards, site.best_season, site.wikipedia_url, site.external_info, site.is_wreck, site.wreck_info, site.wreck_name, site.wreck_url]);
      siteIdMap[site.id] = result.rows[0].id;
      stats.diveSites++;
    }

    // Clone dive buddies (track ID mapping for dive log buddy links)
    const buddies = await pool.query('SELECT * FROM dive_buddies WHERE user_id = $1 AND (deleted_at IS NULL OR deleted_at IS NOT NULL)', [onboardUserId]);
    const buddyIdMap = {};
    for (const buddy of buddies.rows) {
      const result = await pool.query(`
        INSERT INTO dive_buddies (user_id, name, notes, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id
      `, [targetUserId, buddy.name, buddy.notes]);
      buddyIdMap[buddy.id] = result.rows[0].id;
      stats.diveBuddies++;
    }

    // Clone gear profiles
    const gearProfiles = await pool.query('SELECT * FROM gear_profiles WHERE user_id = $1', [onboardUserId]);
    const gearIdMap = {};
    for (const gear of gearProfiles.rows) {
      const result = await pool.query(`
        INSERT INTO gear_profiles (user_id, name, config_type, suit_type, suit_thickness, undersuit, suit_nickname,
          gloves_type, gloves_thickness, gloves_nickname, boots_type, boots_thickness, boots_nickname,
          hood_type, hood_thickness, hood_nickname, bcd_type, bcd_nickname, fins_type, fins_nickname,
          mask_nickname, notes, is_template, planned_depth, planned_bottom_time, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26, NOW())
        RETURNING id
      `, [targetUserId, gear.name, gear.config_type, gear.suit_type, gear.suit_thickness, gear.undersuit, gear.suit_nickname,
          gear.gloves_type, gear.gloves_thickness, gear.gloves_nickname, gear.boots_type, gear.boots_thickness, gear.boots_nickname,
          gear.hood_type, gear.hood_thickness, gear.hood_nickname, gear.bcd_type, gear.bcd_nickname, gear.fins_type, gear.fins_nickname,
          gear.mask_nickname, gear.notes, gear.is_template, gear.planned_depth, gear.planned_bottom_time, gear.status]);
      gearIdMap[gear.id] = result.rows[0].id;
      stats.gearProfiles++;

      // Clone gear cylinders
      const cylinders = await pool.query('SELECT * FROM gear_cylinders WHERE gear_profile_id = $1', [gear.id]);
      for (const cyl of cylinders.rows) {
        await pool.query(`
          INSERT INTO gear_cylinders (gear_profile_id, cylinder_size, cylinder_material, cylinder_role, gas_mix,
            o2_percent, he_percent, start_pressure, working_pressure, nickname, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [result.rows[0].id, cyl.cylinder_size, cyl.cylinder_material, cyl.cylinder_role, cyl.gas_mix,
            cyl.o2_percent, cyl.he_percent, cyl.start_pressure, cyl.working_pressure, cyl.nickname, cyl.sort_order]);
      }

      // Clone gear weights
      const weights = await pool.query('SELECT * FROM gear_weights WHERE gear_profile_id = $1', [gear.id]);
      for (const w of weights.rows) {
        await pool.query(`
          INSERT INTO gear_weights (gear_profile_id, placement, weight_kg, sort_order)
          VALUES ($1,$2,$3,$4)
        `, [result.rows[0].id, w.placement, w.weight_kg, w.sort_order]);
      }
    }

    // Clone equipment inventory
    const equipment = await pool.query('SELECT * FROM equipment_inventory WHERE user_id = $1', [onboardUserId]);
    for (const eq of equipment.rows) {
      await pool.query(`
        INSERT INTO equipment_inventory (user_id, equipment_type, name, brand, model, serial_number, quantity, purchase_date, last_service_date, notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
      `, [targetUserId, eq.equipment_type, eq.name, eq.brand, eq.model, eq.serial_number, eq.quantity, eq.purchase_date, eq.last_service_date, eq.notes]);
      stats.equipment++;
    }

    // Clone dive logs (with mapped site IDs and gear profile IDs)
    const diveLogs = await pool.query('SELECT * FROM dive_logs WHERE user_id = $1 AND deleted_at IS NULL ORDER BY dive_datetime', [onboardUserId]);
    const logIdMap = {};
    for (const log of diveLogs.rows) {
      const newSiteId = log.dive_site_id ? siteIdMap[log.dive_site_id] : null;
      const newGearId = log.gear_profile_id ? gearIdMap[log.gear_profile_id] : null;

      const result = await pool.query(`
        INSERT INTO dive_logs (user_id, dive_site_id, gear_profile_id, dive_datetime, duration_seconds, max_depth_meters, avg_depth_meters,
          min_temperature_celsius, max_temperature_celsius, dive_number, surface_interval_seconds, dive_mode, surface_conditions,
          weather_conditions, notes, rating, samples, gas_mixes, gas_pressures, buddy,
          workload, thermal_comfort, equipment_issues, skills_practiced, skills_notes,
          decompression_symptoms, problem_notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27, NOW())
        RETURNING id
      `, [targetUserId, newSiteId, newGearId, log.dive_datetime, log.duration_seconds, log.max_depth_meters, log.avg_depth_meters,
          log.min_temperature_celsius, log.max_temperature_celsius, log.dive_number, log.surface_interval_seconds, log.dive_mode,
          log.surface_conditions, log.weather_conditions, log.notes, log.rating, log.samples, log.gas_mixes, log.gas_pressures, log.buddy,
          log.workload, log.thermal_comfort, log.equipment_issues, log.skills_practiced, log.skills_notes,
          log.decompression_symptoms, log.problem_notes]);
      logIdMap[log.id] = result.rows[0].id;
      stats.diveLogs++;

      // Clone dive log gases
      const gases = await pool.query('SELECT * FROM dive_log_gases WHERE dive_log_id = $1', [log.id]);
      for (const gas of gases.rows) {
        await pool.query(`
          INSERT INTO dive_log_gases (dive_log_id, gas_slot, name, o2_percent, he_percent, n2_percent, is_diluent, is_bailout,
            tank_size_liters, work_pressure_bar, start_pressure_bar, end_pressure_bar, transmitter_serial)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [result.rows[0].id, gas.gas_slot, gas.name, gas.o2_percent, gas.he_percent, gas.n2_percent, gas.is_diluent, gas.is_bailout,
            gas.tank_size_liters, gas.work_pressure_bar, gas.start_pressure_bar, gas.end_pressure_bar, gas.transmitter_serial]);
      }

      // Clone dive log buddy links
      const logBuddies = await pool.query('SELECT * FROM dive_log_buddies WHERE dive_log_id = $1', [log.id]);
      for (const lb of logBuddies.rows) {
        const newBuddyId = lb.buddy_id ? buddyIdMap[lb.buddy_id] : null;
        if (newBuddyId) {
          await pool.query(`
            INSERT INTO dive_log_buddies (dive_log_id, buddy_id, created_at)
            VALUES ($1, $2, NOW())
          `, [result.rows[0].id, newBuddyId]);
        }
      }
    }

    // Clone certifications
    const certs = await pool.query('SELECT * FROM user_certifications WHERE user_id = $1', [onboardUserId]);
    for (const cert of certs.rows) {
      await pool.query(`
        INSERT INTO user_certifications (user_id, course_id, certification_date, certification_number, instructor_name,
          instructor_number, dive_center, location, notes, is_verified, latitude, longitude, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
      `, [targetUserId, cert.course_id, cert.certification_date, cert.certification_number, cert.instructor_name,
          cert.instructor_number, cert.dive_center, cert.location, cert.notes, cert.is_verified, cert.latitude, cert.longitude]);
      stats.certifications++;
    }

    console.log(`Cloned onboard data to user ${targetUserId}:`, stats);
    return { success: true, stats };
  } catch (error) {
    console.error('Error cloning onboard data:', error);
    return { success: false, message: error.message };
  }
}

// Endpoint to populate sample data for a user
app.post('/api/user/populate-sample-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if user already has dive logs (don't duplicate)
    const existing = await pool.query('SELECT COUNT(*) as count FROM dive_logs WHERE user_id = $1', [userId]);
    if (parseInt(existing.rows[0].count) > 0) {
      return res.status(400).json({ error: 'You already have dive data. Sample data can only be added to empty accounts.' });
    }
    
    const result = await cloneOnboardDataToUser(userId);
    if (result.success) {
      res.json({ message: 'Sample data added successfully', stats: result.stats });
    } else {
      res.status(500).json({ error: result.message || 'Failed to add sample data' });
    }
  } catch (error) {
    console.error('Populate sample data error:', error);
    res.status(500).json({ error: 'Failed to populate sample data' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = result.rows[0];
    
    if (user.is_blocked) {
      return res.status(403).json({ error: 'Your account has been blocked. Please contact an administrator.' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        trialEndsAt: user.trial_ends_at
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  try {
    const result = await pool.query('SELECT id, email FROM users WHERE email = $1', [email.toLowerCase()]);
    
    // Always return success message to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({ message: 'If an account exists with this email, password reset instructions have been sent.' });
    }
    
    const user = result.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour
    
    await pool.query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE email = $3',
      [resetToken, resetExpires, email.toLowerCase()]
    );
    
    // Send password reset email via Resend
    const baseUrl = process.env.APP_URL || req.headers.origin || `https://${req.headers.host}`;
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    
    try {
      const { client, fromEmail } = await getUncachableResendClient();
      console.log(`Sending password reset email from: ${fromEmail || 'noreply@resend.dev'} to: ${user.email}`);
      
      const emailResult = await client.emails.send({
        from: fromEmail || 'noreply@resend.dev',
        to: user.email,
        subject: 'Erebus - Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #D22F00;">Password Reset Request</h2>
            <p>You requested to reset your password for your Erebus account.</p>
            <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
            <p style="margin: 24px 0;">
              <a href="${resetLink}" style="background-color: #D22F00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
            </p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            <p style="color: #666; font-size: 12px; margin-top: 32px;">- The Erebus Team</p>
          </div>
        `
      });
      
      console.log(`Password reset email result:`, JSON.stringify(emailResult));
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError.message || emailError);
      // Still return success to prevent email enumeration, but log the error
    }
    
    res.json({ message: 'If an account exists with this email, password reset instructions have been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  
  if (newPassword.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters' });
  }
  if (!/[A-Z]/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
  }
  if (!/[0-9]/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must contain at least one number' });
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must contain at least one special character' });
  }

  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()',
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE users SET password = $1, password_reset_token = NULL, password_reset_expires = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, result.rows[0].id]
    );
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, age, sex, role, profile_image, created_at, trial_ends_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    let profileImageUrl = null;
    if (user.profile_image) {
      try {
        const REPLIT_SIDECAR = 'http://127.0.0.1:1106';
        let storedPath = user.profile_image;
        
        // Handle /objects/... path format by converting to full storage path
        if (storedPath.startsWith('/objects/')) {
          const entityId = storedPath.slice('/objects/'.length);
          let entityDir = process.env.PRIVATE_OBJECT_DIR || '';
          if (!entityDir.endsWith('/')) entityDir = `${entityDir}/`;
          storedPath = `${entityDir}${entityId}`;
        }
        
        if (!storedPath.startsWith('/')) storedPath = `/${storedPath}`;
        const pathParts = storedPath.split('/');
        if (pathParts.length >= 3) {
          const bucketName = pathParts[1];
          const objectName = pathParts.slice(2).join('/');
          const signResponse = await fetch(`${REPLIT_SIDECAR}/object-storage/signed-object-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bucket_name: bucketName,
              object_name: objectName,
              method: 'GET',
              expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            }),
          });
          if (signResponse.ok) {
            const { signed_url } = await signResponse.json();
            profileImageUrl = signed_url;
          }
        }
      } catch (err) {
        console.error('Error signing profile image in /api/auth/me:', err);
      }
    }
    
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      age: user.age,
      sex: user.sex,
      role: user.role,
      profileImage: profileImageUrl,
      createdAt: user.created_at,
      trialEndsAt: user.trial_ends_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/email-preview/welcome', authenticateToken, requireAdmin, (req, res) => {
  const firstName = req.query.name || 'Diver';
  const html = generateWelcomeEmailHtml(firstName);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Temporary test endpoint for sending welcome email (remove in production)
app.post('/api/dev/send-test-welcome', async (req, res) => {
  const { email, firstName } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    const result = await sendWelcomeEmail(email, firstName || 'Diver');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/email-preview/welcome', (req, res) => {
  const firstName = req.query.name || 'Diver';
  const html = generateWelcomeEmailHtml(firstName);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

app.get('/api/dev/send-test-email', async (req, res) => {
  const { email, name } = req.query;
  
  if (!email) {
    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Send Test Email</title></head>
      <body style="font-family: Arial, sans-serif; padding: 40px; max-width: 500px; margin: 0 auto;">
        <h1 style="color: #D22F00;">Send Test Welcome Email</h1>
        <form method="GET">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px;">Email Address:</label>
            <input type="email" name="email" required style="width: 100%; padding: 8px; font-size: 16px;">
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px;">First Name (optional):</label>
            <input type="text" name="name" placeholder="Diver" style="width: 100%; padding: 8px; font-size: 16px;">
          </div>
          <button type="submit" style="background: #D22F00; color: white; padding: 12px 24px; border: none; font-size: 16px; cursor: pointer; border-radius: 4px;">Send Email</button>
        </form>
      </body>
      </html>
    `);
  }
  
  try {
    const result = await sendWelcomeEmail(email, name || 'Diver');
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Email Sent</title></head>
      <body style="font-family: Arial, sans-serif; padding: 40px; max-width: 500px; margin: 0 auto;">
        <h1 style="color: #28a745;">Email Sent!</h1>
        <p>Welcome email sent to: <strong>${email}</strong></p>
        <p>From: <strong>${result.fromEmail}</strong></p>
        <p>Resend ID: <code>${result.result?.data?.id || 'N/A'}</code></p>
        <p style="margin-top: 24px;"><a href="/api/dev/send-test-email">Send another</a></p>
      </body>
      </html>
    `);
  } catch (error) {
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body style="font-family: Arial, sans-serif; padding: 40px; max-width: 500px; margin: 0 auto;">
        <h1 style="color: #dc3545;">Error</h1>
        <p>${error.message}</p>
        <p><a href="/api/dev/send-test-email">Try again</a></p>
      </body>
      </html>
    `);
  }
});

app.post('/api/admin/email-test/welcome', authenticateToken, requireAdmin, async (req, res) => {
  const { email, firstName } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const result = await sendWelcomeEmail(email, firstName || 'Diver');
  if (result.success) {
    res.json({ message: 'Test email sent successfully', result: result.result });
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, is_blocked, is_archived, created_at, last_login_at FROM users ORDER BY created_at DESC'
    );
    
    res.json(result.rows.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isBlocked: user.is_blocked || false,
      isArchived: user.is_archived || false,
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at
    })));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  
  try {
    const result = await pool.query(
      'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, first_name, last_name, role',
      [role, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/users/:id/block', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { blocked } = req.body;
  
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot block your own account' });
  }
  
  try {
    const result = await pool.query(
      'UPDATE users SET is_blocked = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, first_name, last_name, role, is_blocked',
      [blocked, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isBlocked: user.is_blocked
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const userResult = await pool.query(
      'SELECT id, email, first_name FROM users WHERE id = $1',
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 24 * 3600000);
    
    await pool.query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [resetToken, resetExpires, id]
    );
    
    const baseUrl = process.env.APP_URL || req.headers.origin || `https://${req.headers.host}`;
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    
    try {
      const { client, fromEmail } = await getUncachableResendClient();
      console.log(`Admin sending password reset from: ${fromEmail || 'noreply@resend.dev'} to: ${user.email}`);
      
      const emailResult = await client.emails.send({
        from: fromEmail || 'noreply@resend.dev',
        to: user.email,
        subject: 'Erebus - Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #D22F00;">Password Reset Request</h2>
            <p>Hello ${user.first_name || 'there'},</p>
            <p>An administrator has initiated a password reset for your Erebus account.</p>
            <p>Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #D22F00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="color: #666; word-break: break-all;">${resetLink}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you did not expect this email, please contact an administrator.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">Erebus Dive Management</p>
          </div>
        `
      });
      
      console.log(`Admin password reset email result:`, JSON.stringify(emailResult));
      res.json({ message: 'Password reset email sent successfully' });
    } catch (emailError) {
      console.error('Email send error:', emailError.message || emailError);
      res.status(500).json({ error: 'Failed to send password reset email. Please check email configuration.' });
    }
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Self-delete: authenticated user deletes their own account
app.delete('/api/user/account', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Collect object storage keys before deletion (best-effort cleanup)
    const [userRow, certImages, buddyPhotos, siteImages, userPhotos] = await Promise.all([
      client.query('SELECT profile_image FROM users WHERE id = $1', [userId]),
      client.query(
        `SELECT ci.image_url FROM certification_images ci
         JOIN user_certifications uc ON ci.certification_id = uc.id
         WHERE uc.user_id = $1 AND ci.image_url IS NOT NULL`,
        [userId]
      ),
      client.query(
        'SELECT photo_url FROM dive_buddies WHERE user_id = $1 AND photo_url IS NOT NULL',
        [userId]
      ),
      client.query(
        `SELECT dsi.image_url FROM dive_site_images dsi
         JOIN dive_sites ds ON dsi.dive_site_id = ds.id
         WHERE ds.user_id = $1 AND dsi.image_url IS NOT NULL AND dsi.is_stock = FALSE`,
        [userId]
      ),
      // Gallery photos and videos (both original and thumbnails)
      client.query(
        'SELECT image_url, thumbnail_url FROM dive_photos WHERE user_id = $1',
        [userId]
      ),
    ]);

    // Explicitly delete tables that may not have ON DELETE CASCADE on user_id
    await client.query('DELETE FROM dive_logs WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM dive_buddies WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM support_conversations WHERE user_id = $1', [userId]);
    // dive_sites has ON DELETE SET NULL; we must delete the rows explicitly so
    // dive_site_images (which cascade from dive_sites) are also removed
    await client.query('DELETE FROM dive_sites WHERE user_id = $1', [userId]);

    // Delete the user — all other tables with REFERENCES users(id) ON DELETE CASCADE
    // are handled automatically by PostgreSQL
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    await client.query('COMMIT');

    // Convert any stored URL (relative path OR full https://) to an object-storage key.
    // Relative paths like /objects/abc or bucket/abc are used as-is.
    // Full https:// URLs (e.g. from older upload flows or GCS signed URLs) have their
    // /objects/... path portion extracted.  Unrecognised or external URLs return null.
    const toStorageKey = (url) => {
      if (!url) return null;
      if (!url.startsWith('http')) return url; // already a relative key
      try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/objects\/.+/);
        return match ? match[0] : null;
      } catch {
        return null;
      }
    };

    // Build the full list of object-storage keys to purge
    const keys = [
      userRow.rows[0]?.profile_image,
      ...certImages.rows.map(r => r.image_url),
      ...buddyPhotos.rows.map(r => r.photo_url),
      ...siteImages.rows.map(r => r.image_url),
      ...userPhotos.rows.flatMap(r => [r.image_url, r.thumbnail_url]),
    ].map(toStorageKey).filter(Boolean);

    // Storage cleanup is awaited synchronously — the request only succeeds once
    // cleanup has been attempted.  Individual file failures are tolerated (the DB
    // record is already gone) but a storage-client initialisation failure will
    // propagate to the outer catch and return a 500.
    if (keys.length > 0) {
      const { Client } = require('@replit/object-storage');
      const objectStorage = new Client();
      const results = await Promise.allSettled(keys.map(key => objectStorage.delete(key)));
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        console.warn(`Account deletion: ${failed.length}/${keys.length} storage objects could not be removed (orphaned). DB record is deleted.`);
      }
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Get user stats for admin detail view
app.get('/api/admin/users/:id/stats', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get user info
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name, role, is_blocked, is_archived, created_at, last_login_at FROM users WHERE id = $1',
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Get counts for all user data
    const [diveLogs, diveSites, diveTrips, gearProfiles, equipment, photos, certifications, buddies] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM dive_logs WHERE user_id = $1', [id]),
      pool.query('SELECT COUNT(*) FROM dive_sites WHERE user_id = $1 AND is_archived = FALSE', [id]),
      pool.query('SELECT COUNT(*) FROM dive_trips WHERE user_id = $1', [id]),
      pool.query('SELECT COUNT(*) FROM gear_profiles WHERE user_id = $1', [id]),
      pool.query('SELECT COUNT(*) FROM equipment_inventory WHERE user_id = $1', [id]),
      pool.query('SELECT COUNT(*) FROM dive_photos WHERE user_id = $1', [id]),
      pool.query('SELECT COUNT(*) FROM user_certifications WHERE user_id = $1', [id]),
      pool.query('SELECT COUNT(*) FROM dive_buddies WHERE user_id = $1', [id])
    ]);
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        isBlocked: user.is_blocked || false,
        isArchived: user.is_archived || false,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at
      },
      stats: {
        diveLogs: parseInt(diveLogs.rows[0].count),
        diveSites: parseInt(diveSites.rows[0].count),
        diveTrips: parseInt(diveTrips.rows[0].count),
        gearProfiles: parseInt(gearProfiles.rows[0].count),
        equipment: parseInt(equipment.rows[0].count),
        photos: parseInt(photos.rows[0].count),
        certifications: parseInt(certifications.rows[0].count),
        buddies: parseInt(buddies.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Archive/unarchive user
app.put('/api/admin/users/:id/archive', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { archived } = req.body;
  
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot archive your own account' });
  }
  
  try {
    const result = await pool.query(
      'UPDATE users SET is_archived = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, first_name, last_name, role, is_blocked, is_archived',
      [archived, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isBlocked: user.is_blocked,
      isArchived: user.is_archived
    });
  } catch (error) {
    console.error('Archive user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Dev Log API endpoints
app.get('/api/admin/dev-log', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, page_name } = req.query;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`dl.status = $${params.length}`);
    }

    if (page_name) {
      params.push(page_name);
      conditions.push(`dl.page_name = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
    const query = `
      SELECT dl.*,
        (SELECT COUNT(*) FROM dev_log_notes n
         WHERE n.dev_log_id = dl.id
           AND (dl.last_sent_at IS NULL OR n.created_at > dl.last_sent_at)
        ) AS new_notes_count
      FROM dev_log dl
      ${whereClause}
      ORDER BY dl.created_at DESC
    `;

    const result = await pool.query(query, params);

    res.json(result.rows.map(row => ({
      id: row.id,
      task: row.task,
      pageName: row.page_name,
      pageType: row.page_type,
      status: row.status,
      devices: row.device ? row.device.split(',').filter(d => d) : [],
      taskRef: row.task_ref || null,
      screenshots: row.screenshots || [],
      lastSentAt: row.last_sent_at || null,
      newNotesSinceSent: parseInt(row.new_notes_count || '0', 10) > 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })));
  } catch (error) {
    console.error('Get dev log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/dev-log/page-names', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT page_name FROM dev_log WHERE page_name IS NOT NULL AND page_name != \'\' ORDER BY page_name'
    );
    res.json(result.rows.map(row => row.page_name));
  } catch (error) {
    console.error('Get page names error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/dev-log', authenticateToken, requireAdmin, async (req, res) => {
  const { task, pageName, pageType, status, devices, taskRef, screenshots } = req.body;
  
  if (!task) {
    return res.status(400).json({ error: 'Task is required' });
  }
  
  const deviceString = Array.isArray(devices) && devices.length > 0 ? devices.join(',') : null;
  const screenshotsArray = Array.isArray(screenshots) ? screenshots : [];
  
  try {
    const result = await pool.query(
      `INSERT INTO dev_log (task, page_name, page_type, status, device, task_ref, screenshots) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [task, pageName || null, pageType || 'card', status || 'todo', deviceString, taskRef || null, screenshotsArray]
    );
    
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      task: row.task,
      pageName: row.page_name,
      pageType: row.page_type,
      status: row.status,
      devices: row.device ? row.device.split(',').filter(d => d) : [],
      taskRef: row.task_ref || null,
      screenshots: row.screenshots || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Create dev log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/dev-log/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const current = await pool.query('SELECT * FROM dev_log WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Dev log entry not found' });
    }
    const cur = current.rows[0];

    const task = req.body.task !== undefined ? req.body.task : cur.task;
    const pageName = Object.prototype.hasOwnProperty.call(req.body, 'pageName') ? req.body.pageName : cur.page_name;
    const pageType = req.body.pageType || cur.page_type;
    const status = req.body.status || cur.status;

    let deviceString;
    if (Object.prototype.hasOwnProperty.call(req.body, 'devices')) {
      const d = req.body.devices;
      deviceString = Array.isArray(d) && d.length > 0 ? d.join(',') : null;
    } else {
      deviceString = cur.device;
    }

    const taskRef = req.body.taskRef !== undefined ? (req.body.taskRef || null) : cur.task_ref;
    const screenshots = Object.prototype.hasOwnProperty.call(req.body, 'screenshots')
      ? (Array.isArray(req.body.screenshots) ? req.body.screenshots : cur.screenshots)
      : cur.screenshots;

    const clearPending = !!(req.body.taskRef !== undefined && req.body.taskRef);
    const result = await pool.query(
      `UPDATE dev_log SET 
        task = $1,
        page_name = $2,
        page_type = $3,
        status = $4,
        device = $5,
        task_ref = $6,
        screenshots = $7,
        agent_draft_pending = CASE WHEN $9 THEN FALSE ELSE agent_draft_pending END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING *`,
      [task, pageName, pageType, status, deviceString, taskRef, screenshots, id, clearPending]
    );

    const row = result.rows[0];
    res.json({
      id: row.id,
      task: row.task,
      pageName: row.page_name,
      pageType: row.page_type,
      status: row.status,
      devices: row.device ? row.device.split(',').filter(d => d) : [],
      taskRef: row.task_ref || null,
      screenshots: row.screenshots || [],
      lastSentAt: row.last_sent_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Update dev log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/dev-log/:id/notes', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM dev_log_notes WHERE dev_log_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      note: row.note,
      createdAt: row.created_at,
    })));
  } catch (error) {
    console.error('Get dev log notes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/dev-log/:id/notes', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'Note text is required' });
  }
  try {
    const entryCheck = await pool.query('SELECT id FROM dev_log WHERE id = $1', [id]);
    if (entryCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dev log entry not found' });
    }
    const result = await pool.query(
      'INSERT INTO dev_log_notes (dev_log_id, note) VALUES ($1, $2) RETURNING *',
      [id, note.trim()]
    );
    const row = result.rows[0];
    res.status(201).json({ id: row.id, note: row.note, createdAt: row.created_at });
  } catch (error) {
    console.error('Add dev log note error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/dev-log/:id/send-to-agent', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  console.log(`[send-to-agent] Request for dev log id=${id}`);
  try {
    const entryResult = await pool.query('SELECT * FROM dev_log WHERE id = $1', [id]);
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dev log entry not found' });
    }
    const entry = entryResult.rows[0];
    const notesResult = await pool.query(
      'SELECT * FROM dev_log_notes WHERE dev_log_id = $1 ORDER BY created_at ASC',
      [id]
    );
    const notes = notesResult.rows;

    const devices = entry.device ? entry.device.split(',').filter(d => d).join(', ') : 'Not specified';
    const screenshots = entry.screenshots || [];

    let notesSection = '';
    if (notes.length > 0) {
      notesSection = '\n## Notes History\n' + notes.map(n => {
        const d = new Date(n.created_at);
        const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        return `- [${dateStr}] ${n.note}`;
      }).join('\n');
    }

    let screenshotsSection = '';
    if (screenshots.length > 0) {
      screenshotsSection = '\n## Screenshots\n' + screenshots.map(url => `- ${url}`).join('\n');
    }

    const previousTaskRef = entry.task_ref || null;
    const retryNote = previousTaskRef
      ? `\n> **Retry**: This is a re-submission. Previous task ref: ${previousTaskRef}\n`
      : '';

    const content = `---
devLogId: ${id}
${previousTaskRef ? `previousTaskRef: "${previousTaskRef}"` : ''}
---
# [Dev Log #${id}] ${entry.task.split('\n')[0].substring(0, 80)}

${retryNote}
**Page**: ${entry.page_name || 'N/A'} (${entry.page_type})
**Devices**: ${devices}
**Status**: ${entry.status}

## Description
${entry.task}
${notesSection}
${screenshotsSection}

## Agent Instructions
When you create a Replit task from this entry, call:
  PUT /api/admin/dev-log/${id}
  Body: { "taskRef": "<assigned task ref>" }
to link the task number back to this dev log entry automatically.
`;

    await pool.query(
      'UPDATE dev_log SET last_sent_at = NOW(), agent_draft_content = $1, agent_draft_pending = TRUE WHERE id = $2',
      [content, id]
    );
    console.log(`[send-to-agent] DB updated for id=${id}, draft stored`);

    try {
      const tasksDir = path.join(process.cwd(), '.local', 'tasks');
      if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });
      fs.writeFileSync(path.join(tasksDir, `devlog-draft-${id}.md`), content, 'utf8');
    } catch (_) {}

    res.json({ success: true, draftPath: `devlog-draft-${id}.md`, lastSentAt: new Date().toISOString() });
  } catch (error) {
    console.error('Send to agent error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/dev-log/pending-agent-drafts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, task, page_name, page_type, status, agent_draft_content, last_sent_at
       FROM dev_log WHERE agent_draft_pending = TRUE ORDER BY last_sent_at ASC`
    );
    const drafts = result.rows;
    if (drafts.length > 0) {
      const tasksDir = path.join(process.cwd(), '.local', 'tasks');
      if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });
      for (const draft of drafts) {
        fs.writeFileSync(path.join(tasksDir, `devlog-draft-${draft.id}.md`), draft.agent_draft_content, 'utf8');
      }
    }
    res.json({ count: drafts.length, drafts: drafts.map(d => ({ id: d.id, title: d.task.split('\n')[0].substring(0, 80), lastSentAt: d.last_sent_at })) });
  } catch (error) {
    console.error('Pending agent drafts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/internal/agent-link', async (req, res) => {
  const secret = process.env.AGENT_BRIDGE_SECRET;
  const provided = (req.headers['x-agent-key'] || '');
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  const { id, taskRef } = req.body;
  if (!id || !taskRef) return res.status(400).json({ error: 'id and taskRef required' });
  try {
    await pool.query(
      `UPDATE dev_log SET task_ref = $1, agent_draft_pending = FALSE, status = 'in_progress' WHERE id = $2`,
      [taskRef, id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('[agent-link] error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/internal/agent-complete', async (req, res) => {
  const secret = process.env.AGENT_BRIDGE_SECRET;
  const provided = (req.headers['x-agent-key'] || '');
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    await pool.query(
      `UPDATE dev_log SET status = 'completed', agent_draft_pending = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('[agent-complete] error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/internal/agent-drafts', async (req, res) => {
  const secret = process.env.AGENT_BRIDGE_SECRET;
  const provided = (req.headers['x-agent-key'] || '');
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await pool.query(
      `SELECT id, agent_draft_content, last_sent_at FROM dev_log WHERE agent_draft_pending = TRUE ORDER BY last_sent_at ASC`
    );
    res.json({ drafts: result.rows.map(r => ({ id: r.id, content: r.agent_draft_content, lastSentAt: r.last_sent_at })) });
  } catch (error) {
    console.error('[agent-drafts] error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/dev-log/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM dev_log WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dev log entry not found' });
    }
    
    res.json({ message: 'Dev log entry deleted successfully' });
  } catch (error) {
    console.error('Delete dev log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Statistics
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [
      usersResult,
      diveLogsResult,
      buddiesResult,
      gearProfilesResult,
      diveSitesResult,
      photosResult,
      certificationsResult,
      diveTripsResult,
      usersByMonthResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM users'),
      pool.query('SELECT COUNT(*) as count FROM dive_logs'),
      pool.query('SELECT COUNT(*) as count FROM dive_buddies'),
      pool.query('SELECT COUNT(*) as count FROM gear_profiles'),
      pool.query('SELECT COUNT(*) as count FROM dive_sites WHERE deleted_at IS NULL'),
      pool.query('SELECT COUNT(*) as count FROM dive_photos'),
      pool.query('SELECT COUNT(*) as count FROM user_certifications'),
      pool.query('SELECT COUNT(*) as count FROM dive_trips'),
      pool.query(`
        SELECT 
          TO_CHAR(created_at, 'YYYY-MM') as month,
          COUNT(*) as count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month ASC
      `)
    ]);

    res.json({
      totals: {
        users: parseInt(usersResult.rows[0].count),
        diveLogs: parseInt(diveLogsResult.rows[0].count),
        buddies: parseInt(buddiesResult.rows[0].count),
        gearProfiles: parseInt(gearProfilesResult.rows[0].count),
        diveSites: parseInt(diveSitesResult.rows[0].count),
        photos: parseInt(photosResult.rows[0].count),
        certifications: parseInt(certificationsResult.rows[0].count),
        diveTrips: parseInt(diveTripsResult.rows[0].count)
      },
      usersByMonth: usersByMonthResult.rows.map(r => ({
        month: r.month,
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Dive Messages - Admin CRUD
app.get('/api/admin/dive-messages', authenticateToken, requireAdmin, async (req, res) => {
  const { type } = req.query;
  
  try {
    let query = 'SELECT * FROM dive_messages';
    const params = [];
    
    if (type) {
      query += ' WHERE message_type = $1';
      params.push(type);
    }
    
    query += ' ORDER BY message_type, created_at DESC';
    
    const result = await pool.query(query, params);
    
    res.json({
      messages: result.rows.map(row => ({
        id: row.id,
        messageType: row.message_type,
        text: row.text,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    console.error('Get dive messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/dive-messages', authenticateToken, requireAdmin, async (req, res) => {
  const { messageType, text } = req.body;
  
  if (!messageType || !text) {
    return res.status(400).json({ error: 'Message type and text are required' });
  }
  
  if (!['tip', 'tagline'].includes(messageType)) {
    return res.status(400).json({ error: 'Message type must be "tip" or "tagline"' });
  }
  
  try {
    const result = await pool.query(
      'INSERT INTO dive_messages (message_type, text) VALUES ($1, $2) RETURNING *',
      [messageType, text]
    );
    
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      messageType: row.message_type,
      text: row.text,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Create dive message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/dive-messages/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { text, isActive } = req.body;
  
  try {
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (text !== undefined) {
      updates.push(`text = $${paramIndex}`);
      params.push(text);
      paramIndex++;
    }
    
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    const result = await pool.query(
      `UPDATE dive_messages SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dive message not found' });
    }
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      messageType: row.message_type,
      text: row.text,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Update dive message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/dive-messages/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM dive_messages WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dive message not found' });
    }
    
    res.json({ message: 'Dive message deleted successfully' });
  } catch (error) {
    console.error('Delete dive message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Dive Messages - Public endpoint for random message
app.get('/api/dive-messages/random', authenticateToken, async (req, res) => {
  const { type } = req.query;
  
  try {
    let tipResult, taglineResult;
    
    if (!type || type === 'tip') {
      tipResult = await pool.query(
        `SELECT id, message_type, text FROM dive_messages 
         WHERE message_type = 'tip' AND is_active = true 
         ORDER BY RANDOM() LIMIT 1`
      );
    }
    
    if (!type || type === 'tagline') {
      taglineResult = await pool.query(
        `SELECT id, message_type, text FROM dive_messages 
         WHERE message_type = 'tagline' AND is_active = true 
         ORDER BY RANDOM() LIMIT 1`
      );
    }
    
    const response = {};
    
    if (tipResult?.rows.length > 0) {
      response.tip = {
        id: tipResult.rows[0].id,
        text: tipResult.rows[0].text
      };
    }
    
    if (taglineResult?.rows.length > 0) {
      response.tagline = {
        id: taglineResult.rows[0].id,
        text: taglineResult.rows[0].text
      };
    }
    
    res.json(response);
  } catch (error) {
    console.error('Get random dive message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Erebus API' });
});

app.get('/api/dive-computers', (req, res) => {
  res.json({
    manufacturers: diveComputerCatalog.getAllManufacturersForSelect()
  });
});

app.get('/api/dive-computers/:brandId/models', (req, res) => {
  const { brandId } = req.params;
  const models = diveComputerCatalog.getModelsForSelect(brandId);
  res.json({ models });
});

app.get('/api/dive-computers/:brandId/:modelId', (req, res) => {
  const { brandId, modelId } = req.params;
  const model = diveComputerCatalog.getModel(brandId, modelId);
  if (!model) {
    return res.status(404).json({ error: 'Dive computer model not found' });
  }
  const manufacturer = diveComputerCatalog.getManufacturer(brandId);
  res.json({
    brand: { id: manufacturer.id, name: manufacturer.name },
    model
  });
});

app.get('/api/user/dive-computer', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT dive_computer_brand, dive_computer_model FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    const brand = user.dive_computer_brand;
    const model = user.dive_computer_model;
    
    let capabilities = null;
    if (brand && model) {
      const modelInfo = diveComputerCatalog.getModel(brand, model);
      const manufacturerInfo = diveComputerCatalog.getManufacturer(brand);
      if (modelInfo && manufacturerInfo) {
        capabilities = {
          brand: { id: manufacturerInfo.id, name: manufacturerInfo.name },
          model: modelInfo
        };
      }
    }
    
    res.json({
      dive_computer_brand: brand,
      dive_computer_model: model,
      capabilities
    });
  } catch (error) {
    console.error('Get user dive computer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/user/dive-computer', authenticateToken, async (req, res) => {
  const { brand, model } = req.body;
  
  try {
    if (brand && model) {
      const modelInfo = diveComputerCatalog.getModel(brand, model);
      if (!modelInfo) {
        return res.status(400).json({ error: 'Invalid dive computer brand or model' });
      }
    }
    
    await pool.query(
      'UPDATE users SET dive_computer_brand = $1, dive_computer_model = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [brand || null, model || null, req.user.id]
    );
    
    let capabilities = null;
    if (brand && model) {
      const modelInfo = diveComputerCatalog.getModel(brand, model);
      const manufacturerInfo = diveComputerCatalog.getManufacturer(brand);
      if (modelInfo && manufacturerInfo) {
        capabilities = {
          brand: { id: manufacturerInfo.id, name: manufacturerInfo.name },
          model: modelInfo
        };
      }
    }
    
    res.json({
      message: 'Dive computer preference updated',
      dive_computer_brand: brand || null,
      dive_computer_model: model || null,
      capabilities
    });
  } catch (error) {
    console.error('Update user dive computer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/dive-computers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, brand, model, nickname, created_at FROM user_dive_computers WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );

    const computers = result.rows.map(row => {
      const modelInfo = diveComputerCatalog.getModel(row.brand, row.model);
      const manufacturerInfo = diveComputerCatalog.getManufacturer(row.brand);
      return {
        ...row,
        capabilities: modelInfo && manufacturerInfo ? {
          brand: { id: manufacturerInfo.id, name: manufacturerInfo.name },
          model: modelInfo
        } : null
      };
    });

    res.json({ computers });
  } catch (error) {
    console.error('Get user dive computers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/user/dive-computers', authenticateToken, async (req, res) => {
  const { brand, model, nickname } = req.body;

  if (!brand || !model) {
    return res.status(400).json({ error: 'Brand and model are required' });
  }

  try {
    const modelInfo = diveComputerCatalog.getModel(brand, model);
    if (!modelInfo) {
      return res.status(400).json({ error: 'Invalid dive computer brand or model' });
    }

    const existing = await pool.query(
      'SELECT id FROM user_dive_computers WHERE user_id = $1 AND brand = $2 AND model = $3',
      [req.user.id, brand, model]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This dive computer is already in your list' });
    }

    const result = await pool.query(
      'INSERT INTO user_dive_computers (user_id, brand, model, nickname) VALUES ($1, $2, $3, $4) RETURNING id, brand, model, nickname, created_at',
      [req.user.id, brand, model, nickname || null]
    );

    const row = result.rows[0];
    const manufacturerInfo = diveComputerCatalog.getManufacturer(brand);

    res.status(201).json({
      computer: {
        ...row,
        capabilities: modelInfo && manufacturerInfo ? {
          brand: { id: manufacturerInfo.id, name: manufacturerInfo.name },
          model: modelInfo
        } : null
      }
    });
  } catch (error) {
    console.error('Add user dive computer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/user/dive-computers/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM user_dive_computers WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dive computer not found' });
    }

    res.json({ message: 'Dive computer removed' });
  } catch (error) {
    console.error('Delete user dive computer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, age, sex, role, profile_image, created_at, trial_ends_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    let profileImageUrl = null;
    if (user.profile_image) {
      try {
        let storedPath = user.profile_image;
        
        // Handle /objects/... path format by converting to full storage path
        if (storedPath.startsWith('/objects/')) {
          const entityId = storedPath.slice('/objects/'.length);
          let entityDir = process.env.PRIVATE_OBJECT_DIR || '';
          if (!entityDir.endsWith('/')) entityDir = `${entityDir}/`;
          storedPath = `${entityDir}${entityId}`;
        }
        
        const { bucketName, objectName } = parseObjectPath(storedPath);
        profileImageUrl = await signObjectURL({ bucketName, objectName, method: 'GET', ttlSec: 3600 });
      } catch (err) {
        console.error('Error signing profile image URL:', err);
      }
    }
    
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      age: user.age,
      sex: user.sex,
      role: user.role,
      profileImage: profileImageUrl,
      createdAt: user.created_at,
      trialEndsAt: user.trial_ends_at
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
  const { firstName, lastName, age, sex, profileImage } = req.body;
  
  try {
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (firstName !== undefined) {
      updates.push(`first_name = $${paramIndex}`);
      params.push(firstName);
      paramIndex++;
    }
    
    if (lastName !== undefined) {
      updates.push(`last_name = $${paramIndex}`);
      params.push(lastName);
      paramIndex++;
    }
    
    if (age !== undefined) {
      if (age !== null && (age < 0 || age > 150)) {
        return res.status(400).json({ error: 'Invalid age value' });
      }
      updates.push(`age = $${paramIndex}`);
      params.push(age);
      paramIndex++;
    }
    
    if (sex !== undefined) {
      const validSexOptions = ['male', 'female', 'other', 'prefer_not_to_say', null];
      if (!validSexOptions.includes(sex)) {
        return res.status(400).json({ error: 'Invalid sex value' });
      }
      updates.push(`sex = $${paramIndex}`);
      params.push(sex);
      paramIndex++;
    }
    
    if (profileImage !== undefined) {
      updates.push(`profile_image = $${paramIndex}`);
      params.push(profileImage);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.user.id);
    
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, first_name, last_name, age, sex, role, profile_image`,
      params
    );
    
    const user = result.rows[0];
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        age: user.age,
        sex: user.sex,
        role: user.role,
        profileImage: user.profile_image
      }
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/push-tokens', authenticateToken, async (req, res) => {
  const { token, platform, deviceName } = req.body;
  
  console.log('[Push Tokens] Registration request from user:', req.user.id);
  console.log('[Push Tokens] Token:', token);
  console.log('[Push Tokens] Platform:', platform);
  console.log('[Push Tokens] Device name:', deviceName);
  
  if (!token || !platform) {
    console.log('[Push Tokens] Missing required fields');
    return res.status(400).json({ error: 'Token and platform are required' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO push_tokens (user_id, token, platform, device_name, is_active, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, token) 
       DO UPDATE SET is_active = TRUE, device_name = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [req.user.id, token, platform, deviceName || null]
    );
    
    console.log('[Push Tokens] Token registered successfully, ID:', result.rows[0]?.id);
    res.json({ message: 'Push token registered successfully' });
  } catch (error) {
    console.error('[Push Tokens] Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/push-tokens', authenticateToken, async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  try {
    await pool.query(
      'UPDATE push_tokens SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND token = $2',
      [req.user.id, token]
    );
    
    res.json({ message: 'Push token unregistered successfully' });
  } catch (error) {
    console.error('Unregister push token error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/push-tokens', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, platform, device_name, is_active, created_at, updated_at FROM push_tokens WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.id]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get push tokens error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/push-tokens/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'DELETE FROM push_tokens WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    res.json({ message: 'Device removed successfully' });
  } catch (error) {
    console.error('Delete push token by ID error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/dive-sites', authenticateToken, async (req, res) => {
  const { search, type, difficulty, water_type, country, limit = 50, offset = 0 } = req.query;
  
  try {
    let query = 'SELECT * FROM dive_sites WHERE is_archived = FALSE';
    const params = [];
    let paramCount = 0;
    
    if (search) {
      paramCount++;
      query += ` AND (LOWER(name) LIKE LOWER($${paramCount}) OR LOWER(country) LIKE LOWER($${paramCount}) OR LOWER(region) LIKE LOWER($${paramCount}))`;
      params.push(`%${search}%`);
    }
    
    if (type) {
      paramCount++;
      query += ` AND site_type = $${paramCount}`;
      params.push(type);
    }
    
    if (difficulty) {
      paramCount++;
      query += ` AND difficulty = $${paramCount}`;
      params.push(difficulty);
    }
    
    if (water_type) {
      paramCount++;
      query += ` AND water_type = $${paramCount}`;
      params.push(water_type);
    }
    
    if (country) {
      paramCount++;
      query += ` AND country = $${paramCount}`;
      params.push(country);
    }
    
    query += ' ORDER BY name ASC';
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(parseInt(offset));
    
    const result = await pool.query(query, params);
    
    const countQuery = 'SELECT COUNT(*) FROM dive_sites WHERE is_archived = FALSE';
    const countResult = await pool.query(countQuery);
    
    const siteIds = result.rows.map(s => s.id);
    let primaryImages = {};
    if (siteIds.length > 0) {
      const imagesResult = await pool.query(
        'SELECT dive_site_id, image_url FROM dive_site_images WHERE dive_site_id = ANY($1) AND is_primary = TRUE',
        [siteIds]
      );
      imagesResult.rows.forEach(img => {
        primaryImages[img.dive_site_id] = img.image_url;
      });
    }
    
    res.json({
      sites: result.rows.map(site => {
        let displayImageUrl = primaryImages[site.id] || site.image_url;
        if (displayImageUrl && displayImageUrl.startsWith('/objects/')) {
          displayImageUrl = displayImageUrl;
        }
        return {
          id: site.id,
          name: site.name,
          description: site.description,
          siteType: site.site_type,
          latitude: parseFloat(site.latitude) || null,
          longitude: parseFloat(site.longitude) || null,
          country: site.country,
          region: site.region,
          waterType: site.water_type,
          depthMax: parseFloat(site.depth_max) || null,
          visibilityMin: parseFloat(site.visibility_min) || null,
          visibilityMax: parseFloat(site.visibility_max) || null,
          currentStrength: site.current_strength,
          accessNotes: site.access_notes,
          facilities: site.facilities || [],
          hazards: site.hazards || [],
          bestSeason: site.best_season,
          ratingAvg: parseFloat(site.rating_avg) || 0,
          ratingsCount: site.ratings_count || 0,
          wikipediaUrl: site.wikipedia_url,
          externalInfo: site.external_info,
          imageUrl: displayImageUrl,
          isWreck: site.is_wreck || false,
          createdAt: site.created_at,
          updatedAt: site.updated_at
        };
      }),
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get dive sites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/dive-sites/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('SELECT * FROM dive_sites WHERE id = $1 AND is_archived = FALSE', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dive site not found' });
    }
    
    const site = result.rows[0];
    
    const imagesResult = await pool.query(
      'SELECT * FROM dive_site_images WHERE dive_site_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [id]
    );
    
    res.json({
      id: site.id,
      name: site.name,
      description: site.description,
      siteType: site.site_type,
      latitude: parseFloat(site.latitude) || null,
      longitude: parseFloat(site.longitude) || null,
      country: site.country,
      region: site.region,
      waterType: site.water_type,
      depthMax: parseFloat(site.depth_max) || null,
      visibilityMin: parseFloat(site.visibility_min) || null,
      visibilityMax: parseFloat(site.visibility_max) || null,
      currentStrength: site.current_strength,
      accessNotes: site.access_notes,
      facilities: site.facilities || [],
      hazards: site.hazards || [],
      bestSeason: site.best_season,
      ratingAvg: parseFloat(site.rating_avg) || 0,
      ratingsCount: site.ratings_count || 0,
      wikipediaUrl: site.wikipedia_url,
      externalInfo: site.external_info,
      imageUrl: site.image_url,
      isWreck: site.is_wreck || false,
      wreckName: site.wreck_name || null,
      wreckUrl: site.wreck_url || null,
      wreckInfo: site.wreck_info || null,
      images: imagesResult.rows.map(img => ({
        id: img.id,
        imageUrl: img.image_url,
        caption: img.caption,
        isPrimary: img.is_primary
      })),
      createdAt: site.created_at,
      updatedAt: site.updated_at
    });
  } catch (error) {
    console.error('Get dive site error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/dive-sites', authenticateToken, async (req, res) => {
  const {
    name, description, siteType, latitude, longitude, country, region,
    waterType, depthMax, visibilityMin, visibilityMax,
    difficulty, currentStrength, accessNotes, facilities, hazards,
    bestSeason, wikipediaUrl, externalInfo, imageUrl, isWreck, wreckName, wreckUrl, wreckInfo
  } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO dive_sites (
        user_id, name, description, site_type, latitude, longitude,
        country, region, water_type, depth_max,
        visibility_min, visibility_max, difficulty, current_strength,
        access_notes, facilities, hazards, best_season,
        wikipedia_url, external_info, image_url, is_wreck, wreck_name, wreck_url, wreck_info
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *`,
      [
        req.user.id, name, description || null, siteType || 'reef',
        latitude || null, longitude || null, country || null, region || null,
        waterType || 'marine', depthMax || null,
        visibilityMin || null, visibilityMax || null, difficulty || 'intermediate',
        currentStrength || null, accessNotes || null,
        JSON.stringify(facilities || []), JSON.stringify(hazards || []),
        bestSeason || null, wikipediaUrl || null, externalInfo || null, imageUrl || null,
        isWreck || false, wreckName || null, wreckUrl || null, wreckInfo || null
      ]
    );
    
    const site = result.rows[0];
    res.status(201).json({
      id: site.id,
      name: site.name,
      description: site.description,
      siteType: site.site_type,
      latitude: parseFloat(site.latitude) || null,
      longitude: parseFloat(site.longitude) || null,
      country: site.country,
      region: site.region,
      waterType: site.water_type,
      depthMax: parseFloat(site.depth_max) || null,
      imageUrl: site.image_url,
      isWreck: site.is_wreck || false,
      createdAt: site.created_at
    });
  } catch (error) {
    console.error('Create dive site error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/dive-sites/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    name, description, siteType, latitude, longitude, country, region,
    waterType, depthMax, visibilityMin, visibilityMax,
    difficulty, currentStrength, accessNotes, facilities, hazards,
    bestSeason, wikipediaUrl, externalInfo, imageUrl, ratingAvg,
    isWreck, wreckName, wreckUrl, wreckInfo
  } = req.body;
  
  try {
    const existingCheck = await pool.query('SELECT id FROM dive_sites WHERE id = $1 AND is_archived = FALSE', [id]);
    if (existingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dive site not found' });
    }
    
    const result = await pool.query(
      `UPDATE dive_sites SET
        name = COALESCE($1, name),
        description = $2,
        site_type = COALESCE($3, site_type),
        latitude = $4,
        longitude = $5,
        country = $6,
        region = $7,
        water_type = COALESCE($8, water_type),
        depth_max = $9,
        visibility_min = $10,
        visibility_max = $11,
        difficulty = COALESCE($12, difficulty),
        current_strength = $13,
        access_notes = $14,
        facilities = $15,
        hazards = $16,
        best_season = $17,
        wikipedia_url = $18,
        external_info = $19,
        image_url = $20,
        rating_avg = COALESCE($21, rating_avg),
        is_wreck = $22,
        wreck_name = $23,
        wreck_url = $24,
        wreck_info = $25,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $26 RETURNING *`,
      [
        name, description, siteType, latitude, longitude, country, region,
        waterType, depthMax, visibilityMin, visibilityMax,
        difficulty, currentStrength, accessNotes,
        JSON.stringify(facilities || []), JSON.stringify(hazards || []),
        bestSeason, wikipediaUrl, externalInfo, imageUrl, ratingAvg,
        isWreck !== undefined ? isWreck : false, wreckName || null, wreckUrl || null, wreckInfo || null, id
      ]
    );
    
    const site = result.rows[0];
    res.json({
      id: site.id,
      name: site.name,
      description: site.description,
      siteType: site.site_type,
      latitude: parseFloat(site.latitude) || null,
      longitude: parseFloat(site.longitude) || null,
      country: site.country,
      region: site.region,
      waterType: site.water_type,
      depthMax: parseFloat(site.depth_max) || null,
      visibilityMin: parseFloat(site.visibility_min) || null,
      visibilityMax: parseFloat(site.visibility_max) || null,
      currentStrength: site.current_strength,
      accessNotes: site.access_notes,
      facilities: site.facilities || [],
      hazards: site.hazards || [],
      bestSeason: site.best_season,
      ratingAvg: parseFloat(site.rating_avg) || 0,
      ratingsCount: parseInt(site.ratings_count) || 0,
      wikipediaUrl: site.wikipedia_url,
      externalInfo: site.external_info,
      imageUrl: site.image_url,
      isWreck: site.is_wreck || false,
      wreckName: site.wreck_name || null,
      wreckUrl: site.wreck_url || null,
      wreckInfo: site.wreck_info || null,
      updatedAt: site.updated_at
    });
  } catch (error) {
    console.error('Update dive site error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/dive-sites/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'UPDATE dive_sites SET is_archived = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dive site not found' });
    }
    
    res.json({ message: 'Dive site archived successfully' });
  } catch (error) {
    console.error('Delete dive site error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/dive-sites/:id/weather', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { date } = req.query;
  
  try {
    const siteResult = await pool.query('SELECT latitude, longitude, water_type FROM dive_sites WHERE id = $1', [id]);
    
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dive site not found' });
    }
    
    const site = siteResult.rows[0];
    
    if (!site.latitude || !site.longitude) {
      return res.status(400).json({ error: 'Dive site has no coordinates' });
    }
    
    const lat = site.latitude;
    const lon = site.longitude;
    const isMarine = site.water_type === 'marine';
    
    const weatherData = {};
    
    const today = new Date().toISOString().split('T')[0];
    const requestedDate = date || today;
    const isToday = requestedDate === today;
    
    if (isToday) {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`;
      const weatherResponse = await fetch(weatherUrl);
      if (weatherResponse.ok) {
        const data = await weatherResponse.json();
        weatherData.temperature = data.current?.temperature_2m;
        weatherData.temperatureUnit = data.current_units?.temperature_2m;
        weatherData.humidity = data.current?.relative_humidity_2m;
        weatherData.precipitation = data.current?.precipitation;
        weatherData.weatherCode = data.current?.weather_code;
        weatherData.windSpeed = data.current?.wind_speed_10m;
        weatherData.windSpeedUnit = data.current_units?.wind_speed_10m;
        weatherData.windDirection = data.current?.wind_direction_10m;
      }
      
      if (isMarine) {
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction&timezone=auto`;
        const marineResponse = await fetch(marineUrl);
        if (marineResponse.ok) {
          const data = await marineResponse.json();
          weatherData.waveHeight = data.current?.wave_height;
          weatherData.waveHeightUnit = data.current_units?.wave_height;
          weatherData.waveDirection = data.current?.wave_direction;
          weatherData.wavePeriod = data.current?.wave_period;
          weatherData.wavePeriodUnit = data.current_units?.wave_period;
          weatherData.currentVelocity = data.current?.ocean_current_velocity;
          weatherData.currentVelocityUnit = data.current_units?.ocean_current_velocity;
          weatherData.currentDirection = data.current?.ocean_current_direction;
        }
      }
    } else {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max,wind_direction_10m_dominant&start_date=${requestedDate}&end_date=${requestedDate}&timezone=auto`;
      const weatherResponse = await fetch(weatherUrl);
      if (weatherResponse.ok) {
        const data = await weatherResponse.json();
        if (data.daily) {
          weatherData.temperatureMax = data.daily.temperature_2m_max?.[0];
          weatherData.temperatureMin = data.daily.temperature_2m_min?.[0];
          weatherData.temperatureUnit = data.daily_units?.temperature_2m_max;
          weatherData.precipitation = data.daily.precipitation_sum?.[0];
          weatherData.weatherCode = data.daily.weather_code?.[0];
          weatherData.windSpeed = data.daily.wind_speed_10m_max?.[0];
          weatherData.windSpeedUnit = data.daily_units?.wind_speed_10m_max;
          weatherData.windDirection = data.daily.wind_direction_10m_dominant?.[0];
        }
      }
      
      if (isMarine) {
        const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max,wave_direction_dominant,wave_period_max&start_date=${requestedDate}&end_date=${requestedDate}&timezone=auto`;
        const marineResponse = await fetch(marineUrl);
        if (marineResponse.ok) {
          const data = await marineResponse.json();
          if (data.daily) {
            weatherData.waveHeight = data.daily.wave_height_max?.[0];
            weatherData.waveHeightUnit = data.daily_units?.wave_height_max;
            weatherData.waveDirection = data.daily.wave_direction_dominant?.[0];
            weatherData.wavePeriod = data.daily.wave_period_max?.[0];
            weatherData.wavePeriodUnit = data.daily_units?.wave_period_max;
          }
        }
      }
    }
    
    weatherData.isMarine = isMarine;
    weatherData.isToday = isToday;
    weatherData.forecastDate = requestedDate;
    weatherData.fetchedAt = new Date().toISOString();
    
    if (isMarine && process.env.STORMGLASS_API_KEY) {
      try {
        const startDate = new Date(requestedDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(requestedDate);
        endDate.setHours(23, 59, 59, 999);
        
        const tideUrl = `https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lon}&start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
        const tideResponse = await fetch(tideUrl, {
          headers: {
            'Authorization': process.env.STORMGLASS_API_KEY
          }
        });
        
        if (tideResponse.ok) {
          const tideData = await tideResponse.json();
          if (tideData.data && tideData.data.length > 0) {
            weatherData.tides = tideData.data.map(tide => ({
              time: tide.time,
              height: tide.height,
              type: tide.type
            }));
          }
        }
      } catch (tideError) {
        console.error('Tide fetch error:', tideError.message);
      }
    }
    
    res.json(weatherData);
  } catch (error) {
    console.error('Weather fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

app.get('/api/dive-sites/:id/wikipedia', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const siteResult = await pool.query('SELECT wikipedia_url, name FROM dive_sites WHERE id = $1', [id]);
    
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dive site not found' });
    }
    
    const site = siteResult.rows[0];
    
    if (!site.wikipedia_url) {
      const searchTerm = encodeURIComponent(site.name + ' shipwreck');
      const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${searchTerm}`;
      
      try {
        const response = await fetch(searchUrl);
        if (response.ok) {
          const data = await response.json();
          return res.json({
            title: data.title,
            extract: data.extract,
            thumbnail: data.thumbnail?.source,
            url: data.content_urls?.desktop?.page
          });
        }
      } catch (e) {
        console.log('Wikipedia search failed:', e.message);
      }
      
      return res.json({ message: 'No Wikipedia information found' });
    }
    
    const wikiTitle = site.wikipedia_url.split('/wiki/').pop();
    const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`;
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return res.json({ message: 'Could not fetch Wikipedia information' });
    }
    
    const data = await response.json();
    res.json({
      title: data.title,
      extract: data.extract,
      thumbnail: data.thumbnail?.source,
      url: data.content_urls?.desktop?.page
    });
  } catch (error) {
    console.error('Wikipedia fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/site-types', authenticateToken, (req, res) => {
  res.json([
    { value: 'reef', label: 'Reef' },
    { value: 'wreck', label: 'Wreck' },
    { value: 'cave', label: 'Cave' },
    { value: 'wall', label: 'Wall' },
    { value: 'drift', label: 'Drift' },
    { value: 'shore', label: 'Shore' },
    { value: 'quarry', label: 'Quarry' },
    { value: 'lake', label: 'Lake' },
    { value: 'river', label: 'River' },
    { value: 'cenote', label: 'Cenote' },
    { value: 'artificial', label: 'Artificial Reef' },
    { value: 'other', label: 'Other' }
  ]);
});

app.get('/api/difficulties', authenticateToken, (req, res) => {
  res.json([
    { value: 'beginner', label: 'Beginner' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'advanced', label: 'Advanced' },
    { value: 'technical', label: 'Technical' }
  ]);
});

const { Storage } = require('@google-cloud/storage');

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';

const objectStorageClient = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: 'external_account',
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: 'json',
        subject_token_field_name: 'access_token',
      },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

function parseObjectPath(path) {
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  const pathParts = path.split('/');
  if (pathParts.length < 3) {
    throw new Error('Invalid path: must contain at least a bucket name');
  }
  return {
    bucketName: pathParts[1],
    objectName: pathParts.slice(2).join('/'),
  };
}

async function signObjectURL({ bucketName, objectName, method, ttlSec }) {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to sign object URL: ${response.status}`);
  }
  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

async function getUploadURL() {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR || '';
  if (!privateObjectDir) {
    throw new Error('PRIVATE_OBJECT_DIR not set');
  }
  const objectId = crypto.randomUUID();
  const fullPath = `${privateObjectDir}/uploads/${objectId}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return signObjectURL({ bucketName, objectName, method: 'PUT', ttlSec: 900 });
}

function normalizeObjectPath(rawPath) {
  if (!rawPath.startsWith('https://storage.googleapis.com/')) {
    return rawPath;
  }
  const url = new URL(rawPath);
  const rawObjectPath = url.pathname;
  let objectEntityDir = process.env.PRIVATE_OBJECT_DIR || '';
  if (!objectEntityDir.endsWith('/')) {
    objectEntityDir = `${objectEntityDir}/`;
  }
  if (!rawObjectPath.startsWith(objectEntityDir)) {
    return rawObjectPath;
  }
  const entityId = rawObjectPath.slice(objectEntityDir.length);
  return `/objects/${entityId}`;
}

app.post('/api/uploads/request-url', authenticateToken, async (req, res) => {
  try {
    const { name, size, contentType } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }
    const uploadURL = await getUploadURL();
    const objectPath = normalizeObjectPath(uploadURL);
    res.json({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType },
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Get a URL for accessing an uploaded object
app.get('/api/objects/url', authenticateToken, async (req, res) => {
  try {
    const { path: objectPath } = req.query;
    if (!objectPath) {
      return res.status(400).json({ error: 'Missing required parameter: path' });
    }
    // Return the relative path - frontend will prepend API URL
    res.json({ url: objectPath });
  } catch (error) {
    console.error('Error getting object URL:', error);
    res.status(500).json({ error: 'Failed to get object URL' });
  }
});

app.get(/^\/objects\/(.+)$/, async (req, res) => {
  try {
    const objectPath = req.path;
    const parts = objectPath.slice(1).split('/');
    if (parts.length < 2) {
      return res.status(404).json({ error: 'Object not found' });
    }
    const entityId = parts.slice(1).join('/');
    let entityDir = process.env.PRIVATE_OBJECT_DIR || '';
    if (!entityDir.endsWith('/')) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'Object not found' });
    }
    const [metadata] = await file.getMetadata();
    res.set({
      'Content-Type': metadata.contentType || 'application/octet-stream',
      'Content-Length': metadata.size,
      'Cache-Control': 'public, max-age=3600',
    });
    const stream = file.createReadStream();
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
    });
    stream.pipe(res);
  } catch (error) {
    console.error('Error serving object:', error);
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

app.get('/api/dive-sites/:id/images', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM dive_site_images WHERE dive_site_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [id]
    );
    res.json(result.rows.map(img => ({
      id: img.id,
      diveSiteId: img.dive_site_id,
      imageUrl: img.image_url,
      caption: img.caption,
      isPrimary: img.is_primary,
      isStock: img.is_stock || false,
      attribution: img.attribution,
      createdAt: img.created_at
    })));
  } catch (error) {
    console.error('Get dive site images error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

async function canModifyDiveSite(siteId, userId, userRole) {
  if (userRole === 'admin') return true;
  const result = await pool.query('SELECT user_id FROM dive_sites WHERE id = $1 AND is_archived = FALSE', [siteId]);
  if (result.rows.length === 0) return false;
  return result.rows[0].user_id === userId;
}

app.post('/api/dive-sites/:id/images', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { imageUrl, caption, isPrimary, isStock, attribution } = req.body;
  
  if (!imageUrl) {
    return res.status(400).json({ error: 'Image URL is required' });
  }
  
  try {
    const siteCheck = await pool.query('SELECT id, user_id FROM dive_sites WHERE id = $1 AND is_archived = FALSE', [id]);
    if (siteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dive site not found' });
    }
    
    const canModify = await canModifyDiveSite(id, req.user.id, req.user.role);
    if (!canModify) {
      return res.status(403).json({ error: 'You do not have permission to modify this dive site' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check if this will be the first image for the dive site
      const existingImages = await client.query(
        'SELECT COUNT(*) as count FROM dive_site_images WHERE dive_site_id = $1',
        [id]
      );
      const isFirstImage = parseInt(existingImages.rows[0].count) === 0;
      
      // Auto-set as primary if it's the first image OR if explicitly requested
      const shouldBePrimary = isPrimary || isFirstImage;
      
      if (shouldBePrimary) {
        await client.query('UPDATE dive_site_images SET is_primary = FALSE WHERE dive_site_id = $1', [id]);
      }
      
      const result = await client.query(
        'INSERT INTO dive_site_images (dive_site_id, image_url, caption, is_primary, is_stock, attribution) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [id, imageUrl, caption || null, shouldBePrimary, isStock || false, attribution || null]
      );
      
      await client.query('COMMIT');
      
      const img = result.rows[0];
      res.status(201).json({
        id: img.id,
        diveSiteId: img.dive_site_id,
        imageUrl: img.image_url,
        caption: img.caption,
        isPrimary: img.is_primary,
        isStock: img.is_stock || false,
        attribution: img.attribution,
        createdAt: img.created_at
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Add dive site image error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/dive-sites/:id/images/import-url', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { imageUrl, caption, isPrimary } = req.body;
  
  if (!imageUrl) {
    return res.status(400).json({ error: 'Image URL is required' });
  }
  
  try {
    const siteCheck = await pool.query('SELECT id, user_id FROM dive_sites WHERE id = $1 AND is_archived = FALSE', [id]);
    if (siteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dive site not found' });
    }
    
    const canModify = await canModifyDiveSite(id, req.user.id, req.user.role);
    if (!canModify) {
      return res.status(403).json({ error: 'You do not have permission to modify this dive site' });
    }
    
    const fetch = (await import('node-fetch')).default;
    
    // Parse URL to get origin for Referer header
    let urlOrigin;
    try {
      const parsedUrl = new URL(imageUrl);
      urlOrigin = parsedUrl.origin;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    // Follow redirects and handle various URL types with browser-like headers
    const response = await fetch(imageUrl, {
      timeout: 30000,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': urlOrigin,
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
      }
    });
    
    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        return res.status(400).json({ 
          error: 'This website blocks image downloads from apps. Please download the image to your device first, then use the Upload button.',
          code: 'HOTLINK_BLOCKED'
        });
      }
      return res.status(400).json({ error: `Failed to fetch image from URL (HTTP ${response.status})` });
    }
    
    const contentType = response.headers.get('content-type') || '';
    const isImage = contentType.startsWith('image/') || 
                   contentType.includes('jpeg') || 
                   contentType.includes('png') || 
                   contentType.includes('gif') || 
                   contentType.includes('webp');
    
    if (!isImage) {
      // Try to detect image from first bytes (magic numbers)
      const buffer = await response.buffer();
      const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
      const isGif = buffer[0] === 0x47 && buffer[1] === 0x49;
      const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49;
      
      if (!isJpeg && !isPng && !isGif && !isWebp) {
        return res.status(400).json({ error: 'URL does not point to a valid image. Try using a direct image link (right-click image → Copy image address)' });
      }
      
      // Continue with detected image
      const detectedType = isJpeg ? 'jpeg' : isPng ? 'png' : isGif ? 'gif' : 'webp';
      const ext = detectedType;
      const filename = `dive-site-${id}-${Date.now()}.${ext}`;
      const objectPath = `/objects/dive-sites/${filename}`;
      
      const { Client } = await import('@replit/object-storage');
      const storageClient = new Client();
      await storageClient.uploadFromBuffer(objectPath, buffer, { contentType: `image/${detectedType}` });
      
      const client2 = await pool.connect();
      try {
        await client2.query('BEGIN');
        
        // Check if this will be the first image for the dive site
        const existingImages = await client2.query(
          'SELECT COUNT(*) as count FROM dive_site_images WHERE dive_site_id = $1',
          [id]
        );
        const isFirstImage = parseInt(existingImages.rows[0].count) === 0;
        const shouldBePrimary = isPrimary || isFirstImage;
        
        if (shouldBePrimary) {
          await client2.query('UPDATE dive_site_images SET is_primary = FALSE WHERE dive_site_id = $1', [id]);
        }
        
        const result = await client2.query(
          'INSERT INTO dive_site_images (dive_site_id, image_url, caption, is_primary, is_stock, attribution) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [id, objectPath, caption || null, shouldBePrimary, false, `Imported from: ${new URL(imageUrl).hostname}`]
        );
        
        await client2.query('COMMIT');
        
        const img = result.rows[0];
        return res.status(201).json({
          id: img.id,
          diveSiteId: img.dive_site_id,
          imageUrl: img.image_url,
          caption: img.caption,
          isPrimary: img.is_primary,
          isStock: false,
          attribution: img.attribution,
          createdAt: img.created_at
        });
      } catch (err) {
        await client2.query('ROLLBACK');
        throw err;
      } finally {
        client2.release();
      }
    }
    
    const imageBuffer = await response.buffer();
    
    if (imageBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image is too large (max 10MB)' });
    }
    
    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    const filename = `dive-site-${id}-${Date.now()}.${ext}`;
    const objectPath = `/objects/dive-sites/${filename}`;
    
    const { Client } = await import('@replit/object-storage');
    const client = new Client();
    await client.uploadFromBuffer(objectPath, imageBuffer, { contentType });
    
    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      
      // Check if this will be the first image for the dive site
      const existingImages = await client2.query(
        'SELECT COUNT(*) as count FROM dive_site_images WHERE dive_site_id = $1',
        [id]
      );
      const isFirstImage = parseInt(existingImages.rows[0].count) === 0;
      const shouldBePrimary = isPrimary || isFirstImage;
      
      if (shouldBePrimary) {
        await client2.query('UPDATE dive_site_images SET is_primary = FALSE WHERE dive_site_id = $1', [id]);
      }
      
      const result = await client2.query(
        'INSERT INTO dive_site_images (dive_site_id, image_url, caption, is_primary, is_stock, attribution) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [id, objectPath, caption || null, shouldBePrimary, false, `Imported from: ${new URL(imageUrl).hostname}`]
      );
      
      await client2.query('COMMIT');
      
      const img = result.rows[0];
      res.status(201).json({
        id: img.id,
        diveSiteId: img.dive_site_id,
        imageUrl: img.image_url,
        caption: img.caption,
        isPrimary: img.is_primary,
        isStock: false,
        attribution: img.attribution,
        createdAt: img.created_at
      });
    } catch (err) {
      await client2.query('ROLLBACK');
      throw err;
    } finally {
      client2.release();
    }
  } catch (error) {
    console.error('Import image from URL error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.put('/api/dive-sites/:siteId/images/:imageId', authenticateToken, async (req, res) => {
  const { siteId, imageId } = req.params;
  const { caption, isPrimary } = req.body;
  
  try {
    const canModify = await canModifyDiveSite(siteId, req.user.id, req.user.role);
    if (!canModify) {
      return res.status(403).json({ error: 'You do not have permission to modify this dive site' });
    }
    
    const imageCheck = await pool.query(
      'SELECT id FROM dive_site_images WHERE id = $1 AND dive_site_id = $2',
      [imageId, siteId]
    );
    if (imageCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      if (isPrimary) {
        await client.query('UPDATE dive_site_images SET is_primary = FALSE WHERE dive_site_id = $1', [siteId]);
      }
      
      const result = await client.query(
        'UPDATE dive_site_images SET caption = COALESCE($1, caption), is_primary = COALESCE($2, is_primary) WHERE id = $3 RETURNING *',
        [caption, isPrimary, imageId]
      );
      
      await client.query('COMMIT');
      
      const img = result.rows[0];
      res.json({
        id: img.id,
        diveSiteId: img.dive_site_id,
        imageUrl: img.image_url,
        caption: img.caption,
        isPrimary: img.is_primary,
        isStock: img.is_stock || false,
        attribution: img.attribution,
        createdAt: img.created_at
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update dive site image error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/dive-sites/:siteId/images/:imageId', authenticateToken, async (req, res) => {
  const { siteId, imageId } = req.params;
  
  try {
    const canModify = await canModifyDiveSite(siteId, req.user.id, req.user.role);
    if (!canModify) {
      return res.status(403).json({ error: 'You do not have permission to modify this dive site' });
    }
    
    const result = await pool.query(
      'DELETE FROM dive_site_images WHERE id = $1 AND dive_site_id = $2 RETURNING id',
      [imageId, siteId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete dive site image error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/stock-photos/search', authenticateToken, async (req, res) => {
  const { query, page = 1, perPage = 15 } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }
  
  const pexelsApiKey = process.env.PEXELS_API_KEY;
  if (!pexelsApiKey) {
    return res.status(503).json({ error: 'Stock photo service not configured' });
  }
  
  try {
    const searchUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`;
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': pexelsApiKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    res.json({
      photos: data.photos.map(photo => ({
        id: photo.id,
        width: photo.width,
        height: photo.height,
        url: photo.url,
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
        src: {
          original: photo.src.original,
          large: photo.src.large,
          medium: photo.src.medium,
          small: photo.src.small,
          thumbnail: photo.src.tiny
        },
        alt: photo.alt
      })),
      page: data.page,
      perPage: data.per_page,
      totalResults: data.total_results,
      nextPage: data.next_page ? page + 1 : null
    });
  } catch (error) {
    console.error('Pexels search error:', error);
    res.status(500).json({ error: 'Failed to search stock photos' });
  }
});

// ===== DIVE PHOTOS ENDPOINTS =====

// Get all photos for the current user
app.get('/api/photos', authenticateToken, async (req, res) => {
  const { page = 1, limit = 50, diveLogId, favorites } = req.query;
  const offset = (page - 1) * limit;
  
  try {
    let query = `
      SELECT p.*, dl.dive_number, dl.dive_datetime, ds.name as dive_site_name, dt.name as trip_name
      FROM dive_photos p
      LEFT JOIN dive_logs dl ON p.dive_log_id = dl.id
      LEFT JOIN dive_sites ds ON dl.dive_site_id = ds.id
      LEFT JOIN dive_trips dt ON p.trip_id = dt.id
      WHERE p.user_id = $1 AND p.deleted_at IS NULL
    `;
    const params = [req.user.id];
    let paramIndex = 2;
    
    if (diveLogId) {
      query += ` AND p.dive_log_id = $${paramIndex}`;
      params.push(diveLogId);
      paramIndex++;
    }
    
    if (favorites === 'true') {
      query += ` AND p.is_favorite = TRUE`;
    }
    
    query += ` ORDER BY COALESCE(p.taken_at, p.created_at) DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `SELECT COUNT(*) FROM dive_photos WHERE user_id = $1 AND deleted_at IS NULL`;
    const countResult = await pool.query(countQuery, [req.user.id]);
    
    res.json({
      photos: result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        diveLogId: row.dive_log_id,
        diveNumber: row.dive_number,
        diveDate: row.dive_datetime,
        diveSiteName: row.dive_site_name,
        tripId: row.trip_id,
        tripName: row.trip_name,
        imageUrl: row.image_url,
        thumbnailUrl: row.thumbnail_url,
        caption: row.caption,
        takenAt: row.taken_at,
        locationLat: row.location_lat,
        locationLng: row.location_lng,
        width: row.width,
        height: row.height,
        fileSize: row.file_size,
        mediaType: row.media_type || 'image',
        duration: row.duration,
        isFavorite: row.is_favorite,
        blurhash: row.blurhash,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('Get photos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single photo
app.get('/api/photos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT p.*, dl.dive_number, dl.dive_datetime, ds.name as dive_site_name, dt.name as trip_name
      FROM dive_photos p
      LEFT JOIN dive_logs dl ON p.dive_log_id = dl.id
      LEFT JOIN dive_sites ds ON dl.dive_site_id = ds.id
      LEFT JOIN dive_trips dt ON p.trip_id = dt.id
      WHERE p.id = $1 AND p.user_id = $2 AND p.deleted_at IS NULL
    `, [id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      userId: row.user_id,
      diveLogId: row.dive_log_id,
      tripId: row.trip_id,
      diveNumber: row.dive_number,
      diveDate: row.dive_datetime,
      diveSiteName: row.dive_site_name,
      tripName: row.trip_name,
      imageUrl: row.image_url,
      thumbnailUrl: row.thumbnail_url,
      caption: row.caption,
      takenAt: row.taken_at,
      locationLat: row.location_lat,
      locationLng: row.location_lng,
      width: row.width,
      height: row.height,
      fileSize: row.file_size,
      mediaType: row.media_type || 'image',
      duration: row.duration,
      isFavorite: row.is_favorite,
      blurhash: row.blurhash,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Get photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new photo/video
app.post('/api/photos', authenticateToken, async (req, res) => {
  const { imageUrl, thumbnailUrl, caption, takenAt, diveLogId, locationLat, locationLng, width, height, fileSize, mediaType, duration } = req.body;
  
  if (!imageUrl) {
    return res.status(400).json({ error: 'Media URL is required' });
  }
  
  try {
    // Verify dive log belongs to user if provided
    if (diveLogId) {
      const diveCheck = await pool.query('SELECT id FROM dive_logs WHERE id = $1 AND user_id = $2', [diveLogId, req.user.id]);
      if (diveCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Dive log not found or access denied' });
      }
    }

    const blurhash = (mediaType !== 'video') ? await generateBlurhashFromUrl(imageUrl) : null;
    
    const result = await pool.query(`
      INSERT INTO dive_photos (user_id, dive_log_id, image_url, thumbnail_url, caption, taken_at, location_lat, location_lng, width, height, file_size, media_type, duration, blurhash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [req.user.id, diveLogId || null, imageUrl, thumbnailUrl || null, caption || null, takenAt || null, locationLat || null, locationLng || null, width || null, height || null, fileSize || null, mediaType || 'image', duration || null, blurhash || null]);
    
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      userId: row.user_id,
      diveLogId: row.dive_log_id,
      imageUrl: row.image_url,
      thumbnailUrl: row.thumbnail_url,
      caption: row.caption,
      takenAt: row.taken_at,
      locationLat: row.location_lat,
      locationLng: row.location_lng,
      width: row.width,
      height: row.height,
      fileSize: row.file_size,
      mediaType: row.media_type,
      duration: row.duration,
      isFavorite: row.is_favorite,
      blurhash: row.blurhash,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Create photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update photo
app.put('/api/photos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { caption, diveLogId, tripId, isFavorite, takenAt } = req.body;
  
  try {
    // Verify photo belongs to user
    const photoCheck = await pool.query('SELECT id FROM dive_photos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, req.user.id]);
    if (photoCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    // Verify dive log belongs to user if provided
    if (diveLogId !== undefined && diveLogId !== null) {
      const diveCheck = await pool.query('SELECT id FROM dive_logs WHERE id = $1 AND user_id = $2', [diveLogId, req.user.id]);
      if (diveCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Dive log not found or access denied' });
      }
    }
    
    // Verify trip belongs to user if provided
    if (tripId !== undefined && tripId !== null) {
      const tripCheck = await pool.query('SELECT id FROM dive_trips WHERE id = $1 AND user_id = $2', [tripId, req.user.id]);
      if (tripCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Dive trip not found or access denied' });
      }
    }
    
    const result = await pool.query(`
      UPDATE dive_photos SET
        caption = COALESCE($1, caption),
        dive_log_id = $2,
        is_favorite = COALESCE($3, is_favorite),
        taken_at = COALESCE($4, taken_at),
        trip_id = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND user_id = $7
      RETURNING *
    `, [caption, diveLogId, isFavorite, takenAt, tripId, id, req.user.id]);
    
    const row = result.rows[0];
    res.json({
      id: row.id,
      userId: row.user_id,
      diveLogId: row.dive_log_id,
      tripId: row.trip_id,
      imageUrl: row.image_url,
      thumbnailUrl: row.thumbnail_url,
      caption: row.caption,
      takenAt: row.taken_at,
      locationLat: row.location_lat,
      locationLng: row.location_lng,
      width: row.width,
      height: row.height,
      fileSize: row.file_size,
      isFavorite: row.is_favorite,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Update photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete photo (soft delete)
app.delete('/api/photos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'UPDATE dive_photos SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id',
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    res.json({ message: 'Photo deleted successfully' });
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Batch delete photos
app.post('/api/photos/batch-delete', authenticateToken, async (req, res) => {
  const { photoIds } = req.body;
  
  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return res.status(400).json({ error: 'Photo IDs array is required' });
  }
  
  try {
    const result = await pool.query(
      'UPDATE dive_photos SET deleted_at = CURRENT_TIMESTAMP WHERE id = ANY($1) AND user_id = $2 AND deleted_at IS NULL RETURNING id',
      [photoIds, req.user.id]
    );
    
    res.json({ deletedCount: result.rows.length });
  } catch (error) {
    console.error('Batch delete photos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle favorite
app.post('/api/photos/:id/favorite', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'UPDATE dive_photos SET is_favorite = NOT is_favorite, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING is_favorite',
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    res.json({ isFavorite: result.rows[0].is_favorite });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Link photo to dive log
app.post('/api/photos/:id/link-dive', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { diveLogId } = req.body;
  
  try {
    // Verify photo belongs to user
    const photoCheck = await pool.query('SELECT id FROM dive_photos WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, req.user.id]);
    if (photoCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    // Verify dive log belongs to user if linking
    if (diveLogId) {
      const diveCheck = await pool.query('SELECT id FROM dive_logs WHERE id = $1 AND user_id = $2', [diveLogId, req.user.id]);
      if (diveCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Dive log not found or access denied' });
      }
    }
    
    const result = await pool.query(
      'UPDATE dive_photos SET dive_log_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING dive_log_id',
      [diveLogId || null, id]
    );
    
    res.json({ diveLogId: result.rows[0].dive_log_id });
  } catch (error) {
    console.error('Link dive error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get photos for a specific dive log
app.get('/api/dive-logs/:id/photos', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Verify dive log belongs to user
    const diveCheck = await pool.query('SELECT id FROM dive_logs WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (diveCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dive log not found' });
    }
    
    const result = await pool.query(`
      SELECT * FROM dive_photos
      WHERE dive_log_id = $1 AND user_id = $2 AND deleted_at IS NULL
      ORDER BY COALESCE(taken_at, created_at) ASC
    `, [id, req.user.id]);
    
    res.json({
      photos: result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        diveLogId: row.dive_log_id,
        imageUrl: row.image_url,
        thumbnailUrl: row.thumbnail_url,
        caption: row.caption,
        takenAt: row.taken_at,
        isFavorite: row.is_favorite,
        blurhash: row.blurhash,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error('Get dive log photos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/sync/dive-sites', authenticateToken, async (req, res) => {
  const { since } = req.query;
  
  try {
    let query;
    let params = [];
    
    if (since) {
      query = `
        SELECT id, user_id, name, description, site_type, latitude, longitude,
               country, region, water_type, depth_max, visibility_min,
               visibility_max, difficulty, current_strength, access_notes, facilities,
               hazards, best_season, rating_avg, ratings_count, wikipedia_url,
               external_info, image_url, is_archived, is_wreck, wreck_info, wreck_name,
               wreck_url, created_at, updated_at, deleted_at
        FROM dive_sites
        WHERE updated_at > $1 OR deleted_at > $1
        ORDER BY updated_at ASC
      `;
      params = [since];
    } else {
      query = `
        SELECT id, user_id, name, description, site_type, latitude, longitude,
               country, region, water_type, depth_max, visibility_min,
               visibility_max, difficulty, current_strength, access_notes, facilities,
               hazards, best_season, rating_avg, ratings_count, wikipedia_url,
               external_info, image_url, is_archived, is_wreck, wreck_info, wreck_name,
               wreck_url, created_at, updated_at, deleted_at
        FROM dive_sites
        WHERE deleted_at IS NULL
        ORDER BY updated_at ASC
      `;
    }
    
    const result = await pool.query(query, params);
    
    const sites = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      siteType: row.site_type,
      latitude: row.latitude ? parseFloat(row.latitude) : null,
      longitude: row.longitude ? parseFloat(row.longitude) : null,
      country: row.country,
      region: row.region,
      waterType: row.water_type,
      depthMax: row.depth_max ? parseFloat(row.depth_max) : null,
      visibilityMin: row.visibility_min ? parseFloat(row.visibility_min) : null,
      visibilityMax: row.visibility_max ? parseFloat(row.visibility_max) : null,
      difficulty: row.difficulty,
      currentStrength: row.current_strength,
      accessNotes: row.access_notes,
      facilities: row.facilities || [],
      hazards: row.hazards || [],
      bestSeason: row.best_season,
      ratingAvg: row.rating_avg ? parseFloat(row.rating_avg) : 0,
      ratingsCount: row.ratings_count || 0,
      wikipediaUrl: row.wikipedia_url,
      externalInfo: row.external_info,
      imageUrl: row.image_url,
      isArchived: row.is_archived,
      isWreck: row.is_wreck,
      wreckInfo: row.wreck_info,
      wreckName: row.wreck_name,
      wreckUrl: row.wreck_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at
    }));
    
    const serverTime = new Date().toISOString();
    
    res.json({
      sites,
      serverTime,
      count: sites.length
    });
  } catch (error) {
    console.error('Sync dive sites error:', error);
    res.status(500).json({ error: 'Server error during sync' });
  }
});

app.post('/api/sync/dive-sites', authenticateToken, async (req, res) => {
  const { mutations } = req.body;
  
  if (!Array.isArray(mutations)) {
    return res.status(400).json({ error: 'Mutations array is required' });
  }
  
  const client = await pool.connect();
  const results = [];
  
  try {
    await client.query('BEGIN');
    
    for (const mutation of mutations) {
      const { clientMutationId, action, data } = mutation;
      
      try {
        if (action === 'create') {
          const insertResult = await client.query(`
            INSERT INTO dive_sites (
              user_id, name, description, site_type, latitude, longitude,
              country, region, water_type, depth_max, difficulty,
              current_strength, access_notes, facilities, hazards, best_season,
              image_url, is_wreck, wreck_info, wreck_name, wreck_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING id, updated_at
          `, [
            req.user.id,
            data.name,
            data.description || null,
            data.siteType || 'reef',
            data.latitude || null,
            data.longitude || null,
            data.country || null,
            data.region || null,
            data.waterType || 'marine',
            data.depthMax || null,
            data.difficulty || 'intermediate',
            data.currentStrength || null,
            data.accessNotes || null,
            JSON.stringify(data.facilities || []),
            JSON.stringify(data.hazards || []),
            data.bestSeason || null,
            data.imageUrl || null,
            data.isWreck || false,
            data.wreckInfo || null,
            data.wreckName || null,
            data.wreckUrl || null
          ]);
          
          results.push({
            clientMutationId,
            success: true,
            serverId: insertResult.rows[0].id,
            serverUpdatedAt: insertResult.rows[0].updated_at
          });
        } else if (action === 'update') {
          const canModify = await canModifyDiveSite(data.id, req.user.id, req.user.role);
          if (!canModify) {
            results.push({
              clientMutationId,
              success: false,
              error: 'Permission denied'
            });
            continue;
          }
          
          const updateResult = await client.query(`
            UPDATE dive_sites SET
              name = COALESCE($1, name),
              description = COALESCE($2, description),
              site_type = COALESCE($3, site_type),
              latitude = COALESCE($4, latitude),
              longitude = COALESCE($5, longitude),
              country = COALESCE($6, country),
              region = COALESCE($7, region),
              water_type = COALESCE($8, water_type),
              depth_max = COALESCE($9, depth_max),
              difficulty = COALESCE($10, difficulty),
              current_strength = COALESCE($11, current_strength),
              access_notes = COALESCE($12, access_notes),
              image_url = COALESCE($13, image_url)
            WHERE id = $14 AND deleted_at IS NULL
            RETURNING id, updated_at
          `, [
            data.name,
            data.description,
            data.siteType,
            data.latitude,
            data.longitude,
            data.country,
            data.region,
            data.waterType,
            data.depthMax,
            data.difficulty,
            data.currentStrength,
            data.accessNotes,
            data.imageUrl,
            data.id
          ]);
          
          if (updateResult.rows.length === 0) {
            results.push({
              clientMutationId,
              success: false,
              error: 'Site not found or deleted'
            });
          } else {
            results.push({
              clientMutationId,
              success: true,
              serverId: updateResult.rows[0].id,
              serverUpdatedAt: updateResult.rows[0].updated_at
            });
          }
        } else if (action === 'delete') {
          const canModify = await canModifyDiveSite(data.id, req.user.id, req.user.role);
          if (!canModify) {
            results.push({
              clientMutationId,
              success: false,
              error: 'Permission denied'
            });
            continue;
          }
          
          await client.query(`
            UPDATE dive_sites SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1
          `, [data.id]);
          
          results.push({
            clientMutationId,
            success: true,
            serverId: data.id
          });
        }
      } catch (mutationError) {
        results.push({
          clientMutationId,
          success: false,
          error: mutationError.message
        });
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      results,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync mutations error:', error);
    res.status(500).json({ error: 'Server error during sync' });
  } finally {
    client.release();
  }
});

app.get('/api/sync/status', authenticateToken, async (req, res) => {
  try {
    const sitesResult = await pool.query('SELECT MAX(updated_at) as last_updated, COUNT(*) as count FROM dive_sites WHERE deleted_at IS NULL');
    
    res.json({
      serverTime: new Date().toISOString(),
      diveSites: {
        lastUpdated: sitesResult.rows[0].last_updated,
        count: parseInt(sitesResult.rows[0].count) || 0
      }
    });
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/sync/compressors', authenticateToken, async (req, res) => {
  const { since } = req.query;
  try {
    let query;
    let params = [req.user.id];

    if (since) {
      query = `
        SELECT * FROM compressors
        WHERE user_id = $1 AND (updated_at > $2 OR deleted_at > $2)
        ORDER BY updated_at ASC
      `;
      params.push(since);
    } else {
      query = `
        SELECT * FROM compressors
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY updated_at ASC
      `;
    }

    const result = await pool.query(query, params);

    const compressors = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      make: row.make,
      model: row.model,
      serialNumber: row.serial_number,
      purchaseDate: row.purchase_date,
      totalHours: parseFloat(row.total_hours) || 0,
      oilChangeIntervalHours: row.oil_change_interval_hours,
      filterChangeIntervalHours: row.filter_change_interval_hours,
      independentTestIntervalMonths: row.independent_test_interval_months,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at
    }));

    res.json({
      compressors,
      serverTime: new Date().toISOString(),
      count: compressors.length
    });
  } catch (error) {
    console.error('Sync compressors error:', error);
    res.status(500).json({ error: 'Server error during compressor sync' });
  }
});

app.get('/api/sync/compressor-service-logs', authenticateToken, async (req, res) => {
  const { since } = req.query;
  try {
    let query;
    let params = [req.user.id];

    if (since) {
      query = `
        SELECT csl.* FROM compressor_service_logs csl
        INNER JOIN compressors c ON csl.compressor_id = c.id
        WHERE c.user_id = $1 AND (csl.updated_at > $2 OR csl.created_at > $2)
        ORDER BY csl.service_date ASC
      `;
      params.push(since);
    } else {
      query = `
        SELECT csl.* FROM compressor_service_logs csl
        INNER JOIN compressors c ON csl.compressor_id = c.id
        WHERE c.user_id = $1
        ORDER BY csl.service_date ASC
      `;
    }

    const result = await pool.query(query, params);

    const serviceLogs = result.rows.map(row => ({
      id: row.id,
      compressorId: row.compressor_id,
      userId: row.user_id,
      serviceType: row.service_type,
      serviceDate: row.service_date,
      hoursAtService: row.hours_at_service ? parseFloat(row.hours_at_service) : null,
      filterType: row.filter_type,
      testResult: row.test_result,
      testCertificateNumber: row.test_certificate_number,
      nextDueDate: row.next_due_date,
      cost: row.cost ? parseFloat(row.cost) : null,
      technician: row.technician,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({
      serviceLogs,
      serverTime: new Date().toISOString(),
      count: serviceLogs.length
    });
  } catch (error) {
    console.error('Sync compressor service logs error:', error);
    res.status(500).json({ error: 'Server error during service log sync' });
  }
});

app.get('/api/sync/compressor-usage-logs', authenticateToken, async (req, res) => {
  const { since } = req.query;
  try {
    let query;
    let params = [req.user.id];

    if (since) {
      query = `
        SELECT cul.* FROM compressor_usage_logs cul
        INNER JOIN compressors c ON cul.compressor_id = c.id
        WHERE c.user_id = $1 AND cul.created_at > $2
        ORDER BY cul.usage_date ASC
      `;
      params.push(since);
    } else {
      query = `
        SELECT cul.* FROM compressor_usage_logs cul
        INNER JOIN compressors c ON cul.compressor_id = c.id
        WHERE c.user_id = $1
        ORDER BY cul.usage_date ASC
      `;
    }

    const result = await pool.query(query, params);

    const usageLogs = result.rows.map(row => ({
      id: row.id,
      compressorId: row.compressor_id,
      userId: row.user_id,
      usageDate: row.usage_date,
      hoursUsed: parseFloat(row.hours_used) || 0,
      fillsCount: row.fills_count,
      notes: row.notes,
      createdAt: row.created_at
    }));

    res.json({
      usageLogs,
      serverTime: new Date().toISOString(),
      count: usageLogs.length
    });
  } catch (error) {
    console.error('Sync compressor usage logs error:', error);
    res.status(500).json({ error: 'Server error during usage log sync' });
  }
});

app.get('/api/dive-logs', authenticateToken, async (req, res) => {
  try {
    const { search, dive_site_id, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT dl.*, ds.name as dive_site_name, 
        COALESCE(dsi.image_url, ds.image_url) as dive_site_image_url,
        (SELECT COUNT(*) FROM dive_photos p WHERE p.dive_log_id = dl.id AND p.deleted_at IS NULL) as photo_count
      FROM dive_logs dl
      LEFT JOIN dive_sites ds ON dl.dive_site_id = ds.id
      LEFT JOIN dive_site_images dsi ON ds.id = dsi.dive_site_id AND dsi.is_primary = TRUE
      WHERE dl.user_id = $1 AND dl.deleted_at IS NULL
    `;
    const params = [req.user.id];
    let paramIndex = 2;

    if (search) {
      query += ` AND (dl.notes ILIKE $${paramIndex} OR dl.device_model ILIKE $${paramIndex} OR ds.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (dive_site_id) {
      query += ` AND dl.dive_site_id = $${paramIndex}`;
      params.push(parseInt(dive_site_id));
      paramIndex++;
    }

    query += ` ORDER BY dl.dive_datetime DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    const countQuery = `
      SELECT COUNT(*) FROM dive_logs dl
      LEFT JOIN dive_sites ds ON dl.dive_site_id = ds.id
      WHERE dl.user_id = $1 AND dl.deleted_at IS NULL
      ${search ? `AND (dl.notes ILIKE $2 OR dl.device_model ILIKE $2 OR ds.name ILIKE $2)` : ''}
      ${dive_site_id ? `AND dl.dive_site_id = $${search ? 3 : 2}` : ''}
    `;
    const countParams = [req.user.id];
    if (search) countParams.push(`%${search}%`);
    if (dive_site_id) countParams.push(parseInt(dive_site_id));
    
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      diveLogs: result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        diveSiteId: row.dive_site_id,
        diveSiteName: row.dive_site_name,
        diveSiteImageUrl: row.dive_site_image_url,
        gearProfileId: row.gear_profile_id,
        diveDateTime: row.dive_datetime,
        durationSeconds: row.duration_seconds,
        maxDepthMeters: parseFloat(row.max_depth_meters),
        avgDepthMeters: parseFloat(row.avg_depth_meters),
        minTemperatureCelsius: row.min_temperature_celsius ? parseFloat(row.min_temperature_celsius) : null,
        maxTemperatureCelsius: row.max_temperature_celsius ? parseFloat(row.max_temperature_celsius) : null,
        deviceManufacturer: row.device_manufacturer,
        deviceModel: row.device_model,
        notes: row.notes,
        rating: row.rating,
        importSource: row.import_source,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        photoCount: parseInt(row.photo_count) || 0
      })),
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get dive logs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/dive-logs/stats', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_dives,
        COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
        MAX(max_depth_meters) as deepest_dive_meters,
        AVG(max_depth_meters) as avg_max_depth_meters,
        MIN(min_temperature_celsius) as coldest_temp,
        MAX(max_temperature_celsius) as warmest_temp,
        COUNT(DISTINCT dive_site_id) as sites_visited
      FROM dive_logs
      WHERE user_id = $1 AND deleted_at IS NULL
    `, [req.user.id]);

    const stats = result.rows[0];
    
    res.json({
      totalDives: parseInt(stats.total_dives) || 0,
      totalDurationSeconds: parseInt(stats.total_duration_seconds) || 0,
      deepestDiveMeters: stats.deepest_dive_meters ? parseFloat(stats.deepest_dive_meters) : null,
      avgMaxDepthMeters: stats.avg_max_depth_meters ? parseFloat(stats.avg_max_depth_meters) : null,
      coldestTemp: stats.coldest_temp ? parseFloat(stats.coldest_temp) : null,
      warmestTemp: stats.warmest_temp ? parseFloat(stats.warmest_temp) : null,
      sitesVisited: parseInt(stats.sites_visited) || 0
    });
  } catch (error) {
    console.error('Get dive stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/dive-logs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT dl.*, ds.name as dive_site_name
      FROM dive_logs dl
      LEFT JOIN dive_sites ds ON dl.dive_site_id = ds.id
      WHERE dl.id = $1 AND dl.user_id = $2 AND dl.deleted_at IS NULL
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dive log not found' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      userId: row.user_id,
      diveSiteId: row.dive_site_id,
      diveSiteName: row.dive_site_name,
      gearProfileId: row.gear_profile_id,
      diveDateTime: row.dive_datetime,
      durationSeconds: row.duration_seconds,
      maxDepthMeters: row.max_depth_meters ? parseFloat(row.max_depth_meters) : null,
      avgDepthMeters: row.avg_depth_meters ? parseFloat(row.avg_depth_meters) : null,
      minTemperatureCelsius: row.min_temperature_celsius ? parseFloat(row.min_temperature_celsius) : null,
      maxTemperatureCelsius: row.max_temperature_celsius ? parseFloat(row.max_temperature_celsius) : null,
      deviceManufacturer: row.device_manufacturer,
      deviceModel: row.device_model,
      deviceSerial: row.device_serial,
      samples: row.samples,
      gasMixes: row.gas_mixes,
      notes: row.notes,
      rating: row.rating,
      importSource: row.import_source,
      importFilename: row.import_filename,
      diveNumber: row.dive_number,
      surfaceIntervalSeconds: row.surface_interval_seconds,
      surfacePressureMbar: row.surface_pressure_mbar,
      diveMode: row.dive_mode,
      surfaceConditions: row.surface_conditions,
      weatherConditions: row.weather_conditions,
      workload: row.workload,
      thermalComfort: row.thermal_comfort,
      gasPressures: row.gas_pressures || [],
      equipmentIssues: row.equipment_issues || [],
      skillsPracticed: row.skills_practiced || [],
      skillsNotes: row.skills_notes,
      buddy: row.buddy,
      decompressionSymptoms: row.decompression_symptoms,
      problemNotes: row.problem_notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Get dive log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/dive-logs/import', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileContent = req.file.buffer.toString('utf-8');
    const filename = req.file.originalname;
    const mimeType = req.file.mimetype;

    const parsedDives = await diveLogParser.parseFile(fileContent, filename, mimeType);

    if (!parsedDives || parsedDives.length === 0) {
      return res.status(400).json({ error: 'No dives found in file' });
    }

    const insertedDives = [];
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      let userDiveComputerId = req.body?.user_dive_computer_id || req.query?.user_dive_computer_id || null;
      if (userDiveComputerId) {
        userDiveComputerId = parseInt(userDiveComputerId, 10);
        if (isNaN(userDiveComputerId)) {
          userDiveComputerId = null;
        } else {
          const ownerCheck = await client.query(
            'SELECT id FROM user_dive_computers WHERE id = $1 AND user_id = $2',
            [userDiveComputerId, req.user.id]
          );
          if (ownerCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Invalid dive computer selection' });
          }
        }
      }

      for (const dive of parsedDives) {
        const result = await client.query(`
          INSERT INTO dive_logs (
            user_id, dive_datetime, duration_seconds, max_depth_meters, avg_depth_meters,
            min_temperature_celsius, max_temperature_celsius, device_manufacturer, device_model,
            device_serial, samples, gas_mixes, notes, import_source, import_filename,
            user_dive_computer_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING id, dive_datetime, max_depth_meters, duration_seconds
        `, [
          req.user.id,
          dive.dive_datetime,
          dive.duration_seconds,
          dive.max_depth_meters,
          dive.avg_depth_meters,
          dive.min_temperature_celsius,
          dive.max_temperature_celsius,
          dive.device_manufacturer,
          dive.device_model,
          dive.device_serial,
          JSON.stringify(dive.samples),
          JSON.stringify(dive.gas_mixes),
          dive.notes,
          dive.import_source,
          filename,
          userDiveComputerId
        ]);

        insertedDives.push({
          id: result.rows[0].id,
          diveDateTime: result.rows[0].dive_datetime,
          maxDepthMeters: parseFloat(result.rows[0].max_depth_meters),
          durationSeconds: result.rows[0].duration_seconds
        });
      }

      await client.query('COMMIT');

      res.status(201).json({
        message: `Successfully imported ${insertedDives.length} dive(s)`,
        dives: insertedDives
      });
    } catch (insertError) {
      await client.query('ROLLBACK');
      throw insertError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Import dive logs error:', error);
    res.status(500).json({ error: error.message || 'Server error during import' });
  }
});

app.post('/api/dive-logs/import/v2', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileContent = req.file.buffer.toString('utf-8');
    const filename = req.file.originalname;
    const mimeType = req.file.mimetype;

    const dtos = await diveLogParserV2.parseFile(fileContent, filename, mimeType);

    if (!dtos || dtos.length === 0) {
      return res.status(400).json({ error: 'No dives found in file' });
    }

    const insertedDives = [];
    const errors = [];
    
    let userDiveComputerIdV2 = req.body?.user_dive_computer_id || req.query?.user_dive_computer_id || null;
    if (userDiveComputerIdV2) {
      userDiveComputerIdV2 = parseInt(userDiveComputerIdV2, 10);
      if (isNaN(userDiveComputerIdV2)) {
        userDiveComputerIdV2 = null;
      } else {
        const ownerCheckV2 = await pool.query(
          'SELECT id FROM user_dive_computers WHERE id = $1 AND user_id = $2',
          [userDiveComputerIdV2, req.user.id]
        );
        if (ownerCheckV2.rows.length === 0) {
          return res.status(403).json({ error: 'Invalid dive computer selection' });
        }
      }
    }

    for (let i = 0; i < dtos.length; i++) {
      const dto = dtos[i];
      try {
        const diveLogId = await diveLogPersistence.saveDiveImport(dto, req.user.id, userDiveComputerIdV2);
        insertedDives.push({
          id: diveLogId,
          diveDateTime: dto.header.dive_datetime,
          maxDepthMeters: dto.header.max_depth_meters,
          durationSeconds: dto.header.duration_seconds,
          samplesCount: dto.samples.length,
          gasesCount: dto.gases.length,
          eventsCount: dto.events.length
        });
      } catch (diveError) {
        console.error(`Error saving dive ${i + 1}:`, diveError);
        errors.push({
          diveIndex: i,
          diveDateTime: dto.header.dive_datetime,
          error: diveError.message
        });
      }
    }

    if (insertedDives.length === 0) {
      return res.status(500).json({
        error: 'Failed to import any dives',
        details: errors
      });
    }

    const response = {
      message: `Successfully imported ${insertedDives.length} of ${dtos.length} dive(s) with full details`,
      dives: insertedDives,
      format: dtos[0]?.import_metadata?.source_format
    };
    
    if (errors.length > 0) {
      response.warnings = errors;
    }
    
    res.status(201).json(response);
  } catch (error) {
    console.error('Import V2 dive logs error:', error);
    res.status(500).json({ error: error.message || 'Server error during import' });
  }
});

app.get('/api/dive-logs/:id/detailed', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const diveLog = await diveLogPersistence.getDiveLogWithDetails(id, req.user.id);
    
    if (!diveLog) {
      return res.status(404).json({ error: 'Dive log not found' });
    }
    
    res.json({
      id: diveLog.id,
      userId: diveLog.user_id,
      diveSiteId: diveLog.dive_site_id,
      diveDateTime: diveLog.dive_datetime,
      durationSeconds: diveLog.duration_seconds,
      maxDepthMeters: diveLog.max_depth_meters ? parseFloat(diveLog.max_depth_meters) : null,
      avgDepthMeters: diveLog.avg_depth_meters ? parseFloat(diveLog.avg_depth_meters) : null,
      minTemperatureCelsius: diveLog.min_temperature_celsius ? parseFloat(diveLog.min_temperature_celsius) : null,
      maxTemperatureCelsius: diveLog.max_temperature_celsius ? parseFloat(diveLog.max_temperature_celsius) : null,
      deviceManufacturer: diveLog.device_manufacturer,
      deviceModel: diveLog.device_model,
      deviceSerial: diveLog.device_serial,
      diveComputerId: diveLog.dive_computer_id,
      catalogManufacturer: diveLog.catalog_manufacturer,
      catalogModel: diveLog.catalog_model,
      computerFamily: diveLog.family,
      computerProtocol: diveLog.protocol,
      hasBle: diveLog.has_ble,
      hasAi: diveLog.has_ai,
      sampleFields: diveLog.sample_fields,
      notes: diveLog.notes,
      rating: diveLog.rating,
      importSource: diveLog.import_source,
      importFilename: diveLog.import_filename,
      diveNumber: diveLog.dive_number,
      surfaceIntervalSeconds: diveLog.surface_interval_seconds,
      surfacePressureMbar: diveLog.surface_pressure_mbar,
      diveMode: diveLog.dive_mode,
      surfaceConditions: diveLog.surface_conditions,
      weatherConditions: diveLog.weather_conditions,
      workload: diveLog.workload,
      thermalComfort: diveLog.thermal_comfort,
      buddy: diveLog.buddy,
      decompressionSymptoms: diveLog.decompression_symptoms,
      problemNotes: diveLog.problem_notes,
      createdAt: diveLog.created_at,
      updatedAt: diveLog.updated_at,
      samples: diveLog.samples,
      gasMixes: diveLog.gas_mixes,
      gasPressures: diveLog.gas_pressures || [],
      equipmentIssues: diveLog.equipment_issues || [],
      skillsPracticed: diveLog.skills_practiced || [],
      skillsNotes: diveLog.skills_notes,
      detailedSamples: diveLog.detailed_samples,
      detailedGases: diveLog.detailed_gases,
      events: diveLog.events,
      tankPressureHistory: diveLog.tank_pressure_history,
      computerSettings: diveLog.computer_settings,
      importInfo: diveLog.import_info
    });
  } catch (error) {
    console.error('Get detailed dive log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/dive-computers/catalog', authenticateToken, async (req, res) => {
  try {
    const { manufacturer, has_ble } = req.query;
    
    let query = 'SELECT * FROM dive_computer_catalog WHERE 1=1';
    const params = [];
    
    if (manufacturer) {
      params.push(manufacturer);
      query += ` AND LOWER(manufacturer) = LOWER($${params.length})`;
    }
    
    if (has_ble === 'true') {
      query += ' AND has_ble = true';
    }
    
    query += ' ORDER BY manufacturer, model';
    
    const result = await pool.query(query, params);
    
    res.json({
      computers: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Get dive computer catalog error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/dive-computers/catalog/manufacturers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT manufacturer, COUNT(*) as model_count 
      FROM dive_computer_catalog 
      GROUP BY manufacturer 
      ORDER BY manufacturer
    `);
    
    res.json({
      manufacturers: result.rows
    });
  } catch (error) {
    console.error('Get manufacturers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/dive-logs/:id/migrate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await diveLogPersistence.migrateExistingDiveLog(id, req.user.id);
    
    res.json(result);
  } catch (error) {
    console.error('Migrate dive log error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.post('/api/dive-logs', authenticateToken, async (req, res) => {
  try {
    const {
      diveSiteId, diveDateTime, durationSeconds, maxDepthMeters, avgDepthMeters,
      minTemperatureCelsius, maxTemperatureCelsius, deviceManufacturer, deviceModel,
      samples, gasMixes, notes, rating, gearProfileId,
      surfaceConditions, weatherConditions
    } = req.body;

    if (!diveDateTime) {
      return res.status(400).json({ error: 'Dive date/time is required' });
    }

    if (gearProfileId) {
      const profileCheck = await pool.query(
        'SELECT id FROM gear_profiles WHERE id = $1 AND user_id = $2',
        [gearProfileId, req.user.id]
      );
      if (profileCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid gear profile' });
      }
    }

    const result = await pool.query(`
      INSERT INTO dive_logs (
        user_id, dive_site_id, dive_datetime, duration_seconds, max_depth_meters, avg_depth_meters,
        min_temperature_celsius, max_temperature_celsius, device_manufacturer, device_model,
        samples, gas_mixes, notes, rating, import_source, gear_profile_id,
        surface_conditions, weather_conditions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'manual', $15, $16, $17)
      RETURNING *
    `, [
      req.user.id,
      diveSiteId || null,
      diveDateTime,
      durationSeconds != null ? durationSeconds : null,
      maxDepthMeters != null ? maxDepthMeters : null,
      avgDepthMeters != null ? avgDepthMeters : null,
      minTemperatureCelsius != null ? minTemperatureCelsius : null,
      maxTemperatureCelsius != null ? maxTemperatureCelsius : null,
      deviceManufacturer || null,
      deviceModel || null,
      samples ? JSON.stringify(samples) : null,
      gasMixes ? JSON.stringify(gasMixes) : null,
      notes || null,
      rating || null,
      gearProfileId || null,
      surfaceConditions || null,
      weatherConditions || null
    ]);

    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      userId: row.user_id,
      diveSiteId: row.dive_site_id,
      gearProfileId: row.gear_profile_id,
      diveDateTime: row.dive_datetime,
      durationSeconds: row.duration_seconds,
      maxDepthMeters: row.max_depth_meters ? parseFloat(row.max_depth_meters) : null,
      avgDepthMeters: row.avg_depth_meters ? parseFloat(row.avg_depth_meters) : null,
      createdAt: row.created_at
    });
  } catch (error) {
    console.error('Create dive log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/dive-logs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      diveSiteId, diveDateTime, durationSeconds, maxDepthMeters, avgDepthMeters,
      minTemperatureCelsius, maxTemperatureCelsius, notes, rating, gearProfileId, gasMixes,
      skillsNotes, workload, thermalComfort, equipmentIssues, problemNotes,
      surfaceConditions, weatherConditions
    } = req.body;

    const existingResult = await pool.query(
      'SELECT id FROM dive_logs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dive log not found' });
    }

    if (gearProfileId) {
      const profileCheck = await pool.query(
        'SELECT id FROM gear_profiles WHERE id = $1 AND user_id = $2',
        [gearProfileId, req.user.id]
      );
      if (profileCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid gear profile' });
      }
    }

    const updateQuery = `
      UPDATE dive_logs SET
        dive_site_id = COALESCE($1, dive_site_id),
        dive_datetime = COALESCE($2, dive_datetime),
        duration_seconds = COALESCE($3, duration_seconds),
        max_depth_meters = COALESCE($4, max_depth_meters),
        avg_depth_meters = COALESCE($5, avg_depth_meters),
        min_temperature_celsius = COALESCE($6, min_temperature_celsius),
        max_temperature_celsius = COALESCE($7, max_temperature_celsius),
        notes = COALESCE($8, notes),
        rating = COALESCE($9, rating),
        gear_profile_id = $10,
        gas_mixes = COALESCE($11, gas_mixes),
        skills_notes = COALESCE($12, skills_notes),
        workload = $13,
        thermal_comfort = $14,
        equipment_issues = $15,
        problem_notes = $16,
        surface_conditions = $17,
        weather_conditions = $18
      WHERE id = $19 AND user_id = $20
      RETURNING *
    `;
    const updateParams = [
      diveSiteId, diveDateTime, durationSeconds, maxDepthMeters, avgDepthMeters,
      minTemperatureCelsius, maxTemperatureCelsius, notes, rating,
      gearProfileId !== undefined ? gearProfileId : null,
      gasMixes ? JSON.stringify(gasMixes) : null,
      skillsNotes,
      workload || null,
      thermalComfort || null,
      equipmentIssues ? JSON.stringify(equipmentIssues) : null,
      problemNotes || null,
      surfaceConditions || null,
      weatherConditions || null,
      id, req.user.id
    ];
    
    const result = await pool.query(updateQuery, updateParams);

    const row = result.rows[0];
    res.json({
      id: row.id,
      userId: row.user_id,
      diveSiteId: row.dive_site_id,
      gearProfileId: row.gear_profile_id,
      diveDateTime: row.dive_datetime,
      durationSeconds: row.duration_seconds,
      maxDepthMeters: row.max_depth_meters ? parseFloat(row.max_depth_meters) : null,
      notes: row.notes,
      rating: row.rating,
      gasMixes: row.gas_mixes,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Update dive log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Merge data from uploaded file (UDDF, CSV, etc.) into an existing dive log
app.post('/api/dive-logs/:id/merge-file', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Verify dive log belongs to user
    const existingResult = await pool.query(
      'SELECT * FROM dive_logs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, req.user.id]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dive log not found' });
    }
    
    const existingLog = existingResult.rows[0];
    const fileContent = req.file.buffer.toString('utf-8');
    const filename = req.file.originalname;
    const mimeType = req.file.mimetype;
    
    // Parse the uploaded file
    const dtos = await diveLogParserV2.parseFile(fileContent, filename, mimeType);
    
    if (!dtos || dtos.length === 0) {
      return res.status(400).json({ error: 'No dive data found in file' });
    }
    
    // Use the first dive from the file (or closest match by date if multiple)
    const dto = dtos[0];
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update dive log with parsed data (only update fields that are empty or have better data)
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;
      
      // Update duration if we have it and existing is null or zero
      if (dto.header.duration_seconds && (!existingLog.duration_seconds || existingLog.duration_seconds === 0)) {
        updateFields.push(`duration_seconds = $${paramIndex++}`);
        updateValues.push(dto.header.duration_seconds);
      }
      
      // Update max depth if we have it and existing is null or zero
      if (dto.header.max_depth_meters && (!existingLog.max_depth_meters || parseFloat(existingLog.max_depth_meters) === 0)) {
        updateFields.push(`max_depth_meters = $${paramIndex++}`);
        updateValues.push(dto.header.max_depth_meters);
      }
      
      // Update avg depth if we have it and existing is null
      if (dto.header.avg_depth_meters && !existingLog.avg_depth_meters) {
        updateFields.push(`avg_depth_meters = $${paramIndex++}`);
        updateValues.push(dto.header.avg_depth_meters);
      }
      
      // Update temperatures if we have them and existing are null
      if (dto.header.min_temperature_celsius && !existingLog.min_temperature_celsius) {
        updateFields.push(`min_temperature_celsius = $${paramIndex++}`);
        updateValues.push(dto.header.min_temperature_celsius);
      }
      if (dto.header.max_temperature_celsius && !existingLog.max_temperature_celsius) {
        updateFields.push(`max_temperature_celsius = $${paramIndex++}`);
        updateValues.push(dto.header.max_temperature_celsius);
      }
      
      // Update device info if we have it and existing is null
      if (dto.device.manufacturer && !existingLog.device_manufacturer) {
        updateFields.push(`device_manufacturer = $${paramIndex++}`);
        updateValues.push(dto.device.manufacturer);
      }
      if (dto.device.model && !existingLog.device_model) {
        updateFields.push(`device_model = $${paramIndex++}`);
        updateValues.push(dto.device.model);
      }
      if (dto.device.serial && !existingLog.device_serial) {
        updateFields.push(`device_serial = $${paramIndex++}`);
        updateValues.push(dto.device.serial);
      }
      
      // Always update samples if we have them (this is the main data from dive computer)
      if (dto.samples && dto.samples.length > 0) {
        const samplesJson = JSON.stringify(dto.samples.map(s => ({
          time_seconds: s.sample_time_seconds,
          depth_meters: s.depth_meters,
          temperature_celsius: s.temperature_celsius,
          ndl_seconds: s.metrics?.ndl_seconds || null,
          ndl_min: s.metrics?.ndl_min || null,
          gf99_percent: s.metrics?.gf99_percent || s.metrics?.gf99_pct || null,
          ceiling_meters: s.metrics?.ceiling_meters || s.metrics?.ceiling_m || null,
          tts_seconds: s.metrics?.tts_seconds || null,
          tts_min: s.metrics?.tts_min || null,
          ppo2_bar: s.metrics?.ppo2_bar || null,
          sac_lpm: s.metrics?.sac_lpm || null,
          heartrate_bpm: s.metrics?.heartrate_bpm || null,
          cns_percent: s.metrics?.cns_percent || s.metrics?.cns_pct || null
        })));
        updateFields.push(`samples = $${paramIndex++}`);
        updateValues.push(samplesJson);
      }
      
      // Always update gas mixes if we have them
      if (dto.gases && dto.gases.length > 0) {
        const gasMixesJson = JSON.stringify(dto.gases.map(g => ({
          label: g.gas_name || 'Unknown',
          o2Percent: g.o2_percent,
          hePercent: g.he_percent || 0,
          startBar: g.start_pressure_bar || null,
          endBar: g.end_pressure_bar || null
        })));
        updateFields.push(`gas_mixes = $${paramIndex++}`);
        updateValues.push(gasMixesJson);
      }
      
      // Store import metadata
      updateFields.push(`import_source = $${paramIndex++}`);
      updateValues.push(dto.import_metadata.source_format || 'file');
      updateFields.push(`import_filename = $${paramIndex++}`);
      updateValues.push(filename);
      updateFields.push(`source_file_name = $${paramIndex++}`);
      updateValues.push(filename);
      
      if (updateFields.length > 0) {
        updateValues.push(id);
        await client.query(
          `UPDATE dive_logs SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`,
          updateValues
        );
      }
      
      // Only delete and replace data if the file actually contains that data type
      // This prevents wiping manual data if the file is missing certain arrays
      
      // Insert new samples (only if file has samples)
      if (dto.samples && dto.samples.length > 0) {
        await client.query('DELETE FROM dive_log_samples WHERE dive_log_id = $1', [id]);
        for (const sample of dto.samples) {
          await client.query(
            `INSERT INTO dive_log_samples (dive_log_id, sample_time_seconds, depth_meters, temperature_celsius, 
             ndl_seconds, gf99_percent, ceiling_meters, tts_seconds, ppo2_bar, sac_lpm, heartrate_bpm, cns_percent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [id, sample.sample_time_seconds, sample.depth_meters, sample.temperature_celsius,
             sample.metrics?.ndl_seconds, sample.metrics?.gf99_percent, sample.metrics?.ceiling_meters,
             sample.metrics?.tts_seconds, sample.metrics?.ppo2_bar, sample.metrics?.sac_lpm,
             sample.metrics?.heartrate_bpm, sample.metrics?.cns_percent]
          );
        }
      }
      
      // Insert new gases (only if file has gases)
      if (dto.gases && dto.gases.length > 0) {
        await client.query('DELETE FROM dive_log_gases WHERE dive_log_id = $1', [id]);
        for (let i = 0; i < dto.gases.length; i++) {
          const gas = dto.gases[i];
          const slot = (gas.gas_slot !== undefined && gas.gas_slot !== null) ? gas.gas_slot : i;
          const o2 = gas.o2_percent ?? 21;
          const he = gas.he_percent ?? 0;
          const n2 = gas.n2_percent ?? (100 - o2 - he);
          await client.query(
            `INSERT INTO dive_log_gases (dive_log_id, gas_slot, name, o2_percent, he_percent, n2_percent,
              is_diluent, is_bailout, tank_size_liters, work_pressure_bar, start_pressure_bar, end_pressure_bar, transmitter_serial)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [id, slot, gas.name || gas.gas_name || null, o2, he, n2,
              gas.is_diluent || false, gas.is_bailout || false,
              gas.tank_size_liters ?? null, gas.work_pressure_bar ?? null,
              gas.start_pressure_bar ?? null, gas.end_pressure_bar ?? null,
              gas.transmitter_serial || null]
          );
        }
      }
      
      // Insert new events (only if file has events)
      if (dto.events && dto.events.length > 0) {
        await client.query('DELETE FROM dive_log_events WHERE dive_log_id = $1', [id]);
        for (const event of dto.events) {
          let payload = event.payload || null;
          if (event.event_description) {
            payload = { ...(payload || {}), description: event.event_description };
          }
          // event_value column is integer; if the parser supplied a non-integer
          // (e.g. PO2 setpoints like 0.7), stash the raw value in payload and
          // store NULL in the integer column to avoid a type error.
          let eventValueInt = null;
          const rawValue = event.event_value;
          if (rawValue !== null && rawValue !== undefined) {
            if (Number.isInteger(rawValue)) {
              eventValueInt = rawValue;
            } else if (typeof rawValue === 'number') {
              payload = { ...(payload || {}), value: rawValue };
            }
          }
          await client.query(
            `INSERT INTO dive_log_events (dive_log_id, event_time_seconds, event_type, event_subtype, event_value, gas_slot, payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, event.event_time_seconds, event.event_type, event.event_subtype || null,
              eventValueInt, event.gas_slot ?? null,
              payload ? JSON.stringify(payload) : null]
          );
        }
      }
      
      // Insert new tank pressures (only if file has tank pressures)
      if (dto.tank_pressures && dto.tank_pressures.length > 0) {
        await client.query('DELETE FROM dive_log_tank_pressures WHERE dive_log_id = $1', [id]);
        for (const tp of dto.tank_pressures) {
          const slot = (tp.gas_slot !== undefined && tp.gas_slot !== null)
            ? tp.gas_slot
            : (tp.tank_index ?? 0);
          await client.query(
            `INSERT INTO dive_log_tank_pressures (dive_log_id, gas_slot, sample_time_seconds, pressure_bar, transmitter_serial)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, slot, tp.sample_time_seconds, tp.pressure_bar, tp.transmitter_serial || null]
          );
        }
      }
      
      await client.query('COMMIT');
      
      res.json({ 
        message: 'File data merged successfully',
        samplesCount: dto.samples?.length || 0,
        gasesCount: dto.gases?.length || 0,
        eventsCount: dto.events?.length || 0,
        sourceFileName: filename
      });
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Merge file data error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.delete('/api/dive-logs/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE dive_logs SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dive log not found' });
    }

    res.json({ message: 'Dive log deleted successfully' });
  } catch (error) {
    console.error('Delete dive log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ EQUIPMENT INVENTORY API ============

const EQUIPMENT_TYPES = [
  { value: '1st_stage_reg', label: '1st Stage Reg' },
  { value: '2nd_stage_reg', label: '2nd Stage Reg' },
  { value: 'bcd', label: 'BCD / Wing' },
  { value: 'wetsuit', label: 'Wetsuit' },
  { value: 'drysuit', label: 'Drysuit' },
  { value: 'mask', label: 'Mask' },
  { value: 'fins', label: 'Fins' },
  { value: 'gloves', label: 'Gloves' },
  { value: 'boots', label: 'Boots' },
  { value: 'hood', label: 'Hood' },
  { value: 'cylinder', label: 'Cylinder' },
  { value: 'torch_handheld', label: 'Torch Hand Held' },
  { value: 'torch_umbilical', label: 'Umbilical Torch' },
  { value: 'computer', label: 'Dive Computer' },
  { value: 'smb', label: 'SMB' },
  { value: 'reel', label: 'Reel' },
  { value: 'wet_notes', label: 'Wet Notes' },
  { value: 'line_cutter', label: 'Line Cutter' },
  { value: 'knife', label: 'Knife' },
  { value: 'compass', label: 'Compass' },
  { value: 'whistle', label: 'Whistle' },
  { value: 'hand_mirror', label: 'Hand Mirror' },
  { value: 'dpv', label: 'DPV' },
  { value: 'ccr', label: 'CCR' },
  { value: 'camera', label: 'Camera / Housing' },
  { value: 'weights', label: 'Weights' },
  { value: 'harness', label: 'Harness / Backplate' },
  { value: 'other', label: 'Other' },
];

app.get('/api/equipment-types', authenticateToken, (req, res) => {
  res.json(EQUIPMENT_TYPES);
});

app.get('/api/equipment', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM equipment_inventory 
       WHERE user_id = $1 
       ORDER BY equipment_type, name`,
      [req.user.id]
    );
    
    res.json({
      equipment: result.rows.map(row => ({
        id: row.id,
        equipmentType: row.equipment_type,
        name: row.name,
        brand: row.brand,
        model: row.model,
        serialNumber: row.serial_number,
        quantity: row.quantity,
        purchaseDate: row.purchase_date,
        lastServiceDate: row.last_service_date,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    });
  } catch (error) {
    console.error('Get equipment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/equipment', authenticateToken, async (req, res) => {
  try {
    const { equipmentType, name, brand, model, serialNumber, quantity, purchaseDate, lastServiceDate, notes } = req.body;

    if (!equipmentType || !name) {
      return res.status(400).json({ error: 'Equipment type and name are required' });
    }

    const result = await pool.query(
      `INSERT INTO equipment_inventory 
       (user_id, equipment_type, name, brand, model, serial_number, quantity, purchase_date, last_service_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [req.user.id, equipmentType, name, brand || null, model || null, serialNumber || null, 
       quantity || 1, purchaseDate || null, lastServiceDate || null, notes || null]
    );

    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      equipmentType: row.equipment_type,
      name: row.name,
      brand: row.brand,
      model: row.model,
      serialNumber: row.serial_number,
      quantity: row.quantity,
      purchaseDate: row.purchase_date,
      lastServiceDate: row.last_service_date,
      notes: row.notes,
      createdAt: row.created_at,
    });
  } catch (error) {
    console.error('Create equipment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/equipment/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { equipmentType, name, brand, model, serialNumber, quantity, purchaseDate, lastServiceDate, notes } = req.body;

    const result = await pool.query(
      `UPDATE equipment_inventory SET
        equipment_type = COALESCE($1, equipment_type),
        name = COALESCE($2, name),
        brand = $3,
        model = $4,
        serial_number = $5,
        quantity = COALESCE($6, quantity),
        purchase_date = $7,
        last_service_date = $8,
        notes = $9
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [equipmentType, name, brand || null, model || null, serialNumber || null,
       quantity, purchaseDate || null, lastServiceDate || null, notes || null, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      equipmentType: row.equipment_type,
      name: row.name,
      brand: row.brand,
      model: row.model,
      serialNumber: row.serial_number,
      quantity: row.quantity,
      purchaseDate: row.purchase_date,
      lastServiceDate: row.last_service_date,
      notes: row.notes,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error('Update equipment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/equipment/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM equipment_inventory WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    res.json({ message: 'Equipment deleted successfully' });
  } catch (error) {
    console.error('Delete equipment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/gear-profiles/:profileId/equipment', authenticateToken, async (req, res) => {
  try {
    const { profileId } = req.params;

    const profileCheck = await pool.query(
      'SELECT id FROM gear_profiles WHERE id = $1 AND user_id = $2',
      [profileId, req.user.id]
    );
    if (profileCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Gear profile not found' });
    }

    const result = await pool.query(
      `SELECT e.*, gpe.id as link_id
       FROM equipment_inventory e
       JOIN gear_profile_equipment gpe ON e.id = gpe.equipment_id
       WHERE gpe.gear_profile_id = $1 AND e.user_id = $2
       ORDER BY e.equipment_type, e.name`,
      [profileId, req.user.id]
    );

    res.json({
      equipment: result.rows.map(row => ({
        id: row.id,
        linkId: row.link_id,
        equipmentType: row.equipment_type,
        name: row.name,
        brand: row.brand,
        model: row.model,
        quantity: row.quantity,
      }))
    });
  } catch (error) {
    console.error('Get profile equipment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/gear-profiles/:profileId/equipment', authenticateToken, async (req, res) => {
  try {
    const { profileId } = req.params;
    const { equipmentId } = req.body;

    const profileCheck = await pool.query(
      'SELECT id FROM gear_profiles WHERE id = $1 AND user_id = $2',
      [profileId, req.user.id]
    );
    if (profileCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Gear profile not found' });
    }

    const equipmentCheck = await pool.query(
      'SELECT id FROM equipment_inventory WHERE id = $1 AND user_id = $2',
      [equipmentId, req.user.id]
    );
    if (equipmentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const result = await pool.query(
      `INSERT INTO gear_profile_equipment (gear_profile_id, equipment_id)
       VALUES ($1, $2)
       ON CONFLICT (gear_profile_id, equipment_id) DO NOTHING
       RETURNING id`,
      [profileId, equipmentId]
    );

    if (result.rowCount === 0) {
      return res.status(409).json({ error: 'Equipment already linked to this profile' });
    }

    res.status(201).json({ success: true, linkId: result.rows[0]?.id });
  } catch (error) {
    console.error('Add profile equipment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/gear-profiles/:profileId/equipment/:equipmentId', authenticateToken, async (req, res) => {
  try {
    const { profileId, equipmentId } = req.params;

    const profileCheck = await pool.query(
      'SELECT id FROM gear_profiles WHERE id = $1 AND user_id = $2',
      [profileId, req.user.id]
    );
    if (profileCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Gear profile not found' });
    }

    await pool.query(
      'DELETE FROM gear_profile_equipment WHERE gear_profile_id = $1 AND equipment_id = $2',
      [profileId, equipmentId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Remove profile equipment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ GEAR PROFILES API ============

// Get all gear profiles for user
app.get('/api/gear-profiles', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT gp.*, 
        (SELECT COUNT(*) FROM gear_cylinders WHERE gear_profile_id = gp.id) as cylinder_count,
        (SELECT SUM(weight_kg) FROM gear_weights WHERE gear_profile_id = gp.id) as total_weight
      FROM gear_profiles gp
      WHERE gp.user_id = $1
      ORDER BY gp.updated_at DESC
    `, [req.user.id]);

    const profiles = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      configType: row.config_type,
      suitType: row.suit_type,
      suitThickness: row.suit_thickness,
      undersuit: row.undersuit,
      suitNickname: row.suit_nickname,
      glovesType: row.gloves_type,
      glovesThickness: row.gloves_thickness,
      bootsType: row.boots_type,
      bootsThickness: row.boots_thickness,
      bcdType: row.bcd_type,
      notes: row.notes,
      status: row.status || 'live',
      plannedDepth: row.planned_depth ? parseFloat(row.planned_depth) : null,
      plannedBottomTime: row.planned_bottom_time,
      cylinderCount: parseInt(row.cylinder_count) || 0,
      totalWeight: row.total_weight ? parseFloat(row.total_weight) : 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({ profiles });
  } catch (error) {
    console.error('Get gear profiles error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single gear profile with cylinders and weights
app.get('/api/gear-profiles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const profileResult = await pool.query(
      'SELECT * FROM gear_profiles WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Gear profile not found' });
    }

    const row = profileResult.rows[0];

    const cylindersResult = await pool.query(
      'SELECT * FROM gear_cylinders WHERE gear_profile_id = $1 ORDER BY sort_order, id',
      [id]
    );

    const weightsResult = await pool.query(
      'SELECT * FROM gear_weights WHERE gear_profile_id = $1 ORDER BY sort_order, id',
      [id]
    );

    const profile = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      configType: row.config_type,
      suitType: row.suit_type,
      suitThickness: row.suit_thickness,
      undersuit: row.undersuit,
      suitNickname: row.suit_nickname,
      glovesType: row.gloves_type,
      glovesThickness: row.gloves_thickness,
      glovesNickname: row.gloves_nickname,
      bootsType: row.boots_type,
      bootsThickness: row.boots_thickness,
      bootsNickname: row.boots_nickname,
      hoodType: row.hood_type,
      hoodThickness: row.hood_thickness,
      hoodNickname: row.hood_nickname,
      bcdType: row.bcd_type,
      bcdNickname: row.bcd_nickname,
      finsType: row.fins_type,
      finsNickname: row.fins_nickname,
      maskNickname: row.mask_nickname,
      notes: row.notes,
      status: row.status || 'live',
      plannedDepth: row.planned_depth ? parseFloat(row.planned_depth) : null,
      plannedBottomTime: row.planned_bottom_time,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      cylinders: cylindersResult.rows.map(c => ({
        id: c.id,
        cylinderSize: c.cylinder_size,
        cylinderMaterial: c.cylinder_material,
        cylinderRole: c.cylinder_role,
        gasMix: c.gas_mix,
        o2Percent: c.o2_percent ? parseFloat(c.o2_percent) : 21,
        hePercent: c.he_percent ? parseFloat(c.he_percent) : 0,
        startPressure: c.start_pressure,
        workingPressure: c.working_pressure,
        nickname: c.nickname,
        sortOrder: c.sort_order
      })),
      weights: weightsResult.rows.map(w => ({
        id: w.id,
        placement: w.placement,
        weightKg: w.weight_kg ? parseFloat(w.weight_kg) : 0,
        sortOrder: w.sort_order
      }))
    };

    res.json(profile);
  } catch (error) {
    console.error('Get gear profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create gear profile
app.post('/api/gear-profiles', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      name, configType, suitType, suitThickness, undersuit, suitNickname,
      glovesType, glovesThickness, glovesNickname, bootsType, bootsThickness, bootsNickname,
      hoodType, hoodThickness, hoodNickname, bcdType, bcdNickname,
      finsType, finsNickname, maskNickname, notes, status,
      plannedDepth, plannedBottomTime, cylinders, weights
    } = req.body;

    if (!name || !configType) {
      return res.status(400).json({ error: 'Name and configuration type are required' });
    }

    const profileResult = await client.query(`
      INSERT INTO gear_profiles (
        user_id, name, config_type, suit_type, suit_thickness, undersuit, suit_nickname,
        gloves_type, gloves_thickness, gloves_nickname, boots_type, boots_thickness, boots_nickname,
        hood_type, hood_thickness, hood_nickname, bcd_type, bcd_nickname,
        fins_type, fins_nickname, mask_nickname, notes, status, planned_depth, planned_bottom_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *
    `, [
      req.user.id, name, configType, suitType || null, suitThickness || null, undersuit || null, suitNickname || null,
      glovesType || null, glovesThickness || null, glovesNickname || null,
      bootsType || null, bootsThickness || null, bootsNickname || null,
      hoodType || null, hoodThickness || null, hoodNickname || null,
      bcdType || null, bcdNickname || null, finsType || null, finsNickname || null, maskNickname || null,
      notes || null, status || 'live', plannedDepth || null, plannedBottomTime || null
    ]);

    const profileId = profileResult.rows[0].id;

    // Insert cylinders
    if (cylinders && cylinders.length > 0) {
      for (let i = 0; i < cylinders.length; i++) {
        const c = cylinders[i];
        await client.query(`
          INSERT INTO gear_cylinders (
            gear_profile_id, cylinder_size, cylinder_material, cylinder_role,
            gas_mix, o2_percent, he_percent, start_pressure, working_pressure, nickname, sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          profileId, c.cylinderSize, c.cylinderMaterial || 'steel', c.cylinderRole || 'bottom_gas',
          c.gasMix || 'air', c.o2Percent || 21, c.hePercent || 0,
          c.startPressure || null, c.workingPressure || null, c.nickname || null, i
        ]);
      }
    }

    // Insert weights
    if (weights && weights.length > 0) {
      for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        await client.query(`
          INSERT INTO gear_weights (gear_profile_id, placement, weight_kg, sort_order)
          VALUES ($1, $2, $3, $4)
        `, [profileId, w.placement, w.weightKg || 0, i]);
      }
    }

    await client.query('COMMIT');

    res.status(201).json({ id: profileId, message: 'Gear profile created successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create gear profile error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Update gear profile
app.put('/api/gear-profiles/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      name, configType, suitType, suitThickness, undersuit, suitNickname,
      glovesType, glovesThickness, glovesNickname, bootsType, bootsThickness, bootsNickname,
      hoodType, hoodThickness, hoodNickname, bcdType, bcdNickname,
      finsType, finsNickname, maskNickname, notes, status,
      plannedDepth, plannedBottomTime, cylinders, weights
    } = req.body;

    // Verify ownership
    const existingResult = await client.query(
      'SELECT id FROM gear_profiles WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Gear profile not found' });
    }

    await client.query(`
      UPDATE gear_profiles SET
        name = COALESCE($1, name),
        config_type = COALESCE($2, config_type),
        suit_type = $3,
        suit_thickness = $4,
        undersuit = $5,
        suit_nickname = $6,
        gloves_type = $7,
        gloves_thickness = $8,
        gloves_nickname = $9,
        boots_type = $10,
        boots_thickness = $11,
        boots_nickname = $12,
        hood_type = $13,
        hood_thickness = $14,
        hood_nickname = $15,
        bcd_type = $16,
        bcd_nickname = $17,
        fins_type = $18,
        fins_nickname = $19,
        mask_nickname = $20,
        notes = $21,
        status = COALESCE($22, status),
        planned_depth = $23,
        planned_bottom_time = $24
      WHERE id = $25 AND user_id = $26
    `, [
      name, configType, suitType || null, suitThickness || null, undersuit || null, suitNickname || null,
      glovesType || null, glovesThickness || null, glovesNickname || null,
      bootsType || null, bootsThickness || null, bootsNickname || null,
      hoodType || null, hoodThickness || null, hoodNickname || null,
      bcdType || null, bcdNickname || null, finsType || null, finsNickname || null, maskNickname || null,
      notes || null, status, plannedDepth || null, plannedBottomTime || null,
      id, req.user.id
    ]);

    // Update cylinders - delete existing and re-insert
    if (cylinders !== undefined) {
      await client.query('DELETE FROM gear_cylinders WHERE gear_profile_id = $1', [id]);
      for (let i = 0; i < cylinders.length; i++) {
        const c = cylinders[i];
        await client.query(`
          INSERT INTO gear_cylinders (
            gear_profile_id, cylinder_size, cylinder_material, cylinder_role,
            gas_mix, o2_percent, he_percent, start_pressure, working_pressure, nickname, sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          id, c.cylinderSize, c.cylinderMaterial || 'steel', c.cylinderRole || 'bottom_gas',
          c.gasMix || 'air', c.o2Percent || 21, c.hePercent || 0,
          c.startPressure || null, c.workingPressure || null, c.nickname || null, i
        ]);
      }
    }

    // Update weights - delete existing and re-insert
    if (weights !== undefined) {
      await client.query('DELETE FROM gear_weights WHERE gear_profile_id = $1', [id]);
      for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        await client.query(`
          INSERT INTO gear_weights (gear_profile_id, placement, weight_kg, sort_order)
          VALUES ($1, $2, $3, $4)
        `, [id, w.placement, w.weightKg || 0, i]);
      }
    }

    await client.query('COMMIT');

    res.json({ message: 'Gear profile updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update gear profile error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Delete gear profile
app.delete('/api/gear-profiles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM gear_profiles WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gear profile not found' });
    }

    res.json({ message: 'Gear profile deleted successfully' });
  } catch (error) {
    console.error('Delete gear profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Duplicate gear profile
app.post('/api/gear-profiles/:id/duplicate', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { name } = req.body;

    // Get original profile
    const originalResult = await client.query(
      'SELECT * FROM gear_profiles WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (originalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Gear profile not found' });
    }

    const original = originalResult.rows[0];

    // Create duplicate with 'live' status
    const newProfileResult = await client.query(`
      INSERT INTO gear_profiles (
        user_id, name, config_type, suit_type, suit_thickness, undersuit, suit_nickname,
        gloves_type, gloves_thickness, gloves_nickname, boots_type, boots_thickness, boots_nickname,
        hood_type, hood_thickness, hood_nickname, bcd_type, bcd_nickname,
        fins_type, fins_nickname, mask_nickname, notes, status, planned_depth, planned_bottom_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING id
    `, [
      req.user.id, name || `${original.name} (copy)`, original.config_type,
      original.suit_type, original.suit_thickness, original.undersuit, original.suit_nickname,
      original.gloves_type, original.gloves_thickness, original.gloves_nickname,
      original.boots_type, original.boots_thickness, original.boots_nickname,
      original.hood_type, original.hood_thickness, original.hood_nickname,
      original.bcd_type, original.bcd_nickname, original.fins_type, original.fins_nickname, original.mask_nickname,
      original.notes, 'live',
      original.planned_depth, original.planned_bottom_time
    ]);

    const newProfileId = newProfileResult.rows[0].id;

    // Duplicate cylinders
    const cylindersResult = await client.query(
      'SELECT * FROM gear_cylinders WHERE gear_profile_id = $1 ORDER BY sort_order',
      [id]
    );

    for (const c of cylindersResult.rows) {
      await client.query(`
        INSERT INTO gear_cylinders (
          gear_profile_id, cylinder_size, cylinder_material, cylinder_role,
          gas_mix, o2_percent, he_percent, start_pressure, working_pressure, nickname, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        newProfileId, c.cylinder_size, c.cylinder_material, c.cylinder_role,
        c.gas_mix, c.o2_percent, c.he_percent, c.start_pressure, c.working_pressure, c.nickname, c.sort_order
      ]);
    }

    // Duplicate weights
    const weightsResult = await client.query(
      'SELECT * FROM gear_weights WHERE gear_profile_id = $1 ORDER BY sort_order',
      [id]
    );

    for (const w of weightsResult.rows) {
      await client.query(`
        INSERT INTO gear_weights (gear_profile_id, placement, weight_kg, sort_order)
        VALUES ($1, $2, $3, $4)
      `, [newProfileId, w.placement, w.weight_kg, w.sort_order]);
    }

    await client.query('COMMIT');

    res.status(201).json({ id: newProfileId, message: 'Gear profile duplicated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Duplicate gear profile error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ============ CYLINDER TESTING STANDARDS ============

function getCylinderTestingSchedule(standard, customVisualMonths, customHydroMonths) {
  switch (standard) {
    case 'UK':
    case 'EU':
      return { visualMonths: 30, hydroMonths: 60 };
    case 'US':
      return { visualMonths: null, hydroMonths: 60 };
    case 'custom':
      return {
        visualMonths: customVisualMonths || null,
        hydroMonths: customHydroMonths || null,
      };
    default:
      return { visualMonths: 30, hydroMonths: 60 };
  }
}

function calculateCylinderNextDue(cylinder) {
  const schedule = getCylinderTestingSchedule(
    cylinder.testing_standard,
    cylinder.custom_visual_interval_months,
    cylinder.custom_hydro_interval_months
  );

  const now = new Date();
  const results = {};

  if (schedule.visualMonths && cylinder.last_visual_date) {
    const d = new Date(cylinder.last_visual_date);
    d.setMonth(d.getMonth() + schedule.visualMonths);
    results.nextVisualDue = d;
  } else if (schedule.visualMonths) {
    results.nextVisualDue = null;
  }

  if (schedule.hydroMonths && cylinder.last_hydro_date) {
    const d = new Date(cylinder.last_hydro_date);
    d.setMonth(d.getMonth() + schedule.hydroMonths);
    results.nextHydroDue = d;
  } else if (schedule.hydroMonths) {
    results.nextHydroDue = null;
  }

  if (cylinder.is_enriched_gas && cylinder.oxygen_clean_interval_months && cylinder.last_oxygen_clean_date) {
    const d = new Date(cylinder.last_oxygen_clean_date);
    d.setMonth(d.getMonth() + cylinder.oxygen_clean_interval_months);
    results.nextOxygenCleanDue = d;
  } else if (cylinder.is_enriched_gas) {
    results.nextOxygenCleanDue = null;
  }

  return results;
}

async function recalcLastDatesFromHistory(cylinderId) {
  const types = ['visual', 'hydrostatic', 'oxygen_clean'];
  const cols = ['last_visual_date', 'last_hydro_date', 'last_oxygen_clean_date'];
  for (let i = 0; i < types.length; i++) {
    const latest = await pool.query(
      `SELECT test_date FROM cylinder_test_records
       WHERE cylinder_id = $1 AND test_type = $2 AND result = 'pass'
       ORDER BY test_date DESC LIMIT 1`,
      [cylinderId, types[i]]
    );
    const val = latest.rows.length > 0 ? latest.rows[0].test_date : null;
    await pool.query(`UPDATE cylinders SET ${cols[i]} = $1 WHERE id = $2`, [val, cylinderId]);
  }
}

const AMBER_THRESHOLD_DAYS = 30;

function getCylinderStatus(cylinder) {
  const now = new Date();
  const dueDates = calculateCylinderNextDue(cylinder);
  let worstStatus = 'green';

  const checkDate = (dueDate) => {
    if (dueDate === undefined) return 'green';
    if (dueDate === null) return 'red';
    const diffMs = dueDate.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return 'red';
    if (diffDays <= AMBER_THRESHOLD_DAYS) return 'amber';
    return 'green';
  };

  const statusPriority = { green: 0, amber: 1, red: 2 };

  for (const key of Object.keys(dueDates)) {
    const s = checkDate(dueDates[key]);
    if (statusPriority[s] > statusPriority[worstStatus]) {
      worstStatus = s;
    }
  }

  return { status: worstStatus, dueDates };
}

function formatCylinderRow(row) {
  const { status, dueDates } = getCylinderStatus(row);
  return {
    id: row.id,
    nickname: row.nickname,
    cylinderType: row.cylinder_type,
    sizeLiters: row.size_liters ? parseFloat(row.size_liters) : null,
    serialNumber: row.serial_number,
    workingPressure: row.working_pressure ? parseFloat(row.working_pressure) : null,
    manufactureDate: row.manufacture_date,
    ownershipStatus: row.ownership_status,
    testingStandard: row.testing_standard,
    customVisualIntervalMonths: row.custom_visual_interval_months,
    customHydroIntervalMonths: row.custom_hydro_interval_months,
    isEnrichedGas: row.is_enriched_gas,
    oxygenCleanIntervalMonths: row.oxygen_clean_interval_months,
    lastVisualDate: row.last_visual_date,
    lastHydroDate: row.last_hydro_date,
    lastOxygenCleanDate: row.last_oxygen_clean_date,
    reminderEnabled: row.reminder_enabled,
    reminderDaysBefore: row.reminder_days_before,
    gearProfileId: row.gear_profile_id,
    status,
    nextVisualDue: dueDates.nextVisualDue || null,
    nextHydroDue: dueDates.nextHydroDue || null,
    nextOxygenCleanDue: dueDates.nextOxygenCleanDue || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============ CYLINDERS API ============

app.get('/api/cylinders', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cylinders WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.id]
    );
    const cylinders = result.rows.map(formatCylinderRow);
    res.json({ cylinders });
  } catch (error) {
    console.error('Get cylinders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/cylinders/summary', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cylinders WHERE user_id = $1',
      [req.user.id]
    );
    let inTest = 0, dueSoon = 0, overdue = 0;
    for (const row of result.rows) {
      const { status } = getCylinderStatus(row);
      if (status === 'green') inTest++;
      else if (status === 'amber') dueSoon++;
      else overdue++;
    }
    res.json({ total: result.rows.length, inTest, dueSoon, overdue });
  } catch (error) {
    console.error('Get cylinder summary error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/cylinders/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cylinders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cylinder not found' });
    }
    res.json(formatCylinderRow(result.rows[0]));
  } catch (error) {
    console.error('Get cylinder error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

const VALID_CYLINDER_TYPES = ['steel', 'aluminium', 'composite'];
const VALID_OWNERSHIP_STATUSES = ['owned', 'rented', 'borrowed', 'club'];
const VALID_TESTING_STANDARDS = ['UK', 'US', 'EU', 'custom'];
const VALID_TEST_TYPES = ['visual', 'hydrostatic', 'oxygen_clean'];
const VALID_TEST_RESULTS = ['pass', 'fail'];

app.post('/api/cylinders', authenticateToken, async (req, res) => {
  try {
    const {
      nickname, cylinderType, sizeLiters, serialNumber, workingPressure,
      manufactureDate, ownershipStatus, testingStandard,
      customVisualIntervalMonths, customHydroIntervalMonths,
      isEnrichedGas, oxygenCleanIntervalMonths,
      lastVisualDate, lastHydroDate, lastOxygenCleanDate,
      reminderEnabled, reminderDaysBefore, gearProfileId,
    } = req.body;

    if (!nickname) {
      return res.status(400).json({ error: 'Nickname is required' });
    }
    if (cylinderType && !VALID_CYLINDER_TYPES.includes(cylinderType)) {
      return res.status(400).json({ error: 'Invalid cylinder type' });
    }
    if (ownershipStatus && !VALID_OWNERSHIP_STATUSES.includes(ownershipStatus)) {
      return res.status(400).json({ error: 'Invalid ownership status' });
    }
    if (testingStandard && !VALID_TESTING_STANDARDS.includes(testingStandard)) {
      return res.status(400).json({ error: 'Invalid testing standard' });
    }

    const result = await pool.query(`
      INSERT INTO cylinders (
        user_id, nickname, cylinder_type, size_liters, serial_number, working_pressure,
        manufacture_date, ownership_status, testing_standard,
        custom_visual_interval_months, custom_hydro_interval_months,
        is_enriched_gas, oxygen_clean_interval_months,
        last_visual_date, last_hydro_date, last_oxygen_clean_date,
        reminder_enabled, reminder_days_before, gear_profile_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *
    `, [
      req.user.id, nickname, cylinderType || 'steel', sizeLiters || null,
      serialNumber || null, workingPressure || null, manufactureDate || null,
      ownershipStatus || 'owned', testingStandard || 'UK',
      customVisualIntervalMonths || null, customHydroIntervalMonths || null,
      isEnrichedGas || false, oxygenCleanIntervalMonths || 15,
      lastVisualDate || null, lastHydroDate || null, lastOxygenCleanDate || null,
      reminderEnabled !== false, reminderDaysBefore || 30, gearProfileId || null,
    ]);

    res.status(201).json(formatCylinderRow(result.rows[0]));
  } catch (error) {
    console.error('Create cylinder error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/cylinders/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nickname, cylinderType, sizeLiters, serialNumber, workingPressure,
      manufactureDate, ownershipStatus, testingStandard,
      customVisualIntervalMonths, customHydroIntervalMonths,
      isEnrichedGas, oxygenCleanIntervalMonths,
      lastVisualDate, lastHydroDate, lastOxygenCleanDate,
      reminderEnabled, reminderDaysBefore, gearProfileId,
    } = req.body;

    const result = await pool.query(`
      UPDATE cylinders SET
        nickname = COALESCE($1, nickname),
        cylinder_type = COALESCE($2, cylinder_type),
        size_liters = $3,
        serial_number = $4,
        working_pressure = $5,
        manufacture_date = $6,
        ownership_status = COALESCE($7, ownership_status),
        testing_standard = COALESCE($8, testing_standard),
        custom_visual_interval_months = $9,
        custom_hydro_interval_months = $10,
        is_enriched_gas = COALESCE($11, is_enriched_gas),
        oxygen_clean_interval_months = COALESCE($12, oxygen_clean_interval_months),
        last_visual_date = $13,
        last_hydro_date = $14,
        last_oxygen_clean_date = $15,
        reminder_enabled = COALESCE($16, reminder_enabled),
        reminder_days_before = COALESCE($17, reminder_days_before),
        gear_profile_id = $18
      WHERE id = $19 AND user_id = $20
      RETURNING *
    `, [
      nickname, cylinderType, sizeLiters ?? null, serialNumber ?? null,
      workingPressure ?? null, manufactureDate ?? null, ownershipStatus,
      testingStandard, customVisualIntervalMonths ?? null, customHydroIntervalMonths ?? null,
      isEnrichedGas, oxygenCleanIntervalMonths, lastVisualDate ?? null,
      lastHydroDate ?? null, lastOxygenCleanDate ?? null,
      reminderEnabled, reminderDaysBefore, gearProfileId ?? null,
      id, req.user.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cylinder not found' });
    }

    await pool.query(
      'DELETE FROM cylinder_notifications_sent WHERE cylinder_id = $1',
      [id]
    );

    res.json(formatCylinderRow(result.rows[0]));
  } catch (error) {
    console.error('Update cylinder error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/cylinders/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM cylinders WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cylinder not found' });
    }
    res.json({ message: 'Cylinder deleted successfully' });
  } catch (error) {
    console.error('Delete cylinder error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/cylinders/:id/test-records', authenticateToken, async (req, res) => {
  try {
    const cyl = await pool.query(
      'SELECT id FROM cylinders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (cyl.rows.length === 0) {
      return res.status(404).json({ error: 'Cylinder not found' });
    }

    const result = await pool.query(
      'SELECT * FROM cylinder_test_records WHERE cylinder_id = $1 ORDER BY test_date DESC',
      [req.params.id]
    );

    const records = result.rows.map(r => ({
      id: r.id,
      cylinderId: r.cylinder_id,
      testDate: r.test_date,
      testType: r.test_type,
      result: r.result,
      facilityName: r.facility_name,
      notes: r.notes,
      createdAt: r.created_at,
    }));

    res.json({ records });
  } catch (error) {
    console.error('Get test records error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/cylinders/:id/test-records', authenticateToken, async (req, res) => {
  try {
    const cylinderId = req.params.id;
    const cyl = await pool.query(
      'SELECT id FROM cylinders WHERE id = $1 AND user_id = $2',
      [cylinderId, req.user.id]
    );
    if (cyl.rows.length === 0) {
      return res.status(404).json({ error: 'Cylinder not found' });
    }

    const { testDate, testType, result: testResult, facilityName, notes } = req.body;
    if (!testDate || !testType) {
      return res.status(400).json({ error: 'Test date and type are required' });
    }
    if (!VALID_TEST_TYPES.includes(testType)) {
      return res.status(400).json({ error: 'Invalid test type' });
    }
    if (testResult && !VALID_TEST_RESULTS.includes(testResult)) {
      return res.status(400).json({ error: 'Invalid test result' });
    }

    const insertResult = await pool.query(`
      INSERT INTO cylinder_test_records (cylinder_id, test_date, test_type, result, facility_name, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [cylinderId, testDate, testType, testResult || 'pass', facilityName || null, notes || null]);

    await recalcLastDatesFromHistory(cylinderId);

    await pool.query(
      'DELETE FROM cylinder_notifications_sent WHERE cylinder_id = $1 AND test_type = $2',
      [cylinderId, testType]
    );

    const r = insertResult.rows[0];
    res.status(201).json({
      id: r.id,
      cylinderId: r.cylinder_id,
      testDate: r.test_date,
      testType: r.test_type,
      result: r.result,
      facilityName: r.facility_name,
      notes: r.notes,
      createdAt: r.created_at,
    });
  } catch (error) {
    console.error('Create test record error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/cylinders/:cylinderId/test-records/:recordId', authenticateToken, async (req, res) => {
  try {
    const { cylinderId, recordId } = req.params;
    const cyl = await pool.query(
      'SELECT id FROM cylinders WHERE id = $1 AND user_id = $2',
      [cylinderId, req.user.id]
    );
    if (cyl.rows.length === 0) {
      return res.status(404).json({ error: 'Cylinder not found' });
    }

    const { testDate, testType, result: testResult, facilityName, notes } = req.body;

    const result = await pool.query(`
      UPDATE cylinder_test_records SET
        test_date = COALESCE($1, test_date),
        test_type = COALESCE($2, test_type),
        result = COALESCE($3, result),
        facility_name = $4,
        notes = $5
      WHERE id = $6 AND cylinder_id = $7
      RETURNING *
    `, [testDate, testType, testResult, facilityName ?? null, notes ?? null, recordId, cylinderId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Test record not found' });
    }

    await recalcLastDatesFromHistory(cylinderId);

    const r = result.rows[0];
    res.json({
      id: r.id,
      cylinderId: r.cylinder_id,
      testDate: r.test_date,
      testType: r.test_type,
      result: r.result,
      facilityName: r.facility_name,
      notes: r.notes,
      createdAt: r.created_at,
    });
  } catch (error) {
    console.error('Update test record error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/cylinders/:cylinderId/test-records/:recordId', authenticateToken, async (req, res) => {
  try {
    const { cylinderId, recordId } = req.params;
    const cyl = await pool.query(
      'SELECT id FROM cylinders WHERE id = $1 AND user_id = $2',
      [cylinderId, req.user.id]
    );
    if (cyl.rows.length === 0) {
      return res.status(404).json({ error: 'Cylinder not found' });
    }

    const result = await pool.query(
      'DELETE FROM cylinder_test_records WHERE id = $1 AND cylinder_id = $2 RETURNING id',
      [recordId, cylinderId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Test record not found' });
    }

    await recalcLastDatesFromHistory(cylinderId);

    res.json({ message: 'Test record deleted successfully' });
  } catch (error) {
    console.error('Delete test record error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ CYLINDER NOTIFICATION SCHEDULER ============

async function checkCylinderReminders() {
  try {
    const result = await pool.query(
      'SELECT c.*, u.id as uid FROM cylinders c JOIN users u ON c.user_id = u.id WHERE c.reminder_enabled = true'
    );

    const now = new Date();

    for (const cyl of result.rows) {
      const dueDates = calculateCylinderNextDue(cyl);
      const reminderWindowMs = (cyl.reminder_days_before || 30) * 86400000;

      const checks = [];
      if (dueDates.nextVisualDue !== undefined) checks.push({ type: 'visual', due: dueDates.nextVisualDue, label: 'visual inspection' });
      if (dueDates.nextHydroDue !== undefined) checks.push({ type: 'hydrostatic', due: dueDates.nextHydroDue, label: 'hydrostatic test' });
      if (dueDates.nextOxygenCleanDue !== undefined) checks.push({ type: 'oxygen_clean', due: dueDates.nextOxygenCleanDue, label: 'oxygen cleaning' });

      for (const check of checks) {
        const isDueOrOverdue = check.due === null || (check.due && check.due.getTime() - now.getTime() <= reminderWindowMs);
        if (isDueOrOverdue) {
          const existing = await pool.query(
            'SELECT id FROM cylinder_notifications_sent WHERE cylinder_id = $1 AND test_type = $2',
            [cyl.id, check.type]
          );
          if (existing.rows.length > 0) continue;

          const isOverdue = check.due === null || check.due.getTime() < now.getTime();
          const title = isOverdue ? 'Cylinder Test Overdue' : 'Cylinder Test Due Soon';
          const body = `${cyl.nickname}: ${check.label} is ${isOverdue ? 'overdue' : 'due soon'}`;

          await sendPushNotification(cyl.user_id, title, body, { type: 'cylinder_reminder', cylinderId: cyl.id });

          await pool.query(
            'INSERT INTO cylinder_notifications_sent (cylinder_id, test_type) VALUES ($1, $2) ON CONFLICT (cylinder_id, test_type) DO UPDATE SET sent_at = CURRENT_TIMESTAMP',
            [cyl.id, check.type]
          );
        }
      }
    }
  } catch (error) {
    console.error('Cylinder reminder check error:', error);
  }
}

setInterval(checkCylinderReminders, 24 * 60 * 60 * 1000);
setTimeout(checkCylinderReminders, 60 * 1000);

// ============ DIVE PLANNING API ============

// Get all dive plans for user
app.get('/api/dive-plans', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dp.*,
        (SELECT COUNT(*) FROM dive_plan_dives WHERE dive_plan_id = dp.id) as dive_count
      FROM dive_plans dp
      WHERE dp.user_id = $1
      ORDER BY dp.updated_at DESC
    `, [req.user.id]);

    const plans = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      gfLow: row.gf_low,
      gfHigh: row.gf_high,
      descentRate: parseFloat(row.descent_rate),
      ascentRate: parseFloat(row.ascent_rate),
      lastStopDepth: row.last_stop_depth,
      decoStopInterval: row.deco_stop_interval,
      diveCount: parseInt(row.dive_count) || 0,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({ plans });
  } catch (error) {
    console.error('Get dive plans error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single dive plan with dives and gases
app.get('/api/dive-plans/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const planResult = await pool.query(
      'SELECT * FROM dive_plans WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dive plan not found' });
    }

    const row = planResult.rows[0];

    const divesResult = await pool.query(
      'SELECT * FROM dive_plan_dives WHERE dive_plan_id = $1 ORDER BY dive_order',
      [id]
    );

    const gasesResult = await pool.query(
      'SELECT * FROM dive_plan_gases WHERE dive_plan_id = $1 ORDER BY sort_order',
      [id]
    );

    const plan = {
      id: row.id,
      name: row.name,
      gfLow: row.gf_low,
      gfHigh: row.gf_high,
      descentRate: parseFloat(row.descent_rate),
      ascentRate: parseFloat(row.ascent_rate),
      lastStopDepth: row.last_stop_depth,
      decoStopInterval: row.deco_stop_interval,
      sacRateBottom: row.sac_rate_bottom ? parseFloat(row.sac_rate_bottom) : 20,
      sacRateDeco: row.sac_rate_deco ? parseFloat(row.sac_rate_deco) : 15,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      dives: divesResult.rows.map(d => ({
        id: d.id,
        diveOrder: d.dive_order,
        depth: parseFloat(d.depth),
        bottomTime: d.bottom_time,
        surfaceInterval: d.surface_interval || 0,
        notes: d.notes
      })),
      gases: gasesResult.rows.map(g => ({
        id: g.id,
        name: g.name,
        o2Percent: parseFloat(g.o2_percent),
        hePercent: parseFloat(g.he_percent),
        switchDepth: g.switch_depth ? parseFloat(g.switch_depth) : null,
        isBottomGas: g.is_bottom_gas,
        sortOrder: g.sort_order
      }))
    };

    res.json(plan);
  } catch (error) {
    console.error('Get dive plan error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create dive plan
app.post('/api/dive-plans', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      name, gfLow, gfHigh, descentRate, ascentRate, lastStopDepth, decoStopInterval,
      sacRateBottom, sacRateDeco, notes, dives, gases
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Plan name is required' });
    }

    const planResult = await client.query(`
      INSERT INTO dive_plans (
        user_id, name, gf_low, gf_high, descent_rate, ascent_rate,
        last_stop_depth, deco_stop_interval, sac_rate_bottom, sac_rate_deco, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      req.user.id, name, gfLow || 30, gfHigh || 70, descentRate || 20, ascentRate || 10,
      lastStopDepth || 3, decoStopInterval || 3, sacRateBottom || 20, sacRateDeco || 15, notes || null
    ]);

    const planId = planResult.rows[0].id;

    if (dives && dives.length > 0) {
      for (let i = 0; i < dives.length; i++) {
        const d = dives[i];
        await client.query(`
          INSERT INTO dive_plan_dives (dive_plan_id, dive_order, depth, bottom_time, surface_interval, notes)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [planId, i, d.depth, d.bottomTime, d.surfaceInterval || 0, d.notes || null]);
      }
    }

    if (gases && gases.length > 0) {
      for (let i = 0; i < gases.length; i++) {
        const g = gases[i];
        await client.query(`
          INSERT INTO dive_plan_gases (dive_plan_id, name, o2_percent, he_percent, switch_depth, is_bottom_gas, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [planId, g.name || null, g.o2Percent || 21, g.hePercent || 0, g.switchDepth || null, g.isBottomGas || false, i]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ id: planId, message: 'Dive plan created successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create dive plan error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Update dive plan
app.put('/api/dive-plans/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      name, gfLow, gfHigh, descentRate, ascentRate, lastStopDepth, decoStopInterval,
      sacRateBottom, sacRateDeco, notes, dives, gases
    } = req.body;

    const existingResult = await client.query(
      'SELECT id FROM dive_plans WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dive plan not found' });
    }

    await client.query(`
      UPDATE dive_plans SET
        name = COALESCE($1, name),
        gf_low = COALESCE($2, gf_low),
        gf_high = COALESCE($3, gf_high),
        descent_rate = COALESCE($4, descent_rate),
        ascent_rate = COALESCE($5, ascent_rate),
        last_stop_depth = COALESCE($6, last_stop_depth),
        deco_stop_interval = COALESCE($7, deco_stop_interval),
        sac_rate_bottom = COALESCE($8, sac_rate_bottom),
        sac_rate_deco = COALESCE($9, sac_rate_deco),
        notes = $10
      WHERE id = $11 AND user_id = $12
    `, [
      name, gfLow, gfHigh, descentRate, ascentRate, lastStopDepth, decoStopInterval,
      sacRateBottom, sacRateDeco, notes || null, id, req.user.id
    ]);

    if (dives !== undefined) {
      await client.query('DELETE FROM dive_plan_dives WHERE dive_plan_id = $1', [id]);
      for (let i = 0; i < dives.length; i++) {
        const d = dives[i];
        await client.query(`
          INSERT INTO dive_plan_dives (dive_plan_id, dive_order, depth, bottom_time, surface_interval, notes)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [id, i, d.depth, d.bottomTime, d.surfaceInterval || 0, d.notes || null]);
      }
    }

    if (gases !== undefined) {
      await client.query('DELETE FROM dive_plan_gases WHERE dive_plan_id = $1', [id]);
      for (let i = 0; i < gases.length; i++) {
        const g = gases[i];
        await client.query(`
          INSERT INTO dive_plan_gases (dive_plan_id, name, o2_percent, he_percent, switch_depth, is_bottom_gas, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [id, g.name || null, g.o2Percent || 21, g.hePercent || 0, g.switchDepth || null, g.isBottomGas || false, i]);
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Dive plan updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update dive plan error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Delete dive plan
app.delete('/api/dive-plans/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM dive_plans WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dive plan not found' });
    }

    res.json({ message: 'Dive plan deleted successfully' });
  } catch (error) {
    console.error('Delete dive plan error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// Training Agencies and Certifications API
// ============================================

// Get all training agencies
app.get('/api/training-agencies', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, full_name, website, logo_url, description, founded_year, headquarters
       FROM training_agencies WHERE is_active = TRUE ORDER BY name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get training agencies error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get courses for an agency
app.get('/api/training-agencies/:agencyId/courses', authenticateToken, async (req, res) => {
  try {
    const { agencyId } = req.params;
    const result = await pool.query(
      `SELECT id, name, level, category, description, prerequisites, min_age, min_dives, sort_order
       FROM training_courses 
       WHERE agency_id = $1 AND is_active = TRUE 
       ORDER BY sort_order, name`,
      [agencyId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get agency courses error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all courses (with agency info)
app.get('/api/training-courses', authenticateToken, async (req, res) => {
  try {
    const { level, category } = req.query;
    let query = `
      SELECT c.id, c.name, c.level, c.category, c.description, c.sort_order,
             a.id as agency_id, a.name as agency_name, a.logo_url as agency_logo
      FROM training_courses c
      JOIN training_agencies a ON c.agency_id = a.id
      WHERE c.is_active = TRUE AND a.is_active = TRUE
    `;
    const params = [];
    
    if (level) {
      params.push(level);
      query += ` AND c.level = $${params.length}`;
    }
    if (category) {
      params.push(category);
      query += ` AND c.category = $${params.length}`;
    }
    
    query += ' ORDER BY a.name, c.sort_order, c.name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get all courses error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user certifications
app.get('/api/certifications', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT uc.id, uc.certification_date, uc.certification_number, 
              uc.instructor_name, uc.instructor_number, uc.dive_center, 
              uc.location, uc.latitude, uc.longitude, uc.notes, uc.is_verified, uc.created_at,
              tc.id as course_id, tc.name as course_name, tc.level as course_level, tc.category as course_category,
              ta.id as agency_id, ta.name as agency_name, ta.logo_url as agency_logo,
              (SELECT json_agg(json_build_object('id', ci.id, 'image_url', ci.image_url, 'image_side', ci.image_side))
               FROM certification_images ci WHERE ci.certification_id = uc.id) as images
       FROM user_certifications uc
       LEFT JOIN training_courses tc ON uc.course_id = tc.id
       LEFT JOIN training_agencies ta ON tc.agency_id = ta.id
       WHERE uc.user_id = $1
       ORDER BY uc.certification_date DESC NULLS LAST, uc.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get certifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single certification
app.get('/api/certifications/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT uc.id, uc.certification_date, uc.certification_number, 
              uc.instructor_name, uc.instructor_number, uc.dive_center, 
              uc.location, uc.latitude, uc.longitude, uc.notes, uc.is_verified, uc.created_at,
              tc.id as course_id, tc.name as course_name, tc.level as course_level, tc.category as course_category,
              ta.id as agency_id, ta.name as agency_name, ta.logo_url as agency_logo,
              (SELECT json_agg(json_build_object('id', ci.id, 'image_url', ci.image_url, 'image_side', ci.image_side))
               FROM certification_images ci WHERE ci.certification_id = uc.id) as images
       FROM user_certifications uc
       LEFT JOIN training_courses tc ON uc.course_id = tc.id
       LEFT JOIN training_agencies ta ON tc.agency_id = ta.id
       WHERE uc.id = $1 AND uc.user_id = $2`,
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get certification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create certification
app.post('/api/certifications', authenticateToken, async (req, res) => {
  try {
    const { courseId, certificationDate, certificationNumber, instructorName, 
            instructorNumber, diveCenter, location, latitude, longitude, notes } = req.body;
    
    const result = await pool.query(
      `INSERT INTO user_certifications 
       (user_id, course_id, certification_date, certification_number, 
        instructor_name, instructor_number, dive_center, location, latitude, longitude, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [req.user.id, courseId || null, certificationDate || null, certificationNumber || null,
       instructorName || null, instructorNumber || null, diveCenter || null, location || null, 
       latitude || null, longitude || null, notes || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create certification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update certification
app.put('/api/certifications/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { courseId, certificationDate, certificationNumber, instructorName, 
            instructorNumber, diveCenter, location, latitude, longitude, notes } = req.body;
    
    const result = await pool.query(
      `UPDATE user_certifications 
       SET course_id = $1, certification_date = $2, certification_number = $3,
           instructor_name = $4, instructor_number = $5, dive_center = $6,
           location = $7, latitude = $8, longitude = $9, notes = $10
       WHERE id = $11 AND user_id = $12
       RETURNING *`,
      [courseId || null, certificationDate || null, certificationNumber || null,
       instructorName || null, instructorNumber || null, diveCenter || null,
       location || null, latitude || null, longitude || null, notes || null, id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update certification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete certification
app.delete('/api/certifications/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM user_certifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }
    
    res.json({ message: 'Certification deleted successfully' });
  } catch (error) {
    console.error('Delete certification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add certification image
app.post('/api/certifications/:id/images', authenticateToken, async (req, res) => {
  console.log('Add certification image request:', { id: req.params.id, body: req.body });
  try {
    const { id } = req.params;
    const { imageUrl, imageSide, caption } = req.body;
    
    // Verify certification belongs to user
    const certCheck = await pool.query(
      'SELECT id FROM user_certifications WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (certCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }
    
    const result = await pool.query(
      `INSERT INTO certification_images (certification_id, image_url, image_side, caption)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, imageUrl, imageSide || 'front', caption || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add certification image error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete certification image
app.delete('/api/certifications/:certId/images/:imageId', authenticateToken, async (req, res) => {
  try {
    const { certId, imageId } = req.params;
    
    // Verify certification belongs to user
    const certCheck = await pool.query(
      'SELECT id FROM user_certifications WHERE id = $1 AND user_id = $2',
      [certId, req.user.id]
    );
    
    if (certCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }
    
    // Get the image URL before deleting
    const imageResult = await pool.query(
      'SELECT image_url FROM certification_images WHERE id = $1 AND certification_id = $2',
      [imageId, certId]
    );
    
    if (imageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const imageUrl = imageResult.rows[0].image_url;
    
    // Delete from database
    await pool.query(
      'DELETE FROM certification_images WHERE id = $1 AND certification_id = $2',
      [imageId, certId]
    );
    
    // Delete from Object Storage if it's not an external URL
    if (imageUrl && !imageUrl.startsWith('http')) {
      try {
        const { Client } = require('@replit/object-storage');
        const objectStorage = new Client();
        await objectStorage.delete(imageUrl);
        console.log('Deleted from Object Storage:', imageUrl);
      } catch (storageError) {
        console.error('Failed to delete from Object Storage:', storageError);
        // Continue anyway - the DB record is deleted
      }
    }
    
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete certification image error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user wishlist
app.get('/api/certification-wishlist', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.priority, w.target_date, w.notes, w.dive_center, w.created_at,
              tc.id as course_id, tc.name as course_name, tc.level as course_level, tc.category as course_category,
              ta.id as agency_id, ta.name as agency_name, ta.logo_url as agency_logo
       FROM user_course_wishlist w
       JOIN training_courses tc ON w.course_id = tc.id
       JOIN training_agencies ta ON tc.agency_id = ta.id
       WHERE w.user_id = $1
       ORDER BY w.priority DESC, w.target_date NULLS LAST, w.created_at`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add to wishlist
app.post('/api/certification-wishlist', authenticateToken, async (req, res) => {
  try {
    const { courseId, priority, targetDate, notes, diveCenter } = req.body;
    
    if (!courseId) {
      return res.status(400).json({ error: 'Course ID is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO user_course_wishlist (user_id, course_id, priority, target_date, notes, dive_center)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, course_id) DO UPDATE 
       SET priority = EXCLUDED.priority, target_date = EXCLUDED.target_date, notes = EXCLUDED.notes, dive_center = EXCLUDED.dive_center
       RETURNING *`,
      [req.user.id, courseId, priority || 0, targetDate || null, notes || null, diveCenter || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update wishlist item
app.put('/api/certification-wishlist/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { priority, targetDate, notes, diveCenter } = req.body;
    
    const result = await pool.query(
      `UPDATE user_course_wishlist 
       SET priority = $1, target_date = $2, notes = $3, dive_center = $4
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [priority || 0, targetDate || null, notes || null, diveCenter || null, id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wishlist item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update wishlist error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove from wishlist
app.delete('/api/certification-wishlist/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM user_course_wishlist WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wishlist item not found' });
    }
    
    res.json({ message: 'Removed from wishlist' });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Promote wishlist item to certification
app.post('/api/certification-wishlist/:id/complete', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { certificationDate, certificationNumber, instructorName, 
            instructorNumber, diveCenter, location, notes } = req.body;
    
    await client.query('BEGIN');
    
    // Get the wishlist item
    const wishlistResult = await client.query(
      'SELECT course_id FROM user_course_wishlist WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (wishlistResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Wishlist item not found' });
    }
    
    const courseId = wishlistResult.rows[0].course_id;
    
    // Create the certification
    const certResult = await client.query(
      `INSERT INTO user_certifications 
       (user_id, course_id, certification_date, certification_number, 
        instructor_name, instructor_number, dive_center, location, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.user.id, courseId, certificationDate || null, certificationNumber || null,
       instructorName || null, instructorNumber || null, diveCenter || null, location || null, notes || null]
    );
    
    // Remove from wishlist
    await client.query(
      'DELETE FROM user_course_wishlist WHERE id = $1',
      [id]
    );
    
    await client.query('COMMIT');
    res.status(201).json(certResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Complete wishlist error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ============== DIVE TRIPS API ==============

// Get all dive trips for user
app.get('/api/dive-trips', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT dt.*, 
              (SELECT COUNT(*) FROM dive_trip_logs dtl WHERE dtl.trip_id = dt.id) as linked_dives,
              (SELECT COUNT(*) FROM dive_photos dp 
               JOIN dive_trip_logs dtl ON dp.dive_log_id = dtl.dive_log_id 
               WHERE dtl.trip_id = dt.id AND dp.deleted_at IS NULL) as photo_count
       FROM dive_trips dt
       WHERE dt.user_id = $1 AND dt.deleted_at IS NULL
       ORDER BY dt.start_date DESC NULLS LAST, dt.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get dive trips error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single dive trip with linked dives
app.get('/api/dive-trips/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const tripResult = await pool.query(
      `SELECT * FROM dive_trips WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, req.user.id]
    );
    
    if (tripResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    // Get linked dive logs
    const logsResult = await pool.query(
      `SELECT dl.id, dl.dive_datetime, ds.name as site_name, ds.description as site_description,
              dl.max_depth_meters, ROUND(dl.duration_seconds / 60.0) as duration_minutes
       FROM dive_logs dl
       JOIN dive_trip_logs dtl ON dl.id = dtl.dive_log_id
       LEFT JOIN dive_sites ds ON dl.dive_site_id = ds.id
       WHERE dtl.trip_id = $1
       ORDER BY dl.dive_datetime ASC`,
      [id]
    );
    
    res.json({
      ...tripResult.rows[0],
      linked_dives: logsResult.rows
    });
  } catch (error) {
    console.error('Get dive trip error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create dive trip
app.post('/api/dive-trips', authenticateToken, async (req, res) => {
  try {
    const { name, tripType, startDate, endDate, operatorName, vesselName,
            diveCenterName, location, country, latitude, longitude,
            accommodation, notes, coverImageKey } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Trip name is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO dive_trips 
       (user_id, name, trip_type, start_date, end_date, operator_name, vessel_name,
        dive_center_name, location, country, latitude, longitude, accommodation, notes, cover_image_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [req.user.id, name, tripType || 'dive_center', startDate || null, endDate || null,
       operatorName || null, vesselName || null, diveCenterName || null,
       location || null, country || null, latitude || null, longitude || null,
       accommodation || null, notes || null, coverImageKey || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create dive trip error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update dive trip
app.put('/api/dive-trips/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, tripType, startDate, endDate, operatorName, vesselName,
            diveCenterName, location, country, latitude, longitude,
            accommodation, notes, coverImageKey } = req.body;
    
    const result = await pool.query(
      `UPDATE dive_trips SET
        name = COALESCE($1, name),
        trip_type = COALESCE($2, trip_type),
        start_date = $3,
        end_date = $4,
        operator_name = $5,
        vessel_name = $6,
        dive_center_name = $7,
        location = $8,
        country = $9,
        latitude = $10,
        longitude = $11,
        accommodation = $12,
        notes = $13,
        cover_image_key = COALESCE($14, cover_image_key)
       WHERE id = $15 AND user_id = $16 AND deleted_at IS NULL
       RETURNING *`,
      [name, tripType, startDate || null, endDate || null, operatorName || null,
       vesselName || null, diveCenterName || null, location || null, country || null,
       latitude || null, longitude || null, accommodation || null, notes || null,
       coverImageKey, id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update dive trip error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete dive trip (soft delete)
app.delete('/api/dive-trips/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `UPDATE dive_trips SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('Delete dive trip error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Link dive log to trip
app.post('/api/dive-trips/:id/logs', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { diveLogId } = req.body;
    
    // Verify trip belongs to user
    const tripCheck = await pool.query(
      'SELECT id FROM dive_trips WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, req.user.id]
    );
    
    if (tripCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    // Verify dive log belongs to user
    const logCheck = await pool.query(
      'SELECT id FROM dive_logs WHERE id = $1 AND user_id = $2',
      [diveLogId, req.user.id]
    );
    
    if (logCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dive log not found' });
    }
    
    await pool.query(
      `INSERT INTO dive_trip_logs (trip_id, dive_log_id)
       VALUES ($1, $2)
       ON CONFLICT (trip_id, dive_log_id) DO NOTHING`,
      [id, diveLogId]
    );
    
    // Update total dives count
    await pool.query(
      `UPDATE dive_trips SET total_dives = (SELECT COUNT(*) FROM dive_trip_logs WHERE trip_id = $1)
       WHERE id = $1`,
      [id]
    );
    
    res.json({ message: 'Dive linked to trip' });
  } catch (error) {
    console.error('Link dive to trip error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unlink dive log from trip
app.delete('/api/dive-trips/:tripId/logs/:logId', authenticateToken, async (req, res) => {
  try {
    const { tripId, logId } = req.params;
    
    // Verify trip belongs to user
    const tripCheck = await pool.query(
      'SELECT id FROM dive_trips WHERE id = $1 AND user_id = $2',
      [tripId, req.user.id]
    );
    
    if (tripCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    await pool.query(
      'DELETE FROM dive_trip_logs WHERE trip_id = $1 AND dive_log_id = $2',
      [tripId, logId]
    );
    
    // Update total dives count
    await pool.query(
      `UPDATE dive_trips SET total_dives = (SELECT COUNT(*) FROM dive_trip_logs WHERE trip_id = $1)
       WHERE id = $1`,
      [tripId]
    );
    
    res.json({ message: 'Dive unlinked from trip' });
  } catch (error) {
    console.error('Unlink dive from trip error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get photos for a trip (from central dive_photos table)
app.get('/api/dive-trips/:id/photos', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify trip belongs to user
    const tripCheck = await pool.query(
      'SELECT id FROM dive_trips WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (tripCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    const result = await pool.query(
      `SELECT id, image_url, thumbnail_url, caption, taken_at, is_favorite, created_at
       FROM dive_photos
       WHERE trip_id = $1 AND user_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [id, req.user.id]
    );
    
    res.json({ photos: result.rows });
  } catch (error) {
    console.error('Get trip photos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add photo to trip (uses central dive_photos table)
app.post('/api/dive-trips/:id/photos', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { image_url, caption } = req.body;
    
    // Verify trip belongs to user
    const tripCheck = await pool.query(
      'SELECT id FROM dive_trips WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (tripCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    const result = await pool.query(
      `INSERT INTO dive_photos (trip_id, user_id, image_url, caption)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, req.user.id, image_url, caption || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add trip photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unlink photo from trip (soft-unlink, keeps photo in central table)
app.delete('/api/dive-trips/:tripId/photos/:photoId', authenticateToken, async (req, res) => {
  try {
    const { tripId, photoId } = req.params;
    
    // Verify trip belongs to user
    const tripCheck = await pool.query(
      'SELECT id FROM dive_trips WHERE id = $1 AND user_id = $2',
      [tripId, req.user.id]
    );
    
    if (tripCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    // Unlink photo from trip (set trip_id to null)
    await pool.query(
      'UPDATE dive_photos SET trip_id = NULL WHERE id = $1 AND trip_id = $2 AND user_id = $3',
      [photoId, tripId, req.user.id]
    );
    
    res.json({ message: 'Photo unlinked from trip' });
  } catch (error) {
    console.error('Unlink trip photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== DIVE BUDDIES ====================

// Get all dive buddies for user
app.get('/api/dive-buddies', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT db.*, CONCAT(u.first_name, ' ', u.last_name) AS linked_username, u.email AS linked_email
       FROM dive_buddies db
       LEFT JOIN users u ON db.linked_user_id = u.id
       WHERE db.user_id = $1 AND db.deleted_at IS NULL
       ORDER BY db.name ASC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get dive buddies error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single dive buddy
app.get('/api/dive-buddies/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT db.*, CONCAT(u.first_name, ' ', u.last_name) AS linked_username, u.email AS linked_email
       FROM dive_buddies db
       LEFT JOIN users u ON db.linked_user_id = u.id
       WHERE db.id = $1 AND db.user_id = $2 AND db.deleted_at IS NULL`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Buddy not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get dive buddy error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create dive buddy
app.post('/api/dive-buddies', authenticateToken, async (req, res) => {
  try {
    const { name, photo_url, notes, linked_user_id } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const result = await pool.query(
      `INSERT INTO dive_buddies (user_id, name, photo_url, notes, linked_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, name.trim(), photo_url || null, notes || null, linked_user_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create dive buddy error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update dive buddy
app.put('/api/dive-buddies/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, photo_url, notes, linked_user_id } = req.body;
    
    const check = await pool.query(
      'SELECT id FROM dive_buddies WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Buddy not found' });
    }
    
    const result = await pool.query(
      `UPDATE dive_buddies 
       SET name = COALESCE($1, name),
           photo_url = $2,
           notes = $3,
           linked_user_id = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name?.trim(), photo_url || null, notes || null, linked_user_id || null, id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update dive buddy error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete dive buddy (soft delete)
app.delete('/api/dive-buddies/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE dive_buddies SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Buddy not found' });
    }
    res.json({ message: 'Buddy deleted' });
  } catch (error) {
    console.error('Delete dive buddy error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Search for users with searchable profiles
app.get('/api/users/search', authenticateToken, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.json([]);
    }
    const result = await pool.query(
      `SELECT id,
              COALESCE(NULLIF(TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))), ''), email) AS username,
              email
       FROM users 
       WHERE searchable_profile = TRUE 
         AND id != $1
         AND (LOWER(COALESCE(first_name,'')) LIKE LOWER($2) OR LOWER(COALESCE(last_name,'')) LIKE LOWER($2) OR LOWER(email) LIKE LOWER($2))
       ORDER BY first_name ASC
       LIMIT 20`,
      [req.user.id, `%${query}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle profile searchability
app.patch('/api/profile/searchable', authenticateToken, async (req, res) => {
  try {
    const { searchable } = req.body;
    await pool.query(
      'UPDATE users SET searchable_profile = $1 WHERE id = $2',
      [!!searchable, req.user.id]
    );
    res.json({ searchable_profile: !!searchable });
  } catch (error) {
    console.error('Update searchable error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user's searchable status
app.get('/api/profile/searchable', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT searchable_profile FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ searchable_profile: result.rows[0]?.searchable_profile || false });
  } catch (error) {
    console.error('Get searchable error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Link buddy to dive log
app.post('/api/dive-logs/:logId/buddies', authenticateToken, async (req, res) => {
  try {
    const { logId } = req.params;
    const { buddy_id } = req.body;
    
    // Verify dive log belongs to user
    const logCheck = await pool.query(
      'SELECT id FROM dive_logs WHERE id = $1 AND user_id = $2',
      [logId, req.user.id]
    );
    if (logCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dive log not found' });
    }
    
    // Verify buddy belongs to user
    const buddyCheck = await pool.query(
      'SELECT id FROM dive_buddies WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [buddy_id, req.user.id]
    );
    if (buddyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Buddy not found' });
    }
    
    await pool.query(
      `INSERT INTO dive_log_buddies (dive_log_id, buddy_id)
       VALUES ($1, $2)
       ON CONFLICT (dive_log_id, buddy_id) DO NOTHING`,
      [logId, buddy_id]
    );
    res.json({ message: 'Buddy linked to dive' });
  } catch (error) {
    console.error('Link buddy to dive error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unlink buddy from dive log
app.delete('/api/dive-logs/:logId/buddies/:buddyId', authenticateToken, async (req, res) => {
  try {
    const { logId, buddyId } = req.params;
    
    // Verify dive log belongs to user
    const logCheck = await pool.query(
      'SELECT id FROM dive_logs WHERE id = $1 AND user_id = $2',
      [logId, req.user.id]
    );
    if (logCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dive log not found' });
    }
    
    await pool.query(
      'DELETE FROM dive_log_buddies WHERE dive_log_id = $1 AND buddy_id = $2',
      [logId, buddyId]
    );
    res.json({ message: 'Buddy unlinked from dive' });
  } catch (error) {
    console.error('Unlink buddy from dive error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get buddies for a dive log
app.get('/api/dive-logs/:logId/buddies', authenticateToken, async (req, res) => {
  try {
    const { logId } = req.params;
    
    const result = await pool.query(
      `SELECT db.* FROM dive_buddies db
       INNER JOIN dive_log_buddies dlb ON db.id = dlb.buddy_id
       INNER JOIN dive_logs dl ON dlb.dive_log_id = dl.id
       WHERE dl.id = $1 AND dl.user_id = $2 AND db.deleted_at IS NULL
       ORDER BY db.name ASC`,
      [logId, req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get dive buddies for log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

const distPath = path.join(__dirname, '..', 'dist');

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Roadmap Features API (Admin)
app.get('/api/admin/roadmap', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const result = await pool.query(
      'SELECT * FROM roadmap_features ORDER BY priority DESC, created_at DESC'
    );
    res.json({ features: result.rows });
  } catch (error) {
    console.error('Get roadmap features error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/roadmap', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { title, description, status, priority, predicted_go_live, is_published } = req.body;
    const result = await pool.query(
      `INSERT INTO roadmap_features (title, description, status, priority, predicted_go_live, is_published)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, description, status || 'planned', priority || 0, predicted_go_live, is_published || false]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create roadmap feature error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/roadmap/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { id } = req.params;
    const { title, description, status, priority, predicted_go_live, is_published } = req.body;
    const result = await pool.query(
      `UPDATE roadmap_features 
       SET title = $1, description = $2, status = $3, priority = $4, predicted_go_live = $5, is_published = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [title, description, status, priority, predicted_go_live, is_published, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feature not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update roadmap feature error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/roadmap/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { id } = req.params;
    await pool.query('DELETE FROM roadmap_features WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete roadmap feature error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public Roadmap API (for users - only published items)
app.get('/api/roadmap', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, status, predicted_go_live 
       FROM roadmap_features 
       WHERE is_published = true 
       ORDER BY priority DESC, predicted_go_live ASC NULLS LAST`
    );
    res.json({ features: result.rows });
  } catch (error) {
    console.error('Get public roadmap error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Data Export API
app.get('/api/export/dive-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Fetch all user dive data
    const [
      diveLogs,
      diveSites,
      diveTrips,
      gearProfiles,
      certifications,
      diveBuddies,
      equipment,
      photos
    ] = await Promise.all([
      pool.query(`
        SELECT dl.*, ds.name as site_name 
        FROM dive_logs dl 
        LEFT JOIN dive_sites ds ON dl.dive_site_id = ds.id 
        WHERE dl.user_id = $1 
        ORDER BY dl.dive_datetime DESC
      `, [userId]),
      pool.query('SELECT * FROM dive_sites WHERE user_id = $1 ORDER BY name', [userId]),
      pool.query('SELECT * FROM dive_trips WHERE user_id = $1 ORDER BY start_date DESC', [userId]),
      pool.query('SELECT * FROM gear_profiles WHERE user_id = $1 ORDER BY name', [userId]),
      pool.query(`
        SELECT uc.*, tc.name as course_name, ta.name as agency_name
        FROM user_certifications uc
        LEFT JOIN training_courses tc ON uc.course_id = tc.id
        LEFT JOIN training_agencies ta ON tc.agency_id = ta.id
        WHERE uc.user_id = $1
        ORDER BY uc.certification_date DESC
      `, [userId]),
      pool.query('SELECT * FROM dive_buddies WHERE user_id = $1 ORDER BY name', [userId]),
      pool.query('SELECT * FROM equipment_inventory WHERE user_id = $1 ORDER BY equipment_type, name', [userId]),
      pool.query('SELECT id, image_url, thumbnail_url, dive_log_id, trip_id, is_favorite, caption, created_at FROM dive_photos WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [userId])
    ]);

    // Fetch dive log details (samples, gases, events) for each dive
    const diveLogIds = diveLogs.rows.map(d => d.id);
    let samples = { rows: [] };
    let gases = { rows: [] };
    let events = { rows: [] };
    let tankPressures = { rows: [] };
    
    let diveLogBuddies = { rows: [] };
    let diveTripLogs = { rows: [] };
    
    if (diveLogIds.length > 0) {
      [samples, gases, events, tankPressures, diveLogBuddies, diveTripLogs] = await Promise.all([
        pool.query('SELECT * FROM dive_log_samples WHERE dive_log_id = ANY($1) ORDER BY dive_log_id, sample_time_seconds', [diveLogIds]),
        pool.query('SELECT * FROM dive_log_gases WHERE dive_log_id = ANY($1) ORDER BY dive_log_id, gas_slot', [diveLogIds]),
        pool.query('SELECT * FROM dive_log_events WHERE dive_log_id = ANY($1) ORDER BY dive_log_id, event_time_seconds', [diveLogIds]),
        pool.query('SELECT * FROM dive_log_tank_pressures WHERE dive_log_id = ANY($1) ORDER BY dive_log_id, sample_time_seconds', [diveLogIds]),
        pool.query('SELECT dlb.*, db.name as buddy_name FROM dive_log_buddies dlb LEFT JOIN dive_buddies db ON dlb.buddy_id = db.id WHERE dlb.dive_log_id = ANY($1)', [diveLogIds]),
        pool.query('SELECT * FROM dive_trip_logs WHERE dive_log_id = ANY($1)', [diveLogIds])
      ]);
    }

    // Fetch gear profile details
    const gearProfileIds = gearProfiles.rows.map(g => g.id);
    let cylinders = { rows: [] };
    let weights = { rows: [] };
    let gearEquipment = { rows: [] };
    
    if (gearProfileIds.length > 0) {
      [cylinders, weights, gearEquipment] = await Promise.all([
        pool.query('SELECT * FROM gear_cylinders WHERE gear_profile_id = ANY($1)', [gearProfileIds]),
        pool.query('SELECT * FROM gear_weights WHERE gear_profile_id = ANY($1)', [gearProfileIds]),
        pool.query('SELECT gpe.*, ei.name as equipment_name, ei.equipment_type FROM gear_profile_equipment gpe LEFT JOIN equipment_inventory ei ON gpe.equipment_id = ei.id WHERE gpe.gear_profile_id = ANY($1)', [gearProfileIds])
      ]);
    }

    // Fetch dive plans
    const divePlans = await pool.query('SELECT * FROM dive_plans WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    const divePlanIds = divePlans.rows.map(p => p.id);
    let divePlanDives = { rows: [] };
    let divePlanGases = { rows: [] };
    
    if (divePlanIds.length > 0) {
      [divePlanDives, divePlanGases] = await Promise.all([
        pool.query('SELECT * FROM dive_plan_dives WHERE dive_plan_id = ANY($1) ORDER BY dive_plan_id, dive_number', [divePlanIds]),
        pool.query('SELECT * FROM dive_plan_gases WHERE dive_plan_id = ANY($1) ORDER BY dive_plan_id, gas_number', [divePlanIds])
      ]);
    }

    res.json({
      exportDate: new Date().toISOString(),
      diveLogs: diveLogs.rows,
      diveLogSamples: samples.rows,
      diveLogGases: gases.rows,
      diveLogEvents: events.rows,
      diveLogTankPressures: tankPressures.rows,
      diveLogBuddies: diveLogBuddies.rows,
      diveTripLogs: diveTripLogs.rows,
      diveSites: diveSites.rows,
      diveTrips: diveTrips.rows,
      divePlans: divePlans.rows,
      divePlanDives: divePlanDives.rows,
      divePlanGases: divePlanGases.rows,
      gearProfiles: gearProfiles.rows,
      gearCylinders: cylinders.rows,
      gearWeights: weights.rows,
      gearEquipment: gearEquipment.rows,
      certifications: certifications.rows,
      diveBuddies: diveBuddies.rows,
      equipment: equipment.rows,
      photos: photos.rows
    });
  } catch (error) {
    console.error('Export dive data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Export dive data with photos and videos as ZIP
app.get('/api/export/dive-data-with-media', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Fetch all user dive data (same as regular export)
    const [
      diveLogs,
      diveSites,
      diveTrips,
      gearProfiles,
      certifications,
      diveBuddies,
      equipment,
      photos
    ] = await Promise.all([
      pool.query(`
        SELECT dl.*, ds.name as site_name 
        FROM dive_logs dl 
        LEFT JOIN dive_sites ds ON dl.dive_site_id = ds.id 
        WHERE dl.user_id = $1 
        ORDER BY dl.dive_datetime DESC
      `, [userId]),
      pool.query('SELECT * FROM dive_sites WHERE user_id = $1 ORDER BY name', [userId]),
      pool.query('SELECT * FROM dive_trips WHERE user_id = $1 ORDER BY start_date DESC', [userId]),
      pool.query('SELECT * FROM gear_profiles WHERE user_id = $1 ORDER BY name', [userId]),
      pool.query(`
        SELECT uc.*, tc.name as course_name, ta.name as agency_name
        FROM user_certifications uc
        LEFT JOIN training_courses tc ON uc.course_id = tc.id
        LEFT JOIN training_agencies ta ON tc.agency_id = ta.id
        WHERE uc.user_id = $1
        ORDER BY uc.certification_date DESC
      `, [userId]),
      pool.query('SELECT * FROM dive_buddies WHERE user_id = $1 ORDER BY name', [userId]),
      pool.query('SELECT * FROM equipment_inventory WHERE user_id = $1 ORDER BY equipment_type, name', [userId]),
      pool.query('SELECT * FROM dive_photos WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [userId])
    ]);

    // Fetch dive log details
    const diveLogIds = diveLogs.rows.map(d => d.id);
    let samples = { rows: [] };
    let gases = { rows: [] };
    let events = { rows: [] };
    let tankPressures = { rows: [] };
    let diveLogBuddies = { rows: [] };
    let diveTripLogs = { rows: [] };
    
    if (diveLogIds.length > 0) {
      [samples, gases, events, tankPressures, diveLogBuddies, diveTripLogs] = await Promise.all([
        pool.query('SELECT * FROM dive_log_samples WHERE dive_log_id = ANY($1) ORDER BY dive_log_id, sample_time_seconds', [diveLogIds]),
        pool.query('SELECT * FROM dive_log_gases WHERE dive_log_id = ANY($1) ORDER BY dive_log_id, gas_slot', [diveLogIds]),
        pool.query('SELECT * FROM dive_log_events WHERE dive_log_id = ANY($1) ORDER BY dive_log_id, event_time_seconds', [diveLogIds]),
        pool.query('SELECT * FROM dive_log_tank_pressures WHERE dive_log_id = ANY($1) ORDER BY dive_log_id, sample_time_seconds', [diveLogIds]),
        pool.query('SELECT dlb.*, db.name as buddy_name FROM dive_log_buddies dlb LEFT JOIN dive_buddies db ON dlb.buddy_id = db.id WHERE dlb.dive_log_id = ANY($1)', [diveLogIds]),
        pool.query('SELECT * FROM dive_trip_logs WHERE dive_log_id = ANY($1)', [diveLogIds])
      ]);
    }

    // Fetch gear profile details
    const gearProfileIds = gearProfiles.rows.map(g => g.id);
    let cylinders = { rows: [] };
    let weights = { rows: [] };
    let gearEquipment = { rows: [] };
    
    if (gearProfileIds.length > 0) {
      [cylinders, weights, gearEquipment] = await Promise.all([
        pool.query('SELECT * FROM gear_cylinders WHERE gear_profile_id = ANY($1)', [gearProfileIds]),
        pool.query('SELECT * FROM gear_weights WHERE gear_profile_id = ANY($1)', [gearProfileIds]),
        pool.query('SELECT gpe.*, ei.name as equipment_name, ei.equipment_type FROM gear_profile_equipment gpe LEFT JOIN equipment_inventory ei ON gpe.equipment_id = ei.id WHERE gpe.gear_profile_id = ANY($1)', [gearProfileIds])
      ]);
    }

    // Fetch dive plans
    const divePlans = await pool.query('SELECT * FROM dive_plans WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    const divePlanIds = divePlans.rows.map(p => p.id);
    let divePlanDives = { rows: [] };
    let divePlanGases = { rows: [] };
    
    if (divePlanIds.length > 0) {
      [divePlanDives, divePlanGases] = await Promise.all([
        pool.query('SELECT * FROM dive_plan_dives WHERE dive_plan_id = ANY($1) ORDER BY dive_plan_id, dive_number', [divePlanIds]),
        pool.query('SELECT * FROM dive_plan_gases WHERE dive_plan_id = ANY($1) ORDER BY dive_plan_id, gas_number', [divePlanIds])
      ]);
    }

    // Prepare export data object
    const exportData = {
      exportDate: new Date().toISOString(),
      diveLogs: diveLogs.rows,
      diveLogSamples: samples.rows,
      diveLogGases: gases.rows,
      diveLogEvents: events.rows,
      diveLogTankPressures: tankPressures.rows,
      diveLogBuddies: diveLogBuddies.rows,
      diveTripLogs: diveTripLogs.rows,
      diveSites: diveSites.rows,
      diveTrips: diveTrips.rows,
      divePlans: divePlans.rows,
      divePlanDives: divePlanDives.rows,
      divePlanGases: divePlanGases.rows,
      gearProfiles: gearProfiles.rows,
      gearCylinders: cylinders.rows,
      gearWeights: weights.rows,
      gearEquipment: gearEquipment.rows,
      certifications: certifications.rows,
      diveBuddies: diveBuddies.rows,
      equipment: equipment.rows,
      photos: photos.rows.map(p => ({
        ...p,
        exportedFilename: p.image_url ? `media/${p.media_type === 'video' ? 'videos' : 'photos'}/${p.id}${getExtensionFromUrl(p.image_url)}` : null,
        exportedThumbnail: p.thumbnail_url ? `media/thumbnails/${p.id}_thumb${getExtensionFromUrl(p.thumbnail_url)}` : null
      }))
    };

    // Set up ZIP archive
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `erebus-export-${timestamp}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const archive = archiver('zip', { zlib: { level: 5 } });
    
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create archive' });
      }
    });
    
    archive.pipe(res);
    
    // Add JSON data file
    archive.append(JSON.stringify(exportData, null, 2), { name: 'dive-data.json' });
    
    // Download and add media files
    const mediaFiles = photos.rows.filter(p => p.image_url);
    let successCount = 0;
    let errorCount = 0;
    
    for (const photo of mediaFiles) {
      try {
        // Extract object path from URL
        const urlPath = photo.image_url;
        if (!urlPath) continue;
        
        // Parse the object storage path
        const parts = urlPath.split('/').filter(Boolean);
        if (parts.length < 2) continue;
        
        const entityId = parts.slice(1).join('/');
        let entityDir = process.env.PRIVATE_OBJECT_DIR || '';
        if (!entityDir.endsWith('/')) {
          entityDir = `${entityDir}/`;
        }
        const objectEntityPath = `${entityDir}${entityId}`;
        const { bucketName, objectName } = parseObjectPath(objectEntityPath);
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        
        const [exists] = await file.exists();
        if (!exists) {
          console.warn(`File not found in storage: ${objectName}`);
          errorCount++;
          continue;
        }
        
        // Determine folder and filename
        const isVideo = photo.media_type === 'video';
        const folder = isVideo ? 'media/videos' : 'media/photos';
        const ext = getExtensionFromUrl(photo.image_url);
        const archiveFilename = `${folder}/${photo.id}${ext}`;
        
        // Stream file directly into archive
        const stream = file.createReadStream();
        archive.append(stream, { name: archiveFilename });
        successCount++;
        
        // Also add thumbnail if available
        if (photo.thumbnail_url) {
          try {
            const thumbParts = photo.thumbnail_url.split('/').filter(Boolean);
            if (thumbParts.length >= 2) {
              const thumbEntityId = thumbParts.slice(1).join('/');
              const thumbObjectPath = `${entityDir}${thumbEntityId}`;
              const { bucketName: thumbBucket, objectName: thumbObject } = parseObjectPath(thumbObjectPath);
              const thumbFile = objectStorageClient.bucket(thumbBucket).file(thumbObject);
              const [thumbExists] = await thumbFile.exists();
              if (thumbExists) {
                const thumbExt = getExtensionFromUrl(photo.thumbnail_url);
                archive.append(thumbFile.createReadStream(), { name: `media/thumbnails/${photo.id}_thumb${thumbExt}` });
              }
            }
          } catch (thumbErr) {
            console.warn(`Failed to add thumbnail for photo ${photo.id}:`, thumbErr.message);
          }
        }
      } catch (fileErr) {
        console.warn(`Failed to add file for photo ${photo.id}:`, fileErr.message);
        errorCount++;
      }
    }
    
    // Add a summary file
    const summary = {
      exportDate: new Date().toISOString(),
      totalDiveLogs: diveLogs.rows.length,
      totalDiveSites: diveSites.rows.length,
      totalDiveTrips: diveTrips.rows.length,
      totalGearProfiles: gearProfiles.rows.length,
      totalCertifications: certifications.rows.length,
      totalBuddies: diveBuddies.rows.length,
      totalEquipment: equipment.rows.length,
      totalMediaFiles: mediaFiles.length,
      mediaExportSuccess: successCount,
      mediaExportErrors: errorCount
    };
    archive.append(JSON.stringify(summary, null, 2), { name: 'export-summary.json' });
    
    // Finalize archive
    await archive.finalize();
    
  } catch (error) {
    console.error('Export dive data with media error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export data with media' });
    }
  }
});

// Helper function to extract file extension from URL
function getExtensionFromUrl(url) {
  if (!url) return '';
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match) return `.${match[1].toLowerCase()}`;
  // Default extensions based on common patterns
  if (url.includes('video') || url.includes('.mp4') || url.includes('.mov')) return '.mp4';
  if (url.includes('.webp')) return '.webp';
  if (url.includes('.png')) return '.png';
  return '.jpg';
}

// ============================================
// SUPPORT MESSAGING ENDPOINTS
// ============================================

// Get user's support conversations
app.get('/api/support/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(`
      SELECT sc.*, 
        (SELECT COUNT(*) FROM support_messages sm WHERE sm.conversation_id = sc.id AND sm.is_admin_reply = true AND sm.read_at IS NULL) as unread_count,
        (SELECT sm.message FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as last_message,
        (SELECT sm.created_at FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as last_message_at
      FROM support_conversations sc
      WHERE sc.user_id = $1 AND sc.status != 'closed'
      ORDER BY sc.updated_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get support conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Create new support conversation
app.post('/api/support/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject, message, priority } = req.body;
    
    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const convResult = await client.query(`
        INSERT INTO support_conversations (user_id, subject, priority)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [userId, subject, priority || 'normal']);
      
      const conversation = convResult.rows[0];
      
      await client.query(`
        INSERT INTO support_messages (conversation_id, sender_id, is_admin_reply, message)
        VALUES ($1, $2, false, $3)
      `, [conversation.id, userId, message]);
      
      await client.query('COMMIT');
      
      // Notify all admins about the new support ticket
      const admins = await pool.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins.rows) {
        sendPushNotification(
          admin.id,
          'New Support Ticket',
          `${subject}: ${message.length > 80 ? message.substring(0, 80) + '...' : message}`,
          { type: 'support_new_ticket', conversationId: conversation.id }
        ).catch(err => console.error('Admin push notification error:', err));
      }
      
      res.status(201).json(conversation);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create support conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Get messages in a conversation
app.get('/api/support/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    
    const convCheck = await pool.query(
      'SELECT * FROM support_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    await pool.query(`
      UPDATE support_messages 
      SET read_at = CURRENT_TIMESTAMP 
      WHERE conversation_id = $1 AND is_admin_reply = true AND read_at IS NULL
    `, [conversationId]);
    
    const messages = await pool.query(`
      SELECT sm.*, u.first_name, u.last_name, u.email
      FROM support_messages sm
      JOIN users u ON sm.sender_id = u.id
      WHERE sm.conversation_id = $1
      ORDER BY sm.created_at ASC
    `, [conversationId]);
    
    res.json({
      conversation: convCheck.rows[0],
      messages: messages.rows
    });
  } catch (error) {
    console.error('Get support messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send message in conversation (user)
app.post('/api/support/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const convCheck = await pool.query(
      'SELECT * FROM support_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const result = await pool.query(`
      INSERT INTO support_messages (conversation_id, sender_id, is_admin_reply, message)
      VALUES ($1, $2, false, $3)
      RETURNING *
    `, [conversationId, userId, message]);
    
    await pool.query(
      'UPDATE support_conversations SET updated_at = CURRENT_TIMESTAMP, status = $1 WHERE id = $2',
      ['open', conversationId]
    );
    
    // Notify all admins about the new user message
    const admins = await pool.query("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins.rows) {
      sendPushNotification(
        admin.id,
        'New Support Message',
        message.length > 100 ? message.substring(0, 100) + '...' : message,
        { type: 'support_user_message', conversationId: conversationId }
      ).catch(err => console.error('Admin push notification error:', err));
    }
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Send support message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get user's unread message count
app.get('/api/support/unread-count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM support_messages sm
      JOIN support_conversations sc ON sm.conversation_id = sc.id
      WHERE sc.user_id = $1 AND sc.status != 'closed' AND sm.is_admin_reply = true AND sm.read_at IS NULL
    `, [userId]);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// ============================================
// ADMIN SUPPORT MESSAGING ENDPOINTS
// ============================================

// Get all support conversations (admin)
app.get('/api/admin/support/conversations', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { status } = req.query;
    let query = `
      SELECT sc.*, 
        u.first_name, u.last_name, u.email,
        (SELECT COUNT(*) FROM support_messages sm WHERE sm.conversation_id = sc.id AND sm.is_admin_reply = false AND sm.read_at IS NULL) as unread_count,
        (SELECT sm.message FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as last_message,
        (SELECT sm.created_at FROM support_messages sm WHERE sm.conversation_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as last_message_at
      FROM support_conversations sc
      JOIN users u ON sc.user_id = u.id
    `;
    const params = [];
    
    if (status) {
      query += ' WHERE sc.status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY sc.updated_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get messages in a conversation (admin)
app.get('/api/admin/support/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const conversationId = req.params.id;
    
    const convResult = await pool.query(`
      SELECT sc.*, u.first_name, u.last_name, u.email
      FROM support_conversations sc
      JOIN users u ON sc.user_id = u.id
      WHERE sc.id = $1
    `, [conversationId]);
    
    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    await pool.query(`
      UPDATE support_messages 
      SET read_at = CURRENT_TIMESTAMP 
      WHERE conversation_id = $1 AND is_admin_reply = false AND read_at IS NULL
    `, [conversationId]);
    
    const messages = await pool.query(`
      SELECT sm.*, u.first_name, u.last_name, u.email
      FROM support_messages sm
      JOIN users u ON sm.sender_id = u.id
      WHERE sm.conversation_id = $1
      ORDER BY sm.created_at ASC
    `, [conversationId]);
    
    res.json({
      conversation: convResult.rows[0],
      messages: messages.rows
    });
  } catch (error) {
    console.error('Admin get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Admin create new conversation directed at a user
app.post('/api/admin/support/conversations', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const adminId = req.user.id;
    const { userId, subject, message, priority } = req.body;
    
    if (!userId || !subject || !message) {
      return res.status(400).json({ error: 'User ID, subject, and message are required' });
    }
    
    const userCheck = await pool.query('SELECT id, first_name FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const convResult = await client.query(`
        INSERT INTO support_conversations (user_id, subject, priority)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [userId, subject, priority || 'normal']);
      
      const conversation = convResult.rows[0];
      
      await client.query(`
        INSERT INTO support_messages (conversation_id, sender_id, is_admin_reply, message)
        VALUES ($1, $2, true, $3)
      `, [conversation.id, adminId, message]);
      
      await client.query(
        'UPDATE support_conversations SET status = $1 WHERE id = $2',
        ['in_progress', conversation.id]
      );
      
      await client.query('COMMIT');
      
      sendPushNotification(
        userId,
        'New Support Message',
        `${subject}: ${message.length > 80 ? message.substring(0, 80) + '...' : message}`,
        { type: 'support_reply', conversationId: conversation.id }
      ).catch(err => console.error('Push notification error:', err));
      
      res.status(201).json(conversation);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Admin create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Send admin reply
app.post('/api/admin/support/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const conversationId = req.params.id;
    const adminId = req.user.id;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const convCheck = await pool.query(
      'SELECT sc.*, u.first_name FROM support_conversations sc JOIN users u ON sc.user_id = u.id WHERE sc.id = $1',
      [conversationId]
    );
    
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const conversation = convCheck.rows[0];
    
    const result = await pool.query(`
      INSERT INTO support_messages (conversation_id, sender_id, is_admin_reply, message)
      VALUES ($1, $2, true, $3)
      RETURNING *
    `, [conversationId, adminId, message]);
    
    await pool.query(
      'UPDATE support_conversations SET updated_at = CURRENT_TIMESTAMP, status = $1 WHERE id = $2',
      ['in_progress', conversationId]
    );
    
    sendPushNotification(
      conversation.user_id,
      'Support Reply',
      message.length > 100 ? message.substring(0, 100) + '...' : message,
      { type: 'support_reply', conversationId: conversationId }
    ).catch(err => console.error('Push notification error:', err));
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Admin send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Update conversation status (admin)
app.put('/api/admin/support/conversations/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const conversationId = req.params.id;
    const { status, priority } = req.body;
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(conversationId);
    
    const result = await pool.query(`
      UPDATE support_conversations 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Admin update conversation error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// Get admin unread message count
app.get('/api/admin/support/unread-count', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM support_messages sm
      JOIN support_conversations sc ON sm.conversation_id = sc.id
      WHERE sm.is_admin_reply = false AND sm.read_at IS NULL
    `);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('Admin get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

app.get('/api/compressors', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
        (SELECT MAX(service_date) FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'oil_change') as last_oil_change_date,
        (SELECT hours_at_service FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'oil_change' ORDER BY service_date DESC LIMIT 1) as last_oil_change_hours,
        (SELECT MAX(service_date) FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'filter_change') as last_filter_change_date,
        (SELECT hours_at_service FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'filter_change' ORDER BY service_date DESC LIMIT 1) as last_filter_change_hours,
        (SELECT MAX(service_date) FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'independent_test') as last_test_date,
        (SELECT test_result FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'independent_test' ORDER BY service_date DESC LIMIT 1) as last_test_result,
        (SELECT next_due_date FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'independent_test' ORDER BY service_date DESC LIMIT 1) as next_test_due_date
      FROM compressors c
      WHERE c.user_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch compressors error:', error);
    res.status(500).json({ error: 'Failed to fetch compressors' });
  }
});

app.get('/api/compressors/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
        (SELECT MAX(service_date) FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'oil_change') as last_oil_change_date,
        (SELECT hours_at_service FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'oil_change' ORDER BY service_date DESC LIMIT 1) as last_oil_change_hours,
        (SELECT MAX(service_date) FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'filter_change') as last_filter_change_date,
        (SELECT hours_at_service FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'filter_change' ORDER BY service_date DESC LIMIT 1) as last_filter_change_hours,
        (SELECT MAX(service_date) FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'independent_test') as last_test_date,
        (SELECT test_result FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'independent_test' ORDER BY service_date DESC LIMIT 1) as last_test_result,
        (SELECT next_due_date FROM compressor_service_logs WHERE compressor_id = c.id AND service_type = 'independent_test' ORDER BY service_date DESC LIMIT 1) as next_test_due_date
      FROM compressors c
      WHERE c.id = $1 AND c.user_id = $2 AND c.deleted_at IS NULL`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Compressor not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch compressor error:', error);
    res.status(500).json({ error: 'Failed to fetch compressor' });
  }
});

app.post('/api/compressors', authenticateToken, async (req, res) => {
  try {
    const { name, make, model, serial_number, purchase_date, total_hours, oil_change_interval_hours, filter_change_interval_hours, independent_test_interval_months, notes, status } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const result = await pool.query(
      `INSERT INTO compressors (user_id, name, make, model, serial_number, purchase_date, total_hours, oil_change_interval_hours, filter_change_interval_hours, independent_test_interval_months, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [req.user.id, name, make || null, model || null, serial_number || null, purchase_date || null, total_hours || 0, oil_change_interval_hours || 100, filter_change_interval_hours || 500, independent_test_interval_months || 12, notes || null, status || 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create compressor error:', error);
    res.status(500).json({ error: 'Failed to create compressor' });
  }
});

app.put('/api/compressors/:id', authenticateToken, async (req, res) => {
  try {
    const { name, make, model, serial_number, purchase_date, total_hours, oil_change_interval_hours, filter_change_interval_hours, independent_test_interval_months, notes, status } = req.body;
    const result = await pool.query(
      `UPDATE compressors SET name = $1, make = $2, model = $3, serial_number = $4, purchase_date = $5, total_hours = $6, oil_change_interval_hours = $7, filter_change_interval_hours = $8, independent_test_interval_months = $9, notes = $10, status = $11
       WHERE id = $12 AND user_id = $13 AND deleted_at IS NULL
       RETURNING *`,
      [name, make || null, model || null, serial_number || null, purchase_date || null, total_hours || 0, oil_change_interval_hours || 100, filter_change_interval_hours || 500, independent_test_interval_months || 12, notes || null, status || 'active', req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Compressor not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update compressor error:', error);
    res.status(500).json({ error: 'Failed to update compressor' });
  }
});

app.delete('/api/compressors/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE compressors SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Compressor not found' });
    }
    res.json({ message: 'Compressor deleted' });
  } catch (error) {
    console.error('Delete compressor error:', error);
    res.status(500).json({ error: 'Failed to delete compressor' });
  }
});

app.get('/api/compressors/:id/services', authenticateToken, async (req, res) => {
  try {
    const compressor = await pool.query('SELECT id FROM compressors WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [req.params.id, req.user.id]);
    if (compressor.rows.length === 0) {
      return res.status(404).json({ error: 'Compressor not found' });
    }
    const { service_type } = req.query;
    let query = 'SELECT * FROM compressor_service_logs WHERE compressor_id = $1 ORDER BY service_date DESC';
    let params = [req.params.id];
    if (service_type) {
      query = 'SELECT * FROM compressor_service_logs WHERE compressor_id = $1 AND service_type = $2 ORDER BY service_date DESC';
      params.push(service_type);
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch service logs error:', error);
    res.status(500).json({ error: 'Failed to fetch service logs' });
  }
});

app.post('/api/compressors/:id/services', authenticateToken, async (req, res) => {
  try {
    const compressor = await pool.query('SELECT id FROM compressors WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [req.params.id, req.user.id]);
    if (compressor.rows.length === 0) {
      return res.status(404).json({ error: 'Compressor not found' });
    }
    const { service_type, service_date, hours_at_service, filter_type, test_result, test_certificate_number, next_due_date, cost, technician, notes } = req.body;
    if (!service_type || !service_date) {
      return res.status(400).json({ error: 'Service type and date are required' });
    }
    const result = await pool.query(
      `INSERT INTO compressor_service_logs (compressor_id, user_id, service_type, service_date, hours_at_service, filter_type, test_result, test_certificate_number, next_due_date, cost, technician, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [req.params.id, req.user.id, service_type, service_date, hours_at_service || null, filter_type || null, test_result || null, test_certificate_number || null, next_due_date || null, cost || null, technician || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create service log error:', error);
    res.status(500).json({ error: 'Failed to create service log' });
  }
});

app.put('/api/compressors/:compressorId/services/:serviceId', authenticateToken, async (req, res) => {
  try {
    const { service_type, service_date, hours_at_service, filter_type, test_result, test_certificate_number, next_due_date, cost, technician, notes } = req.body;
    if (!service_type || !service_date) {
      return res.status(400).json({ error: 'Service type and date are required' });
    }
    const result = await pool.query(
      `UPDATE compressor_service_logs
       SET service_type=$1, service_date=$2, hours_at_service=$3, filter_type=$4, test_result=$5,
           test_certificate_number=$6, next_due_date=$7, cost=$8, technician=$9, notes=$10
       WHERE id=$11 AND compressor_id=$12 AND user_id=$13
       RETURNING *`,
      [service_type, service_date, hours_at_service || null, filter_type || null, test_result || null,
       test_certificate_number || null, next_due_date || null, cost || null, technician || null, notes || null,
       req.params.serviceId, req.params.compressorId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service log not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update service log error:', error);
    res.status(500).json({ error: 'Failed to update service log' });
  }
});

app.delete('/api/compressors/:compressorId/services/:serviceId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM compressor_service_logs WHERE id = $1 AND compressor_id = $2 AND user_id = $3 RETURNING id',
      [req.params.serviceId, req.params.compressorId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service log not found' });
    }
    res.json({ message: 'Service log deleted' });
  } catch (error) {
    console.error('Delete service log error:', error);
    res.status(500).json({ error: 'Failed to delete service log' });
  }
});

app.get('/api/compressors/:id/usage', authenticateToken, async (req, res) => {
  try {
    const compressor = await pool.query('SELECT id FROM compressors WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [req.params.id, req.user.id]);
    if (compressor.rows.length === 0) {
      return res.status(404).json({ error: 'Compressor not found' });
    }
    const result = await pool.query(
      'SELECT * FROM compressor_usage_logs WHERE compressor_id = $1 ORDER BY usage_date DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch usage logs error:', error);
    res.status(500).json({ error: 'Failed to fetch usage logs' });
  }
});

app.post('/api/compressors/:id/usage', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const compressor = await client.query('SELECT id, total_hours FROM compressors WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [req.params.id, req.user.id]);
    if (compressor.rows.length === 0) {
      return res.status(404).json({ error: 'Compressor not found' });
    }
    const { usage_date, hours_used, fills_count, notes } = req.body;
    if (!usage_date || !hours_used) {
      return res.status(400).json({ error: 'Usage date and hours are required' });
    }
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO compressor_usage_logs (compressor_id, user_id, usage_date, hours_used, fills_count, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.params.id, req.user.id, usage_date, hours_used, fills_count || null, notes || null]
    );
    const newTotal = parseFloat(compressor.rows[0].total_hours) + parseFloat(hours_used);
    await client.query('UPDATE compressors SET total_hours = $1 WHERE id = $2', [newTotal, req.params.id]);
    await client.query('COMMIT');
    res.status(201).json({ ...result.rows[0], new_total_hours: newTotal });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create usage log error:', error);
    res.status(500).json({ error: 'Failed to create usage log' });
  } finally {
    client.release();
  }
});

app.delete('/api/compressors/:compressorId/usage/:usageId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const usage = await client.query(
      'SELECT hours_used FROM compressor_usage_logs WHERE id = $1 AND compressor_id = $2 AND user_id = $3',
      [req.params.usageId, req.params.compressorId, req.user.id]
    );
    if (usage.rows.length === 0) {
      return res.status(404).json({ error: 'Usage log not found' });
    }
    await client.query('BEGIN');
    await client.query('DELETE FROM compressor_usage_logs WHERE id = $1', [req.params.usageId]);
    await client.query(
      'UPDATE compressors SET total_hours = GREATEST(0, total_hours - $1) WHERE id = $2',
      [usage.rows[0].hours_used, req.params.compressorId]
    );
    await client.query('COMMIT');
    res.json({ message: 'Usage log deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete usage log error:', error);
    res.status(500).json({ error: 'Failed to delete usage log' });
  } finally {
    client.release();
  }
});

// Public legal pages — required for App Store / Play Store compliance review
const legalHtmlShell = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Erebus</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; color: #111; line-height: 1.65; }
  h1 { font-size: 28px; margin-bottom: 6px; } h2 { font-size: 18px; margin-top: 32px; color: #D22F00; }
  p, li { font-size: 15px; } ul { padding-left: 20px; } a { color: #D22F00; }
  .meta { color: #666; font-size: 13px; margin-bottom: 28px; font-style: italic; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;

app.get('/privacy', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(legalHtmlShell('Privacy Policy', `
    <h1>Privacy Policy</h1>
    <p class="meta">Last Updated: January 20, 2026</p>
    <p>At Erebus, we believe your dive data is personal. Whether it's your bottom time, your gas mixes, or your favorite dive sites, that information belongs to you. This policy outlines how we handle your data with a "user-first" approach.</p>
    <h2>1. Data Ownership &amp; Minimization</h2>
    <p>You own your data. We follow a strict principle of Data Minimization: we only collect what is strictly necessary to run the app.</p>
    <ul>
      <li><strong>Logs &amp; Plans:</strong> Stored to provide the core service.</li>
      <li><strong>Location Data:</strong> Only used to log dive sites at your request.</li>
      <li><strong>Health Data:</strong> If you sync dive computer data (e.g., heart rate), this is used only for your personal log history and is never shared.</li>
    </ul>
    <h2>2. GDPR (European Union) Compliance</h2>
    <p>If you are located in the EEA, the GDPR gives you specific rights including access, rectification, erasure (right to be forgotten), and data portability. We process your data based on Contractual Necessity and Consent.</p>
    <h2>3. CCPA/CPRA (California, USA) Compliance</h2>
    <p>California residents have the right to know what data we collect, the right to deletion, and confirmation that we do not sell or share personal information for cross-contextual behavioral advertising.</p>
    <h2>4. Automated Decision-Making</h2>
    <p>We do not use automated algorithms to make significant decisions affecting your legal or financial status. All decompression and gas planning tools are informational mathematical models only.</p>
    <h2>5. How to Exercise Your Rights</h2>
    <p>To request a copy of your data, request deletion, or correct an error, email us at: <a href="mailto:privacy@erebusdive.com">privacy@erebusdive.com</a>. We will respond within 30 days.</p>
    <h2>6. Data Security</h2>
    <p>We use industry-standard encryption to protect your dive logs. We do not store your data longer than necessary to provide the service or until you request its deletion. You may delete your account and all associated data at any time from the app's Profile screen.</p>
  `));
});

app.get('/terms', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(legalHtmlShell('Terms & Conditions', `
    <h1>Terms &amp; Conditions</h1>
    <p class="meta">Last Updated: January 20, 2026</p>
    <p>Welcome to Erebus. By downloading or using the Erebus app you agree to these Terms. Please read them carefully.</p>
    <h2>1. Use of the App</h2>
    <p>Erebus is a dive management tool intended for informational purposes only. Dive planning and decompression calculations provided by the app are based on standard mathematical models (Bühlmann ZHL-16C) and must not be used as a substitute for professional dive training, certification, or in-water judgement.</p>
    <h2>2. Subscriptions &amp; Billing</h2>
    <p>Erebus offers monthly and annual auto-renewing subscriptions with a 14-day free trial for new users. Payment is charged to your Apple ID or Google Play account at confirmation of purchase. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. Manage or cancel at any time in your device's account settings.</p>
    <h2>3. User Content</h2>
    <p>You retain ownership of all dive data you create in Erebus. You grant us a limited licence to store and serve your content solely to provide the app's functionality. You may export or delete your data at any time.</p>
    <h2>4. Limitation of Liability</h2>
    <p>Erebus and Leviathan Systems Ltd are not liable for any personal injury, death, or property damage arising from reliance on information provided by the app. Always dive within your training and certification limits.</p>
    <h2>5. Account Termination</h2>
    <p>You may delete your account at any time from the Profile screen. Upon deletion, all your data is permanently removed from our servers. We may suspend accounts that violate these Terms.</p>
    <h2>6. Contact</h2>
    <p>Questions or concerns? Email <a href="mailto:support@erebusdive.com">support@erebusdive.com</a>.</p>
  `));
});

if (process.env.NODE_ENV === 'production' || process.env.PORT) {
  app.use(express.static(distPath));
  
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/objects/')) {
      return next();
    }
    if (req.method === 'GET') {
      const indexPath = path.join(distPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error('Error serving index.html:', err);
          if (!res.headersSent) {
            res.status(500).send('Server error');
          }
        }
      });
    } else {
      next();
    }
  });
}

initDatabase()
  .then(() => {
    console.log('Database initialized successfully');
  })
  .catch((err) => {
    console.error('Database initialization failed:', err.message);
    console.log('Server will start without database - API calls will fail until DB is available');
  })
  .finally(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Erebus API server running on port ${PORT}`);
    });
  });
