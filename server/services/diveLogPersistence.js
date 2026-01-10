const { Pool } = require('pg');

class DiveLogPersistenceService {
  constructor(pool) {
    this.pool = pool;
  }
  
  async saveDiveImport(dto, userId) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const diveLogId = await this.insertDiveLog(client, dto, userId);
      
      await this.insertSamples(client, diveLogId, dto.samples);
      await this.insertGases(client, diveLogId, dto.gases);
      await this.insertEvents(client, diveLogId, dto.events);
      await this.insertTankPressures(client, diveLogId, dto.tank_pressures);
      await this.insertSettings(client, diveLogId, dto.settings);
      await this.insertImportMetadata(client, diveLogId, dto.import_metadata);
      
      await client.query('COMMIT');
      
      return diveLogId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async insertDiveLog(client, dto, userId) {
    const diveComputerId = await this.findDiveComputerId(client, dto.device.manufacturer, dto.device.model);
    
    const result = await client.query(
      `INSERT INTO dive_logs (
        user_id, dive_site_id, dive_datetime, duration_seconds,
        max_depth_meters, avg_depth_meters, min_temperature_celsius, max_temperature_celsius,
        device_manufacturer, device_model, device_serial, dive_computer_id,
        notes, rating, import_source, import_filename,
        dive_number, surface_interval_seconds, surface_pressure_mbar, dive_mode,
        surface_conditions, weather_conditions, workload, thermal_comfort,
        gas_pressures, equipment_issues, skills_practiced, buddy,
        decompression_symptoms, problem_notes,
        samples, gas_mixes,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28, $29, $30, $31, $32,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) RETURNING id`,
      [
        userId,
        dto.header.dive_site_id,
        dto.header.dive_datetime,
        dto.header.duration_seconds,
        dto.header.max_depth_meters,
        dto.header.avg_depth_meters,
        dto.header.min_temperature_celsius,
        dto.header.max_temperature_celsius,
        dto.device.manufacturer,
        dto.device.model,
        dto.device.serial,
        diveComputerId,
        dto.header.notes,
        dto.header.rating,
        dto.import_metadata.source_format,
        dto.import_metadata.source_filename,
        dto.header.dive_number,
        dto.header.surface_interval_seconds,
        dto.header.surface_pressure_mbar,
        dto.header.dive_mode,
        dto.header.surface_conditions,
        dto.header.weather_conditions,
        dto.header.workload,
        dto.header.thermal_comfort,
        dto.gas_pressures ? JSON.stringify(dto.gas_pressures) : null,
        dto.equipment_issues.length > 0 ? JSON.stringify(dto.equipment_issues) : null,
        dto.skills_practiced.length > 0 ? JSON.stringify(dto.skills_practiced) : null,
        dto.header.buddy,
        dto.header.decompression_symptoms,
        dto.header.problem_notes,
        JSON.stringify(dto.samples.map(s => ({
          time_seconds: s.sample_time_seconds,
          depth_meters: s.depth_meters,
          temperature_celsius: s.temperature_celsius,
        }))),
        JSON.stringify(dto.gases.map(g => ({
          name: g.name,
          o2: g.o2_percent,
          he: g.he_percent,
        }))),
      ]
    );
    
    return result.rows[0].id;
  }
  
  async findDiveComputerId(client, manufacturer, model) {
    if (!manufacturer || !model) return null;
    
    const result = await client.query(
      `SELECT id FROM dive_computer_catalog 
       WHERE LOWER(manufacturer) = LOWER($1) AND LOWER(model) = LOWER($2)
       LIMIT 1`,
      [manufacturer, model]
    );
    
    return result.rows.length > 0 ? result.rows[0].id : null;
  }
  
  async insertSamples(client, diveLogId, samples) {
    if (!samples || samples.length === 0) return;
    
    const batchSize = 500;
    for (let i = 0; i < samples.length; i += batchSize) {
      const batch = samples.slice(i, i + batchSize);
      
      const values = [];
      const params = [];
      let paramIdx = 1;
      
      for (const sample of batch) {
        values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
        params.push(
          diveLogId,
          sample.sample_time_seconds,
          sample.depth_meters,
          sample.temperature_celsius,
          sample.metrics ? JSON.stringify(sample.metrics) : null
        );
      }
      
      await client.query(
        `INSERT INTO dive_log_samples (dive_log_id, sample_time_seconds, depth_meters, temperature_celsius, metrics)
         VALUES ${values.join(', ')}`,
        params
      );
    }
  }
  
