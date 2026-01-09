const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Pool } = require('pg');
const { Resend } = require('resend');

const app = express();
const PORT = 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_sites_name ON dive_sites(name);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_sites_type ON dive_sites(site_type);
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dive_sites_location ON dive_sites(country, region);
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
    
    res.json({
      sites: result.rows.map(site => ({
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
        createdAt: site.created_at,
        updatedAt: site.updated_at
      })),
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
    bestSeason, wikipediaUrl, externalInfo, imageUrl
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
        wikipedia_url, external_info, image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *`,
      [
        req.user.id, name, description || null, siteType || 'reef',
        latitude || null, longitude || null, country || null, region || null,
        waterType || 'marine', depthMin || null, depthMax || null,
        visibilityMin || null, visibilityMax || null, difficulty || 'intermediate',
        currentStrength || null, accessNotes || null,
        JSON.stringify(facilities || []), JSON.stringify(hazards || []),
        bestSeason || null, wikipediaUrl || null, externalInfo || null, imageUrl || null
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
    bestSeason, wikipediaUrl, externalInfo, imageUrl, ratingAvg
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
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $23 RETURNING *`,
      [
        name, description, siteType, latitude, longitude, country, region,
        waterType, depthMin, depthMax, visibilityMin, visibilityMax,
        difficulty, currentStrength, accessNotes,
        JSON.stringify(facilities || []), JSON.stringify(hazards || []),
        bestSeason, wikipediaUrl, externalInfo, imageUrl, ratingAvg, id
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

initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Erebus API server running on port ${PORT}`);
  });
});
