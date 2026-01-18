import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  Dimensions, Platform, Modal, Switch, Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import Svg, { Path, Line, Text as SvgText, Rect, G, Circle } from 'react-native-svg';
import {
  calculateDivePlan, calculateMultiDivePlan, createGasMix, initializeTissues,
  DEFAULT_SETTINGS, GasMix, DivePlanResult, TissueState, DivePlanInput, DivePlanSettings,
  CircuitType, DecoModel, WaterType, UnitSystem, calculateCNS, calculateOTU, GasConsumption
} from '@/services/divePlanner';
import { CYLINDER_PRESETS_LEGACY as CYLINDER_PRESETS } from '@/services/cylinderCatalog';
import PageHeader from '@/components/PageHeader';
import { useTheme } from '@/contexts/ThemeContext';

const CHART_HEIGHT = 280;
const TISSUE_CHART_HEIGHT = 180;

type TabType = 'plan' | 'gases' | 'settings' | 'saved';

interface DiveEntry {
  id: string;
  depth: number;
  bottomTime: number;
  surfaceInterval: number;
}

// Gas roles for OC and CCR circuits
type OCGasRole = 'bottom' | 'travel' | 'deco';
type CCRGasRole = 'o2' | 'diluent' | 'bailout' | 'extension';
type GasRole = OCGasRole | CCRGasRole;

interface GasEntry {
  id: string;
  name: string;
  o2Percent: number;
  hePercent: number;
  switchDepth: number | null;
  isBottomGas: boolean; // legacy
  role: GasRole; // circuit-specific role
  cylinderVolume: number;
  fillPressure: number;
  reservePressure: number;
}

const DECO_MODELS: { value: DecoModel; label: string; description: string }[] = [
  { value: 'zhl16a', label: 'ZHL-16A', description: 'Original Buhlmann algorithm' },
  { value: 'zhl16b', label: 'ZHL-16B', description: 'Revised coefficients' },
  { value: 'zhl16c', label: 'ZHL-16C', description: 'Most conservative (recommended)' },
  { value: 'vpmb', label: 'VPM-B', description: 'Variable Permeability Model (beta)' },
];

