const xml2js = require('xml2js');
const Papa = require('papaparse');
const crypto = require('crypto');
const { DiveImportDTO, EVENT_TYPES, DIVE_MODES, DECO_MODELS } = require('./diveImportDTO');

function normalizeDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  try {
    let d = dateStr.trim();
    let t = timeStr ? timeStr.trim() : null;

    if (!t && d.includes('T')) {
      const parts = d.split('T');
      d = parts[0];
      t = parts[1];
    }
    if (!t && d.includes(' ') && d.split(' ').length >= 2) {
      const parts = d.split(' ');
      d = parts[0];
      t = parts.slice(1).join(' ');
    }

    const datePart = d.replace(/\//g, '-').substring(0, 10);
    const dateMatch = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!dateMatch) {
      return new Date(dateStr).toISOString();
    }
    const year = dateMatch[1];
    const month = dateMatch[2].padStart(2, '0');
    const day = dateMatch[3].padStart(2, '0');

    let hour = '00', minute = '00', second = '00';
    if (t) {
      t = t.replace(/Z$/i, '').replace(/[+-]\d{2}:\d{2}$/, '');
      const timeMatch = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (timeMatch) {
        hour = timeMatch[1].padStart(2, '0');
        minute = timeMatch[2];
        second = timeMatch[3] || '00';
      }
    }

    return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
  } catch {
    return new Date(dateStr).toISOString();
  }
}

class FormatDetector {
  static detect(fileContent, filename, mimeType) {
    const ext = filename.toLowerCase().split('.').pop();
    const contentStart = fileContent.substring(0, 1000).toLowerCase();
    
    if (ext === 'uddf' || contentStart.includes('<uddf')) {
      return 'uddf';
    }
    
    if (ext === 'ssrf' || contentStart.includes('<divelog') || contentStart.includes('<subsurface')) {
      return 'subsurface';
    }
    
    if (contentStart.includes('schemas.datacontract.org/2004/07/suunto') || contentStart.includes('<dive xmlns="http://schemas.datacontract.org/2004/07/suunto')) {
      return 'suunto_dm5';
    }

    if (ext === 'xml' || mimeType === 'application/xml' || mimeType === 'text/xml') {
      if (contentStart.includes('<uddf')) return 'uddf';
      if (contentStart.includes('<divelog') || contentStart.includes('<subsurface')) return 'subsurface';
      if (contentStart.includes('<dives>') || contentStart.includes('<dive ')) return 'generic_xml';
      return 'unknown_xml';
    }
    
    if (ext === 'csv' || mimeType === 'text/csv') {
      return 'csv';
    }
    
    if (ext === 'bin' || ext === 'dat') {
      return 'binary';
    }
    
    return 'unknown';
  }
}

class BaseAdapter {
  constructor() {
    this.version = '2.0.0';
  }
  
  async parse(content, filename) {
    throw new Error('parse() must be implemented by subclass');
  }
  
  createDTO() {
    const dto = new DiveImportDTO();
    dto.import_metadata.parser_version = this.version;
    return dto;
  }
  
  hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  
  parseTime(timeStr) {
    if (!timeStr) return null;
    if (typeof timeStr === 'number') return timeStr;
    
    const match = timeStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }
  
  parseDuration(durationStr) {
    if (!durationStr) return null;
    if (typeof durationStr === 'number') return durationStr;
    
    const minMatch = durationStr.match(/(\d+)\s*min/);
    const secMatch = durationStr.match(/(\d+)\s*sec/);
    const colonMatch = durationStr.match(/(\d+):(\d+)(?::(\d+))?/);
    
    if (colonMatch) {
      const hours = colonMatch[3] ? parseInt(colonMatch[1]) : 0;
      const mins = colonMatch[3] ? parseInt(colonMatch[2]) : parseInt(colonMatch[1]);
      const secs = colonMatch[3] ? parseInt(colonMatch[3]) : parseInt(colonMatch[2]);
      return hours * 3600 + mins * 60 + secs;
    }
    
    let seconds = 0;
    if (minMatch) seconds += parseInt(minMatch[1]) * 60;
    if (secMatch) seconds += parseInt(secMatch[1]);
    
    return seconds || null;
  }
  
  parseDepth(depthStr) {
    if (!depthStr) return null;
    if (typeof depthStr === 'number') return depthStr;
    
    const match = depthStr.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : null;
  }
  
