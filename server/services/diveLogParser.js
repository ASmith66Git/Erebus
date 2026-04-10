const xml2js = require('xml2js');
const Papa = require('papaparse');

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

class DiveLogParser {
  async parseFile(fileContent, filename, mimeType) {
    const ext = filename.toLowerCase().split('.').pop();
    
    if (ext === 'xml' || ext === 'uddf' || mimeType === 'application/xml' || mimeType === 'text/xml') {
      return await this.parseXML(fileContent);
    } else if (ext === 'csv' || mimeType === 'text/csv') {
      return await this.parseCSV(fileContent);
    } else if (ext === 'ssrf') {
      return await this.parseSubsurface(fileContent);
    } else {
      throw new Error(`Unsupported file format: ${ext}. Supported formats: XML, UDDF, CSV, SSRF`);
    }
  }

  async parseXML(content) {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const result = await parser.parseStringPromise(content);
    
    if (result.uddf) {
      return this.parseUDDF(result.uddf);
    } else if (result.divelog) {
      return this.parseSubsurfaceXML(result.divelog);
    } else if (result.dives) {
      return this.parseGenericDivesXML(result.dives);
    } else {
      const suuntoDive = this.findSuuntoDiveRoot(result);
      if (suuntoDive) {
        return this.parseSuuntoDM5(suuntoDive);
      }
      throw new Error('Unknown XML format. Supported: UDDF, Subsurface, Suunto DM5');
    }
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

  parseUDDF(uddf) {
    const dives = [];
    const profileData = uddf.profiledata;
    
    if (!profileData || !profileData.repetitiongroup) {
      return dives;
    }

    const groups = Array.isArray(profileData.repetitiongroup) 
      ? profileData.repetitiongroup 
      : [profileData.repetitiongroup];

    for (const group of groups) {
      const diveEntries = Array.isArray(group.dive) ? group.dive : [group.dive];
      
      for (const dive of diveEntries) {
        if (!dive) continue;
        
        const samples = this.parseUDDFSamples(dive.samples);
        const { maxDepth, avgDepth, minTemp, maxTemp } = this.calculateDiveStats(samples);
        
        const parsedDuration = this.parseDuration(dive.$?.duration);
        const fallbackDuration = samples.length > 0 ? samples[samples.length - 1]?.time_seconds : null;
        
        dives.push({
          dive_datetime: this.extractUDDFDateTime(dive) || new Date().toISOString(),
          duration_seconds: parsedDuration ?? fallbackDuration,
          max_depth_meters: maxDepth,
          avg_depth_meters: avgDepth,
          min_temperature_celsius: minTemp,
          max_temperature_celsius: maxTemp,
          samples: samples,
          gas_mixes: this.parseUDDFGasMixes(uddf.gasdefinitions),
          device_manufacturer: uddf.generator?.manufacturer || null,
          device_model: uddf.generator?.name || null,
          device_serial: null,
          notes: dive.notes || null,
          import_source: 'uddf'
        });
      }
    }

    return dives;
  }

  parseUDDFSamples(samplesData) {
    if (!samplesData || !samplesData.waypoint) return [];
    
    const waypoints = Array.isArray(samplesData.waypoint) 
      ? samplesData.waypoint 
      : [samplesData.waypoint];

    return waypoints.map(wp => {
      const sample = {
        time_seconds: this.parseTime(wp.divetime),
        depth_meters: parseFloat(wp.depth) || 0,
        temperature_celsius: wp.temperature ? parseFloat(wp.temperature) - 273.15 : null,
      };
      
      if (wp.nodecotime) sample.ndl_seconds = parseInt(wp.nodecotime);
      if (wp.calculatedpo2) sample.ppo2_bar = parseFloat(wp.calculatedpo2);
      if (wp.batterychargecondition) sample.battery_voltage = parseFloat(wp.batterychargecondition);
      if (wp.cns) sample.cns_pct = parseFloat(wp.cns) * 100;
      if (wp.otu) sample.otu = parseFloat(wp.otu);
      if (wp.setpo2) sample.setpoint_bar = parseFloat(wp.setpo2);
      if (wp.tts) sample.tts_min = Math.round(parseInt(wp.tts) / 60);
      if (wp.ceiling) sample.ceiling_m = parseFloat(wp.ceiling);
      if (wp.decostop) {
        sample.stop_depth_m = parseFloat(wp.decostop.depth || wp.decostop.$.depth);
        sample.stop_time_min = parseInt(wp.decostop.duration || wp.decostop.$.duration) / 60;
      }
      if (wp.gradientfactor) sample.gf99_pct = parseFloat(wp.gradientfactor);
      
      return sample;
    }).filter(s => s.time_seconds !== null);
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

  parseUDDFGasMixes(gasDefs) {
    if (!gasDefs || !gasDefs.mix) return [];
    
    const mixes = Array.isArray(gasDefs.mix) ? gasDefs.mix : [gasDefs.mix];
    return mixes.map(mix => ({
      name: mix.$.name || 'Unknown',
      o2: parseFloat(mix.o2) * 100 || 21,
      he: parseFloat(mix.he) * 100 || 0
    }));
  }

  parseSubsurfaceXML(divelog) {
    const dives = [];
    
    if (!divelog.dives || !divelog.dives.dive) {
      return dives;
    }

    const diveEntries = Array.isArray(divelog.dives.dive) 
      ? divelog.dives.dive 
      : [divelog.dives.dive];

    for (const dive of diveEntries) {
      if (!dive) continue;
      
      const samples = this.parseSubsurfaceSamples(dive.sample);
      const { maxDepth, avgDepth, minTemp, maxTemp } = this.calculateDiveStats(samples);
      
      dives.push({
        dive_datetime: dive.$.date && dive.$.time 
          ? normalizeDateTime(dive.$.date, dive.$.time)
          : new Date().toISOString(),
        duration_seconds: this.parseDuration(dive.$.duration),
        max_depth_meters: maxDepth || this.parseDepth(dive.$.maxdepth),
        avg_depth_meters: avgDepth,
        min_temperature_celsius: minTemp || this.parseTemperature(dive.$.watertemp),
        max_temperature_celsius: maxTemp,
        samples: samples,
        gas_mixes: this.parseSubsurfaceGasMixes(dive.cylinder),
        device_manufacturer: divelog.divecomputers?.divecomputer?.$.model?.split(' ')[0] || null,
        device_model: divelog.divecomputers?.divecomputer?.$.model || null,
        device_serial: divelog.divecomputers?.divecomputer?.$.serial || null,
        notes: dive.notes?._ || dive.notes || null,
        import_source: 'subsurface'
      });
    }

    return dives;
  }

  parseSubsurfaceSamples(sampleData) {
    if (!sampleData) return [];
    
    const samples = Array.isArray(sampleData) ? sampleData : [sampleData];
    
    return samples.map(s => {
      const sample = {
        time_seconds: this.parseDuration(s.$.time),
        depth_meters: this.parseDepth(s.$.depth),
        temperature_celsius: this.parseTemperature(s.$.temp)
      };
      
      if (s.$.ndl) sample.ndl_min = this.parseDuration(s.$.ndl) / 60;
      if (s.$.tts) sample.tts_min = this.parseDuration(s.$.tts) / 60;
      if (s.$.stopdepth) sample.stop_depth_m = this.parseDepth(s.$.stopdepth);
      if (s.$.stoptime) sample.stop_time_min = this.parseDuration(s.$.stoptime) / 60;
      if (s.$.ceiling) sample.ceiling_m = this.parseDepth(s.$.ceiling);
      if (s.$.gfline) sample.gf99_pct = parseFloat(s.$.gfline);
      if (s.$.po2) sample.ppo2_bar = parseFloat(s.$.po2);
      if (s.$.pressure) sample.tank_pressure_bar = this.parsePressure(s.$.pressure);
      if (s.$.cns) sample.cns_pct = parseFloat(s.$.cns) * 100;
      
      return sample;
    }).filter(s => s.time_seconds !== null && s.depth_meters !== null);
  }
  
  parsePressure(pressureStr) {
    if (!pressureStr) return null;
    const match = pressureStr.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : null;
  }

  parseSubsurfaceGasMixes(cylinderData) {
    if (!cylinderData) return [];
    
    const cylinders = Array.isArray(cylinderData) ? cylinderData : [cylinderData];
    return cylinders.map(c => ({
      name: c.$.description || 'Unknown',
      o2: parseFloat(c.$.o2) || 21,
      he: parseFloat(c.$.he) || 0,
      size: parseFloat(c.$.size) || null,
      workpressure: parseFloat(c.$.workpressure) || null
    }));
  }

  async parseSubsurface(content) {
    return this.parseXML(content);
  }

  async parseCSV(content) {
    return new Promise((resolve, reject) => {
      Papa.parse(content, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const dives = this.normalizeCSVDives(results.data);
            resolve(dives);
          } catch (err) {
            reject(err);
          }
        },
        error: (err) => reject(err)
      });
    });
  }

  normalizeCSVDives(rows) {
    const dives = [];
    let currentDive = null;
    let samples = [];

    for (const row of rows) {
      const time = this.findField(row, ['time', 'Time', 'TIME', 'elapsed', 'Elapsed', 'divetime', 'DiveTime']);
      const depth = this.findField(row, ['depth', 'Depth', 'DEPTH', 'depth_m', 'Depth (m)', 'depth (m)']);
      const temp = this.findField(row, ['temp', 'Temp', 'temperature', 'Temperature', 'water_temp']);
      const date = this.findField(row, ['date', 'Date', 'DATE', 'dive_date', 'DiveDate']);

      if (date && currentDive && samples.length > 0) {
        currentDive.samples = samples;
        const stats = this.calculateDiveStats(samples);
        currentDive.max_depth_meters = stats.maxDepth;
        currentDive.avg_depth_meters = stats.avgDepth;
        currentDive.min_temperature_celsius = stats.minTemp;
        currentDive.max_temperature_celsius = stats.maxTemp;
        currentDive.duration_seconds = samples.length > 0 ? samples[samples.length - 1].time_seconds : null;
        dives.push(currentDive);
        samples = [];
      }

      if (date && !currentDive) {
        currentDive = {
          dive_datetime: normalizeDateTime(date) || new Date().toISOString(),
          duration_seconds: null,
          max_depth_meters: null,
          avg_depth_meters: null,
          min_temperature_celsius: null,
          max_temperature_celsius: null,
          samples: [],
          gas_mixes: [],
          device_manufacturer: null,
          device_model: null,
          device_serial: null,
          notes: null,
          import_source: 'csv'
        };
      }

      if (time !== undefined && depth !== undefined) {
        samples.push({
          time_seconds: this.parseTimeValue(time),
          depth_meters: parseFloat(depth) || 0,
          temperature_celsius: temp ? parseFloat(temp) : null
        });
      }
    }

    if (currentDive && samples.length > 0) {
      currentDive.samples = samples;
      const stats = this.calculateDiveStats(samples);
      currentDive.max_depth_meters = stats.maxDepth;
      currentDive.avg_depth_meters = stats.avgDepth;
      currentDive.min_temperature_celsius = stats.minTemp;
      currentDive.max_temperature_celsius = stats.maxTemp;
      currentDive.duration_seconds = samples.length > 0 ? samples[samples.length - 1].time_seconds : null;
      dives.push(currentDive);
    }

    if (dives.length === 0 && samples.length > 0) {
      dives.push({
        dive_datetime: new Date().toISOString(),
        duration_seconds: samples.length > 0 ? samples[samples.length - 1].time_seconds : null,
        max_depth_meters: Math.max(...samples.map(s => s.depth_meters)),
        avg_depth_meters: samples.reduce((a, s) => a + s.depth_meters, 0) / samples.length,
        min_temperature_celsius: samples.filter(s => s.temperature_celsius).length > 0 
          ? Math.min(...samples.filter(s => s.temperature_celsius).map(s => s.temperature_celsius)) : null,
        max_temperature_celsius: samples.filter(s => s.temperature_celsius).length > 0 
          ? Math.max(...samples.filter(s => s.temperature_celsius).map(s => s.temperature_celsius)) : null,
        samples: samples,
        gas_mixes: [],
        device_manufacturer: null,
        device_model: null,
        device_serial: null,
        notes: null,
        import_source: 'csv'
      });
    }

    return dives;
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
    const colonMatch = durationStr.match(/(\d+):(\d+)/);
    
    if (colonMatch) {
      return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
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

  calculateDiveStats(samples) {
    if (!samples || samples.length === 0) {
      return { maxDepth: null, avgDepth: null, minTemp: null, maxTemp: null };
    }

    const depths = samples.map(s => s.depth_meters).filter(d => d !== null && d !== undefined);
    const temps = samples.map(s => s.temperature_celsius).filter(t => t !== null && t !== undefined);

    return {
      maxDepth: depths.length > 0 ? Math.max(...depths) : null,
      avgDepth: depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : null,
      minTemp: temps.length > 0 ? Math.min(...temps) : null,
      maxTemp: temps.length > 0 ? Math.max(...temps) : null
    };
  }

  parseGenericDivesXML(divesData) {
    return [];
  }

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

  parseSuuntoDM5(dive) {
    const samples = this.parseSuuntoDM5Samples(dive.DiveSamples);
    const gasMixes = this.parseSuuntoDM5GasMixes(dive.DiveMixtures, dive);

    const maxDepth = this.suuntoNum(dive.MaxDepth);
    const avgDepth = this.suuntoNum(dive.AvgDepth);
    const duration = this.suuntoNum(dive.Duration);
    const bottomTemp = this.suuntoNum(dive.BottomTemperature);
    const startTemp = this.suuntoNum(dive.StartTemperature);
    const endTemp = this.suuntoNum(dive.EndTemperature);

    let minTemp = bottomTemp;
    let maxTemp = startTemp;
    if (maxTemp === null && samples.length > 0) {
      maxTemp = samples[0].temperature_celsius;
    }
    if (endTemp !== null && (maxTemp === null || endTemp > maxTemp)) maxTemp = endTemp;
    if (minTemp !== null && maxTemp !== null && minTemp > maxTemp) {
      [minTemp, maxTemp] = [maxTemp, minTemp];
    }

    const startTime = this.suuntoVal(dive.StartTime);
    const diveDateTime = startTime ? normalizeDateTime(startTime) : new Date().toISOString();

    const source = this.suuntoVal(dive.Source);
    const serial = this.suuntoVal(dive.SerialNumber);

    return [{
      dive_datetime: diveDateTime,
      duration_seconds: duration,
      max_depth_meters: maxDepth,
      avg_depth_meters: avgDepth,
      min_temperature_celsius: minTemp,
      max_temperature_celsius: maxTemp,
      samples: samples,
      gas_mixes: gasMixes,
      device_manufacturer: 'Suunto',
      device_model: source || null,
      device_serial: serial || null,
      notes: this.suuntoVal(dive.Note) || null,
      import_source: 'suunto_dm5'
    }];
  }

  parseSuuntoDM5Samples(diveSamples) {
    if (!diveSamples || !diveSamples['Dive.Sample']) return [];

    const rawSamples = [].concat(diveSamples['Dive.Sample']);
    return rawSamples.map(s => ({
      time_seconds: this.suuntoNum(s.Time),
      depth_meters: this.suuntoNum(s.Depth) || 0,
      temperature_celsius: this.suuntoNum(s.Temperature),
    })).filter(s => s.time_seconds !== null);
  }

  parseSuuntoDM5GasMixes(diveMixtures, dive) {
    if (!diveMixtures || !diveMixtures.DiveMixture) return [];

    const rawMixes = [].concat(diveMixtures.DiveMixture);
    const cylinderWorkPressure = this.suuntoNum(dive.CylinderWorkPressure);
    const workPressureBar = cylinderWorkPressure ? cylinderWorkPressure / 1000 : null;

    return rawMixes.map(mix => {
      const o2 = this.suuntoNum(mix.Oxygen) || 21;
      const he = this.suuntoNum(mix.Helium) || 0;
      const size = this.suuntoNum(mix.Size);

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

      return {
        name: name,
        o2: o2,
        he: he,
        size: size ? Math.round(size * 10) / 10 : null,
        workpressure: workPressureBar,
      };
    });
  }
}

module.exports = new DiveLogParser();
