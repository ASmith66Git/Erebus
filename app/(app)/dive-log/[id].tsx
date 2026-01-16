import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
  Platform,
  TextInput,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, Path, Line, Text as SvgText, Rect, G } from 'react-native-svg';
import { GestureResponderEvent, PanResponder } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/utils/apiConfig';

const TABS = ['Dive', 'Profile', 'Computer', 'Notes', 'Team'] as const;
type TabType = typeof TABS[number];

const EQUIPMENT_OPTIONS = [
  'None', 'First Stages', 'Second Stages', 'Gas Hoses', 'Wing', 'Harness',
  'Torches', 'Weights', 'SMBs', 'Reels', 'Suit Inflation', 'Suit Venting',
  'Fins', 'Masks', 'CCR O2', 'CCR Dil', 'CCR CO2', 'Dive Computer', 'Other'
];

const SKILLS_OPTIONS = [
  'Bailout', 'Gas switch', 'SMB launch', 'Mask clearing', 'Backward manoeuvring',
  'Buoyancy', 'Breathing', 'Gas Shut down', 'High PO2', 'Low PO2',
  'Manual PO2', 'Line laying with markers'
];

interface DiveLog {
  id: number;
  diveSiteId: number | null;
  diveSiteName: string | null;
  diveDateTime: string;
  durationSeconds: number | null;
  maxDepthMeters: number | null;
  avgDepthMeters: number | null;
  minTemperatureCelsius: number | null;
  maxTemperatureCelsius: number | null;
  deviceManufacturer: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  samples: Sample[] | null;
  gasMixes: GasMix[] | null;
  notes: string | null;
  rating: number | null;
  importSource: string;
  importFilename: string | null;
  diveNumber: number | null;
  surfaceIntervalSeconds: number | null;
  surfacePressureMbar: number | null;
  diveMode: string | null;
  surfaceConditions: string | null;
  weatherConditions: string | null;
  workload: string | null;
  thermalComfort: string | null;
  gasPressures: GasPressure[] | null;
  equipmentIssues: string[] | null;
  skillsPracticed: string[] | null;
  buddy: string | null;
  decompressionSymptoms: boolean | null;
  problemNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Sample {
  time_seconds: number;
  depth_meters: number;
  temperature_celsius: number | null;
  ndl_minutes?: number | null;
  ndl_min?: number | null;
  ndl_seconds?: number | null;
  gf99_percent?: number | null;
  gf99_pct?: number | null;
  ceiling_meters?: number | null;
  ceiling_m?: number | null;
  ppo2_bar?: number | null;
  cns_pct?: number | null;
  cns_percent?: number | null;
  otu?: number | null;
  battery_voltage?: number | null;
  tts_minutes?: number | null;
  tts_min?: number | null;
  tts_seconds?: number | null;
  stop_depth_m?: number | null;
  stop_time_min?: number | null;
  tank_pressure_bar?: number | null;
  setpoint_bar?: number | null;
  sac_lpm?: number | null;
  heartrate_bpm?: number | null;
}

interface GasMix {
  name?: string;
  o2?: number;
  he?: number;
}

interface GasPressure {
  tankId: string;
  label: string;
  startBar: number;
  endBar: number;
  o2Percent: number;
  hePercent?: number;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
}

function formatSurfaceInterval(seconds: number | null): string {
  if (!seconds) return '--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEndTime(startStr: string, durationSeconds: number | null): string {
  if (!durationSeconds) return '--';
  const start = new Date(startStr);
  const end = new Date(start.getTime() + durationSeconds * 1000);
  return end.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CircularGauge({ 
  startBar, 
  endBar, 
  o2Percent, 
  hePercent = 0, 
  label, 
  colors 
}: { 
  startBar: number; 
  endBar: number; 
  o2Percent: number; 
  hePercent?: number; 
  label: string; 
  colors: any;
}) {
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  
  const remainingPercent = startBar > 0 ? (endBar / startBar) * 100 : 100;
  const usedPercent = 100 - remainingPercent;
  const strokeDashoffset = circumference - (remainingPercent / 100) * circumference;
  
  const progressColor = remainingPercent > 50 ? '#4CAF50' : remainingPercent > 25 ? '#FFC107' : '#f44336';
  
  return (
    <View style={styles.gaugeContainer}>
      <Text style={[styles.gaugeLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.gaugeWrapper}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.border || '#333'}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={progressColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
          />
        </Svg>
        <View style={[styles.gaugeCenter, { position: 'absolute' }]}>
          <Text style={[styles.gaugeMix, { color: colors.text }]}>
            {Math.round(o2Percent)}/{hePercent || 0}
          </Text>
          <Text style={[styles.gaugeStart, { color: colors.textSecondary }]}>
            {startBar} bar
          </Text>
          <Text style={[styles.gaugeEnd, { color: colors.textSecondary }]}>
            {endBar} bar
          </Text>
        </View>
      </View>
      <Text style={[styles.gaugeUsed, { color: colors.textSecondary }]}>
        {Math.round(usedPercent)}% used
      </Text>
    </View>
  );
}

function DiveProfileChart({ samples, colors, showTemp, showNdl, showGf99, showPpo2, showCns }: { 
  samples: Sample[]; 
  colors: any;
  showTemp: boolean;
  showNdl: boolean;
  showGf99: boolean;
  showPpo2: boolean;
  showCns: boolean;
}) {
  const chartHeight = 200;
  const padding = 30;
  const screenWidth = Dimensions.get('window').width - 64;
  const chartWidth = Math.max(screenWidth, 300);
  const innerWidth = chartWidth - padding * 2;
  const innerHeight = chartHeight - padding * 2;
  
  const getDefaultScrubberX = () => padding + innerWidth / 2;
  const getDefaultSample = () => samples.length > 0 ? samples[Math.floor(samples.length / 2)] : null;
  
  const [scrubberX, setScrubberX] = useState<number>(getDefaultScrubberX());
  const [scrubberSample, setScrubberSample] = useState<Sample | null>(getDefaultSample());
  
  useEffect(() => {
    if (samples.length > 0 && !scrubberSample) {
      setScrubberX(getDefaultScrubberX());
      setScrubberSample(getDefaultSample());
    }
  }, [samples]);
  
  if (!samples || samples.length === 0) return null;
  
  const maxDepth = Math.max(...samples.map(s => s.depth_meters || 0)) || 1;
  const maxTime = samples[samples.length - 1]?.time_seconds || 1;
  
  const tempSamples = samples.filter(s => s.temperature_celsius != null);
  const ndlSamples = samples.filter(s => (s.ndl_minutes ?? s.ndl_min ?? (s.ndl_seconds != null ? s.ndl_seconds / 60 : null)) != null);
  const gf99Samples = samples.filter(s => (s.gf99_percent ?? s.gf99_pct) != null);
  const ppo2Samples = samples.filter(s => s.ppo2_bar != null);
  const ttsSamples = samples.filter(s => (s.tts_minutes ?? s.tts_min ?? (s.tts_seconds != null ? s.tts_seconds / 60 : null)) != null);
  const ceilingSamples = samples.filter(s => (s.ceiling_meters ?? s.ceiling_m) != null);
  const decoSamples = samples.filter(s => s.stop_depth_m != null && s.stop_time_min != null);
  const cnsSamples = samples.filter(s => (s.cns_pct ?? s.cns_percent) != null);
  
  const minTemp = tempSamples.length > 0 ? Math.min(...tempSamples.map(s => s.temperature_celsius!)) : 0;
  const maxTemp = tempSamples.length > 0 ? Math.max(...tempSamples.map(s => s.temperature_celsius!)) : 1;
  const tempRange = maxTemp - minTemp || 1;
  
  const getNdl = (s: Sample) => s.ndl_minutes ?? s.ndl_min ?? (s.ndl_seconds != null ? s.ndl_seconds / 60 : null);
  const getGf99 = (s: Sample) => s.gf99_percent ?? s.gf99_pct ?? null;
  const getTts = (s: Sample) => s.tts_minutes ?? s.tts_min ?? (s.tts_seconds != null ? s.tts_seconds / 60 : null);
  const getCeiling = (s: Sample) => s.ceiling_meters ?? s.ceiling_m ?? null;
  const getCns = (s: Sample) => {
    const val = s.cns_pct ?? s.cns_percent;
    return val != null ? val / 100 : null;
  };
  const maxNdl = ndlSamples.length > 0 ? Math.max(...ndlSamples.map(s => getNdl(s) || 0)) : 99;
  const maxGf99 = 100;
  const maxPpo2 = 1.6;
  const maxCns = Math.max(100, cnsSamples.length > 0 ? Math.max(...cnsSamples.map(s => (s.cns_pct ?? s.cns_percent ?? 0) / 100)) : 100);
  
  const findLastValueAtTime = <T,>(
    sparseList: Sample[],
    timeSeconds: number,
    getter: (s: Sample) => T | null | undefined
  ): T | null => {
    let lastVal: T | null = null;
    for (const s of sparseList) {
      if (s.time_seconds <= timeSeconds) {
        const v = getter(s);
        if (v != null) lastVal = v;
      } else {
        break;
      }
    }
    return lastVal;
  };
  
  const createPath = (points: {x: number, y: number}[]) => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };
  
  const depthPath = createPath(samples.map((s) => ({
    x: padding + (s.time_seconds / maxTime) * innerWidth,
    y: padding + (s.depth_meters / maxDepth) * innerHeight,
  })));

  const tempPath = showTemp && tempSamples.length > 0 ? createPath(tempSamples.map((s) => ({
    x: padding + (s.time_seconds / maxTime) * innerWidth,
    y: padding + innerHeight - ((s.temperature_celsius! - minTemp) / tempRange) * innerHeight,
  }))) : '';

  const ndlPath = showNdl && ndlSamples.length > 0 ? createPath(ndlSamples.map((s) => ({
    x: padding + (s.time_seconds / maxTime) * innerWidth,
    y: padding + innerHeight - (Math.min(getNdl(s) || 0, maxNdl) / maxNdl) * innerHeight,
  }))) : '';

  const gf99Path = showGf99 && gf99Samples.length > 0 ? createPath(gf99Samples.map((s) => ({
    x: padding + (s.time_seconds / maxTime) * innerWidth,
    y: padding + innerHeight - ((getGf99(s) || 0) / maxGf99) * innerHeight,
  }))) : '';

  const ppo2Path = showPpo2 && ppo2Samples.length > 0 ? createPath(ppo2Samples.map((s) => ({
    x: padding + (s.time_seconds / maxTime) * innerWidth,
    y: padding + innerHeight - (Math.min(s.ppo2_bar!, maxPpo2) / maxPpo2) * innerHeight,
  }))) : '';

  const cnsPath = showCns && cnsSamples.length > 0 ? createPath(cnsSamples.map((s) => ({
    x: padding + (s.time_seconds / maxTime) * innerWidth,
    y: padding + innerHeight - (Math.min(getCns(s) || 0, maxCns) / maxCns) * innerHeight,
  }))) : '';

  const isDraggingRef = useRef(false);
  
  const calculateScrubberPosition = (locationX: number) => {
    const clampedX = Math.max(padding, Math.min(locationX, chartWidth - padding));
    const timeAtX = ((clampedX - padding) / innerWidth) * maxTime;
    
    let closest = samples[0];
    let closestDist = Math.abs(samples[0].time_seconds - timeAtX);
    for (const s of samples) {
      const dist = Math.abs(s.time_seconds - timeAtX);
      if (dist < closestDist) {
        closest = s;
        closestDist = dist;
      }
    }
    
    setScrubberX(clampedX);
    setScrubberSample(closest);
  };

  const handleTouch = (event: GestureResponderEvent) => {
    const { locationX } = event.nativeEvent;
    calculateScrubberPosition(locationX);
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (Platform.OS !== 'web') return;
    event.preventDefault();
    isDraggingRef.current = true;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const locationX = event.clientX - rect.left;
    calculateScrubberPosition(locationX);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (Platform.OS !== 'web') return;
    if (!isDraggingRef.current && event.buttons !== 1) return;
    if (event.buttons === 1) {
      isDraggingRef.current = true;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const locationX = event.clientX - rect.left;
    calculateScrubberPosition(locationX);
  };

  const handleMouseUp = () => {
    if (Platform.OS !== 'web') return;
    handleTouchEnd();
  };

  const handleMouseLeave = () => {
    if (Platform.OS !== 'web') return;
    handleTouchEnd();
  };

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>0 min</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          {Math.round(maxTime / 60)} min
        </Text>
      </View>
      
      {scrubberSample && (() => {
        const t = scrubberSample.time_seconds;
        const tempVal = findLastValueAtTime(tempSamples, t, s => s.temperature_celsius);
        const ndlVal = findLastValueAtTime(ndlSamples, t, getNdl);
        const gf99Val = findLastValueAtTime(gf99Samples, t, getGf99);
        const ppo2Val = findLastValueAtTime(ppo2Samples, t, s => s.ppo2_bar);
        const ttsVal = findLastValueAtTime(ttsSamples, t, getTts);
        const ceilingVal = findLastValueAtTime(ceilingSamples, t, getCeiling);
        const cnsVal = findLastValueAtTime(cnsSamples, t, getCns);
        const decoSample = decoSamples.filter(s => s.time_seconds <= t).pop();
        
        return (
          <View style={{ 
            flexDirection: 'row', 
            flexWrap: 'wrap',
            gap: 8, 
            marginBottom: 8,
            padding: 8,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.primary,
          }}>
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>
              {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, '0')}
            </Text>
            <Text style={{ fontSize: 12, color: '#2196F3' }}>
              Depth: {scrubberSample.depth_meters.toFixed(1)}m
            </Text>
            {tempVal != null && showTemp && (
              <Text style={{ fontSize: 12, color: '#4CAF50' }}>
                Temp: {tempVal.toFixed(1)}°C
              </Text>
            )}
            {ndlVal != null && showNdl && (
              <Text style={{ fontSize: 12, color: '#FFC107' }}>
                NDL: {Math.round(ndlVal)} min
              </Text>
            )}
            {gf99Val != null && showGf99 && (
              <Text style={{ fontSize: 12, color: '#9C27B0' }}>
                GF99: {Math.round(gf99Val)}%
              </Text>
            )}
            {ppo2Val != null && showPpo2 && (
              <Text style={{ fontSize: 12, color: '#FF5722' }}>
                PPO2: {ppo2Val.toFixed(2)} bar
              </Text>
            )}
            {ttsVal != null && (
              <Text style={{ fontSize: 12, color: '#00BCD4' }}>
                TTS: {Math.round(ttsVal)} min
              </Text>
            )}
            {ceilingVal != null && ceilingVal > 0 && (
              <Text style={{ fontSize: 12, color: '#E91E63' }}>
                Ceiling: {ceilingVal.toFixed(1)}m
              </Text>
            )}
            {cnsVal != null && showCns && (
              <Text style={{ fontSize: 12, color: '#795548' }}>
                CNS: {Math.round(cnsVal)}%
              </Text>
            )}
            {decoSample && decoSample.stop_depth_m != null && decoSample.stop_time_min != null && (
              <Text style={{ fontSize: 12, color: '#E91E63' }}>
                Deco: {decoSample.stop_depth_m}m @ {decoSample.stop_time_min}min
              </Text>
            )}
          </View>
        );
      })()}
      
      <View 
        style={{ 
          height: chartHeight, 
          backgroundColor: colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          cursor: Platform.OS === 'web' ? 'crosshair' : undefined,
        } as any}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
        {...(Platform.OS === 'web' ? {
          onMouseDown: handleMouseDown,
          onMouseMove: handleMouseMove,
          onMouseUp: handleMouseUp,
          onMouseLeave: handleMouseLeave,
        } : {})}
      >
        <Svg width={chartWidth} height={chartHeight}>
          {[0.25, 0.5, 0.75].map((ratio, i) => (
            <Line
              key={`grid-${i}`}
              x1={padding}
              y1={padding + ratio * innerHeight}
              x2={chartWidth - padding}
              y2={padding + ratio * innerHeight}
              stroke={colors.border || '#333'}
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          ))}
          <Path
            d={depthPath}
            stroke="#2196F3"
            strokeWidth={2}
            fill="none"
          />
          {tempPath && (
            <Path
              d={tempPath}
              stroke="#4CAF50"
              strokeWidth={2}
              fill="none"
            />
          )}
          {ndlPath && (
            <Path
              d={ndlPath}
              stroke="#FFC107"
              strokeWidth={2}
              fill="none"
            />
          )}
          {gf99Path && (
            <Path
              d={gf99Path}
              stroke="#9C27B0"
              strokeWidth={2}
              fill="none"
            />
          )}
          {ppo2Path && (
            <Path
              d={ppo2Path}
              stroke="#FF5722"
              strokeWidth={2}
              fill="none"
            />
          )}
          {cnsPath && (
            <Path
              d={cnsPath}
              stroke="#795548"
              strokeWidth={2}
              fill="none"
            />
          )}
          {scrubberX != null && (
            <Line
              x1={scrubberX}
              y1={padding}
              x2={scrubberX}
              y2={padding + innerHeight}
              stroke={colors.primary}
              strokeWidth={1.5}
              strokeDasharray="3,3"
            />
          )}
          <SvgText
            x={padding - 5}
            y={padding + 5}
            fontSize={10}
            fill={colors.textSecondary || '#666'}
            textAnchor="end"
          >
            0m
          </SvgText>
          <SvgText
            x={padding - 5}
            y={padding + innerHeight}
            fontSize={10}
            fill={colors.textSecondary || '#666'}
            textAnchor="end"
          >
            {maxDepth.toFixed(0)}m
          </SvgText>
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 12, height: 3, backgroundColor: '#2196F3', borderRadius: 1 }} />
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>Depth (m)</Text>
        </View>
        {showTemp && tempSamples.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 3, backgroundColor: '#4CAF50', borderRadius: 1 }} />
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>Temp (C)</Text>
          </View>
        )}
        {showNdl && ndlSamples.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 3, backgroundColor: '#FFC107', borderRadius: 1 }} />
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>NDL (min)</Text>
          </View>
        )}
        {showGf99 && gf99Samples.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 3, backgroundColor: '#9C27B0', borderRadius: 1 }} />
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>GF99 (%)</Text>
          </View>
        )}
        {showPpo2 && ppo2Samples.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 3, backgroundColor: '#FF5722', borderRadius: 1 }} />
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>PPO2 (bar)</Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 10, color: colors.textSecondary, textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
        Drag scrubber to see values at any point
      </Text>
    </View>
  );
}