  parseTemperature(tempStr) {
    if (!tempStr) return null;
    if (typeof tempStr === 'number') return tempStr;
    
    const match = tempStr.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : null;
  }
  
  parsePressure(pressureStr) {
    if (!pressureStr) return null;
    if (typeof pressureStr === 'number') return pressureStr;
    
    const match = pressureStr.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : null;
  }
}

class UDDFAdapter extends BaseAdapter {
  async parse(content, filename) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const result = await parser.parseStringPromise(content);
    
    if (!result.uddf) {
      throw new Error('Invalid UDDF format');
    }
    
    const dtos = [];
    const uddf = result.uddf;
    const profileData = uddf.profiledata;
    
    if (!profileData || !profileData.repetitiongroup) {
      return dtos;
    }
    
    const groups = Array.isArray(profileData.repetitiongroup)
      ? profileData.repetitiongroup
      : [profileData.repetitiongroup];
    
    for (const group of groups) {
      const diveEntries = Array.isArray(group.dive) ? group.dive : [group.dive];
      
      for (const dive of diveEntries) {
        if (!dive) continue;
        
        const dto = this.createDTO();
        dto.import_metadata.source_type = 'file';
        dto.import_metadata.source_filename = filename;
        dto.import_metadata.source_format = 'uddf';
        dto.import_metadata.raw_data_hash = this.hashContent(content);
        
        dto.header.dive_datetime = this.extractUDDFDateTime(dive) || new Date().toISOString();
        dto.header.duration_seconds = this.parseDuration(dive.$?.duration);
        dto.header.notes = dive.notes || null;
        
        if (uddf.generator) {
          dto.device.manufacturer = uddf.generator.manufacturer || null;
          dto.device.model = uddf.generator.name || null;
        }
        
        this.parseUDDFSamples(dive.samples, dto);
        this.parseUDDFGasMixes(uddf.gasdefinitions, dto);
        this.parseUDDFInformationBeforeDive(dive.informationbeforedive, dto);
        this.parseUDDFInformationAfterDive(dive.informationafterdive, dto);
        
        dto.calculateStats();
        dtos.push(dto);
      }
    }
    
    return dtos;
  }
  
  extractUDDFDateTime(dive) {
    if (dive.informationbeforedive?.datetime) {
      const result = normalizeDateTime(dive.informationbeforedive.datetime);
      if (result) return result;
    }
    
    if (dive.$?.date) {
      const result = normalizeDateTime(dive.$.date, dive.$.time);
      if (result) return result;
    }
    
    return null;
  }
  
  parseUDDFDateTime(dateStr, timeStr) {
    return normalizeDateTime(dateStr, timeStr);
  }
  
  parseUDDFSamples(samplesData, dto) {
    if (!samplesData || !samplesData.waypoint) return;
    
    const waypoints = Array.isArray(samplesData.waypoint)
      ? samplesData.waypoint
      : [samplesData.waypoint];
    
    for (const wp of waypoints) {
      const time = this.parseTime(wp.divetime);
      if (time === null) continue;
      
      const depth = parseFloat(wp.depth) || 0;
      const temp = wp.temperature ? parseFloat(wp.temperature) - 273.15 : null;
      
      const metrics = {};
      
      if (wp.alarm) {
        const alarms = Array.isArray(wp.alarm) ? wp.alarm : [wp.alarm];
        for (const alarm of alarms) {
          dto.addEvent(time, this.mapUDDFAlarm(alarm), { payload: { raw: alarm } });
        }
      }
      
      if (wp.switchmix) {
        dto.addEvent(time, EVENT_TYPES.GAS_SWITCH, { payload: { mix: wp.switchmix } });
      }
      
      if (wp.nodecotime) metrics.ndl_min = Math.round(parseInt(wp.nodecotime) / 60);
      if (wp.calculatedpo2) metrics.ppo2_bar = parseFloat(wp.calculatedpo2);
      if (wp.batterychargecondition) metrics.battery_voltage = parseFloat(wp.batterychargecondition);
      if (wp.cns) metrics.cns_pct = parseFloat(wp.cns) * 100;
      if (wp.otu) metrics.otu = parseFloat(wp.otu);
      if (wp.setpo2) metrics.setpoint_bar = parseFloat(wp.setpo2);
      if (wp.decostop) {
        metrics.stop_depth_m = parseFloat(wp.decostop.depth);
        metrics.stop_time_min = parseInt(wp.decostop.duration);
      }
      
      dto.addSample(time, depth, temp, Object.keys(metrics).length > 0 ? metrics : null);
    }
  }
  
  parseUDDFGasMixes(gasDefs, dto) {
    if (!gasDefs || !gasDefs.mix) return;
    
    const mixes = Array.isArray(gasDefs.mix) ? gasDefs.mix : [gasDefs.mix];
    let slot = 0;
    
    for (const mix of mixes) {
      const o2 = (parseFloat(mix.o2) || 0.21) * 100;
      const he = (parseFloat(mix.he) || 0) * 100;
      
      dto.addGas(slot, o2, he, {
        name: mix.$.name || mix.$.id || `Mix ${slot + 1}`,
      });
      slot++;
    }
  }
  
  parseUDDFInformationBeforeDive(info, dto) {
    if (!info) return;
    
    if (info.surfaceintervalbeforedive) {
      dto.header.surface_interval_seconds = this.parseDuration(info.surfaceintervalbeforedive.passedtime);
    }
    
    if (info.divenumber) {
      dto.header.dive_number = parseInt(info.divenumber);
    }
    
    if (info.airtemperature) {
      dto.header.weather_conditions = `Air temp: ${parseFloat(info.airtemperature) - 273.15}°C`;
    }
  }
  
  parseUDDFInformationAfterDive(info, dto) {
    if (!info) return;
    
    if (info.notes) {
      dto.header.notes = info.notes;
    }
    
    if (info.rating) {
      dto.header.rating = parseInt(info.rating);
    }
  }
  
  mapUDDFAlarm(alarm) {
    const alarmMap = {
      'ascent': EVENT_TYPES.ASCENT_VIOLATION,
      'deco': EVENT_TYPES.DECO_VIOLATION,
      'surface': EVENT_TYPES.SURFACE,
      'ppO2high': EVENT_TYPES.PO2_HIGH,
      'ppO2low': EVENT_TYPES.PO2_LOW,
    };
    return alarmMap[alarm] || EVENT_TYPES.MANUAL_MARKER;
  }
}

