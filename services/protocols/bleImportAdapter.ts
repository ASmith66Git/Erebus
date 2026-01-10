import { RawDiveData, RawSample, RawGasMix, RawEvent, DiveComputerInfo } from './baseProtocol';

export interface DiveImportDTO {
  header: {
    dive_number?: number;
    datetime: string;
    duration_seconds: number;
    max_depth_meters: number;
    avg_depth_meters?: number;
    min_temp_celsius?: number;
    max_temp_celsius?: number;
    surface_pressure_mbar?: number;
    dive_mode?: string;
    algorithm?: string;
    gf_low?: number;
    gf_high?: number;
    firmware_version?: string;
    serial_number?: string;
  };
  samples: {
    sample_time_seconds: number;
    metrics: Record<string, number | null>;
  }[];
  gases: {
    gas_index: number;
    o2_percent: number;
    he_percent: number;
    n2_percent: number;
    gas_name: string;
    tank_size_liters?: number;
    start_pressure_bar?: number;
  }[];
  events: {
    event_time_seconds: number;
    event_type: string;
    event_value?: number;
    event_flags?: number;
    gas_index?: number;
  }[];
  tank_pressures: {
    sample_time_seconds: number;
    tank_index: number;
    pressure_bar: number;
  }[];
  settings: Record<string, string | number | boolean>;
  import_metadata: {
    source_type: string;
    source_format: string;
    parser_version: string;
    import_datetime: string;
    original_filename?: string;
    raw_data_hash?: string;
    device_manufacturer?: string;
    device_model?: string;
    device_serial?: string;
    device_firmware?: string;
  };
}

export function convertBleToImportDTO(
  rawDive: RawDiveData,
  deviceInfo: DiveComputerInfo
): DiveImportDTO {
  const samples = rawDive.samples.map(sample => ({
    sample_time_seconds: sample.time,
    metrics: {
      depth_meters: sample.depth,
      temperature_celsius: sample.temperature ?? null,
      tank_pressure_bar: sample.pressure ?? null,
      ndl_minutes: sample.ndl ?? null,
      tts_minutes: sample.tts ?? null,
      ceiling_meters: sample.ceiling ?? null,
      gf99_percent: sample.gf99 ?? null,
      ppo2_bar: sample.ppo2 ?? null,
      cns_percent: sample.cns ?? null,
      heartrate_bpm: sample.heartrate ?? null,
    },
  }));

  const gases = rawDive.gases.map(gas => ({
    gas_index: gas.index,
    o2_percent: gas.o2,
    he_percent: gas.he,
    n2_percent: gas.n2,
    gas_name: gas.name,
    tank_size_liters: gas.tankSize,
    start_pressure_bar: gas.startPressure,
  }));

  const events = rawDive.events.map(event => ({
    event_time_seconds: event.time,
    event_type: event.type,
    event_value: event.value,
    event_flags: event.flags,
    gas_index: event.gasIndex,
  }));

  const tempSamples = rawDive.samples.filter(s => s.temperature !== undefined);
  const minTemp = tempSamples.length > 0
    ? tempSamples.reduce((min, s) => Math.min(min, s.temperature!), Infinity)
    : undefined;
  
  const maxTemp = tempSamples.length > 0
    ? tempSamples.reduce((max, s) => Math.max(max, s.temperature!), -Infinity)
    : undefined;

  const avgDepth = rawDive.samples.length > 0
    ? rawDive.samples.reduce((sum, s) => sum + s.depth, 0) / rawDive.samples.length
    : undefined;

  return {
    header: {
      dive_number: rawDive.diveNumber,
      datetime: rawDive.datetime.toISOString(),
      duration_seconds: rawDive.duration,
      max_depth_meters: rawDive.maxDepth,
      avg_depth_meters: avgDepth,
      min_temp_celsius: minTemp !== undefined && isFinite(minTemp) ? minTemp : undefined,
      max_temp_celsius: maxTemp !== undefined && isFinite(maxTemp) ? maxTemp : undefined,
      firmware_version: deviceInfo.firmware,
      serial_number: deviceInfo.serial,
    },
    samples,
    gases,
    events,
    tank_pressures: [],
    settings: {
      hardware: deviceInfo.hardware,
    },
    import_metadata: {
      source_type: 'bluetooth',
      source_format: `${deviceInfo.manufacturer.toLowerCase()}_ble`,
      parser_version: '1.0.0',
      import_datetime: new Date().toISOString(),
      device_manufacturer: deviceInfo.manufacturer,
      device_model: deviceInfo.model,
      device_serial: deviceInfo.serial,
      device_firmware: deviceInfo.firmware,
    },
  };
}

export function generateRawDataHash(data: Uint8Array): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export interface BleImportResult {
  success: boolean;
  dives: DiveImportDTO[];
  deviceInfo: DiveComputerInfo;
  errors: string[];
}

export async function processBleDownload(
  rawDives: RawDiveData[],
  deviceInfo: DiveComputerInfo
): Promise<BleImportResult> {
  const dives: DiveImportDTO[] = [];
  const errors: string[] = [];

  for (const rawDive of rawDives) {
    try {
      const dto = convertBleToImportDTO(rawDive, deviceInfo);
      
      if (rawDive.rawData) {
        dto.import_metadata.raw_data_hash = generateRawDataHash(rawDive.rawData);
      }
      
      dives.push(dto);
    } catch (error) {
      errors.push(`Failed to convert dive ${rawDive.diveNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return {
    success: errors.length === 0,
    dives,
    deviceInfo,
    errors,
  };
}