function DiveTab({ diveLog, colors }: { diveLog: DiveLog; colors: any }) {
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.fieldRow}>
          <Feather name="map-pin" size={16} color={colors.textSecondary} />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Dive Site</Text>
        </View>
        <View style={[styles.fieldValue, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.fieldValueText, { color: colors.text }]}>
            {diveLog.diveSiteName || 'Not specified'}
          </Text>
          {diveLog.diveSiteName && <Feather name="external-link" size={16} color={colors.textSecondary} />}
        </View>
      </View>

      <View style={styles.rowCards}>
        <View style={[styles.halfCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.fieldRow}>
            <Feather name="wind" size={16} color={colors.textSecondary} />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Surface Conditions</Text>
          </View>
          <Text style={[styles.cardValue, { color: colors.text }]}>
            {diveLog.surfaceConditions || 'Not set'}
          </Text>
        </View>
        <View style={[styles.halfCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.fieldRow}>
            <Feather name="sun" size={16} color={colors.textSecondary} />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Dive Weather</Text>
          </View>
          <Text style={[styles.cardValue, { color: colors.text }]}>
            {diveLog.weatherConditions || 'Not set'}
          </Text>
        </View>
      </View>

      <View style={styles.rowCards}>
        <View style={[styles.halfCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.fieldRow}>
            <Feather name="arrow-down" size={16} color={colors.textSecondary} />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Max Depth</Text>
          </View>
          <Text style={[styles.cardValue, { color: colors.text }]}>
            {diveLog.maxDepthMeters ? `${diveLog.maxDepthMeters.toFixed(0)}m` : '--'}
          </Text>
        </View>
        <View style={[styles.halfCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.fieldRow}>
            <Feather name="clock" size={16} color={colors.textSecondary} />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Duration</Text>
          </View>
          <Text style={[styles.cardValue, { color: colors.text }]}>
            {formatDuration(diveLog.durationSeconds)}
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.fieldRow}>
          <Feather name="thermometer" size={16} color={colors.textSecondary} />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Temperature</Text>
        </View>
        <Text style={[styles.cardValue, { color: colors.text }]}>
          {diveLog.minTemperatureCelsius ? `${diveLog.minTemperatureCelsius.toFixed(0)}°C` : '--'}
        </Text>
      </View>

      {diveLog.gasPressures && diveLog.gasPressures.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.fieldRow}>
            <Feather name="circle" size={16} color={colors.textSecondary} />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Gas Pressures (bar)</Text>
          </View>
          <View style={styles.gaugesRow}>
            {diveLog.gasPressures.map((gas, index) => (
              <CircularGauge
                key={index}
                label={gas.label}
                startBar={gas.startBar}
                endBar={gas.endBar}
                o2Percent={gas.o2Percent}
                hePercent={gas.hePercent}
                colors={colors}
              />
            ))}
          </View>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.fieldRow}>
          <Feather name="alert-triangle" size={16} color={colors.textSecondary} />
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Dive Problems</Text>
        </View>
        
        <Text style={[styles.subLabel, { color: colors.textSecondary }]}>Thermal Comfort</Text>
        <View style={[styles.fieldValue, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.fieldValueText, { color: colors.text }]}>
            {diveLog.thermalComfort || 'Neutral'}
          </Text>
        </View>

        <Text style={[styles.subLabel, { color: colors.textSecondary, marginTop: 12 }]}>Workload</Text>
        <View style={[styles.fieldValue, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.fieldValueText, { color: colors.text }]}>
            {diveLog.workload || 'Moderate'}
          </Text>
        </View>

        <Text style={[styles.subLabel, { color: colors.textSecondary, marginTop: 12 }]}>Equipment Malfunction</Text>
        <View style={styles.checkboxGrid}>
          {EQUIPMENT_OPTIONS.map((option) => {
            const isChecked = diveLog.equipmentIssues?.includes(option) || (option === 'None' && (!diveLog.equipmentIssues || diveLog.equipmentIssues.length === 0));
            return (
              <View key={option} style={styles.checkboxItem}>
                <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: isChecked ? colors.primary + '20' : 'transparent' }]}>
                  {isChecked && <Feather name="check" size={12} color={colors.primary} />}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.text }]}>{option}</Text>
              </View>
            );
          })}
        </View>

        <Text style={[styles.subLabel, { color: colors.textSecondary, marginTop: 16 }]}>Decompression Symptoms</Text>
        <View style={styles.radioRow}>
          <View style={styles.radioItem}>
            <View style={[styles.radio, { borderColor: colors.border, backgroundColor: !diveLog.decompressionSymptoms ? colors.primary : 'transparent' }]} />
            <Text style={[styles.radioLabel, { color: colors.text }]}>No</Text>
          </View>
          <View style={styles.radioItem}>
            <View style={[styles.radio, { borderColor: colors.border, backgroundColor: diveLog.decompressionSymptoms ? colors.primary : 'transparent' }]} />
            <Text style={[styles.radioLabel, { color: colors.text }]}>Yes</Text>
          </View>
        </View>

        <Text style={[styles.subLabel, { color: colors.textSecondary, marginTop: 16 }]}>Problem Notes</Text>
        <View style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.textAreaText, { color: diveLog.problemNotes ? colors.text : colors.textSecondary }]}>
            {diveLog.problemNotes || 'Describe any problems encountered during the dive...'}
          </Text>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ProfileTab({ diveLog, colors }: { diveLog: DiveLog; colors: any }) {
  const [showTemp, setShowTemp] = useState(true);
  const [showNdl, setShowNdl] = useState(true);
  const [showGf99, setShowGf99] = useState(true);
  const [showPpo2, setShowPpo2] = useState(true);
  const [showCns, setShowCns] = useState(true);

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Profile</Text>
        
        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggleButton, showTemp && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
            onPress={() => setShowTemp(!showTemp)}
          >
            <Text style={[styles.toggleText, { color: showTemp ? colors.primary : colors.textSecondary }]}>Temp</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, showNdl && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
            onPress={() => setShowNdl(!showNdl)}
          >
            <Text style={[styles.toggleText, { color: showNdl ? colors.primary : colors.textSecondary }]}>NDL</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, showGf99 && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
            onPress={() => setShowGf99(!showGf99)}
          >
            <Text style={[styles.toggleText, { color: showGf99 ? colors.primary : colors.textSecondary }]}>GF99</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, showPpo2 && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
            onPress={() => setShowPpo2(!showPpo2)}
          >
            <Text style={[styles.toggleText, { color: showPpo2 ? colors.primary : colors.textSecondary }]}>PPO2</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, showCns && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
            onPress={() => setShowCns(!showCns)}
          >
            <Text style={[styles.toggleText, { color: showCns ? colors.primary : colors.textSecondary }]}>CNS</Text>
          </Pressable>
        </View>

        {diveLog.samples && diveLog.samples.length > 0 ? (
          <DiveProfileChart 
            samples={diveLog.samples} 
            colors={colors} 
            showTemp={showTemp}
            showNdl={showNdl}
            showGf99={showGf99}
            showPpo2={showPpo2}
            showCns={showCns}
          />
        ) : (
          <View style={styles.noDataContainer}>
            <Feather name="activity" size={48} color={colors.textSecondary} />
            <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
              No dive profile data available
            </Text>
          </View>
        )}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ComputerTab({ diveLog, colors }: { diveLog: DiveLog; colors: any }) {
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.fieldRow}>
          <Feather name="cpu" size={16} color={colors.textSecondary} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Computer</Text>
        </View>
        <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Model: <Text style={{ color: colors.text }}>{diveLog.deviceModel || 'Unknown'}</Text></Text>
        <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Serial: <Text style={{ color: colors.text }}>{diveLog.deviceSerial || 'Unknown'}</Text></Text>
        <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Manufacturer: <Text style={{ color: colors.text }}>{diveLog.deviceManufacturer || 'Unknown'}</Text></Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Metadata</Text>
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}># Dive Number</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>#{diveLog.diveNumber || '--'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Surface Interval</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{formatSurfaceInterval(diveLog.surfaceIntervalSeconds)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Surface Pressure</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{diveLog.surfacePressureMbar ? `${diveLog.surfacePressureMbar} mbar` : '--'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Dive Mode</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{diveLog.diveMode || 'Open Circuit'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Start Time</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{formatTime(diveLog.diveDateTime)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>End Time</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{formatEndTime(diveLog.diveDateTime, diveLog.durationSeconds)}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Gas Mixes</Text>
        {diveLog.gasMixes && diveLog.gasMixes.length > 0 ? (
          <View style={styles.gasMixGrid}>
            {diveLog.gasMixes.map((mix, index) => (
              <View key={index} style={[styles.gasMixCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.gasMixName, { color: colors.text }]}>{mix.name || `Mix ${index + 1}`}</Text>
                <Text style={[styles.gasMixInfo, { color: colors.textSecondary }]}>
                  O₂: {mix.o2?.toFixed(0) || 21}%{mix.he ? ` He: ${mix.he.toFixed(0)}%` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.noDataText, { color: colors.textSecondary }]}>No gas mix data available</Text>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function NotesTab({ diveLog, colors }: { diveLog: DiveLog; colors: any }) {
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.fieldRow}>
          <Feather name="file-text" size={16} color={colors.textSecondary} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Notes</Text>
        </View>
        <View style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, minHeight: 120 }]}>
          <Text style={[styles.textAreaText, { color: diveLog.notes ? colors.text : colors.textSecondary }]}>
            {diveLog.notes || 'Add your dive notes here...'}
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.fieldRow}>
          <Feather name="award" size={16} color={colors.textSecondary} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Skills Practised</Text>
        </View>
        <View style={styles.checkboxGrid}>
          {SKILLS_OPTIONS.map((skill) => {
            const isChecked = diveLog.skillsPracticed?.includes(skill);
            return (
              <View key={skill} style={styles.checkboxItem}>
                <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: isChecked ? colors.primary + '20' : 'transparent' }]}>
                  {isChecked && <Feather name="check" size={12} color={colors.primary} />}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.text }]}>{skill}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