class SubsurfaceAdapter extends BaseAdapter {
  async parse(content, filename) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const result = await parser.parseStringPromise(content);
    
    let divelog;
    if (result.divelog) {
      divelog = result.divelog;
    } else if (result.subsurface) {
      divelog = result.subsurface;
    } else {
      throw new Error('Invalid Subsurface format');
    }
    
    const dtos = [];
    
    if (!divelog.dives || !divelog.dives.dive) {
      return dtos;
    }
    
    const diveEntries = Array.isArray(divelog.dives.dive)
      ? divelog.dives.dive
      : [divelog.dives.dive];
    
    for (const dive of diveEntries) {
      if (!dive) continue;
      
      const dto = this.createDTO();
      dto.import_metadata.source_type = 'file';
      dto.import_metadata.source_filename = filename;
      dto.import_metadata.source_format = 'subsurface';
      dto.import_metadata.raw_data_hash = this.hashContent(content);
      
      dto.header.dive_datetime = dive.$.date && dive.$.time
        ? normalizeDateTime(dive.$.date, dive.$.time)
        : new Date().toISOString();
      dto.header.duration_seconds = this.parseDuration(dive.$.duration);
      dto.header.dive_number = dive.$.number ? parseInt(dive.$.number) : null;
      dto.header.notes = dive.notes?._ || dive.notes || null;
      dto.header.rating = dive.$.rating ? parseInt(dive.$.rating) : null;
      
      if (dive.buddy) {
        dto.header.buddy = dive.buddy;
      }
      
      this.parseSubsurfaceDevice(divelog.divecomputers, dive.divecomputer, dto);
      this.parseSubsurfaceSamples(dive.sample, dto);
      this.parseSubsurfaceGasMixes(dive.cylinder, dto);
      this.parseSubsurfaceEvents(dive.event, dto);
      this.parseSubsurfaceDecoModel(dive.divecomputer, dto);
      this.parseSubsurfaceExtraData(dive.extradata, dto);
      
      dto.calculateStats();
      
      if (!dto.header.max_depth_meters && dive.$.maxdepth) {
        dto.header.max_depth_meters = this.parseDepth(dive.$.maxdepth);
      }
      if (!dto.header.min_temperature_celsius && dive.$.watertemp) {
        dto.header.min_temperature_celsius = this.parseTemperature(dive.$.watertemp);
      }
      if (dive.$.airtemp) {
        dto.header.weather_conditions = `Air temp: ${this.parseTemperature(dive.$.airtemp)}°C`;
      }
      
      dtos.push(dto);
    }
    