  async insertGases(client, diveLogId, gases) {
    if (!gases || gases.length === 0) return;
    
    for (const gas of gases) {
      await client.query(
        `INSERT INTO dive_log_gases (
          dive_log_id, gas_slot, name, o2_percent, he_percent, n2_percent,
          is_diluent, is_bailout, tank_size_liters, work_pressure_bar,
          start_pressure_bar, end_pressure_bar, transmitter_serial
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          diveLogId,
          gas.gas_slot,
          gas.name,
          gas.o2_percent,
          gas.he_percent,
          gas.n2_percent,
          gas.is_diluent,
          gas.is_bailout,
          gas.tank_size_liters,
          gas.work_pressure_bar,
          gas.start_pressure_bar,
          gas.end_pressure_bar,
          gas.transmitter_serial,
        ]
      );
    }
  }
  
  async insertEvents(client, diveLogId, events) {
    if (!events || events.length === 0) return;
    
    for (const event of events) {
      await client.query(
        `INSERT INTO dive_log_events (
          dive_log_id, event_time_seconds, event_type, event_subtype, event_value, gas_slot, payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          diveLogId,
          event.event_time_seconds,
          event.event_type,
          event.event_subtype,
          event.event_value,
          event.gas_slot,
          event.payload ? JSON.stringify(event.payload) : null,
        ]
      );
    }
  }
  
  async insertTankPressures(client, diveLogId, tankPressures) {
    if (!tankPressures || tankPressures.length === 0) return;
    
    const batchSize = 500;
    for (let i = 0; i < tankPressures.length; i += batchSize) {
      const batch = tankPressures.slice(i, i + batchSize);
      
      const values = [];
      const params = [];
      let paramIdx = 1;
      
      for (const tp of batch) {
        values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
        params.push(
          diveLogId,
          tp.gas_slot,
          tp.sample_time_seconds,
          tp.pressure_bar,
          tp.transmitter_serial
        );
      }
      
      await client.query(
        `INSERT INTO dive_log_tank_pressures (dive_log_id, gas_slot, sample_time_seconds, pressure_bar, transmitter_serial)
         VALUES ${values.join(', ')}`,
        params
      );
    }
  }
  
  async insertSettings(client, diveLogId, settings) {
    const hasSettings = Object.values(settings).some(v => v !== null);
    if (!hasSettings) return;
    
    await client.query(
      `INSERT INTO dive_log_settings (
        dive_log_id, deco_model, gf_low, gf_high, conservatism, salinity,
        altitude_mode, ppO2_max, ppO2_min, ppO2_deco, end_limit_meters,
        firmware_version, battery_at_start, battery_at_end, extra_settings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        diveLogId,
        settings.deco_model,
        settings.gf_low,
        settings.gf_high,
        settings.conservatism,
        settings.salinity,
        settings.altitude_mode,
        settings.ppO2_max,
        settings.ppO2_min,
        settings.ppO2_deco,
        settings.end_limit_meters,
        settings.firmware_version,
        settings.battery_at_start,
        settings.battery_at_end,
        settings.extra_settings ? JSON.stringify(settings.extra_settings) : null,
      ]
    );
  }
  
  async insertImportMetadata(client, diveLogId, metadata) {
    await client.query(
      `INSERT INTO dive_log_imports (
        dive_log_id, source_type, source_filename, source_format,
        parser_version, raw_data_hash, unmapped_fields, import_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        diveLogId,
        metadata.source_type,
        metadata.source_filename,
        metadata.source_format,
        metadata.parser_version,
        metadata.raw_data_hash,
        metadata.unmapped_fields ? JSON.stringify(metadata.unmapped_fields) : null,
        metadata.import_notes,
      ]
    );
  }
  