export default function DivePlanningScreen() {
  const { colors: themeColors, isDark } = useTheme();
  const navigation = useNavigation();

  const colors = {
    background: themeColors.background,
    card: isDark ? '#1C1C1E' : '#F2F2F7',
    text: themeColors.text,
    textSecondary: isDark ? '#8E8E93' : '#6B6B6B',
    border: isDark ? '#38383A' : '#E5E5EA',
    primary: themeColors.primary,
    accent: '#007AFF',
    warning: '#FF9500',
    success: '#34C759',
    danger: '#FF3B30',
  };

  const [activeTab, setActiveTab] = useState<TabType>('plan');
  const [dives, setDives] = useState<DiveEntry[]>([
    { id: '1', depth: 30, bottomTime: 25, surfaceInterval: 0 }
  ]);

  const [gases, setGases] = useState<GasEntry[]>([
    { id: '1', name: 'Air', o2Percent: 21, hePercent: 0, switchDepth: null, isBottomGas: true, role: 'bottom', cylinderVolume: 11.1, fillPressure: 220, reservePressure: 50 },
  ]);
  const [showCylinderDropdown, setShowCylinderDropdown] = useState<string | null>(null);

  // Applied settings are what the dive plan uses - updates only when "Apply" is pressed
  const [appliedSettings, setAppliedSettings] = useState<DivePlanSettings>({
    ...DEFAULT_SETTINGS,
    gfLow: 30,
    gfHigh: 70,
  });
  
  // Pending settings track changes in the Settings tab before applying
  const [pendingSettings, setPendingSettings] = useState<DivePlanSettings>({
    ...DEFAULT_SETTINGS,
    gfLow: 30,
    gfHigh: 70,
  });
  
  // Track if settings have been modified but not applied
  const settingsAreDirty = useMemo(() => {
    return JSON.stringify(pendingSettings) !== JSON.stringify(appliedSettings);
  }, [pendingSettings, appliedSettings]);
  
  // For backward compatibility, "settings" refers to appliedSettings for plan calculations
  // but GF can be changed directly on the plan tab
  const settings = appliedSettings;
  
  // Saved dive plans
  interface SavedDivePlan {
    id: string;
    name: string;
    createdAt: string;
    dives: DiveEntry[];
    gases: GasEntry[];
    settings: DivePlanSettings;
  }
  const [savedPlans, setSavedPlans] = useState<SavedDivePlan[]>([]);
  const [planName, setPlanName] = useState('');
  
  // Apply pending settings
  const applySettings = () => {
    setAppliedSettings({ ...pendingSettings });
  };
  
  // Reset pending settings to applied
  const resetSettings = () => {
    setPendingSettings({ ...appliedSettings });
  };
  
  // Update GF directly (real-time on plan tab)
  const updateGF = (field: 'gfLow' | 'gfHigh', value: number) => {
    setAppliedSettings(prev => ({ ...prev, [field]: value }));
    setPendingSettings(prev => ({ ...prev, [field]: value }));
  };

  const [selectedDiveIndex, setSelectedDiveIndex] = useState(0);
  const [chartWidth, setChartWidth] = useState(300);
  const [tissueChartWidth, setTissueChartWidth] = useState(300);
  const [showScrubberModal, setShowScrubberModal] = useState(false);
  const [scrubberElapsed, setScrubberElapsed] = useState(0);
  const [chartScrubberTime, setChartScrubberTime] = useState<number>(0);
  const [showChartPopup, setShowChartPopup] = useState(false);

  const gasMixes = useMemo(() => {
    return gases.map(g => {
      const mix = createGasMix(g.o2Percent, g.hePercent, g.name, g.cylinderVolume, g.fillPressure, g.reservePressure, g.id);
      mix.switchDepth = g.switchDepth;
      return mix;
    });
  }, [gases]);

  const planResults = useMemo(() => {
    if (dives.length === 0) return [];

    const inputs: DivePlanInput[] = dives.map((dive, i) => ({
      depth: dive.depth,
      bottomTime: dive.bottomTime,
      gases: gasMixes,
      settings,
      surfaceIntervalMinutes: i > 0 ? dive.surfaceInterval : undefined,
    }));

    return calculateMultiDivePlan(inputs);
  }, [dives, gasMixes, settings]);

  const currentResult = planResults[selectedDiveIndex] || null;

  const addDive = () => {
    const newId = String(Date.now());
    setDives([...dives, { id: newId, depth: 20, bottomTime: 30, surfaceInterval: 60 }]);
  };

  const removeDive = (id: string) => {
    if (dives.length <= 1) return;
    const newDives = dives.filter(d => d.id !== id);
    setDives(newDives);
    if (selectedDiveIndex >= newDives.length) {
      setSelectedDiveIndex(newDives.length - 1);
    }
  };

  const updateDive = (id: string, field: keyof DiveEntry, value: number) => {
    setDives(dives.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const addGas = (role: GasRole = 'deco') => {
    const newId = String(Date.now());
    // Set defaults based on role
    let defaults: Partial<GasEntry> = { cylinderVolume: 7, fillPressure: 220, reservePressure: 35 };
    
    if (role === 'o2') {
      defaults = { ...defaults, o2Percent: 100, hePercent: 0, name: 'O2', cylinderVolume: 3, fillPressure: 220 };
    } else if (role === 'diluent') {
      defaults = { ...defaults, o2Percent: 21, hePercent: 35, name: 'Trimix 21/35', cylinderVolume: 3, fillPressure: 220 };
    } else if (role === 'bailout') {
      defaults = { ...defaults, o2Percent: 21, hePercent: 0, name: 'Bailout', cylinderVolume: 11.1, fillPressure: 220 };
    } else if (role === 'extension') {
      defaults = { ...defaults, o2Percent: 100, hePercent: 0, name: 'Extension O2', cylinderVolume: 3, fillPressure: 220 };
    } else if (role === 'deco') {
      defaults = { ...defaults, o2Percent: 50, hePercent: 0, name: 'EAN50', switchDepth: 21 };
    } else if (role === 'travel') {
      defaults = { ...defaults, o2Percent: 32, hePercent: 0, name: 'EAN32', switchDepth: null };
    } else if (role === 'bottom') {
      defaults = { ...defaults, o2Percent: 21, hePercent: 0, name: 'Air', switchDepth: null, cylinderVolume: 11.1, fillPressure: 220 };
    }
    
    setGases([...gases, { 
      id: newId, 
      name: defaults.name || '', 
      o2Percent: defaults.o2Percent || 21, 
      hePercent: defaults.hePercent || 0, 
      switchDepth: defaults.switchDepth ?? null, 
      isBottomGas: role === 'bottom',
      role,
      cylinderVolume: defaults.cylinderVolume || 7, 
      fillPressure: defaults.fillPressure || 220, 
      reservePressure: defaults.reservePressure || 35 
    }]);
  };

  const removeGas = (id: string) => {
    if (gases.length <= 1) return;
    setGases(gases.filter(g => g.id !== id));
  };

  const updateGas = (id: string, field: keyof GasEntry, value: any) => {
    setGases(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));
  };

  const tissueColors = [
    '#FF6B6B', '#FF8E53', '#FFA94D', '#FFD93D', '#C0EB75', '#6BCB77',
    '#4ECDC4', '#45B7D1', '#5C7CFA', '#7950F2', '#BE4BDB', '#E64980',
    '#F06595', '#CC5DE8', '#845EF7', '#5C7CFA'
  ];

  const depthUnit = settings.units === 'imperial' ? 'ft' : 'm';
  const rateUnit = settings.units === 'imperial' ? 'ft/min' : 'm/min';

  const getTabIcon = (tab: TabType): string => {
    switch (tab) {
      case 'plan': return 'activity';
      case 'gases': return 'wind';
      case 'settings': return 'sliders';
      case 'saved': return 'folder';
      default: return 'file';
    }
  };
  
  const getTabLabel = (tab: TabType): string => {
    switch (tab) {
      case 'plan': return 'Plan';
      case 'gases': return 'Gases';
      case 'settings': return 'Settings';
      case 'saved': return 'Saved';
      default: return tab;
    }
  };

  const renderTabBar = () => (
    <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {(['plan', 'gases', 'settings', 'saved'] as TabType[]).map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[
            styles.tab,
            activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
          ]}
          onPress={() => setActiveTab(tab)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Feather
              name={getTabIcon(tab) as any}
              size={16}
              color={activeTab === tab ? colors.primary : colors.textSecondary}
            />
            {tab === 'settings' && settingsAreDirty && (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning, marginLeft: 2 }} />
            )}
          </View>
          <Text style={[
            styles.tabText,
            { color: activeTab === tab ? colors.primary : colors.textSecondary }
          ]}>
            {getTabLabel(tab)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    unit: string = ''
  ) => {
    return (
      <View style={styles.sliderContainer}>
        <View style={styles.sliderHeader}>
          <Text style={[styles.sliderLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.sliderValue, { color: colors.primary }]}>{value}{unit}</Text>
        </View>
        <Slider
          style={styles.touchSlider}
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={value}
          onValueChange={onChange}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
        />
      </View>
    );
  };

  const renderToggle = (
    label: string,
    value: boolean,
    onChange: (v: boolean) => void,
    description?: string
  ) => (
    <View style={styles.toggleContainer}>
      <View style={styles.toggleInfo}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
        {description && <Text style={[styles.toggleDesc, { color: colors.textSecondary }]}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  const renderPicker = (
    label: string,
    options: { value: string; label: string }[],
    selectedValue: string,
    onChange: (v: string) => void
  ) => (
    <View style={styles.pickerContainer}>
      <Text style={[styles.pickerLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.pickerOptions}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.pickerOption,
              { borderColor: colors.border },
              selectedValue === opt.value && { backgroundColor: colors.primary, borderColor: colors.primary }
            ]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[
              styles.pickerOptionText,
              { color: selectedValue === opt.value ? '#FFFFFF' : colors.text }
            ]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Get values at a specific time point for the chart scrubber popup
  const getValuesAtTime = useCallback((time: number) => {
    if (!currentResult || currentResult.segments.length === 0) return null;
    
    let elapsedTime = 0;
    let currentDepth = 0;
    let currentGas = currentResult.segments[0]?.gasMix;
    let segmentType = '';
    
    // Find the segment and interpolate depth at this time
    for (const segment of currentResult.segments) {
      const segmentEnd = elapsedTime + segment.duration;
      if (time <= segmentEnd) {
        const progress = segment.duration > 0 ? (time - elapsedTime) / segment.duration : 0;
        currentDepth = segment.startDepth + (segment.endDepth - segment.startDepth) * progress;
        currentGas = segment.gasMix;
        segmentType = segment.type;
        break;
      }
      elapsedTime = segmentEnd;
      currentDepth = segment.endDepth;
      currentGas = segment.gasMix;
      segmentType = segment.type;
    }
    
    // Get tissue loading at this time (approximate from history)
    const historyIndex = Math.min(
      Math.floor((time / currentResult.totalRunTime) * (currentResult.tissueHistory.length - 1)),
      currentResult.tissueHistory.length - 1
    );
    const tissues = currentResult.tissueHistory[Math.max(0, historyIndex)] || [];
    
    // Calculate approximate CNS/OTU at this point (linear interpolation)
    const progress = currentResult.totalRunTime > 0 ? time / currentResult.totalRunTime : 0;
    const cnsAtTime = Math.round(currentResult.cns * progress);
    const otuAtTime = Math.round(currentResult.otu * progress);
    
    // Calculate ceiling at this depth
    const maxTissueM = Math.max(...tissues.map(t => t.ppInert - t.mValue), 0);
    const ceilingDepth = Math.max(0, maxTissueM);
    
    return {
      time: Math.round(time * 10) / 10,
      depth: Math.round(currentDepth * 10) / 10,
      gas: currentGas?.name || 'Unknown',
      o2Percent: currentGas?.o2Percent || 21,
      hePercent: currentGas?.hePercent || 0,
      segmentType,
      cns: cnsAtTime,
      otu: otuAtTime,
      tissues,
      ceiling: Math.round(ceilingDepth * 10) / 10,
    };
  }, [currentResult]);

  const handleChartTouch = useCallback((event: any, chartW: number, padding: { left: number }, totalTime: number) => {
    const locationX = event.nativeEvent.locationX - padding.left;
    const time = Math.max(0, Math.min((locationX / chartW) * totalTime, totalTime));
    setChartScrubberTime(time);
    setShowChartPopup(true);
  }, []);

  const renderDiveProfileChart = () => {
    if (!currentResult || currentResult.segments.length === 0) {
      return (
        <View 
          style={[styles.chartContainer, { backgroundColor: colors.card }]}
          onLayout={(e) => setChartWidth(e.nativeEvent.layout.width - 32)}
        >
          <Text style={[styles.chartTitle, { color: colors.text }]}>Dive Profile with Tissue Loading</Text>
          <View style={styles.emptyChart}>
            <Text style={{ color: colors.textSecondary }}>Configure dive parameters to see profile</Text>
          </View>
        </View>
      );
    }

    const maxDepth = Math.max(currentResult.maxDepth, 10);
    const totalTime = Math.max(currentResult.totalRunTime, 1);
    const padding = { top: 40, right: 20, bottom: 40, left: 50 };
    const chartW = Math.max(chartWidth - padding.left - padding.right, 100);
    const chartH = CHART_HEIGHT - padding.top - padding.bottom;

    let depthPathD = '';
    let currentTime = 0;

    currentResult.segments.forEach((seg, i) => {
      const x1 = (currentTime / totalTime) * chartW;
      const y1 = (seg.startDepth / maxDepth) * chartH;
      const x2 = ((currentTime + seg.duration) / totalTime) * chartW;
      const y2 = (seg.endDepth / maxDepth) * chartH;

      if (i === 0) {
        depthPathD += `M ${x1} ${y1}`;
      }
      depthPathD += ` L ${x2} ${y2}`;
      currentTime += seg.duration;
    });

    const tissueLines = currentResult.tissueHistory.length > 1 ? 
      Array.from({ length: 16 }, (_, tissueIdx) => {
        let pathD = '';
        const historyStep = Math.max(1, Math.floor(currentResult.tissueHistory.length / 50));
        const maxPpInert = Math.max(...currentResult.tissueHistory.flatMap(h => h.map(t => t.ppInert)), 1);
        
        for (let i = 0; i < currentResult.tissueHistory.length; i += historyStep) {
          const tissue = currentResult.tissueHistory[i][tissueIdx];
          const x = (i / (currentResult.tissueHistory.length - 1)) * chartW;
          const normalizedLoading = tissue.ppInert / maxPpInert;
          const y = chartH - (normalizedLoading * chartH * 0.5);
          
          if (i === 0) {
            pathD += `M ${x} ${y}`;
          } else {
            pathD += ` L ${x} ${y}`;
          }
        }
        
        return (
          <Path
            key={tissueIdx}
            d={pathD}
            stroke={tissueColors[tissueIdx]}
            strokeWidth={1}
            strokeOpacity={0.6}
            fill="none"
          />
        );
      }) : [];

    const decoStopMarkers = currentResult.decoStops.map((stop, i) => {
      const segTime = currentResult.segments.find(s => s.type === 'deco_stop' && s.startDepth === stop.depth);
      if (!segTime) return null;
      const idx = currentResult.segments.indexOf(segTime);
      let time = 0;
      for (let j = 0; j < idx; j++) {
        time += currentResult.segments[j].duration;
      }
      const x = (time / totalTime) * chartW;
      const y = (stop.depth / maxDepth) * chartH;
      return (
        <Circle key={i} cx={x} cy={y} r={4} fill={colors.warning} />
      );
    });

    const depthLabels = [0, maxDepth / 4, maxDepth / 2, (maxDepth * 3) / 4, maxDepth].map((d, i) => (
      <SvgText
        key={i}
        x={padding.left - 8}
        y={padding.top + (d / maxDepth) * chartH + 4}
        fontSize={9}
        fill={colors.textSecondary}
        textAnchor="end"
      >
        {Math.round(d)}{depthUnit}
      </SvgText>
    ));

    const timeInterval = totalTime <= 30 ? 5 : totalTime <= 60 ? 10 : totalTime <= 120 ? 15 : 30;
    const timeLabels = [];
    for (let t = 0; t <= totalTime; t += timeInterval) {
      timeLabels.push(
        <G key={t}>
          <Line
            x1={padding.left + (t / totalTime) * chartW}
            y1={padding.top}
            x2={padding.left + (t / totalTime) * chartW}
            y2={padding.top + chartH}
            stroke={colors.border}
            strokeWidth={0.5}
            strokeOpacity={0.3}
          />
          <SvgText
            x={padding.left + (t / totalTime) * chartW}
            y={CHART_HEIGHT - 8}
            fontSize={9}
            fill={colors.textSecondary}
            textAnchor="middle"
          >
            {t}
          </SvgText>
        </G>
      );
    }

    const depthGridLines = [0, maxDepth / 4, maxDepth / 2, (maxDepth * 3) / 4, maxDepth].map((d, i) => (
      <Line
        key={i}
        x1={padding.left}
        y1={padding.top + (d / maxDepth) * chartH}
        x2={padding.left + chartW}
        y2={padding.top + (d / maxDepth) * chartH}
        stroke={colors.border}
        strokeWidth={0.5}
        strokeOpacity={0.3}
      />
    ));

    // Scrubber position - always visible
    const scrubberX = padding.left + (chartScrubberTime / totalTime) * chartW;
    const scrubberValues = getValuesAtTime(chartScrubberTime);
    const scrubberDepthY = scrubberValues 
      ? padding.top + (scrubberValues.depth / maxDepth) * chartH 
      : padding.top;

    return (
      <View 
        style={[styles.chartContainer, { backgroundColor: colors.card }]}
        onLayout={(e) => setChartWidth(e.nativeEvent.layout.width - 32)}
      >
        <View style={styles.chartHeaderRow}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>Dive Profile</Text>
          <View style={styles.chartStatsRow}>
            <View style={[styles.chartStatBadge, { backgroundColor: colors.warning + '20' }]}>
              <Text style={[styles.chartStatLabel, { color: colors.warning }]}>CNS</Text>
              <Text style={[styles.chartStatValue, { color: colors.warning }]}>{currentResult.cns}%</Text>
            </View>
            <View style={[styles.chartStatBadge, { backgroundColor: colors.accent + '20' }]}>
              <Text style={[styles.chartStatLabel, { color: colors.accent }]}>OTU</Text>
              <Text style={[styles.chartStatValue, { color: colors.accent }]}>{currentResult.otu}</Text>
            </View>
          </View>
        </View>
        
        <View 
          style={{ position: 'relative', cursor: 'crosshair' } as any}
          onTouchStart={(e) => handleChartTouch(e, chartW, padding, totalTime)}
          onTouchMove={(e) => handleChartTouch(e, chartW, padding, totalTime)}
          onTouchEnd={() => setShowChartPopup(false)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          {...(Platform.OS === 'web' ? {
            onMouseDown: (e: any) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const locationX = e.clientX - rect.left - padding.left;
              const time = Math.max(0, Math.min((locationX / chartW) * totalTime, totalTime));
              setChartScrubberTime(time);
              setShowChartPopup(true);
            },
            onMouseMove: (e: any) => {
              if (e.buttons === 1) {
                const rect = e.currentTarget.getBoundingClientRect();
                const locationX = e.clientX - rect.left - padding.left;
                const time = Math.max(0, Math.min((locationX / chartW) * totalTime, totalTime));
                setChartScrubberTime(time);
                setShowChartPopup(true);
              }
            },
            onMouseUp: () => setShowChartPopup(false),
            onMouseLeave: () => setShowChartPopup(false),
          } : {})}
        >
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            <Rect x={padding.left} y={padding.top} width={chartW} height={chartH} fill={isDark ? '#1A1A1C' : '#F5F5F7'} />
            {depthGridLines}
            {timeLabels}
            <G transform={`translate(${padding.left}, ${padding.top})`}>
              {tissueLines}
              <Path d={depthPathD} stroke={colors.primary} strokeWidth={2.5} fill="none" />
              {decoStopMarkers}
            </G>
            {depthLabels}
            <SvgText x={padding.left + chartW / 2} y={CHART_HEIGHT - 2} fontSize={10} fill={colors.textSecondary} textAnchor="middle">
              Time (min)
            </SvgText>
            <Line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartH} stroke={colors.border} strokeWidth={1} />
            <Line x1={padding.left} y1={padding.top + chartH} x2={padding.left + chartW} y2={padding.top + chartH} stroke={colors.border} strokeWidth={1} />
            
            {/* Scrubber line - always visible */}
            <Line 
              x1={scrubberX} 
              y1={padding.top} 
              x2={scrubberX} 
              y2={padding.top + chartH} 
              stroke={showChartPopup ? colors.accent : colors.accent + '60'} 
              strokeWidth={showChartPopup ? 2 : 1.5} 
              strokeDasharray={showChartPopup ? "4,2" : "6,3"}
            />
            <Circle 
              cx={scrubberX} 
              cy={scrubberDepthY} 
              r={showChartPopup ? 6 : 5} 
              fill={colors.primary} 
              stroke="#FFF" 
              strokeWidth={2} 
            />
            {/* Drag handle at top */}
            <Circle 
              cx={scrubberX} 
              cy={padding.top - 8} 
              r={8} 
              fill={showChartPopup ? colors.accent : colors.accent + '80'} 
              stroke="#FFF" 
              strokeWidth={1.5} 
            />
            <Line 
              x1={scrubberX - 3} 
              y1={padding.top - 10} 
              x2={scrubberX - 3} 
              y2={padding.top - 6} 
              stroke="#FFF" 
              strokeWidth={1} 
            />
            <Line 
              x1={scrubberX + 3} 
              y1={padding.top - 10} 
              x2={scrubberX + 3} 
              y2={padding.top - 6} 
              stroke="#FFF" 
              strokeWidth={1} 
            />
          </Svg>
          
          {/* Popup with values */}
          {showChartPopup && scrubberValues && (
            <View 
              style={[
                styles.scrubberPopup, 
                { 
                  backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                  borderColor: colors.border,
                  left: Math.min(Math.max(scrubberX - 90, 10), chartWidth - 190),
                  top: 10,
                }
              ]}
            >
              <View style={styles.popupRow}>
                <Text style={[styles.popupLabel, { color: colors.textSecondary }]}>Time</Text>
                <Text style={[styles.popupValue, { color: colors.text }]}>{scrubberValues.time} min</Text>
              </View>
              <View style={styles.popupRow}>
                <Text style={[styles.popupLabel, { color: colors.textSecondary }]}>Depth</Text>
                <Text style={[styles.popupValue, { color: colors.primary }]}>{scrubberValues.depth}{depthUnit}</Text>
              </View>
              <View style={styles.popupRow}>
                <Text style={[styles.popupLabel, { color: colors.textSecondary }]}>Gas</Text>
                <Text style={[styles.popupValue, { color: colors.text }]}>{scrubberValues.gas}</Text>
              </View>
              <View style={styles.popupDivider} />
              <View style={styles.popupRow}>
                <Text style={[styles.popupLabel, { color: colors.textSecondary }]}>CNS</Text>
                <Text style={[styles.popupValue, { color: scrubberValues.cns > 80 ? colors.danger : colors.warning }]}>{scrubberValues.cns}%</Text>
              </View>
              <View style={styles.popupRow}>
                <Text style={[styles.popupLabel, { color: colors.textSecondary }]}>OTU</Text>
                <Text style={[styles.popupValue, { color: colors.accent }]}>{scrubberValues.otu}</Text>
              </View>
              <View style={styles.popupRow}>
                <Text style={[styles.popupLabel, { color: colors.textSecondary }]}>Phase</Text>
                <Text style={[styles.popupValue, { color: colors.textSecondary }]}>
                  {scrubberValues.segmentType.replace('_', ' ')}
                </Text>
              </View>
            </View>
          )}
        </View>
        
        <Text style={[styles.chartSubtitle, { color: colors.textSecondary }]}>
          Touch and drag to see values at any point
        </Text>
      </View>
    );
  };

  const renderTissueChart = () => {
    if (!currentResult || currentResult.tissueHistory.length === 0) {
      return null;
    }

    const finalTissues = currentResult.tissueHistory[currentResult.tissueHistory.length - 1];
    const padding = { top: 30, right: 16, bottom: 40, left: 40 };
    const chartW = Math.max(tissueChartWidth - padding.left - padding.right, 100);
    const chartH = TISSUE_CHART_HEIGHT - padding.top - padding.bottom;
    const barWidth = (chartW / 16) - 2;
    const barGap = 2;

    const maxInert = Math.max(...finalTissues.map(t => t.ppInert), 1);

    const bars = finalTissues.map((tissue, i) => {
      const height = Math.max((tissue.ppInert / maxInert) * chartH, 2);
      const x = padding.left + i * (barWidth + barGap);
      const y = padding.top + chartH - height;
      const percent = tissue.percentMValue;
      let fillColor = tissueColors[i];

      return (
        <G key={i}>
          <Rect x={x} y={y} width={barWidth} height={height} fill={fillColor} rx={1} />
          <SvgText
            x={x + barWidth / 2}
            y={padding.top + chartH + 12}
            fontSize={7}
            fill={colors.textSecondary}
            textAnchor="middle"
          >
            {i + 1}
          </SvgText>
          <SvgText
            x={x + barWidth / 2}
            y={y - 4}
            fontSize={6}
            fill={colors.textSecondary}
            textAnchor="middle"
          >
            {Math.round(percent)}%
          </SvgText>
        </G>
      );
    });

    const loadingLabels = [0, 25, 50, 75, 100].map((pct, i) => {
      const y = padding.top + chartH - (pct / 100) * chartH;
      return (
        <G key={i}>
          <Line
            x1={padding.left}
            y1={y}
            x2={padding.left + chartW}
            y2={y}
            stroke={colors.border}
            strokeWidth={0.5}
            strokeOpacity={0.3}
          />
          <SvgText
            x={padding.left - 6}
            y={y + 3}
            fontSize={8}
            fill={colors.textSecondary}
            textAnchor="end"
          >
            {pct}%
          </SvgText>
        </G>
      );
    });

    return (
      <View 
        style={[styles.chartContainer, { backgroundColor: colors.card }]}
        onLayout={(e) => setTissueChartWidth(e.nativeEvent.layout.width - 32)}
      >
        <Text style={[styles.chartTitle, { color: colors.text }]}>Final Tissue Saturation (16 Compartments)</Text>
        <Svg width={tissueChartWidth} height={TISSUE_CHART_HEIGHT}>
          {loadingLabels}
          {bars}
          <SvgText x={padding.left + chartW / 2} y={TISSUE_CHART_HEIGHT - 4} fontSize={9} fill={colors.textSecondary} textAnchor="middle">
            Compartment (1=fast, 16=slow)
          </SvgText>
          <Line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartH} stroke={colors.border} strokeWidth={1} />
          <Line x1={padding.left} y1={padding.top + chartH} x2={padding.left + chartW} y2={padding.top + chartH} stroke={colors.border} strokeWidth={1} />
        </Svg>
        <Text style={[styles.chartSubtitle, { color: colors.textSecondary }]}>
          Percentage shown = tissue loading relative to M-value limit
        </Text>
      </View>
    );
  };

  const renderSummary = () => {
    if (!currentResult) return null;

    const cnsColor = currentResult.cns > 100 ? colors.danger : currentResult.cns > 80 ? colors.warning : colors.success;
    const otuColor = currentResult.otu > 300 ? colors.warning : colors.success;

    return (
      <View style={[styles.summaryContainer, { backgroundColor: colors.card }]}>
        <Text style={[styles.summaryTitle, { color: colors.text }]}>Plan Summary</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{currentResult.totalRunTime}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total Time (min)</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{currentResult.totalDecoTime}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Deco Time (min)</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{currentResult.maxDepth}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Max Depth ({depthUnit})</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: currentResult.ndl !== null ? colors.success : colors.textSecondary }]}>
              {currentResult.ndl !== null ? currentResult.ndl : 'N/A'}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>NDL (min)</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: cnsColor }]}>{currentResult.cns}%</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>CNS O2 Toxicity</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: otuColor }]}>{currentResult.otu}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>OTU (Pulmonary)</Text>
          </View>
        </View>

        {settings.circuit === 'ccr' && (
          <TouchableOpacity
            style={[styles.scrubberButton, { backgroundColor: colors.accent }]}
            onPress={() => setShowScrubberModal(true)}
          >
            <Feather name="clock" size={16} color="#FFF" />
            <Text style={styles.scrubberButtonText}>
              Scrubber: {scrubberElapsed}/{settings.scrubberDuration} min
            </Text>
          </TouchableOpacity>
        )}

        {/* Dive Profile Table */}
        <View style={[styles.decoStopsContainer, { borderTopColor: colors.border }]}>
          <Text style={[styles.decoStopsTitle, { color: colors.text }]}>Dive Profile</Text>
          
          {/* Table Header */}
          <View style={[styles.profileTableHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.profileHeaderCell, { width: 28, color: colors.textSecondary }]}></Text>
            <Text style={[styles.profileHeaderCell, { width: 55, color: colors.textSecondary }]}>Depth</Text>
            <Text style={[styles.profileHeaderCell, { width: 50, color: colors.textSecondary }]}>Run</Text>
            <Text style={[styles.profileHeaderCell, { flex: 1, color: colors.textSecondary }]}>Gas</Text>
            <Text style={[styles.profileHeaderCell, { width: 45, color: colors.textSecondary }]}>PO2</Text>
            <Text style={[styles.profileHeaderCell, { width: 50, color: colors.textSecondary }]}>EAD</Text>
          </View>
          
          {/* Table Rows */}
          {currentResult.segments.filter(s => s.type !== 'surface_interval').map((seg, i) => {
            const depth = seg.type === 'descent' || seg.type === 'ascent' ? seg.endDepth : seg.startDepth;
            const pressure = 1 + depth / (settings.waterType === 'salt' ? 10 : 10.3);
            const po2 = (seg.gasMix.o2Percent / 100) * pressure;
            const fN2 = (100 - seg.gasMix.o2Percent - (seg.gasMix.hePercent || 0)) / 100;
            const ead = fN2 > 0 ? Math.round(((pressure * fN2) - 0.79) / 0.79 * (settings.waterType === 'salt' ? 10 : 10.3)) : 0;
            
            let arrow = '→';
            let arrowColor = colors.textSecondary;
            if (seg.type === 'descent') { arrow = '↓'; arrowColor = colors.primary; }
            else if (seg.type === 'ascent') { arrow = '↑'; arrowColor = colors.success; }
            else if (seg.type === 'deco_stop') { arrow = '⏸'; arrowColor = colors.warning; }
            else if (seg.type === 'gas_switch') { arrow = '⟳'; arrowColor = colors.accent; }
            
            const po2Color = po2 > 1.6 ? colors.error : po2 > 1.4 ? colors.warning : colors.text;
            
            return (
              <View key={i} style={[styles.profileTableRow, { backgroundColor: i % 2 === 0 ? 'transparent' : colors.background + '40' }]}>
                <Text style={[styles.profileCell, { width: 28, fontSize: 16, color: arrowColor }]}>{arrow}</Text>
                <Text style={[styles.profileCell, { width: 55, color: colors.text }]}>{depth}{depthUnit}</Text>
                <Text style={[styles.profileCell, { width: 50, color: colors.textSecondary }]}>{seg.runTime}'</Text>
                <Text style={[styles.profileCell, { flex: 1, color: colors.text }]} numberOfLines={1}>{seg.gasMix.name}</Text>
                <Text style={[styles.profileCell, { width: 45, color: po2Color }]}>{po2.toFixed(2)}</Text>
                <Text style={[styles.profileCell, { width: 50, color: colors.textSecondary }]}>{ead > 0 ? `${ead}${depthUnit}` : '-'}</Text>
              </View>
            );
          })}
        </View>

        {currentResult.warnings.length > 0 && (
          <View style={styles.warningsContainer}>
            {currentResult.warnings.map((warning, i) => (
              <View key={i} style={[styles.warningRow, { backgroundColor: colors.warning + '20' }]}>
                <Feather name="alert-triangle" size={16} color={colors.warning} />
                <Text style={[styles.warningText, { color: colors.warning }]}>{warning}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderPlanTab = () => (
    <>
      {dives.length > 1 && (
        <View style={styles.diveSelector}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {dives.map((dive, i) => (
              <TouchableOpacity
                key={dive.id}
                style={[
                  styles.diveSelectorItem,
                  { backgroundColor: selectedDiveIndex === i ? colors.primary : colors.card }
                ]}
                onPress={() => setSelectedDiveIndex(i)}
              >
                <Text style={[styles.diveSelectorText, { color: selectedDiveIndex === i ? '#FFF' : colors.text }]}>
                  Dive {i + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Dive Parameters</Text>
            <View style={[styles.modeBadge, { backgroundColor: settings.circuit === 'ccr' ? colors.primary : colors.accent }]}>
              <Feather name={settings.circuit === 'ccr' ? 'refresh-cw' : 'wind'} size={12} color="#FFF" />
              <Text style={styles.modeBadgeText}>{settings.circuit === 'ccr' ? 'CCR' : 'OC'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={addDive} style={[styles.addButton, { backgroundColor: colors.primary }]}>
            <Feather name="plus" size={16} color="#FFF" />
            <Text style={styles.addButtonText}>Add Dive</Text>
          </TouchableOpacity>
        </View>

        {dives.map((dive, index) => (
          <View key={dive.id} style={[styles.diveCard, { borderColor: colors.border }]}>
            {index > 0 && (
              <View style={styles.inputRow}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Surface Interval</Text>
                <View style={styles.inputGroup}>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    value={String(dive.surfaceInterval)}
                    onChangeText={(v) => updateDive(dive.id, 'surfaceInterval', parseInt(v) || 0)}
                    keyboardType="numeric"
                  />
                  <Text style={[styles.inputUnit, { color: colors.textSecondary }]}>min</Text>
                </View>
              </View>
            )}
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Depth</Text>
              <View style={styles.inputGroup}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  value={String(dive.depth)}
                  onChangeText={(v) => updateDive(dive.id, 'depth', parseFloat(v) || 0)}
                  keyboardType="numeric"
                />
                <Text style={[styles.inputUnit, { color: colors.textSecondary }]}>{depthUnit}</Text>
              </View>
            </View>
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Bottom Time</Text>
              <View style={styles.inputGroup}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  value={String(dive.bottomTime)}
                  onChangeText={(v) => updateDive(dive.id, 'bottomTime', parseInt(v) || 0)}
                  keyboardType="numeric"
                />
                <Text style={[styles.inputUnit, { color: colors.textSecondary }]}>min</Text>
              </View>
            </View>
            {dives.length > 1 && (
              <TouchableOpacity
                style={styles.removeDiveButton}
                onPress={() => removeDive(dive.id)}
              >
                <Feather name="trash-2" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 16 }]}>Gradient Factors</Text>
        {renderSlider('GF Low', settings.gfLow, 10, 100, 5, (v) => updateGF('gfLow', v), '%')}
        {renderSlider('GF High', settings.gfHigh, 10, 100, 5, (v) => updateGF('gfHigh', v), '%')}
        <Text style={[styles.settingHint, { color: colors.textSecondary, marginTop: 4 }]}>
          Adjust gradient factors in real-time to see their effect on decompression
        </Text>
      </View>

      {renderDiveProfileChart()}
      {renderTissueChart()}
      {renderSummary()}
    </>
  );

  const getRoleLabel = (role: GasRole): string => {
    const labels: Record<GasRole, string> = {
      bottom: 'Bottom Gas',
      travel: 'Travel Gas',
      deco: 'Deco Gas',
      o2: 'O2 Cylinder',
      diluent: 'Diluent',
      bailout: 'Bailout',
      extension: 'Extension'
    };
    return labels[role] || role;
  };

  const getRoleColor = (role: GasRole): string => {
    const roleColors: Record<GasRole, string> = {
      bottom: colors.primary,
      travel: colors.accent,
      deco: colors.success,
      o2: '#FF6B6B',
      diluent: '#4ECDC4',
      bailout: colors.warning,
      extension: colors.textSecondary
    };
    return roleColors[role] || colors.primary;
  };

  const getRoleIcon = (role: GasRole): string => {
    const icons: Record<GasRole, string> = {
      bottom: 'arrow-down-circle',
      travel: 'navigation',
      deco: 'trending-up',
      o2: 'target',
      diluent: 'layers',
      bailout: 'alert-triangle',
      extension: 'plus-circle'
    };
    return icons[role] || 'circle';
  };

  const renderGasCard = (gas: GasEntry, canRemove: boolean, isO2Fixed: boolean = false) => {
    const gasConsumption = currentResult?.gasConsumption?.find(gc => gc.cylinderId === gas.id);
    const totalGas = gas.cylinderVolume * gas.fillPressure;
    const roleColor = getRoleColor(gas.role);
    const showSwitchDepth = ['deco', 'travel', 'bailout'].includes(gas.role);
    
    return (
      <View key={gas.id} style={[styles.gasCard, { borderColor: roleColor, borderLeftWidth: 4, zIndex: showCylinderDropdown === gas.id ? 1000 : 1 }]}>
        <View style={styles.gasHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name={getRoleIcon(gas.role) as any} size={16} color={roleColor} />
            <Text style={[styles.gasIndex, { color: roleColor }]}>
              {getRoleLabel(gas.role)}
            </Text>
          </View>
          {canRemove && (
            <TouchableOpacity onPress={() => removeGas(gas.id)}>
              <Feather name="x" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Gas Mix Row */}
        <View style={styles.gasInputRow}>
          <View style={styles.gasInputGroup}>
            <Text style={[styles.gasInputLabel, { color: colors.textSecondary }]}>O2%</Text>
            <TextInput
              style={[styles.gasInput, { color: colors.text, borderColor: colors.border, backgroundColor: isO2Fixed ? colors.background : undefined }]}
              value={String(gas.o2Percent)}
              onChangeText={(v) => updateGas(gas.id, 'o2Percent', parseFloat(v) || 21)}
              keyboardType="numeric"
              editable={!isO2Fixed}
            />
          </View>
          <View style={styles.gasInputGroup}>
            <Text style={[styles.gasInputLabel, { color: colors.textSecondary }]}>He%</Text>
            <TextInput
              style={[styles.gasInput, { color: colors.text, borderColor: colors.border, backgroundColor: isO2Fixed ? colors.background : undefined }]}
              value={String(gas.hePercent)}
              onChangeText={(v) => updateGas(gas.id, 'hePercent', parseFloat(v) || 0)}
              keyboardType="numeric"
              editable={!isO2Fixed}
            />
          </View>
          {showSwitchDepth && (
            <View style={styles.gasInputGroup}>
              <Text style={[styles.gasInputLabel, { color: colors.textSecondary }]}>Switch@</Text>
              <TextInput
                style={[styles.gasInput, { color: colors.text, borderColor: colors.border }]}
                value={gas.switchDepth !== null ? String(gas.switchDepth) : ''}
                onChangeText={(v) => updateGas(gas.id, 'switchDepth', v ? parseFloat(v) : null)}
                keyboardType="numeric"
                placeholder={depthUnit}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          )}
        </View>
        
        {/* Cylinder Type Dropdown */}
        <View style={styles.cylinderDropdownContainer}>
          <Text style={[styles.gasInputLabel, { color: colors.textSecondary }]}>Cylinder Type</Text>
          <TouchableOpacity
            style={[styles.cylinderDropdownButton, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => setShowCylinderDropdown(showCylinderDropdown === gas.id ? null : gas.id)}
          >
            <Text style={[styles.cylinderDropdownText, { color: colors.text }]}>
              {CYLINDER_PRESETS.find(p => 
                Math.abs(p.volumeL - gas.cylinderVolume) < 0.5 && Math.abs(p.fillBar - gas.fillPressure) < 10
              )?.label || 'Custom'}
            </Text>
            <Feather name={showCylinderDropdown === gas.id ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          
          {showCylinderDropdown === gas.id && (
            <View style={[styles.cylinderDropdownList, { backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF', borderColor: colors.border }]}>
              <ScrollView 
                style={{ maxHeight: 200 }} 
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {CYLINDER_PRESETS.map(preset => (
                  <Pressable
                    key={preset.label}
                    style={({ pressed }) => [
                      styles.cylinderDropdownItem,
                      { borderBottomColor: colors.border },
                      Math.abs(preset.volumeL - gas.cylinderVolume) < 0.5 && Math.abs(preset.fillBar - gas.fillPressure) < 10 &&
                        { backgroundColor: colors.primary + '15' },
                      pressed && { backgroundColor: colors.primary + '25' }
                    ]}
                    onPress={() => {
                      updateGas(gas.id, 'cylinderVolume', preset.volumeL);
                      updateGas(gas.id, 'fillPressure', preset.fillBar);
                      setShowCylinderDropdown(null);
                    }}
                  >
                    <Text style={[styles.cylinderDropdownItemText, { color: colors.text }]}>{preset.label}</Text>
                    <Text style={[styles.cylinderDropdownItemSub, { color: colors.textSecondary }]}>
                      {settings.units === 'imperial' 
                        ? `${preset.volumeCuft} cu ft @ ${Math.round(preset.fillBar * 14.5)} PSI`
                        : `${preset.volumeL}L @ ${preset.fillBar} bar`
                      }
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
        
        {/* Cylinder Details Row */}
        <View style={styles.gasInputRow}>
          <View style={styles.gasInputGroup}>
            <Text style={[styles.gasInputLabel, { color: colors.textSecondary }]}>
              {settings.units === 'imperial' ? 'Volume (cu ft)' : 'Volume (L)'}
            </Text>
            <TextInput
              style={[styles.gasInput, { color: colors.text, borderColor: colors.border }]}
              value={String(settings.units === 'imperial' 
                ? Math.round(gas.cylinderVolume * gas.fillPressure / 28.3)
                : Math.round(gas.cylinderVolume * 10) / 10
              )}
              onChangeText={(v) => {
                const val = parseFloat(v) || 12;
                if (settings.units === 'imperial') {
                  updateGas(gas.id, 'cylinderVolume', Math.round((val * 28.3 / gas.fillPressure) * 10) / 10);
                } else {
                  updateGas(gas.id, 'cylinderVolume', val);
                }
              }}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.gasInputGroup}>
            <Text style={[styles.gasInputLabel, { color: colors.textSecondary }]}>
              {settings.units === 'imperial' ? 'Fill (PSI)' : 'Fill (bar)'}
            </Text>
            <TextInput
              style={[styles.gasInput, { color: colors.text, borderColor: colors.border }]}
              value={String(settings.units === 'imperial'
                ? Math.round(gas.fillPressure * 14.5)
                : gas.fillPressure
              )}
              onChangeText={(v) => {
                const val = parseFloat(v) || 220;
                if (settings.units === 'imperial') {
                  updateGas(gas.id, 'fillPressure', Math.round(val / 14.5));
                } else {
                  updateGas(gas.id, 'fillPressure', val);
                }
              }}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.gasInputGroup}>
            <Text style={[styles.gasInputLabel, { color: colors.textSecondary }]}>
              {settings.units === 'imperial' ? 'Reserve (PSI)' : 'Reserve (bar)'}
            </Text>
            <TextInput
              style={[styles.gasInput, { color: colors.text, borderColor: colors.border }]}
              value={String(settings.units === 'imperial'
                ? Math.round(gas.reservePressure * 14.5)
                : gas.reservePressure
              )}
              onChangeText={(v) => {
                const val = parseFloat(v) || 50;
                if (settings.units === 'imperial') {
                  updateGas(gas.id, 'reservePressure', Math.round(val / 14.5));
                } else {
                  updateGas(gas.id, 'reservePressure', val);
                }
              }}
              keyboardType="numeric"
            />
          </View>
        </View>
        
        {/* Gas Stats */}
        <View style={styles.gasStatsRow}>
          <Text style={[styles.gasMod, { color: colors.textSecondary }]}>
            MOD: {Math.floor(((1.4 / (gas.o2Percent / 100)) - 1) * 10)}{depthUnit} (1.4) / {Math.floor(((1.6 / (gas.o2Percent / 100)) - 1) * 10)}{depthUnit} (1.6)
          </Text>
          <Text style={[styles.gasMod, { color: colors.textSecondary }]}>
            Total: {totalGas}L
          </Text>
        </View>
        
        {/* Gas Consumption Display */}
        {gasConsumption && (
          <View style={[styles.gasConsumptionBar, { backgroundColor: colors.background }]}>
            <View style={styles.gasConsumptionLabels}>
              <Text style={[styles.gasConsumptionText, { color: colors.text }]}>
                Required: {gasConsumption.gasRequired}L
              </Text>
              <Text style={[
                styles.gasConsumptionText, 
                { color: gasConsumption.isSufficient ? colors.success : colors.danger }
              ]}>
                {gasConsumption.isSufficient ? `Remaining: ${gasConsumption.gasRemaining}L` : 'INSUFFICIENT'}
              </Text>
            </View>
            <View style={[styles.consumptionTrack, { backgroundColor: colors.border }]}>
              <View 
                style={[
                  styles.consumptionFill, 
                  { 
                    width: `${Math.min(gasConsumption.percentUsed, 100)}%`,
                    backgroundColor: gasConsumption.percentUsed > 80 
                      ? (gasConsumption.isSufficient ? colors.warning : colors.danger) 
                      : colors.success 
                  }
                ]} 
              />
              <View 
                style={[
                  styles.reserveMarker,
                  { left: `${100 - (gas.reservePressure / gas.fillPressure * 100)}%`, backgroundColor: colors.warning }
                ]}
              />
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderGasesTab = () => {
    const isCCR = settings.circuit === 'ccr';
    
    // Filter gases by role for organized display
    const o2Cylinder = gases.find(g => g.role === 'o2');
    const diluentCylinder = gases.find(g => g.role === 'diluent');
    const bailoutGases = gases.filter(g => g.role === 'bailout');
    const extensionGases = gases.filter(g => g.role === 'extension');
    
    const bottomGases = gases.filter(g => g.role === 'bottom');
    const travelGases = gases.filter(g => g.role === 'travel');
    const decoGases = gases.filter(g => g.role === 'deco');
    
    return (
      <>
        {/* Circuit Mode Badge */}
        <View style={[styles.section, { backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <View style={[styles.circuitBadge, { backgroundColor: isCCR ? colors.primary + '20' : colors.accent + '20' }]}>
            <Feather name={isCCR ? 'refresh-cw' : 'wind'} size={14} color={isCCR ? colors.primary : colors.accent} />
            <Text style={[styles.circuitBadgeText, { color: isCCR ? colors.primary : colors.accent }]}>
              {isCCR ? 'CCR Mode' : 'Open Circuit'}
            </Text>
          </View>
          <Text style={[styles.settingHint, { color: colors.textSecondary, flex: 1 }]}>
            {isCCR 
              ? 'Configure O2, Diluent, and backup gases' 
              : 'Configure bottom, travel, and deco gases'}
          </Text>
        </View>

        {isCCR ? (
          <>
            {/* CCR Loop Gases */}
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>Loop Gases</Text>
              <Text style={[styles.settingHint, { color: colors.textSecondary, marginBottom: 12 }]}>
                Onboard O2 and Diluent cylinders
              </Text>
              
              {o2Cylinder && renderGasCard(o2Cylinder, false, true)}
              {diluentCylinder && renderGasCard(diluentCylinder, false, false)}
              
              {!o2Cylinder && (
                <TouchableOpacity onPress={() => addGas('o2')} style={[styles.addGasButton, { borderColor: '#FF6B6B' }]}>
                  <Feather name="plus" size={16} color="#FF6B6B" />
                  <Text style={[styles.addGasText, { color: '#FF6B6B' }]}>Add O2 Cylinder</Text>
                </TouchableOpacity>
              )}
              {!diluentCylinder && (
                <TouchableOpacity onPress={() => addGas('diluent')} style={[styles.addGasButton, { borderColor: '#4ECDC4' }]}>
                  <Feather name="plus" size={16} color="#4ECDC4" />
                  <Text style={[styles.addGasText, { color: '#4ECDC4' }]}>Add Diluent Cylinder</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* CCR Bailout Gases */}
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>Bailout Gases</Text>
              <Text style={[styles.settingHint, { color: colors.textSecondary, marginBottom: 12 }]}>
                Open circuit bailout in case of loop failure
              </Text>
              
              {bailoutGases.map(gas => renderGasCard(gas, bailoutGases.length > 0, false))}
              
              <TouchableOpacity onPress={() => addGas('bailout')} style={[styles.addGasButton, { borderColor: colors.warning }]}>
                <Feather name="plus" size={16} color={colors.warning} />
                <Text style={[styles.addGasText, { color: colors.warning }]}>Add Bailout Gas</Text>
              </TouchableOpacity>
            </View>

            {/* CCR Extension Gases */}
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>Extension Gases</Text>
              <Text style={[styles.settingHint, { color: colors.textSecondary, marginBottom: 12 }]}>
                Extra O2 or Diluent to extend dive duration
              </Text>
              
              {extensionGases.map(gas => renderGasCard(gas, true, false))}
              
              <TouchableOpacity onPress={() => addGas('extension')} style={[styles.addGasButton, { borderColor: colors.textSecondary }]}>
                <Feather name="plus" size={16} color={colors.textSecondary} />
                <Text style={[styles.addGasText, { color: colors.textSecondary }]}>Add Extension Gas</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* OC Bottom Gases */}
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>Bottom Gases</Text>
              <Text style={[styles.settingHint, { color: colors.textSecondary, marginBottom: 12 }]}>
                Primary gases for the bottom phase of the dive
              </Text>
              
              {bottomGases.map(gas => renderGasCard(gas, bottomGases.length > 1, false))}
              
              <TouchableOpacity onPress={() => addGas('bottom')} style={[styles.addGasButton, { borderColor: colors.primary }]}>
                <Feather name="plus" size={16} color={colors.primary} />
                <Text style={[styles.addGasText, { color: colors.primary }]}>Add Bottom Gas</Text>
              </TouchableOpacity>
            </View>

            {/* OC Travel Gases */}
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>Travel Gases</Text>
              <Text style={[styles.settingHint, { color: colors.textSecondary, marginBottom: 12 }]}>
                Gases used during descent (optional)
              </Text>
              
              {travelGases.map(gas => renderGasCard(gas, true, false))}
              
              <TouchableOpacity onPress={() => addGas('travel')} style={[styles.addGasButton, { borderColor: colors.accent }]}>
                <Feather name="plus" size={16} color={colors.accent} />
                <Text style={[styles.addGasText, { color: colors.accent }]}>Add Travel Gas</Text>
              </TouchableOpacity>
            </View>

            {/* OC Deco Gases */}
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>Deco Gases</Text>
              <Text style={[styles.settingHint, { color: colors.textSecondary, marginBottom: 12 }]}>
                Gases used during ascent and decompression stops
              </Text>
              
              {decoGases.map(gas => renderGasCard(gas, true, false))}
              
              <TouchableOpacity onPress={() => addGas('deco')} style={[styles.addGasButton, { borderColor: colors.success }]}>
                <Feather name="plus" size={16} color={colors.success} />
                <Text style={[styles.addGasText, { color: colors.success }]}>Add Deco Gas</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </>
    );
  };

  // Helper to render settings with pending state
  const ps = pendingSettings;
  const setPs = (updates: Partial<DivePlanSettings>) => setPendingSettings(prev => ({ ...prev, ...updates }));
  
  const renderSettingsTab = () => (
    <>
      {/* Apply/Reset Banner */}
      {settingsAreDirty && (
        <View style={[styles.section, { backgroundColor: colors.warning + '20', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={[styles.sectionTitle, { color: colors.warning, flex: 1 }]}>Settings modified</Text>
          <TouchableOpacity 
            style={[styles.applyButton, { backgroundColor: colors.primary, marginRight: 8 }]}
            onPress={applySettings}
          >
            <Feather name="check" size={16} color="#FFF" />
            <Text style={styles.applyButtonText}>Apply</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.applyButton, { backgroundColor: colors.textSecondary }]}
            onPress={resetSettings}
          >
            <Feather name="x" size={16} color="#FFF" />
            <Text style={styles.applyButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>
      )}
    
      {/* Model Settings */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Model Settings</Text>
        
        {renderPicker('Circuit', [
          { value: 'open', label: 'OC' },
          { value: 'ccr', label: 'CCR' },
        ], ps.circuit, (v) => setPs({ circuit: v as CircuitType }))}

        {renderPicker('Deco Model', DECO_MODELS.map(m => ({ value: m.value, label: m.label })), 
          ps.decoModel, (v) => setPs({ decoModel: v as DecoModel }))}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>
          {DECO_MODELS.find(m => m.value === ps.decoModel)?.description || ''}
        </Text>

        {renderToggle('O2 narcotic', ps.o2Narcotic, 
          (v) => setPs({ o2Narcotic: v }),
          'END calculation - Consider O2 as narcotic?'
        )}
      </View>

      {/* Units & Environment */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Feet / Meter / Units</Text>
        
        {renderPicker('Depth', [
          { value: 'imperial', label: 'Feet' },
          { value: 'metric', label: 'Meter' },
        ], ps.units, (v) => setPs({ units: v as UnitSystem }))}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Depth shown in feet or meters</Text>

        {renderPicker('Water', [
          { value: 'salt', label: 'Salt' },
          { value: 'fresh', label: 'Fresh' },
        ], ps.waterType, (v) => setPs({ waterType: v as WaterType }))}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Type of water - salt or fresh</Text>

        {renderPicker('Gas volume', [
          { value: 'cuft', label: 'CuFt.' },
          { value: 'ltr', label: 'Ltr.' },
        ], ps.gasVolumeUnits, (v) => setPs({ gasVolumeUnits: v as 'cuft' | 'ltr' }))}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>RMV or SAC gas units - cubic ft or liter</Text>
      </View>

      {/* Gas Consumption */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.settingsSectionTitle, { color: colors.text, marginBottom: 0 }]}>Gas Consumption</Text>
            <View style={[styles.modeBadge, { backgroundColor: ps.circuit === 'ccr' ? colors.warning : colors.accent }]}>
              <Feather name={ps.circuit === 'ccr' ? 'alert-triangle' : 'wind'} size={12} color="#FFF" />
              <Text style={styles.modeBadgeText}>{ps.circuit === 'ccr' ? 'Bailout' : 'OC'}</Text>
            </View>
          </View>
        </View>
        
        {renderSlider('Bottom', ps.circuit === 'ccr' ? ps.bailoutSacRateBottom : ps.sacRateBottom, 5, 40, 1,
          (v) => ps.circuit === 'ccr' ? setPs({ bailoutSacRateBottom: v }) : setPs({ sacRateBottom: v }), '')}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>
          {ps.circuit === 'ccr' ? 'Bailout SAC rate (stress factor included)' : 'Bottom mix SAC/RMV rate'}
        </Text>

        {renderSlider('Deco', ps.circuit === 'ccr' ? ps.bailoutSacRateDeco : ps.sacRateDeco, 5, 30, 1,
          (v) => ps.circuit === 'ccr' ? setPs({ bailoutSacRateDeco: v }) : setPs({ sacRateDeco: v }), '')}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>
          {ps.circuit === 'ccr' ? 'Bailout deco SAC rate (stress factor)' : 'Deco mix SAC/RMV rate'}
        </Text>
      </View>

      {/* CCR Settings */}
      {ps.circuit === 'ccr' && (
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>CCR Settings</Text>
          
          {renderPicker('Setpoint Units', [
            { value: 'bar', label: 'BAR' },
            { value: 'ata', label: 'ATA' },
          ], ps.ccrSetpointUnits, (v) => setPs({ ccrSetpointUnits: v as 'bar' | 'ata' }))}
          <Text style={[styles.settingHint, { color: colors.textSecondary }]}>CCR setpoint base units</Text>

          {renderSlider('Bottom Setpoint', ps.ccrSetpoint, 0.7, 1.6, 0.1, 
            (v) => setPs({ ccrSetpoint: Math.round(v * 10) / 10 }), ps.ccrSetpointUnits === 'bar' ? ' bar' : ' ATA')}
          <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Setpoint during bottom phase</Text>

          {renderSlider('Deco Setpoint', ps.decoSetpoint, 0.7, 1.6, 0.1, 
            (v) => setPs({ decoSetpoint: Math.round(v * 10) / 10 }), ps.ccrSetpointUnits === 'bar' ? ' bar' : ' ATA')}
          <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Higher setpoint during ascent to reduce deco</Text>

          {renderSlider('Scrubber Duration', ps.scrubberDuration, 60, 300, 30,
            (v) => setPs({ scrubberDuration: v }), ' min')}
        </View>
      )}

      {/* Deco Stop Settings */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Deco Stop, Deco Mix Settings</Text>
        
        {renderSlider(`Stop size = ${ps.stopSize}${depthUnit}`, ps.stopSize, 3, 6, 3,
          (v) => setPs({ stopSize: v }), '')}
        {renderSlider(`Last OC = ${ps.lastOcStopDepth}${depthUnit}`, ps.lastOcStopDepth, 3, 6, 3,
          (v) => setPs({ lastOcStopDepth: v }), '')}
        {renderSlider(`Last CCR = ${ps.lastCcrStopDepth}${depthUnit}`, ps.lastCcrStopDepth, 3, 9, 3,
          (v) => setPs({ lastCcrStopDepth: v }), '')}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Stop size dimensions, last stop depths</Text>

        {renderSlider(`Stop = ${ps.minStopTime} min`, ps.minStopTime, 1, 3, 1,
          (v) => setPs({ minStopTime: v }), '')}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Minimum stop time intervals</Text>

        {renderSlider(`45..99% = ${ps.ppo2High}`, ps.ppo2High, 1.4, 1.6, 0.1,
          (v) => setPs({ ppo2High: Math.round(v * 10) / 10 }), '')}
        {renderSlider(`28..45% = ${ps.ppo2Medium}`, ps.ppo2Medium, 1.3, 1.6, 0.1,
          (v) => setPs({ ppo2Medium: Math.round(v * 10) / 10 }), '')}
        {renderSlider(`up to 28% = ${ps.ppo2Low}`, ps.ppo2Low, 1.2, 1.6, 0.1,
          (v) => setPs({ ppo2Low: Math.round(v * 10) / 10 }), '')}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Deco mix switch depth - ppO2 threshold</Text>

        {renderSlider(`100% O2 = ${ps.maxO2Depth}${depthUnit}`, ps.maxO2Depth, 3, 9, 1,
          (v) => setPs({ maxO2Depth: v }), '')}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Maximum depth for 100% O2 use</Text>

        {renderToggle('30 sec stops', ps.use30SecStops, 
          (v) => setPs({ use30SecStops: v })
        )}
        {renderToggle('6 m steps', ps.use6mSteps, 
          (v) => setPs({ use6mSteps: v }),
          'Controls initial (deepest) stop dimensions'
        )}
      </View>

      {/* Extended Stops */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Extended Stops</Text>
        
        {renderToggle('Extended stops', ps.extendedStops, 
          (v) => setPs({ extendedStops: v }),
          'Include extended stops with deco mix swaps'
        )}

        {ps.extendedStops && (
          <>
            {renderSlider(`7..30 m = ${ps.extendedStopShallow}min`, ps.extendedStopShallow, 1, 10, 1,
              (v) => setPs({ extendedStopShallow: v }), '')}
            {renderSlider(`30 + m = ${ps.extendedStopDeep}min`, ps.extendedStopDeep, 1, 5, 1,
              (v) => setPs({ extendedStopDeep: v }), '')}
            <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Extra stop time with deco mix changes</Text>
          </>
        )}

        {renderToggle('Add time to stop', ps.addTimeToStop, 
          (v) => setPs({ addTimeToStop: v })
        )}
        {renderToggle('All mix changes', ps.allMixChanges, 
          (v) => setPs({ allMixChanges: v })
        )}
        {renderToggle('O2 window effect', ps.o2WindowEffect, 
          (v) => setPs({ o2WindowEffect: v }),
          'Controls extended stop time behavior'
        )}
      </View>

      {/* Descent/Ascent Rates */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Descent / Ascent Rates</Text>
        
        {renderSlider(`Descent`, ps.descentRate, 5, 30, 1,
          (v) => setPs({ descentRate: v }), ` ${rateUnit}`)}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Descent rates throughout the plan</Text>

        {renderSlider(`Surface`, ps.surfaceRate, 3, 18, 1,
          (v) => setPs({ surfaceRate: v }), ` ${rateUnit}`)}
        {renderSlider(`Deco`, ps.decoRate, 3, 15, 1,
          (v) => setPs({ decoRate: v }), ` ${rateUnit}`)}
        {renderSlider(`Ascent`, ps.ascentRate, 3, 18, 1,
          (v) => setPs({ ascentRate: v }), ` ${rateUnit}`)}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Ascent rates throughout the plan</Text>
      </View>

      {/* Dive Site Elevation */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Dive Site Elevation</Text>
        
        {renderSlider(`Elevation`, ps.elevation, 0, 3000, 100,
          (v) => setPs({ elevation: v }), 'm')}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Dive site elevation</Text>

        {renderSlider(`Acclimatized`, ps.acclimatizedElevation, 0, 3000, 100,
          (v) => setPs({ acclimatizedElevation: v }), 'm')}
      </View>

      {/* Gas Switch Time - moved from removed Display section */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Gas Switch</Text>
        
        {renderSlider('Gas Switch Time', ps.gasSwitchTime, 0, 5, 1, 
          (v) => setPs({ gasSwitchTime: v }), ' min')}
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Time added for gas switches during deco</Text>
      </View>

      {/* Dive Monitor Controls */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Dive Monitor Controls</Text>
        
        <View style={styles.monitorRow}>
          {renderToggle(`ppO2 above = ${ps.ppo2AboveThreshold.toFixed(2)}`, ps.ppo2AboveEnabled,
            (v) => setPs({ ppo2AboveEnabled: v })
          )}
          {ps.ppo2AboveEnabled && (
            <View style={styles.monitorSlider}>
              {renderSlider('', ps.ppo2AboveThreshold, 1.0, 2.0, 0.1,
                (v) => setPs({ ppo2AboveThreshold: Math.round(v * 100) / 100 }), '')}
            </View>
          )}
        </View>
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Monitor when ppO2 exceeds...</Text>

        <View style={styles.monitorRow}>
          {renderToggle(`ppO2 below = ${ps.ppo2BelowThreshold.toFixed(2)}`, ps.ppo2BelowEnabled,
            (v) => setPs({ ppo2BelowEnabled: v })
          )}
          {ps.ppo2BelowEnabled && (
            <View style={styles.monitorSlider}>
              {renderSlider('', ps.ppo2BelowThreshold, 0.10, 0.21, 0.01,
                (v) => setPs({ ppo2BelowThreshold: Math.round(v * 100) / 100 }), '')}
            </View>
          )}
        </View>
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Monitor when ppO2 is lower than</Text>

        <View style={styles.monitorRow}>
          {renderToggle(`OTU's above = ${ps.otuAboveThreshold}`, ps.otuAboveEnabled,
            (v) => setPs({ otuAboveEnabled: v })
          )}
          {ps.otuAboveEnabled && (
            <View style={styles.monitorSlider}>
              {renderSlider('', ps.otuAboveThreshold, 100, 600, 50,
                (v) => setPs({ otuAboveThreshold: v }), '')}
            </View>
          )}
        </View>
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Monitor when OTU's exceeds...</Text>

        <View style={styles.monitorRow}>
          {renderToggle(`CNS % above = ${ps.cnsAboveThreshold}%`, ps.cnsAboveEnabled,
            (v) => setPs({ cnsAboveEnabled: v })
          )}
          {ps.cnsAboveEnabled && (
            <View style={styles.monitorSlider}>
              {renderSlider('', ps.cnsAboveThreshold, 50, 100, 5,
                (v) => setPs({ cnsAboveThreshold: v }), '')}
            </View>
          )}
        </View>
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Monitor when CNS % exceeds...</Text>

        <View style={styles.monitorRow}>
          {renderToggle(`IBCD N2 = ${ps.ibcdN2Threshold} ATA`, ps.ibcdN2Enabled,
            (v) => setPs({ ibcdN2Enabled: v })
          )}
          {ps.ibcdN2Enabled && (
            <View style={styles.monitorSlider}>
              {renderSlider('', ps.ibcdN2Threshold, 0.1, 1.0, 0.1,
                (v) => setPs({ ibcdN2Threshold: Math.round(v * 10) / 10 }), '')}
            </View>
          )}
        </View>
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Deco mix swap ppN2 exceeds...</Text>

        <View style={styles.monitorRow}>
          {renderToggle(`IBCD He = ${ps.ibcdHeThreshold} ATA`, ps.ibcdHeEnabled,
            (v) => setPs({ ibcdHeEnabled: v })
          )}
          {ps.ibcdHeEnabled && (
            <View style={styles.monitorSlider}>
              {renderSlider('', ps.ibcdHeThreshold, 0.1, 1.0, 0.1,
                (v) => setPs({ ibcdHeThreshold: Math.round(v * 10) / 10 }), '')}
            </View>
          )}
        </View>
        <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Deco mix swap ppHe exceeds...</Text>

        {ps.circuit === 'ccr' && (
          <>
            {renderToggle('CCR diluent check', ps.ccrDiluentCheck,
              (v) => setPs({ ccrDiluentCheck: v }),
              'CCR diluent pp exceeds ATA'
            )}
          </>
        )}
      </View>
    </>
  );

  // Save current dive plan
  const savePlan = () => {
    if (!planName.trim()) {
      Alert.alert('Name Required', 'Please enter a name for this dive plan.');
      return;
    }
    const newPlan: SavedDivePlan = {
      id: String(Date.now()),
      name: planName.trim(),
      createdAt: new Date().toISOString(),
      dives: [...dives],
      gases: [...gases],
      settings: { ...appliedSettings },
    };
    setSavedPlans(prev => [newPlan, ...prev]);
    setPlanName('');
    Alert.alert('Saved', `Dive plan "${newPlan.name}" has been saved.`);
  };

  // Load a saved dive plan
  const loadPlan = (plan: SavedDivePlan) => {
    setDives(plan.dives.map(d => ({ ...d })));
    setGases(plan.gases.map(g => ({ ...g })));
    setAppliedSettings({ ...plan.settings });
    setPendingSettings({ ...plan.settings });
    setSelectedDiveIndex(0);
    setActiveTab('plan');
    Alert.alert('Loaded', `Dive plan "${plan.name}" has been loaded.`);
  };

  // Delete a saved dive plan
  const deletePlan = (id: string) => {
    Alert.alert(
      'Delete Plan',
      'Are you sure you want to delete this dive plan?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: () => setSavedPlans(prev => prev.filter(p => p.id !== id))
        },
      ]
    );
  };

  const renderSavedPlansTab = () => (
    <>
      {/* Save Current Plan */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Save Current Plan</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, flex: 1 }]}
            value={planName}
            onChangeText={setPlanName}
            placeholder="Enter plan name..."
            placeholderTextColor={colors.textSecondary}
          />
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={savePlan}
          >
            <Feather name="save" size={16} color="#FFF" />
            <Text style={styles.addButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
        {currentResult && (
          <Text style={[styles.settingHint, { color: colors.textSecondary, marginTop: 8 }]}>
            Current: {dives.length} dive(s), {currentResult.maxDepth}{depthUnit} max, {currentResult.totalRunTime} min runtime
          </Text>
        )}
      </View>

      {/* Saved Plans List */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>
          Saved Plans ({savedPlans.length})
        </Text>
        
        {savedPlans.length === 0 ? (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 24 }}>
            No saved dive plans yet. Create a plan and save it to see it here.
          </Text>
        ) : (
          savedPlans.map(plan => (
            <View 
              key={plan.id} 
              style={[styles.savedPlanCard, { borderColor: colors.border, backgroundColor: colors.background }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.savedPlanName, { color: colors.text }]}>{plan.name}</Text>
                <Text style={[styles.savedPlanMeta, { color: colors.textSecondary }]}>
                  {plan.dives.length} dive(s) | {plan.gases.length} gas(es)
                </Text>
                <Text style={[styles.savedPlanMeta, { color: colors.textSecondary }]}>
                  Saved: {new Date(plan.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.savedPlanBtn, { backgroundColor: colors.primary }]}
                  onPress={() => loadPlan(plan)}
                >
                  <Feather name="upload" size={14} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.savedPlanBtn, { backgroundColor: colors.danger }]}
                  onPress={() => deletePlan(plan.id)}
                >
                  <Feather name="trash-2" size={14} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </>
  );

  const renderScrubberModal = () => (
    <Modal
      visible={showScrubberModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowScrubberModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>CCR Scrubber Time</Text>
            <TouchableOpacity onPress={() => setShowScrubberModal(false)}>
              <Feather name="x" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.scrubberInfo}>
            <View style={styles.scrubberGauge}>
              <View style={[styles.scrubberBar, { backgroundColor: colors.border }]}>
                <View 
                  style={[
                    styles.scrubberProgress, 
                    { 
                      width: `${Math.min(100, (scrubberElapsed / settings.scrubberDuration) * 100)}%`,
                      backgroundColor: scrubberElapsed > settings.scrubberDuration * 0.8 ? colors.warning : colors.success
                    }
                  ]} 
                />
              </View>
              <Text style={[styles.scrubberText, { color: colors.text }]}>
                {scrubberElapsed} / {settings.scrubberDuration} min
              </Text>
              <Text style={[styles.scrubberRemaining, { color: colors.textSecondary }]}>
                {Math.max(0, settings.scrubberDuration - scrubberElapsed)} min remaining
              </Text>
            </View>
            
            <View style={styles.scrubberActions}>
              {renderSlider('Elapsed Time', scrubberElapsed, 0, settings.scrubberDuration, 5,
                (v) => setScrubberElapsed(v), ' min')}
              
              <View style={styles.scrubberButtons}>
                <TouchableOpacity
                  style={[styles.scrubberActionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setScrubberElapsed(0)}
                >
                  <Feather name="rotate-ccw" size={16} color="#FFF" />
                  <Text style={styles.scrubberActionText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.scrubberActionBtn, { backgroundColor: colors.accent }]}
                  onPress={() => setScrubberElapsed(prev => Math.min(settings.scrubberDuration, prev + currentResult?.totalRunTime || 0))}
                >
                  <Feather name="plus" size={16} color="#FFF" />
                  <Text style={styles.scrubberActionText}>Add Dive Time</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PageHeader title="Dive Planning" />

      {renderTabBar()}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'plan' && renderPlanTab()}
        {activeTab === 'gases' && renderGasesTab()}
        {activeTab === 'settings' && renderSettingsTab()}
        {activeTab === 'saved' && renderSavedPlansTab()}
        <View style={{ height: 40 }} />
      </ScrollView>

      {renderScrubberModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabText: { fontSize: 14, fontWeight: '500' },
  content: { flex: 1, padding: 16 },
  diveSelector: { marginBottom: 16 },
  diveSelectorItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  diveSelectorText: { fontSize: 14, fontWeight: '500' },
  section: { borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  modeBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  circuitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  circuitBadgeText: { fontSize: 13, fontWeight: '600' },
  settingsSectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  addButtonText: { color: '#FFF', fontSize: 12, fontWeight: '500' },
  diveCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    position: 'relative',
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputLabel: { fontSize: 14 },
  inputGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    width: 70,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 16,
  },
  inputUnit: { fontSize: 14, width: 40 },
  removeDiveButton: { position: 'absolute', top: 8, right: 8 },
  sliderContainer: { marginBottom: 20 },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sliderLabel: { fontSize: 14 },
  sliderValue: { fontSize: 14, fontWeight: '600' },
  touchSlider: { width: '100%', height: 40 },
  sliderTrack: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sliderButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderFill: { height: 6, borderRadius: 3, overflow: 'hidden' },
  sliderProgress: { height: '100%', borderRadius: 3 },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '500' },
  toggleDesc: { fontSize: 12, marginTop: 2 },
  pickerContainer: { marginBottom: 16 },
  pickerLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  pickerOptions: { flexDirection: 'row', gap: 8 },
  pickerOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  pickerOptionText: { fontSize: 13, fontWeight: '500' },
  modelPicker: { marginTop: 8 },
  modelOption: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  modelOptionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modelRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelRadioInner: { width: 10, height: 10, borderRadius: 5 },
  modelLabel: { fontSize: 14, fontWeight: '600' },
  modelDesc: { fontSize: 12, marginTop: 4, marginLeft: 30 },
  gasCard: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  gasHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gasIndex: { fontSize: 14, fontWeight: '600' },
  gasInputRow: { flexDirection: 'row', gap: 12 },
  gasInputGroup: { flex: 1 },
  gasInputLabel: { fontSize: 12, marginBottom: 4 },
  gasInput: {
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 14,
  },
  gasMod: { fontSize: 12, marginTop: 8 },
  addGasButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
  },
  addGasText: { fontSize: 14, fontWeight: '500' },
  chartContainer: { borderRadius: 12, padding: 16, marginBottom: 16, overflow: 'hidden' },
  chartTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  chartSubtitle: { fontSize: 11, marginTop: 8, textAlign: 'center' as const, fontStyle: 'italic' as const },
  emptyChart: {
    height: CHART_HEIGHT - 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryContainer: { borderRadius: 12, padding: 16, marginBottom: 16 },
  summaryTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  summaryItem: { width: '50%', marginBottom: 16 },
  summaryValue: { fontSize: 24, fontWeight: '700' },
  summaryLabel: { fontSize: 12, marginTop: 2 },
  scrubberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  scrubberButtonText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  decoStopsContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  decoStopsTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  profileTableHeader: { flexDirection: 'row', paddingBottom: 8, marginBottom: 4, borderBottomWidth: 1 },
  profileHeaderCell: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' } as any,
  profileTableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderRadius: 4 },
  profileCell: { fontSize: 13 },
  decoStopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 16 },
  decoStopDepth: { fontSize: 14, fontWeight: '500', width: 50 },
  decoStopDuration: { fontSize: 14, fontWeight: '600' },
  decoStopGas: { fontSize: 12, flex: 1 },
  warningsContainer: { marginTop: 16 },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, marginBottom: 8 },
  warningText: { fontSize: 12, flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  scrubberInfo: { gap: 20 },
  scrubberGauge: { alignItems: 'center', gap: 8 },
  scrubberBar: { width: '100%', height: 12, borderRadius: 6, overflow: 'hidden' },
  scrubberProgress: { height: '100%', borderRadius: 6 },
  scrubberText: { fontSize: 24, fontWeight: '700' },
  scrubberRemaining: { fontSize: 14 },
  scrubberActions: { gap: 16 },
  scrubberButtons: { flexDirection: 'row', gap: 12 },
  scrubberActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  scrubberActionText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  cylinderDropdownContainer: { marginVertical: 8, zIndex: 1000 },
  cylinderDropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
  },
  cylinderDropdownText: { fontSize: 14 },
  cylinderDropdownList: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 8,
    zIndex: 9999,
    elevation: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  cylinderDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  cylinderDropdownItemText: { fontSize: 14, fontWeight: '500' },
  cylinderDropdownItemSub: { fontSize: 12, marginTop: 2 },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chartStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  chartStatLabel: { fontSize: 11, fontWeight: '600' },
  chartStatValue: { fontSize: 13, fontWeight: '700' },
  scrubberPopup: {
    position: 'absolute',
    width: 180,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 100,
  },
  popupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  popupLabel: { fontSize: 12 },
  popupValue: { fontSize: 13, fontWeight: '600' },
  popupDivider: {
    height: 1,
    backgroundColor: '#38383A',
    marginVertical: 6,
  },
  gasStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  gasConsumptionBar: {
    marginTop: 12,
    padding: 8,
    borderRadius: 8,
  },
  gasConsumptionLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  gasConsumptionText: { fontSize: 12, fontWeight: '500' },
  consumptionTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  consumptionFill: {
    height: '100%',
    borderRadius: 4,
  },
  reserveMarker: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: '100%',
  },
  gfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  gfInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  settingHint: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  monitorRow: {
    marginBottom: 4,
  },
  monitorSlider: {
    marginTop: -12,
    marginBottom: 0,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  applyButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  savedPlanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  savedPlanName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  savedPlanMeta: {
    fontSize: 12,
  },
  savedPlanBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