    return dtos;
  }
  
  parseSubsurfaceDevice(divecomputers, divecomputer, dto) {
    const dc = divecomputer || divecomputers?.divecomputer;
    if (!dc) return;
    
    const dcData = Array.isArray(dc) ? dc[0] : dc;
    
    if (dcData.$) {
      const model = dcData.$.model || dcData.$.deviceid;
      if (model) {
        const parts = model.split(' ');
        dto.device.manufacturer = parts[0] || null;
        dto.device.model = model;
      }
      dto.device.serial = dcData.$.serial || dcData.$.deviceid || null;
    }
    
    if (dcData.$.diveid) {
      dto.header.dive_number = parseInt(dcData.$.diveid);
    }
  }
  
  parseSubsurfaceSamples(sampleData, dto) {
    if (!sampleData) return;
    
    const samples = Array.isArray(sampleData) ? sampleData : [sampleData];
    
    for (const s of samples) {
      const time = this.parseDuration(s.$.time);
      const depth = this.parseDepth(s.$.depth);
      
      if (time === null || depth === null) continue;
      
      const temp = this.parseTemperature(s.$.temp);
      const metrics = {};
      
      if (s.$.ndl) metrics.ndl_min = this.parseDuration(s.$.ndl) / 60;
      if (s.$.tts) metrics.tts_min = this.parseDuration(s.$.tts) / 60;
      if (s.$.stopdepth) metrics.stop_depth_m = this.parseDepth(s.$.stopdepth);
      if (s.$.stoptime) metrics.stop_time_min = this.parseDuration(s.$.stoptime) / 60;
      if (s.$.cns) metrics.cns_pct = parseFloat(s.$.cns) * 100;
      if (s.$.po2) metrics.ppo2_bar = parseFloat(s.$.po2);
      if (s.$.setpoint) metrics.setpoint_bar = parseFloat(s.$.setpoint);
      if (s.$.heartbeat) metrics.heart_rate_bpm = parseInt(s.$.heartbeat);
      if (s.$.bearing) metrics.bearing_deg = parseInt(s.$.bearing);
      
      if (s.$.pressure) {
        const pressure = this.parsePressure(s.$.pressure);
        const tankIdx = s.$.sensor ? parseInt(s.$.sensor) : 0;
        dto.addTankPressure(tankIdx, time, pressure);
        metrics.tank_pressure_bar = pressure;
      }
      
      if (s.$.gfline) metrics.gf99_pct = parseFloat(s.$.gfline);
      if (s.$.ceiling) metrics.ceiling_m = this.parseDepth(s.$.ceiling);
      
      dto.addSample(time, depth, temp, Object.keys(metrics).length > 0 ? metrics : null);
    }
  }
  
  parseSubsurfaceGasMixes(cylinderData, dto) {
    if (!cylinderData) return;
    
    const cylinders = Array.isArray(cylinderData) ? cylinderData : [cylinderData];
    let slot = 0;
    
    for (const c of cylinders) {
      const o2 = parseFloat(c.$.o2) || 21;
      const he = parseFloat(c.$.he) || 0;
      
      dto.addGas(slot, o2, he, {
        name: c.$.description || `Tank ${slot + 1}`,
        tank_size_liters: parseFloat(c.$.size) || null,
        work_pressure_bar: this.parsePressure(c.$.workpressure),
        start_pressure_bar: this.parsePressure(c.$.start),
        end_pressure_bar: this.parsePressure(c.$.end),
      });
      slot++;
    }
  }
  
  parseSubsurfaceEvents(eventData, dto) {
    if (!eventData) return;
    
    const events = Array.isArray(eventData) ? eventData : [eventData];
    
    for (const e of events) {
      const time = this.parseDuration(e.$.time);
      if (time === null) continue;
      
      const eventType = this.mapSubsurfaceEvent(e.$.type || e.$.name);
      
      dto.addEvent(time, eventType, {
        event_subtype: e.$.name,
        event_value: e.$.value ? parseInt(e.$.value) : null,
        gas_slot: e.$.cylinder ? parseInt(e.$.cylinder) : null,
        payload: e.$.flags ? { flags: e.$.flags } : null,
      });
    }
  }
  
  parseSubsurfaceDecoModel(divecomputer, dto) {
    if (!divecomputer) return;
    
    const dc = Array.isArray(divecomputer) ? divecomputer[0] : divecomputer;
    
    if (dc.$.model) {
      if (dc.$.model.toLowerCase().includes('zhl')) {
        dto.settings.deco_model = DECO_MODELS.BUHLMANN_ZHL16C_GF;
      } else if (dc.$.model.toLowerCase().includes('vpm')) {
        dto.settings.deco_model = DECO_MODELS.VPM_B;
      } else if (dc.$.model.toLowerCase().includes('rgbm')) {
        dto.settings.deco_model = DECO_MODELS.RGBM;
      }
    }
    
    if (dc.$.gflow) dto.settings.gf_low = parseInt(dc.$.gflow);
    if (dc.$.gfhigh) dto.settings.gf_high = parseInt(dc.$.gfhigh);
    
    if (dc.$.dctype) {
      const modeMap = {
        'OC': DIVE_MODES.OC,
        'CCR': DIVE_MODES.CC,
        'pSCR': DIVE_MODES.SCR,
        'Freedive': DIVE_MODES.APNEA,
      };
      dto.header.dive_mode = modeMap[dc.$.dctype] || dc.$.dctype;
    }
  }
  
  parseSubsurfaceExtraData(extraData, dto) {
    if (!extraData) return;
    
    const extras = Array.isArray(extraData) ? extraData : [extraData];
    const unmapped = {};
    
    for (const e of extras) {
      if (e.$.key === 'GF') {
        const gfMatch = e.$.value.match(/(\d+)\/(\d+)/);
        if (gfMatch) {
          dto.settings.gf_low = parseInt(gfMatch[1]);
          dto.settings.gf_high = parseInt(gfMatch[2]);
        }
      } else if (e.$.key === 'Serial') {
        dto.device.serial = e.$.value;
      } else if (e.$.key === 'FW Version' || e.$.key === 'Firmware') {
        dto.settings.firmware_version = e.$.value;
      } else if (e.$.key === 'Battery') {
        dto.settings.battery_at_start = parseInt(e.$.value);
      } else {
        unmapped[e.$.key] = e.$.value;
      }
    }
    
    if (Object.keys(unmapped).length > 0) {
      dto.import_metadata.unmapped_fields = unmapped;
    }
  }
  
  mapSubsurfaceEvent(eventType) {
    const eventMap = {
      'gaschange': EVENT_TYPES.GAS_SWITCH,
      'heading': EVENT_TYPES.HEADING,
      'violation': EVENT_TYPES.ASCENT_VIOLATION,
      'ascent': EVENT_TYPES.ASCENT_VIOLATION,
      'ceiling': EVENT_TYPES.CEILING_VIOLATION,
      'deco': EVENT_TYPES.DECO_REQUIRED,
      'safetystop': EVENT_TYPES.SAFETY_STOP,
      'deepstop': EVENT_TYPES.DEEP_STOP,
      'decostop': EVENT_TYPES.DECO_STOP,
      'po2': EVENT_TYPES.PO2_HIGH,
      'bookmark': EVENT_TYPES.BOOKMARK,
      'setpoint': EVENT_TYPES.SETPOINT_CHANGE,
      'surface': EVENT_TYPES.SURFACE,
    };
    
    return eventMap[eventType?.toLowerCase()] || EVENT_TYPES.MANUAL_MARKER;
  }
}

