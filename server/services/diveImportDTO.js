class DiveImportDTO {
  constructor() {
    this.header = {
      dive_datetime: null,
      duration_seconds: null,
      max_depth_meters: null,
      avg_depth_meters: null,
      min_temperature_celsius: null,
      max_temperature_celsius: null,
      dive_number: null,
      surface_interval_seconds: null,
      surface_pressure_mbar: null,
      dive_mode: null,
      surface_conditions: null,
      weather_conditions: null,
      workload: null,
      thermal_comfort: null,
      decompression_symptoms: false,
      problem_notes: null,
      notes: null,
      buddy: null,
      rating: null,
      dive_site_id: null,
    };
    
    this.device = {
      manufacturer: null,
      model: null,
      serial: null,
      dive_computer_id: null,
    };
    
    this.samples = [];
    
    this.gases = [];
    
    this.events = [];
    
    this.tank_pressures = [];
    
    this.settings = {
      deco_model: null,
      gf_low: null,
      gf_high: null,
      conservatism: null,
      salinity: null,
      altitude_mode: null,
      ppO2_max: null,
      ppO2_min: null,
      ppO2_deco: null,
      end_limit_meters: null,
      firmware_version: null,
      battery_at_start: null,
      battery_at_end: null,
      extra_settings: null,
    };
    
    this.import_metadata = {
      source_type: null,
      source_filename: null,
      source_format: null,
      parser_version: '2.0.0',
      raw_data_hash: null,
      unmapped_fields: null,
      import_notes: null,
    };
    
    this.skills_practiced = [];
    this.equipment_issues = [];
    this.gas_pressures = null;
  }
  
  static createSample(time_seconds, depth_meters, temperature_celsius = null, metrics = null) {
    return {
      sample_time_seconds: time_seconds,
      depth_meters: depth_meters,
      temperature_celsius: temperature_celsius,
      metrics: metrics || {},
    };
  }
  
  static createGas(slot, o2_percent, he_percent = 0, options = {}) {
    return {
      gas_slot: slot,
      name: options.name || null,
      o2_percent: o2_percent,
      he_percent: he_percent,
      n2_percent: 100 - o2_percent - he_percent,
      is_diluent: options.is_diluent || false,
      is_bailout: options.is_bailout || false,
      tank_size_liters: options.tank_size_liters || null,
      work_pressure_bar: options.work_pressure_bar || null,
      start_pressure_bar: options.start_pressure_bar || null,
      end_pressure_bar: options.end_pressure_bar || null,
      transmitter_serial: options.transmitter_serial || null,
    };
  }
  
  static createEvent(time_seconds, event_type, options = {}) {
    return {
      event_time_seconds: time_seconds,
      event_type: event_type,
      event_subtype: options.event_subtype || null,
      event_value: options.event_value || null,
      gas_slot: options.gas_slot || null,
      payload: options.payload || null,
    };
  }
  
  static createTankPressure(gas_slot, time_seconds, pressure_bar, transmitter_serial = null) {
    return {
      gas_slot: gas_slot,
      sample_time_seconds: time_seconds,
      pressure_bar: pressure_bar,
      transmitter_serial: transmitter_serial,
    };
  }
  
  addSample(time_seconds, depth_meters, temperature_celsius = null, metrics = null) {
    this.samples.push(DiveImportDTO.createSample(time_seconds, depth_meters, temperature_celsius, metrics));
    return this;
  }
  
  addGas(slot, o2_percent, he_percent = 0, options = {}) {
    this.gases.push(DiveImportDTO.createGas(slot, o2_percent, he_percent, options));
    return this;
  }
  
  addEvent(time_seconds, event_type, options = {}) {
    this.events.push(DiveImportDTO.createEvent(time_seconds, event_type, options));
    return this;
  }
  
  addTankPressure(gas_slot, time_seconds, pressure_bar, transmitter_serial = null) {
    this.tank_pressures.push(DiveImportDTO.createTankPressure(gas_slot, time_seconds, pressure_bar, transmitter_serial));
    return this;
  }
  
  calculateStats() {
    if (this.samples.length === 0) return;
    
    const depths = this.samples.map(s => s.depth_meters).filter(d => d !== null && d !== undefined);
    const temps = this.samples.map(s => s.temperature_celsius).filter(t => t !== null && t !== undefined);
    
    if (depths.length > 0) {
      this.header.max_depth_meters = Math.max(...depths);
      this.header.avg_depth_meters = depths.reduce((a, b) => a + b, 0) / depths.length;
    }
    
    if (temps.length > 0) {
      this.header.min_temperature_celsius = Math.min(...temps);
      this.header.max_temperature_celsius = Math.max(...temps);
    }
    
    if (this.samples.length > 0 && !this.header.duration_seconds) {
      this.header.duration_seconds = this.samples[this.samples.length - 1].sample_time_seconds;
    }
  }
  
  validate() {
    const errors = [];
    
    if (!this.header.dive_datetime) {
      errors.push('Dive datetime is required');
    }
    
    if (this.samples.length === 0) {
      errors.push('At least one sample is required');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
    };
  }
  
  toJSON() {
    return {
      header: this.header,
      device: this.device,
      samples: this.samples,
      gases: this.gases,
      events: this.events,
      tank_pressures: this.tank_pressures,
      settings: this.settings,
      import_metadata: this.import_metadata,
      skills_practiced: this.skills_practiced,
      equipment_issues: this.equipment_issues,
      gas_pressures: this.gas_pressures,
    };
  }
}