  async getDiveLogWithDetails(diveLogId, userId) {
    const diveLog = await this.pool.query(
      `SELECT dl.*, dcc.manufacturer as catalog_manufacturer, dcc.model as catalog_model,
              dcc.family, dcc.protocol, dcc.has_ble, dcc.has_ai, dcc.sample_fields
       FROM dive_logs dl
       LEFT JOIN dive_computer_catalog dcc ON dl.dive_computer_id = dcc.id
       WHERE dl.id = $1 AND dl.user_id = $2 AND dl.is_archived IS NOT TRUE`,
      [diveLogId, userId]
    );
    
    if (diveLog.rows.length === 0) {
      return null;
    }
    
    const [samples, gases, events, tankPressures, settings, importMeta] = await Promise.all([
      this.pool.query(
        `SELECT * FROM dive_log_samples WHERE dive_log_id = $1 ORDER BY sample_time_seconds`,
        [diveLogId]
      ),
      this.pool.query(
        `SELECT * FROM dive_log_gases WHERE dive_log_id = $1 ORDER BY gas_slot`,
        [diveLogId]
      ),
      this.pool.query(
        `SELECT * FROM dive_log_events WHERE dive_log_id = $1 ORDER BY event_time_seconds`,
        [diveLogId]
      ),
      this.pool.query(
        `SELECT * FROM dive_log_tank_pressures WHERE dive_log_id = $1 ORDER BY sample_time_seconds`,
        [diveLogId]
      ),
      this.pool.query(
        `SELECT * FROM dive_log_settings WHERE dive_log_id = $1`,
        [diveLogId]
      ),
      this.pool.query(
        `SELECT * FROM dive_log_imports WHERE dive_log_id = $1`,
        [diveLogId]
      ),
    ]);
    
    return {
      ...diveLog.rows[0],
      detailed_samples: samples.rows,
      detailed_gases: gases.rows,
      events: events.rows,
      tank_pressure_history: tankPressures.rows,
      computer_settings: settings.rows[0] || null,
      import_info: importMeta.rows[0] || null,
    };
  }
  
  async migrateExistingDiveLog(diveLogId, userId) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const diveLog = await client.query(
        `SELECT * FROM dive_logs WHERE id = $1 AND user_id = $2`,
        [diveLogId, userId]
      );
      
      if (diveLog.rows.length === 0) {
        throw new Error('Dive log not found');
      }
      
      const log = diveLog.rows[0];
      
      const existingSamples = await client.query(
        `SELECT COUNT(*) as count FROM dive_log_samples WHERE dive_log_id = $1`,
        [diveLogId]
      );
      
      if (existingSamples.rows[0].count > 0) {
        await client.query('COMMIT');
        return { migrated: false, reason: 'Already migrated' };
      }
      
      if (log.samples) {
        const samples = typeof log.samples === 'string' ? JSON.parse(log.samples) : log.samples;
        for (const sample of samples) {
          await client.query(
            `INSERT INTO dive_log_samples (dive_log_id, sample_time_seconds, depth_meters, temperature_celsius)
             VALUES ($1, $2, $3, $4)`,
            [diveLogId, sample.time_seconds, sample.depth_meters, sample.temperature_celsius]
          );
        }
      }
      
      if (log.gas_mixes) {
        const gases = typeof log.gas_mixes === 'string' ? JSON.parse(log.gas_mixes) : log.gas_mixes;
        let slot = 0;
        for (const gas of gases) {
          await client.query(
            `INSERT INTO dive_log_gases (dive_log_id, gas_slot, name, o2_percent, he_percent, n2_percent, tank_size_liters, work_pressure_bar)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (dive_log_id, gas_slot) DO NOTHING`,
            [
              diveLogId,
              slot,
              gas.name,
              gas.o2 || 21,
              gas.he || 0,
              100 - (gas.o2 || 21) - (gas.he || 0),
              gas.size,
              gas.workpressure,
            ]
          );
          slot++;
        }
      }
      
      if (log.import_source) {
        await client.query(
          `INSERT INTO dive_log_imports (dive_log_id, source_type, source_filename, source_format, parser_version)
           VALUES ($1, 'file', $2, $3, '1.0.0')
           ON CONFLICT DO NOTHING`,
          [diveLogId, log.import_filename, log.import_source]
        );
      }
      
      await client.query('COMMIT');
      return { migrated: true };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = DiveLogPersistenceService;