class CSVAdapter extends BaseAdapter {
  async parse(content, filename) {
    return new Promise((resolve, reject) => {
      Papa.parse(content, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const dtos = this.normalizeCSVDives(results.data, filename, content);
            resolve(dtos);
          } catch (err) {
            reject(err);
          }
        },
        error: (err) => reject(err),
      });
    });
  }
  
  normalizeCSVDives(rows, filename, content) {
    const dtos = [];
    let currentDTO = null;
    
    for (const row of rows) {
      const time = this.findField(row, ['time', 'Time', 'TIME', 'elapsed', 'Elapsed', 'divetime', 'DiveTime', 'sample_time']);
      const depth = this.findField(row, ['depth', 'Depth', 'DEPTH', 'depth_m', 'Depth (m)', 'depth (m)']);
      const temp = this.findField(row, ['temp', 'Temp', 'temperature', 'Temperature', 'water_temp']);
      const date = this.findField(row, ['date', 'Date', 'DATE', 'dive_date', 'DiveDate']);
      
      if (date && currentDTO && currentDTO.samples.length > 0) {
        currentDTO.calculateStats();
        dtos.push(currentDTO);
        currentDTO = null;
      }
      
      if (date || !currentDTO) {
        currentDTO = this.createDTO();
        currentDTO.import_metadata.source_type = 'file';
        currentDTO.import_metadata.source_filename = filename;
        currentDTO.import_metadata.source_format = 'csv';
        currentDTO.import_metadata.raw_data_hash = this.hashContent(content);
        
        if (date) {
          currentDTO.header.dive_datetime = normalizeDateTime(date) || new Date().toISOString();
        } else {
          currentDTO.header.dive_datetime = new Date().toISOString();
        }
      }
      
      if (time !== undefined && depth !== undefined) {
        const metrics = {};
        
        const ndl = this.findField(row, ['ndl', 'NDL', 'no_deco_time']);
        if (ndl !== undefined) metrics.ndl_min = parseFloat(ndl);
        
        const tts = this.findField(row, ['tts', 'TTS', 'time_to_surface']);
        if (tts !== undefined) metrics.tts_min = parseFloat(tts);
        
        const ceiling = this.findField(row, ['ceiling', 'Ceiling', 'deco_ceiling']);
        if (ceiling !== undefined) metrics.ceiling_m = parseFloat(ceiling);
        
        const gf = this.findField(row, ['gf', 'GF', 'gf99', 'GF99']);
        if (gf !== undefined) metrics.gf99_pct = parseFloat(gf);
        
        const ppo2 = this.findField(row, ['ppo2', 'PPO2', 'po2', 'PO2']);
        if (ppo2 !== undefined) metrics.ppo2_bar = parseFloat(ppo2);
        
        const pressure = this.findField(row, ['pressure', 'tank_pressure', 'cylinder_pressure']);
        if (pressure !== undefined) {
          metrics.tank_pressure_bar = parseFloat(pressure);
          currentDTO.addTankPressure(0, this.parseTimeValue(time), parseFloat(pressure));
        }
        
        currentDTO.addSample(
          this.parseTimeValue(time),
          parseFloat(depth) || 0,
          temp ? parseFloat(temp) : null,
          Object.keys(metrics).length > 0 ? metrics : null
        );
      }
    }
    
    if (currentDTO && currentDTO.samples.length > 0) {
      currentDTO.calculateStats();
      dtos.push(currentDTO);
    }
    
    return dtos;
  }
  
  findField(row, possibleNames) {
    for (const name of possibleNames) {
      if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
        return row[name];
      }
    }
    return undefined;
  }
  
  parseTimeValue(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (value.includes(':')) {
        const parts = value.split(':').map(Number);
        if (parts.length === 3) {
          return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          return parts[0] * 60 + parts[1];
        }
      }
      const num = parseFloat(value.replace(/[^\d.]/g, ''));
      return isNaN(num) ? null : num;
    }
    return null;
  }
}

