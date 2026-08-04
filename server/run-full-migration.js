/**
 * Full migration script — runs on Render via /api/admin/run-full-migration
 * Reads onboard-migration-data.json, other-users-data.json and training-data.json.
 *
 * Phase 0: Seed training agencies + courses (reference data).
 * Phase 1: Seed the onboarding user (anthony@clara-eu.co) with all their data from Replit prod.
 * Phase 2: Create remaining users on Render (preserving password hashes) and clone onboard data to each.
 */

const path = require('path');
const onboardData    = require(path.join(__dirname, 'onboard-migration-data.json'));
const otherUsers     = require(path.join(__dirname, 'other-users-data.json'));
const trainingData   = require(path.join(__dirname, 'training-data.json'));

async function runFullMigration(pool) {
  const log = [];
  const say = (msg) => { console.log('[migration]', msg); log.push(msg); };

  // ── Phase 0: training agencies + courses (reference data) ──────────────────
  say('Phase 0: seeding training agencies and courses');
  const n = (v) => (v === '' || v === 'null' || v === null || v === undefined) ? null : v;
  const nb = (v) => v === 'true' ? true : v === 'false' ? false : (v === null || v === '' || v === undefined) ? null : v;

  for (const ag of trainingData.agencies) {
    await pool.query(`
      INSERT INTO training_agencies (id,name,abbreviation,website,logo_url,country,is_active,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO NOTHING`,
      [n(ag.id),n(ag.name),n(ag.abbreviation),n(ag.website),n(ag.logo_url),n(ag.country),nb(ag.is_active),n(ag.created_at)]
    );
  }
  say(`  agencies: ${trainingData.agencies.length}`);

  for (const c of trainingData.courses) {
    await pool.query(`
      INSERT INTO training_courses (id,agency_id,name,level,category,description,prerequisites,min_age,min_dives,sort_order,is_active,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO NOTHING`,
      [n(c.id),n(c.agency_id),n(c.name),n(c.level),n(c.category),n(c.description),n(c.prerequisites),n(c.min_age),n(c.min_dives),n(c.sort_order),nb(c.is_active),n(c.created_at)]
    );
  }
  say(`  courses: ${trainingData.courses.length}`);

  // ── Phase 1: seed onboarding user ──────────────────────────────────────────
  say('Phase 1: seeding onboarding user data');

  const onboardRes = await pool.query(
    "SELECT id FROM users WHERE email = 'anthony@clara-eu.co'"
  );
  if (onboardRes.rows.length === 0) {
    throw new Error('Onboarding user (anthony@clara-eu.co) not found on Render');
  }
  const onboardUserId = onboardRes.rows[0].id;
  say(`Onboarding user Render id = ${onboardUserId}`);

  // Guard: skip if already seeded
  const alreadySeeded = await pool.query(
    'SELECT COUNT(*) AS n FROM dive_sites WHERE user_id = $1', [onboardUserId]
  );
  if (parseInt(alreadySeeded.rows[0].n) > 0) {
    say('Onboarding user already has dive sites — skipping Phase 1');
  } else {
    await seedOnboardUser(pool, onboardUserId, onboardData, say);
  }

  // ── Phase 2: create other users + clone ────────────────────────────────────
  say('Phase 2: creating other users and cloning data');

  for (const u of otherUsers) {
    // Check if user already exists on Render
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [u.email.toLowerCase()]);
    let renderUserId;
    if (exists.rows.length > 0) {
      renderUserId = exists.rows[0].id;
      say(`User ${u.email} already exists as Render id ${renderUserId}`);
    } else {
      const created = await pool.query(
        `INSERT INTO users (email, password, first_name, last_name, role, created_at, trial_ends_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [u.email.toLowerCase(), u.password, u.first_name, u.last_name, u.role || 'user',
         u.created_at || new Date(), u.trial_ends_at || null]
      );
      renderUserId = created.rows[0].id;
      say(`Created user ${u.email} as Render id ${renderUserId}`);
    }

    // Clone onboard data if user has no dive sites yet
    const hasData = await pool.query(
      'SELECT COUNT(*) AS n FROM dive_sites WHERE user_id = $1', [renderUserId]
    );
    if (parseInt(hasData.rows[0].n) > 0) {
      say(`User ${u.email} already has data — skipping clone`);
    } else {
      await seedOnboardUser(pool, renderUserId, onboardData, say);
      say(`Cloned onboard data to ${u.email}`);
    }
  }

  say('Migration complete');
  return log;
}

async function seedOnboardUser(pool, targetUserId, data, say) {
  const n = (v) => (v === '' || v === 'null' || v === null || v === undefined) ? null : v;
  const nb = (v) => v === 'true' ? true : v === 'false' ? false : (v === null || v === '' || v === undefined) ? null : v;

  // ── dive_sites ──────────────────────────────────────────────────────────────
  const siteIdMap = {};
  for (const s of data.diveSites) {
    const r = await pool.query(`
      INSERT INTO dive_sites (user_id,name,description,site_type,latitude,longitude,country,region,
        water_type,depth_max,visibility_min,visibility_max,difficulty,current_strength,access_notes,
        facilities,hazards,best_season,wikipedia_url,external_info,is_wreck,wreck_info,wreck_name,wreck_url,image_url,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,NOW())
      RETURNING id`,
      [targetUserId,n(s.name),n(s.description),n(s.site_type),n(s.latitude),n(s.longitude),n(s.country),n(s.region),
       n(s.water_type),n(s.depth_max),n(s.visibility_min),n(s.visibility_max),n(s.difficulty),n(s.current_strength),n(s.access_notes),
       n(s.facilities),n(s.hazards),n(s.best_season),n(s.wikipedia_url),n(s.external_info),nb(s.is_wreck),n(s.wreck_info),n(s.wreck_name),n(s.wreck_url),n(s.image_url)]
    );
    siteIdMap[s.id] = r.rows[0].id;
  }
  say && say(`  dive_sites: ${data.diveSites.length}`);

  // ── dive_site_images ────────────────────────────────────────────────────────
  for (const img of data.siteImages) {
    const newSiteId = siteIdMap[img.dive_site_id];
    if (!newSiteId) continue;
    await pool.query(`
      INSERT INTO dive_site_images (dive_site_id,image_url,is_primary,is_stock,caption,attribution,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [newSiteId,n(img.image_url),nb(img.is_primary),nb(img.is_stock),n(img.caption),n(img.attribution)]
    );
  }

  // ── gear_profiles ───────────────────────────────────────────────────────────
  const gearIdMap = {};
  for (const g of data.gearProfiles) {
    const r = await pool.query(`
      INSERT INTO gear_profiles (user_id,name,config_type,suit_type,suit_thickness,undersuit,suit_nickname,
        gloves_type,gloves_thickness,gloves_nickname,boots_type,boots_thickness,boots_nickname,
        hood_type,hood_thickness,hood_nickname,bcd_type,bcd_nickname,fins_type,fins_nickname,
        mask_nickname,notes,is_template,planned_depth,planned_bottom_time,status,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,NOW())
      RETURNING id`,
      [targetUserId,n(g.name),n(g.config_type),n(g.suit_type),n(g.suit_thickness),n(g.undersuit),n(g.suit_nickname),
       n(g.gloves_type),n(g.gloves_thickness),n(g.gloves_nickname),n(g.boots_type),n(g.boots_thickness),n(g.boots_nickname),
       n(g.hood_type),n(g.hood_thickness),n(g.hood_nickname),n(g.bcd_type),n(g.bcd_nickname),n(g.fins_type),n(g.fins_nickname),
       n(g.mask_nickname),n(g.notes),nb(g.is_template),n(g.planned_depth),n(g.planned_bottom_time),n(g.status)]
    );
    gearIdMap[g.id] = r.rows[0].id;
  }

  // ── gear_cylinders (within gear profiles) ──────────────────────────────────
  for (const gc of data.gearCylinders) {
    const newGearId = gearIdMap[gc.gear_profile_id];
    if (!newGearId) continue;
    await pool.query(`
      INSERT INTO gear_cylinders (gear_profile_id,cylinder_size,cylinder_material,cylinder_role,gas_mix,
        o2_percent,he_percent,start_pressure,working_pressure,nickname,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [newGearId,n(gc.cylinder_size),n(gc.cylinder_material),n(gc.cylinder_role),n(gc.gas_mix),
       n(gc.o2_percent),n(gc.he_percent),n(gc.start_pressure),n(gc.working_pressure),n(gc.nickname),n(gc.sort_order)]
    );
  }

  // ── gear_weights ────────────────────────────────────────────────────────────
  for (const gw of data.gearWeights) {
    const newGearId = gearIdMap[gw.gear_profile_id];
    if (!newGearId) continue;
    await pool.query(`
      INSERT INTO gear_weights (gear_profile_id,placement,weight_kg,sort_order)
      VALUES ($1,$2,$3,$4)`,
      [newGearId,n(gw.placement),n(gw.weight_kg),n(gw.sort_order)]
    );
  }
  say && say(`  gear_profiles: ${data.gearProfiles.length} (+ ${data.gearCylinders.length} cylinders, ${data.gearWeights.length} weights)`);

  // ── dive_buddies ────────────────────────────────────────────────────────────
  const buddyIdMap = {};
  for (const b of data.diveBuddies) {
    const r = await pool.query(`
      INSERT INTO dive_buddies (user_id,name,notes,created_at)
      VALUES ($1,$2,$3,NOW()) RETURNING id`,
      [targetUserId,n(b.name),n(b.notes)]
    );
    buddyIdMap[b.id] = r.rows[0].id;
  }

  // ── equipment_inventory ─────────────────────────────────────────────────────
  for (const eq of data.equipment) {
    await pool.query(`
      INSERT INTO equipment_inventory (user_id,equipment_type,name,brand,model,serial_number,quantity,purchase_date,last_service_date,notes,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [targetUserId,n(eq.equipment_type),n(eq.name),n(eq.brand),n(eq.model),n(eq.serial_number),n(eq.quantity),n(eq.purchase_date),n(eq.last_service_date),n(eq.notes)]
    );
  }

  // ── user_certifications ─────────────────────────────────────────────────────
  const certIdMap = {};
  for (const c of data.certs) {
    const r = await pool.query(`
      INSERT INTO user_certifications (user_id,course_id,certification_date,certification_number,instructor_name,
        instructor_number,dive_center,location,notes,is_verified,latitude,longitude,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING id`,
      [targetUserId,n(c.course_id),n(c.certification_date),n(c.certification_number),n(c.instructor_name),
       n(c.instructor_number),n(c.dive_center),n(c.location),n(c.notes),nb(c.is_verified),n(c.latitude),n(c.longitude)]
    );
    certIdMap[c.id] = r.rows[0].id;
  }
  for (const ci of data.certImages) {
    const newCertId = certIdMap[ci.certification_id];
    if (!newCertId) continue;
    await pool.query(`
      INSERT INTO certification_images (certification_id,image_url,image_side,created_at)
      VALUES ($1,$2,$3,NOW())`,
      [newCertId,n(ci.image_url),n(ci.image_side)]
    );
  }

  // ── cylinders ───────────────────────────────────────────────────────────────
  for (const cyl of data.cylinders) {
    const newGearId = cyl.gear_profile_id ? (gearIdMap[cyl.gear_profile_id] ?? null) : null;
    await pool.query(`
      INSERT INTO cylinders (user_id,nickname,cylinder_type,size_liters,serial_number,working_pressure,
        manufacture_date,ownership_status,testing_standard,custom_visual_interval_months,
        custom_hydro_interval_months,is_enriched_gas,oxygen_clean_interval_months,
        last_visual_date,last_hydro_date,last_oxygen_clean_date,
        reminder_enabled,reminder_days_before,gear_profile_id,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())`,
      [targetUserId,n(cyl.nickname),n(cyl.cylinder_type),n(cyl.size_liters),n(cyl.serial_number),n(cyl.working_pressure),
       n(cyl.manufacture_date),n(cyl.ownership_status),n(cyl.testing_standard),n(cyl.custom_visual_interval_months),
       n(cyl.custom_hydro_interval_months),nb(cyl.is_enriched_gas),n(cyl.oxygen_clean_interval_months),
       n(cyl.last_visual_date),n(cyl.last_hydro_date),n(cyl.last_oxygen_clean_date),
       nb(cyl.reminder_enabled),n(cyl.reminder_days_before),newGearId]
    );
  }

  // ── compressors ─────────────────────────────────────────────────────────────
  for (const comp of data.compressors) {
    await pool.query(`
      INSERT INTO compressors (user_id,name,make,model,serial_number,purchase_date,total_hours,
        oil_change_interval_hours,filter_change_interval_hours,independent_test_interval_months,
        notes,status,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
      [targetUserId,n(comp.name),n(comp.make),n(comp.model),n(comp.serial_number),n(comp.purchase_date),n(comp.total_hours),
       n(comp.oil_change_interval_hours),n(comp.filter_change_interval_hours),n(comp.independent_test_interval_months),
       n(comp.notes),n(comp.status)]
    );
  }

  // ── dive_trips ──────────────────────────────────────────────────────────────
  const tripIdMap = {};
  for (const t of data.trips) {
    const r = await pool.query(`
      INSERT INTO dive_trips (user_id,name,trip_type,start_date,end_date,operator_name,vessel_name,
        dive_center_name,location,country,latitude,longitude,accommodation,total_dives,notes,cover_image_key,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW()) RETURNING id`,
      [targetUserId,n(t.name),n(t.trip_type),n(t.start_date),n(t.end_date),n(t.operator_name),n(t.vessel_name),
       n(t.dive_center_name),n(t.location),n(t.country),n(t.latitude),n(t.longitude),
       n(t.accommodation),n(t.total_dives),n(t.notes),n(t.cover_image_key)]
    );
    tripIdMap[t.id] = r.rows[0].id;
  }

  // ── dive_logs ───────────────────────────────────────────────────────────────
  const logIdMap = {};
  for (const dl of data.diveLogs) {
    const newSiteId = dl.dive_site_id ? (siteIdMap[dl.dive_site_id] ?? null) : null;
    const newGearId = dl.gear_profile_id ? (gearIdMap[dl.gear_profile_id] ?? null) : null;
    const r = await pool.query(`
      INSERT INTO dive_logs (user_id,dive_site_id,gear_profile_id,dive_datetime,duration_seconds,max_depth_meters,avg_depth_meters,
        min_temperature_celsius,max_temperature_celsius,dive_number,surface_interval_seconds,dive_mode,surface_conditions,
        weather_conditions,notes,rating,buddy,workload,thermal_comfort,equipment_issues,skills_practiced,skills_notes,
        decompression_symptoms,problem_notes,import_source,import_filename,device_manufacturer,device_model,device_serial,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,NOW())
      RETURNING id`,
      [targetUserId,newSiteId,newGearId,n(dl.dive_datetime),n(dl.duration_seconds),n(dl.max_depth_meters),n(dl.avg_depth_meters),
       n(dl.min_temperature_celsius),n(dl.max_temperature_celsius),n(dl.dive_number),n(dl.surface_interval_seconds),n(dl.dive_mode),
       n(dl.surface_conditions),n(dl.weather_conditions),n(dl.notes),n(dl.rating),n(dl.buddy),
       n(dl.workload),n(dl.thermal_comfort),n(dl.equipment_issues),n(dl.skills_practiced),n(dl.skills_notes),
       n(dl.decompression_symptoms),n(dl.problem_notes),n(dl.import_source),n(dl.import_filename),
       n(dl.device_manufacturer),n(dl.device_model),n(dl.device_serial)]
    );
    logIdMap[dl.id] = r.rows[0].id;
  }
  say && say(`  dive_logs: ${data.diveLogs.length}`);

  // ── dive_log_buddies ────────────────────────────────────────────────────────
  for (const lb of data.logBuddies) {
    const newLogId = logIdMap[lb.dive_log_id];
    const newBuddyId = lb.buddy_id ? (buddyIdMap[lb.buddy_id] ?? null) : null;
    if (newLogId && newBuddyId) {
      await pool.query(`INSERT INTO dive_log_buddies (dive_log_id,buddy_id,created_at) VALUES ($1,$2,NOW())`,
        [newLogId, newBuddyId]);
    }
  }

  // ── dive_trip_logs ──────────────────────────────────────────────────────────
  for (const tl of data.tripLogs) {
    const newTripId = tripIdMap[tl.trip_id];
    const newLogId  = logIdMap[tl.dive_log_id];
    if (newTripId && newLogId) {
      await pool.query(`INSERT INTO dive_trip_logs (trip_id,dive_log_id,created_at) VALUES ($1,$2,NOW())`,
        [newTripId, newLogId]);
    }
  }

  // ── dive_photos ─────────────────────────────────────────────────────────────
  for (const p of data.photos) {
    const newLogId  = p.dive_log_id ? (logIdMap[p.dive_log_id] ?? null) : null;
    const newTripId = p.trip_id     ? (tripIdMap[p.trip_id]   ?? null) : null;
    await pool.query(`
      INSERT INTO dive_photos (user_id,dive_log_id,trip_id,image_url,thumbnail_url,caption,
        taken_at,location_lat,location_lng,width,height,file_size,is_favorite,media_type,
        duration,blurhash,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())`,
      [targetUserId,newLogId,newTripId,n(p.image_url),n(p.thumbnail_url),n(p.caption),
       n(p.taken_at),n(p.location_lat),n(p.location_lng),n(p.width),n(p.height),
       n(p.file_size),nb(p.is_favorite),n(p.media_type),n(p.duration),n(p.blurhash)]
    );
  }
  say && say(`  photos: ${data.photos.length}`);

  say && say(`  Seeded user ${targetUserId} — sites:${data.diveSites.length} logs:${data.diveLogs.length} photos:${data.photos.length}`);
}

module.exports = { runFullMigration };
