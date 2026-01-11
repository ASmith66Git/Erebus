const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const { Resend } = require('resend');
const diveLogParser = require('./services/diveLogParser');
const diveLogParserV2 = require('./services/diveLogParserV2');
const DiveLogPersistenceService = require('./services/diveLogPersistence');
const diveComputerCatalog = require('./data/diveComputerCatalog');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const app = express();
const PORT = process.env.PORT || 3001;

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

app.use(cors());
app.use(express.json());

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
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS buddy TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS decompression_symptoms BOOLEAN DEFAULT FALSE;`).catch(() => {});
    await client.query(`ALTER TABLE dive_logs ADD COLUMN IF NOT EXISTS problem_notes TEXT;`).catch(() => {});
    
    const adminCheck = await client.query("SELECT id FROM users WHERE email = 'admin@erebus.app'");
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        "INSERT INTO users (email, password, first_name, last_name, role) VALUES ('admin@erebus.app', $1, 'Admin', 'User', 'admin')",
        [hashedPassword]
      );
      console.log('Default admin user created: admin@erebus.app / admin123');
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  } finally {
    client.release();
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
      return res.status(403).json({ error: 'Invalid or expired token' });
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
  const { email, password, firstName, lastName } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  try {
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO users (email, password, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name, role',
      [email.toLowerCase(), hashedPassword, firstName || null, lastName || null]
    );
    
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      },
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
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
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
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
    
    if (result.rows.length === 0) {
      return res.json({ message: 'If an account exists with this email, password reset instructions have been sent.' });
    }
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000);
    
    await pool.query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE email = $3',
      [resetToken, resetExpires, email.toLowerCase()]
    );
    
    console.log(`Password reset requested for ${email}. In production, email would be sent with reset link.`);
    
    res.json({ 
      message: 'If an account exists with this email, password reset instructions have been sent. Please contact an administrator to reset your password.'
    });
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
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
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
      'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1',
      [req.user.id]
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
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, is_blocked, created_at FROM users ORDER BY created_at DESC'
    );
    
    res.json(result.rows.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isBlocked: user.is_blocked || false,
      createdAt: user.created_at
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
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:5000';
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    
    try {
      const { client, fromEmail } = await getUncachableResendClient();
      
      await client.emails.send({
        from: fromEmail || 'noreply@resend.dev',
        to: user.email,
        subject: 'Erebus - Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #E31837;">Password Reset Request</h2>
            <p>Hello ${user.first_name || 'there'},</p>
            <p>An administrator has initiated a password reset for your Erebus account.</p>
            <p>Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #E31837; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
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
      
      console.log(`Password reset email sent to ${user.email}`);
      res.json({ message: 'Password reset email sent successfully' });
    } catch (emailError) {
      console.error('Email send error:', emailError);
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
          depthMin: parseFloat(site.depth_min) || null,
          depthMax: parseFloat(site.depth_max) || null,
          visibilityMin: parseFloat(site.visibility_min) || null,
          visibilityMax: parseFloat(site.visibility_max) || null,
          difficulty: site.difficulty,
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
      depthMin: parseFloat(site.depth_min) || null,
      depthMax: parseFloat(site.depth_max) || null,
      visibilityMin: parseFloat(site.visibility_min) || null,
      visibilityMax: parseFloat(site.visibility_max) || null,
      difficulty: site.difficulty,
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
    waterType, depthMin, depthMax, visibilityMin, visibilityMax,
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
        country, region, water_type, depth_min, depth_max,
        visibility_min, visibility_max, difficulty, current_strength,
        access_notes, facilities, hazards, best_season,
        wikipedia_url, external_info, image_url, is_wreck, wreck_name, wreck_url, wreck_info
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING *`,
      [
        req.user.id, name, description || null, siteType || 'reef',
        latitude || null, longitude || null, country || null, region || null,
        waterType || 'marine', depthMin || null, depthMax || null,
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
      depthMin: parseFloat(site.depth_min) || null,
      depthMax: parseFloat(site.depth_max) || null,
      difficulty: site.difficulty,
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
    waterType, depthMin, depthMax, visibilityMin, visibilityMax,
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
        depth_min = $9,
        depth_max = $10,
        visibility_min = $11,
        visibility_max = $12,
        difficulty = COALESCE($13, difficulty),
        current_strength = $14,
        access_notes = $15,
        facilities = $16,
        hazards = $17,
        best_season = $18,
        wikipedia_url = $19,
        external_info = $20,
        image_url = $21,
        rating_avg = COALESCE($22, rating_avg),
        is_wreck = $23,
        wreck_name = $24,
        wreck_url = $25,
        wreck_info = $26,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $27 RETURNING *`,
      [
        name, description, siteType, latitude, longitude, country, region,
        waterType, depthMin, depthMax, visibilityMin, visibilityMax,
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
      depthMin: parseFloat(site.depth_min) || null,
      depthMax: parseFloat(site.depth_max) || null,
      visibilityMin: parseFloat(site.visibility_min) || null,
      visibilityMax: parseFloat(site.visibility_max) || null,
      difficulty: site.difficulty,
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
      
      if (isPrimary) {
        await client.query('UPDATE dive_site_images SET is_primary = FALSE WHERE dive_site_id = $1', [id]);
      }
      
      const result = await client.query(
        'INSERT INTO dive_site_images (dive_site_id, image_url, caption, is_primary, is_stock, attribution) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [id, imageUrl, caption || null, isPrimary || false, isStock || false, attribution || null]
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
    const response = await fetch(imageUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ErebusDiveApp/1.0)'
      }
    });
    
    if (!response.ok) {
      return res.status(400).json({ error: 'Failed to fetch image from URL' });
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL does not point to a valid image' });
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
      
      if (isPrimary) {
        await client2.query('UPDATE dive_site_images SET is_primary = FALSE WHERE dive_site_id = $1', [id]);
      }
      
      const result = await client2.query(
        'INSERT INTO dive_site_images (dive_site_id, image_url, caption, is_primary, is_stock, attribution) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [id, objectPath, caption || null, isPrimary || false, false, `Imported from: ${new URL(imageUrl).hostname}`]
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

app.get('/api/sync/dive-sites', authenticateToken, async (req, res) => {
  const { since } = req.query;
  
  try {
    let query;
    let params = [];
    
    if (since) {
      query = `
        SELECT id, user_id, name, description, site_type, latitude, longitude,
               country, region, water_type, depth_min, depth_max, visibility_min,
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
               country, region, water_type, depth_min, depth_max, visibility_min,
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
      depthMin: row.depth_min ? parseFloat(row.depth_min) : null,
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
              country, region, water_type, depth_min, depth_max, difficulty,
              current_strength, access_notes, facilities, hazards, best_season,
              image_url, is_wreck, wreck_info, wreck_name, wreck_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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
            data.depthMin || null,
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
              depth_min = COALESCE($9, depth_min),
              depth_max = COALESCE($10, depth_max),
              difficulty = COALESCE($11, difficulty),
              current_strength = COALESCE($12, current_strength),
              access_notes = COALESCE($13, access_notes),
              image_url = COALESCE($14, image_url)
            WHERE id = $15 AND deleted_at IS NULL
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
            data.depthMin,
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

app.get('/api/dive-logs', authenticateToken, async (req, res) => {
  try {
    const { search, dive_site_id, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT dl.*, ds.name as dive_site_name
      FROM dive_logs dl
      LEFT JOIN dive_sites ds ON dl.dive_site_id = ds.id
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
        updatedAt: row.updated_at
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
        SUM(duration_seconds) as total_duration_seconds,
        MAX(max_depth_meters) as deepest_dive_meters,
        AVG(max_depth_meters) as avg_max_depth_meters,
        MIN(min_temperature_celsius) as coldest_temp,
        MAX(max_temperature_celsius) as warmest_temp
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
      warmestTemp: stats.warmest_temp ? parseFloat(stats.warmest_temp) : null
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

      for (const dive of parsedDives) {
        const result = await client.query(`
          INSERT INTO dive_logs (
            user_id, dive_datetime, duration_seconds, max_depth_meters, avg_depth_meters,
            min_temperature_celsius, max_temperature_celsius, device_manufacturer, device_model,
            device_serial, samples, gas_mixes, notes, import_source, import_filename
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
          filename
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
    
    for (let i = 0; i < dtos.length; i++) {
      const dto = dtos[i];
      try {
        const diveLogId = await diveLogPersistence.saveDiveImport(dto, req.user.id);
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
      samples, gasMixes, notes, rating
    } = req.body;

    if (!diveDateTime) {
      return res.status(400).json({ error: 'Dive date/time is required' });
    }

    const result = await pool.query(`
      INSERT INTO dive_logs (
        user_id, dive_site_id, dive_datetime, duration_seconds, max_depth_meters, avg_depth_meters,
        min_temperature_celsius, max_temperature_celsius, device_manufacturer, device_model,
        samples, gas_mixes, notes, rating, import_source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'manual')
      RETURNING *
    `, [
      req.user.id,
      diveSiteId || null,
      diveDateTime,
      durationSeconds || null,
      maxDepthMeters || null,
      avgDepthMeters || null,
      minTemperatureCelsius || null,
      maxTemperatureCelsius || null,
      deviceManufacturer || null,
      deviceModel || null,
      samples ? JSON.stringify(samples) : null,
      gasMixes ? JSON.stringify(gasMixes) : null,
      notes || null,
      rating || null
    ]);

    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      userId: row.user_id,
      diveSiteId: row.dive_site_id,
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
      minTemperatureCelsius, maxTemperatureCelsius, notes, rating
    } = req.body;

    const existingResult = await pool.query(
      'SELECT id FROM dive_logs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, req.user.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dive log not found' });
    }

    const result = await pool.query(`
      UPDATE dive_logs SET
        dive_site_id = COALESCE($1, dive_site_id),
        dive_datetime = COALESCE($2, dive_datetime),
        duration_seconds = COALESCE($3, duration_seconds),
        max_depth_meters = COALESCE($4, max_depth_meters),
        avg_depth_meters = COALESCE($5, avg_depth_meters),
        min_temperature_celsius = COALESCE($6, min_temperature_celsius),
        max_temperature_celsius = COALESCE($7, max_temperature_celsius),
        notes = COALESCE($8, notes),
        rating = COALESCE($9, rating)
      WHERE id = $10 AND user_id = $11
      RETURNING *
    `, [
      diveSiteId,
      diveDateTime,
      durationSeconds,
      maxDepthMeters,
      avgDepthMeters,
      minTemperatureCelsius,
      maxTemperatureCelsius,
      notes,
      rating,
      id,
      req.user.id
    ]);

    const row = result.rows[0];
    res.json({
      id: row.id,
      userId: row.user_id,
      diveSiteId: row.dive_site_id,
      diveDateTime: row.dive_datetime,
      durationSeconds: row.duration_seconds,
      maxDepthMeters: row.max_depth_meters ? parseFloat(row.max_depth_meters) : null,
      notes: row.notes,
      rating: row.rating,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Update dive log error:', error);
    res.status(500).json({ error: 'Server error' });
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

const distPath = path.join(__dirname, '..', 'dist');

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