class SuuntoDM5Adapter extends BaseAdapter {
  suuntoVal(field) {
    if (field === null || field === undefined) return null;
    if (typeof field === 'object' && field.$?.['i:nil'] === 'true') return null;
    if (typeof field === 'string') return field;
    return null;
  }

  suuntoNum(field) {
    const val = this.suuntoVal(field);
    if (val === null) return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  }

  findSuuntoDiveRoot(result) {
    for (const key of Object.keys(result)) {
      const localName = key.split(':').pop();
      if (localName === 'Dive') {
        const node = result[key];
        if (node?.$) {
          const nsValues = Object.values(node.$).join(' ').toLowerCase();
          if (nsValues.includes('suunto')) return node;
        }
        if (node?.DiveSamples || node?.MaxDepth) return node;
      }
    }
    return null;
  }

  async parse(content, filename) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const result = await parser.parseStringPromise(content);
    const dive = this.findSuuntoDiveRoot(result);
    if (!dive) throw new Error('Invalid Suunto DM5 XML: no <Dive> root element');

    const dto = this.createDTO();

    const startTime = this.suuntoVal(dive.StartTime);
    dto.header.dive_datetime = startTime ? normalizeDateTime(startTime) : new Date().toISOString();
    dto.header.duration_seconds = this.suuntoNum(dive.Duration);
    dto.header.max_depth_meters = this.suuntoNum(dive.MaxDepth);
    dto.header.avg_depth_meters = this.suuntoNum(dive.AvgDepth);
    dto.header.notes = this.suuntoVal(dive.Note) || null;

    const bottomTime = this.suuntoNum(dive.BottomTime);
    if (bottomTime !== null) dto.header.bottom_time_seconds = bottomTime;