const CANONICAL_METRICS = {
  ndl_min: 'No Decompression Limit (minutes)',
  gf99_pct: 'Gradient Factor 99 (percentage)',
  ceiling_m: 'Decompression Ceiling (meters)',
  tts_min: 'Time To Surface (minutes)',
  ppo2_bar: 'Partial Pressure O2 (bar)',
  setpoint_bar: 'CCR Setpoint (bar)',
  cns_pct: 'CNS Oxygen Toxicity (percentage)',
  otu: 'Oxygen Toxicity Units',
  rbt_min: 'Remaining Bottom Time (minutes)',
  stop_depth_m: 'Deco Stop Depth (meters)',
  stop_time_min: 'Deco Stop Time (minutes)',
  ascent_rate_mpm: 'Ascent Rate (meters per minute)',
  descent_rate_mpm: 'Descent Rate (meters per minute)',
  heart_rate_bpm: 'Heart Rate (beats per minute)',
  tank_pressure_bar: 'Tank Pressure (bar)',
  sac_rate: 'Surface Air Consumption (liters per minute)',
  heading_deg: 'Compass Heading (degrees)',
  bearing_deg: 'Bearing (degrees)',
};

const EVENT_TYPES = {
  GAS_SWITCH: 'gas_switch',
  ASCENT_VIOLATION: 'ascent_violation',
  DECO_VIOLATION: 'deco_violation',
  CEILING_VIOLATION: 'ceiling_violation',
  SAFETY_STOP: 'safety_stop',
  DEEP_STOP: 'deep_stop',
  DECO_STOP: 'deco_stop',
  PO2_HIGH: 'po2_high',
  PO2_LOW: 'po2_low',
  BOOKMARK: 'bookmark',
  HEADING: 'heading',
  SETPOINT_CHANGE: 'setpoint_change',
  GASTIME_LOW: 'gastime_low',
  GAS_PRESSURE_LOW: 'gas_pressure_low',
  BATTERY_LOW: 'battery_low',
  SURFACE: 'surface',
  DIVETIME_ALERT: 'divetime_alert',
  DEPTH_ALERT: 'depth_alert',
  DECO_REQUIRED: 'deco_required',
  NDL_WARNING: 'ndl_warning',
  MANUAL_MARKER: 'manual_marker',
  TISSUE_LEVEL_WARNING: 'tissue_level_warning',
};

const DIVE_MODES = {
  OC: 'Open Circuit',
  CC: 'Closed Circuit',
  SCR: 'Semi-Closed Rebreather',
  GAUGE: 'Gauge',
  APNEA: 'Apnea/Freedive',
  SIDEMOUNT: 'Sidemount',
};

const DECO_MODELS = {
  BUHLMANN_ZHL16C: 'Bühlmann ZHL-16C',
  BUHLMANN_ZHL16C_GF: 'Bühlmann ZHL-16C with GF',
  VPM_B: 'VPM-B',
  VPM_B_GFS: 'VPM-B/GFS',
  RGBM: 'RGBM',
  DCIEM: 'DCIEM',
  US_NAVY: 'US Navy',
};

module.exports = {
  DiveImportDTO,
  CANONICAL_METRICS,
  EVENT_TYPES,
  DIVE_MODES,
  DECO_MODELS,
};
