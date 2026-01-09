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

initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Erebus API server running on port ${PORT}`);
  });
});