    const cnsEnd = this.suuntoNum(dive.CnsEnd);
    if (cnsEnd !== null) dto.header.cns_end = cnsEnd;

    const otuEnd = this.suuntoNum(dive.OtuEnd);
    if (otuEnd !== null) dto.header.otu_end = otuEnd;

    const bottomTemp = this.suuntoNum(dive.BottomTemperature);
    const startTemp = this.suuntoNum(dive.StartTemperature);
    const endTemp = this.suuntoNum(dive.EndTemperature);
    let minTemp = bottomTemp;
    let maxTemp = startTemp;

    this.parseSamples(dive, dto);

    if (maxTemp === null && dto.samples.length > 0) {
      maxTemp = dto.samples[0].temperature_celsius;
    }
    if (endTemp !== null && (maxTemp === null || endTemp > maxTemp)) maxTemp = endTemp;
    if (minTemp !== null && maxTemp !== null && minTemp > maxTemp) {
      [minTemp, maxTemp] = [maxTemp, minTemp];
    }
    dto.header.min_temperature_celsius = minTemp;
    dto.header.max_temperature_celsius = maxTemp;

    const surfacePressure = this.suuntoNum(dive.SurfacePressure);
    if (surfacePressure) dto.header.surface_pressure_mbar = surfacePressure;

    dto.device.manufacturer = 'Suunto';
    dto.device.model = this.suuntoVal(dive.Source) || null;
    dto.device.serial = this.suuntoVal(dive.SerialNumber) || null;

    const firmware = this.suuntoVal(dive.Software);
    if (firmware) dto.settings.firmware_version = firmware;

    const mode = this.suuntoNum(dive.Mode);
    if (mode !== null) {
      const modeMap = { 0: 'OC', 1: 'OC', 2: 'GAUGE', 3: 'APNEA', 4: 'CC', 5: 'CC' };
      dto.header.dive_mode = modeMap[mode] || null;
    }

    this.parseGases(dive, dto);
    this.parseMarks(dive, dto);

    dto.import_metadata.source_format = 'suunto_dm5';
    dto.import_metadata.source_filename = filename;
    dto.import_metadata.raw_data_hash = this.hashContent(content);

    return [dto];
  }

  parseSamples(dive, dto) {
    if (!dive.DiveSamples || !dive.DiveSamples['Dive.Sample']) return;

    const rawSamples = [].concat(dive.DiveSamples['Dive.Sample']);
    for (const s of rawSamples) {
      const time = this.suuntoNum(s.Time);
      if (time === null) continue;
      const depth = this.suuntoNum(s.Depth) || 0;
      const temp = this.suuntoNum(s.Temperature);

      const metrics = {};
      const ceiling = this.suuntoNum(s.Ceiling);
      if (ceiling !== null) metrics.ceiling_m = ceiling;
      const sacRate = this.suuntoNum(s.SacRate);
      if (sacRate !== null) metrics.sac_rate = sacRate;
      const heading = this.suuntoNum(s.Heading);
      if (heading !== null) metrics.heading_deg = heading;
      const pressure = this.suuntoNum(s.Pressure);
      if (pressure !== null) metrics.tank_pressure_bar = pressure / 1000;

      dto.addSample(time, depth, temp, Object.keys(metrics).length > 0 ? metrics : null);
    }
  }

  parseGases(dive, dto) {
    if (!dive.DiveMixtures || !dive.DiveMixtures.DiveMixture) return;

    const rawMixes = [].concat(dive.DiveMixtures.DiveMixture);
    const cylinderWorkPressure = this.suuntoNum(dive.CylinderWorkPressure);
    const workPressureBar = cylinderWorkPressure ? cylinderWorkPressure / 1000 : null;

    rawMixes.forEach((mix, index) => {
      const o2 = this.suuntoNum(mix.Oxygen) || 21;
      const he = this.suuntoNum(mix.Helium) || 0;
      const size = this.suuntoNum(mix.Size);
      const type = this.suuntoNum(mix.Type);
      const startP = this.suuntoNum(mix.StartPressure);
      const endP = this.suuntoNum(mix.EndPressure);

      let name;
      if (he > 0) {
        name = `Tx${o2}/${he}`;
      } else if (o2 === 21) {
        name = 'Air';
      } else if (o2 >= 99) {
        name = 'O2';
      } else {
        name = `Nx${o2}`;
      }

      const isDiluent = type === 3;
      const isBailout = type === 5;

      dto.addGas(index, o2, he, {
        name: name,
        is_diluent: isDiluent,
        is_bailout: isBailout,
        tank_size_liters: size ? Math.round(size * 10) / 10 : null,
        work_pressure_bar: workPressureBar,
        start_pressure_bar: startP && startP > 0 ? startP / 1000 : null,
        end_pressure_bar: endP && endP > 0 ? endP / 1000 : null,
      });

      if (mix.DiveGasChanges && mix.DiveGasChanges.DiveGasChange) {
        const changes = [].concat(mix.DiveGasChanges.DiveGasChange);
        for (const change of changes) {
          const changeTime = this.suuntoNum(change.GasChangeTime);
          if (changeTime !== null) {
            const po2 = this.suuntoNum(change.PO2);
            dto.addEvent(changeTime, EVENT_TYPES.GAS_SWITCH, {
              gas_slot: index,
              event_value: po2,
            });
          }
        }
      }
    });
  }

  parseMarks(dive, dto) {
    if (!dive.Marks || !dive.Marks.Mark) return;

    const marks = [].concat(dive.Marks.Mark);
    const markTypeMap = {
      19: EVENT_TYPES.SURFACE,
      257: EVENT_TYPES.BOOKMARK,
      261: EVENT_TYPES.DECO_STOP,
      262: EVENT_TYPES.DECO_STOP,
      265: EVENT_TYPES.SAFETY_STOP,
      270: EVENT_TYPES.SETPOINT_CHANGE,
    };

    for (const mark of marks) {
      const time = this.suuntoNum(mark.MarkTime);
      if (time === null) continue;
      const type = this.suuntoNum(mark.Type);
      const eventType = markTypeMap[type] || EVENT_TYPES.BOOKMARK;
      dto.addEvent(time, eventType, {
        event_value: type,
        event_subtype: `suunto_mark_${type}`,
      });
    }
  }
}