interface Buddy {
  id: number;
  name: string;
  photo_url: string | null;
  notes: string | null;
  linked_user_id: number | null;
}

function TeamTab({ diveLog, colors, token, onRefresh }: { diveLog: DiveLog; colors: any; token: string | null; onRefresh: () => void }) {
  const [linkedBuddies, setLinkedBuddies] = useState<Buddy[]>([]);
  const [allBuddies, setAllBuddies] = useState<Buddy[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchBuddies = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [linkedRes, allRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/dive-logs/${diveLog.id}/buddies`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/dive-buddies`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (linkedRes.ok) {
        setLinkedBuddies(await linkedRes.json());
      }
      if (allRes.ok) {
        setAllBuddies(await allRes.json());
      }
    } catch (error) {
      console.error('Fetch buddies error:', error);
    } finally {
      setLoading(false);
    }
  }, [token, diveLog.id]);

  useEffect(() => {
    fetchBuddies();
  }, [fetchBuddies]);

  const addBuddy = async (buddyId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/dive-logs/${diveLog.id}/buddies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ buddy_id: buddyId }),
      });
      if (res.ok) {
        fetchBuddies();
        setShowAddModal(false);
      }
    } catch (error) {
      console.error('Add buddy error:', error);
    }
  };

  const removeBuddy = async (buddyId: number) => {
    if (!token) return;
    const doRemove = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/dive-logs/${diveLog.id}/buddies/${buddyId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          fetchBuddies();
        }
      } catch (error) {
        console.error('Remove buddy error:', error);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Remove this buddy from the dive?')) {
        doRemove();
      }
    } else {
      Alert.alert('Remove Buddy', 'Remove this buddy from the dive?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  const availableBuddies = allBuddies.filter(b => !linkedBuddies.some(lb => lb.id === b.id));

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.fieldRow, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="users" size={16} color={colors.textSecondary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Dive Buddies</Text>
          </View>
          <Pressable
            onPress={() => setShowAddModal(true)}
            style={[styles.addBuddyBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBuddyBtnText}>Add</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
        ) : linkedBuddies.length === 0 ? (
          <View style={[styles.emptyBuddies, { borderColor: colors.border }]}>
            <Feather name="user-plus" size={32} color={colors.textSecondary} />
            <Text style={[styles.emptyBuddiesText, { color: colors.textSecondary }]}>
              No buddies linked to this dive
            </Text>
            <Text style={[styles.emptyBuddiesSubtext, { color: colors.textSecondary }]}>
              Tap "Add" to link dive buddies
            </Text>
          </View>
        ) : (
          <View style={styles.buddyList}>
            {linkedBuddies.map(buddy => (
              <View key={buddy.id} style={[styles.buddyCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={[styles.buddyAvatar, { backgroundColor: colors.primary + '20' }]}>
                  {buddy.photo_url ? (
                    <View style={styles.buddyPhotoContainer}>
                      <View style={[styles.buddyPhoto, { backgroundColor: colors.primary + '20' }]}>
                        <Feather name="user" size={20} color={colors.primary} />
                      </View>
                    </View>
                  ) : (
                    <Feather name="user" size={20} color={colors.primary} />
                  )}
                </View>
                <View style={styles.buddyInfo}>
                  <Text style={[styles.buddyName, { color: colors.text }]}>{buddy.name}</Text>
                  {buddy.linked_user_id && (
                    <Text style={[styles.buddyConnected, { color: colors.primary }]}>Erebus User</Text>
                  )}
                </View>
                <Pressable onPress={() => removeBuddy(buddy.id)} hitSlop={10}>
                  <Feather name="x-circle" size={20} color={colors.error} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {diveLog.buddy && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.fieldRow}>
            <Feather name="edit-3" size={16} color={colors.textSecondary} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Notes (from import)</Text>
          </View>
          <View style={[styles.textArea, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.textAreaText, { color: colors.text }]}>{diveLog.buddy}</Text>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />

      {showAddModal && (
        <View style={styles.buddyModalOverlay}>
          <View style={[styles.buddyModalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.buddyModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.buddyModalTitle, { color: colors.text }]}>Add Buddy to Dive</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.buddyModalList}>
              {availableBuddies.length === 0 ? (
                <View style={styles.noBuddiesAvailable}>
                  <Feather name="users" size={32} color={colors.textSecondary} />
                  <Text style={[styles.noBuddiesText, { color: colors.textSecondary }]}>
                    {allBuddies.length === 0 ? 'No buddies in your list yet' : 'All buddies already added'}
                  </Text>
                </View>
              ) : (
                availableBuddies.map(buddy => (
                  <Pressable
                    key={buddy.id}
                    style={[styles.buddySelectItem, { borderBottomColor: colors.border }]}
                    onPress={() => addBuddy(buddy.id)}
                  >
                    <View style={[styles.buddyAvatar, { backgroundColor: colors.primary + '20' }]}>
                      <Feather name="user" size={18} color={colors.primary} />
                    </View>
                    <Text style={[styles.buddySelectName, { color: colors.text }]}>{buddy.name}</Text>
                    <Feather name="plus-circle" size={22} color={colors.primary} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

export default function DiveLogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useAuth();
  const [diveLog, setDiveLog] = useState<DiveLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('Dive');

  const fetchDiveLog = useCallback(async () => {
    if (!id || !token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${getApiUrl()}/api/dive-logs/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch dive log');
      }
      
      const data = await response.json();
      setDiveLog(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    fetchDiveLog();
  }, [fetchDiveLog]);

  const handleDelete = () => {
    const confirmDelete = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/dive-logs/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          router.back();
        } else {
          const errorMessage = 'Failed to delete dive log';
          if (Platform.OS === 'web') {
            alert(errorMessage);
          } else {
            Alert.alert('Error', errorMessage);
          }
        }
      } catch (err) {
        const errorMessage = 'An error occurred while deleting';
        if (Platform.OS === 'web') {
          alert(errorMessage);
        } else {
          Alert.alert('Error', errorMessage);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to delete this dive log?')) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        'Delete Dive Log',
        'Are you sure you want to delete this dive log?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete },
        ]
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !diveLog) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Dive Details</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={[styles.centered, { flex: 1 }]}>
          <Feather name="alert-circle" size={48} color={colors.textSecondary} />
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            {error || 'Dive log not found'}
          </Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={fetchDiveLog}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Dive':
        return <DiveTab diveLog={diveLog} colors={colors} />;
      case 'Profile':
        return <ProfileTab diveLog={diveLog} colors={colors} />;
      case 'Computer':
        return <ComputerTab diveLog={diveLog} colors={colors} />;
      case 'Notes':
        return <NotesTab diveLog={diveLog} colors={colors} />;
      case 'Team':
        return <TeamTab diveLog={diveLog} colors={colors} token={token} onRefresh={fetchDiveLog} />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Dive Details</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerButton} onPress={() => router.push(`/dive-log/${id}/edit`)}>
            <Feather name="edit-2" size={18} color={colors.text} />
          </Pressable>
          <Pressable style={styles.headerButton} onPress={handleDelete}>
            <Feather name="trash-2" size={18} color={colors.error || '#D22F00'} />
          </Pressable>
        </View>
      </View>

      <View style={styles.diveHeader}>
        <Text style={[styles.diveTitle, { color: colors.text }]}>
          Dive #{diveLog.diveNumber || diveLog.id}
        </Text>
        <View style={styles.dateRow}>
          <Feather name="calendar" size={14} color={colors.textSecondary} />
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {formatDate(diveLog.diveDateTime)} • {formatTime(diveLog.diveDateTime)}
          </Text>
        </View>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.tabItem,
              activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? colors.primary : colors.textSecondary },
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {renderTabContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 72,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  diveHeader: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  diveTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  dateText: {
    fontSize: 14,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  rowCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  halfCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
  },
  fieldValue: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldValueText: {
    fontSize: 15,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  subLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  textArea: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  textAreaText: {
    fontSize: 14,
    lineHeight: 20,
  },
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '50%',
    paddingVertical: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 13,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 24,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  radioLabel: {
    fontSize: 14,
  },
  gaugesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  gaugeContainer: {
    alignItems: 'center',
    padding: 8,
  },
  gaugeLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  gaugeWrapper: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gaugeSvgContainer: {
    position: 'absolute',
    width: 100,
    height: 100,
  },
  gaugeBackground: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 8,
    left: 5,
    top: 5,
  },
  gaugeProgress: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 8,
    left: 5,
    top: 5,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  gaugeCenter: {
    alignItems: 'center',
  },
  gaugeMix: {
    fontSize: 16,
    fontWeight: '700',
  },
  gaugeStart: {
    fontSize: 11,
  },
  gaugeEnd: {
    fontSize: 11,
  },
  gaugeUsed: {
    fontSize: 11,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '500',
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 14,
    marginTop: 12,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaItem: {
    width: '50%',
    paddingVertical: 8,
  },
  metaLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  gasMixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gasMixCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    minWidth: '45%',
  },
  gasMixName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  gasMixInfo: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  addBuddyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addBuddyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBuddies: {
    alignItems: 'center',
    paddingVertical: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyBuddiesText: {
    fontSize: 15,
    marginTop: 12,
  },
  emptyBuddiesSubtext: {
    fontSize: 13,
    marginTop: 4,
  },
  buddyList: {
    gap: 8,
  },
  buddyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  buddyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buddyPhotoContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  buddyPhoto: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buddyInfo: {
    flex: 1,
  },
  buddyName: {
    fontSize: 15,
    fontWeight: '600',
  },
  buddyConnected: {
    fontSize: 12,
    marginTop: 2,
  },
  buddyModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  buddyModalContent: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  buddyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  buddyModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  buddyModalList: {
    padding: 8,
  },
  noBuddiesAvailable: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noBuddiesText: {
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },
  buddySelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  buddySelectName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
});