class BinaryAdapter extends BaseAdapter {
  async parse(content, filename) {
    throw new Error('Binary format parsing requires native libdivecomputer integration. Please use Subsurface or UDDF export from your dive computer software.');
  }
}

class DiveLogParserV2 {
  constructor() {
    this.adapters = {
      uddf: new UDDFAdapter(),
      subsurface: new SubsurfaceAdapter(),
      suunto_dm5: new SuuntoDM5Adapter(),
      csv: new CSVAdapter(),
      binary: new BinaryAdapter(),
    };
  }
  
  async parseFile(fileContent, filename, mimeType) {
    const format = FormatDetector.detect(fileContent, filename, mimeType);
    
    if (format === 'unknown' || format === 'unknown_xml') {
      throw new Error(`Unsupported file format. Supported formats: UDDF, Subsurface XML, CSV`);
    }
    
    const adapter = this.adapters[format];
    if (!adapter) {
      if (format === 'generic_xml') {
        return this.adapters.subsurface.parse(fileContent, filename);
      }
      throw new Error(`No adapter available for format: ${format}`);
    }
    
    const dtos = await adapter.parse(fileContent, filename);
    
    for (const dto of dtos) {
      const validation = dto.validate();
      if (!validation.valid) {
        console.warn(`Dive import validation warnings: ${validation.errors.join(', ')}`);
      }
    }
    
    return dtos;
  }
  
  async parseToLegacyFormat(fileContent, filename, mimeType) {
    const dtos = await this.parseFile(fileContent, filename, mimeType);
    
    return dtos.map(dto => ({
      dive_datetime: dto.header.dive_datetime,
      duration_seconds: dto.header.duration_seconds,
      max_depth_meters: dto.header.max_depth_meters,
      avg_depth_meters: dto.header.avg_depth_meters,
      min_temperature_celsius: dto.header.min_temperature_celsius,
      max_temperature_celsius: dto.header.max_temperature_celsius,
      samples: dto.samples.map(s => ({
        time_seconds: s.sample_time_seconds,
        depth_meters: s.depth_meters,
        temperature_celsius: s.temperature_celsius,
      })),
      gas_mixes: dto.gases.map(g => ({
        name: g.name,
        o2: g.o2_percent,
        he: g.he_percent,
        size: g.tank_size_liters,
        workpressure: g.work_pressure_bar,
      })),
      device_manufacturer: dto.device.manufacturer,
      device_model: dto.device.model,
      device_serial: dto.device.serial,
      notes: dto.header.notes,
      import_source: dto.import_metadata.source_format,
    }));
  }
}

module.exports = new DiveLogParserV2();
