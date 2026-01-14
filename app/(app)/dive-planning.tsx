import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  useColorScheme, Dimensions, Platform, Modal, Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Svg, { Path, Line, Text as SvgText, Rect, G, Circle } from 'react-native-svg';
import {
  calculateDivePlan, calculateMultiDivePlan, createGasMix, initializeTissues,
  DEFAULT_SETTINGS, GasMix, DivePlanResult, TissueState, DivePlanInput, DivePlanSettings,
  CircuitType, DecoModel, WaterType, UnitSystem, calculateCNS, calculateOTU, GasConsumption
} from '../../services/divePlanner';

const CHART_HEIGHT = 280;
const TISSUE_CHART_HEIGHT = 180;

type TabType = 'plan' | 'gases' | 'settings';

interface DiveEntry {
  id: string;
  depth: number;
  bottomTime: number;
  surfaceInterval: number;
}

interface GasEntry {
  id: string;
  name: string;
  o2Percent: number;
  hePercent: number;
  switchDepth: number | null;
  isBottomGas: boolean;
  cylinderVolume: number; // liters
  fillPressure: number; // bar
  reservePressure: number; // bar
}

// Cylinder presets with volume in liters and fill in bar (220 bar standard)
const CYLINDER_PRESETS = [
  { label: 'Aluminum 80 (AL80)', volumeL: 11.1, fillBar: 220, volumeCuft: 80 },
  { label: 'Aluminum 63 (AL63)', volumeL: 8.9, fillBar: 220, volumeCuft: 63 },
  { label: 'Aluminum 100 (AL100)', volumeL: 12.9, fillBar: 220, volumeCuft: 100 },
  { label: 'Steel 80 (HP80)', volumeL: 10.2, fillBar: 220, volumeCuft: 80 },
  { label: 'Steel 100 (HP100)', volumeL: 12.7, fillBar: 220, volumeCuft: 100 },
  { label: 'Steel 120 (HP120)', volumeL: 15.3, fillBar: 220, volumeCuft: 120 },
  { label: 'Steel 12L', volumeL: 12, fillBar: 220, volumeCuft: 85 },
  { label: 'Steel 15L', volumeL: 15, fillBar: 220, volumeCuft: 106 },
  { label: 'Twinset 12L x2', volumeL: 24, fillBar: 220, volumeCuft: 170 },
  { label: 'Twinset 15L x2', volumeL: 30, fillBar: 220, volumeCuft: 212 },
  { label: 'Stage AL40', volumeL: 5.7, fillBar: 220, volumeCuft: 40 },
  { label: 'Stage AL30', volumeL: 4.0, fillBar: 220, volumeCuft: 30 },
  { label: 'Stage Steel 7L', volumeL: 7, fillBar: 220, volumeCuft: 50 },
  { label: 'Pony AL13', volumeL: 1.9, fillBar: 220, volumeCuft: 13 },
  { label: 'Custom', volumeL: 12, fillBar: 220, volumeCuft: 85 },
];

const DECO_MODELS: { value: DecoModel; label: string; description: string }[] = [
  { value: 'zhl16a', label: 'ZHL-16A', description: 'Original Buhlmann algorithm' },
  { value: 'zhl16b', label: 'ZHL-16B', description: 'Revised coefficients' },
  { value: 'zhl16c', label: 'ZHL-16C', description: 'Most conservative (recommended)' },
  { value: 'vpmb', label: 'VPM-B', description: 'Variable Permeability Model (beta)' },
];

export default function DivePlanningScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const colors = {
    background: isDark ? '#000000' : '#FFFFFF',
    card: isDark ? '#1C1C1E' : '#F2F2F7',
    text: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#8E8E93' : '#6B6B6B',
    border: isDark ? '#38383A' : '#E5E5EA',
    primary: '#D22F00',
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
    { id: '1', name: 'Air', o2Percent: 21, hePercent: 0, switchDepth: null, isBottomGas: true, cylinderVolume: 11.1, fillPressure: 220, reservePressure: 50 },
  ]);
  const [showCylinderDropdown, setShowCylinderDropdown] = useState<string | null>(null);

  const [settings, setSettings] = useState<DivePlanSettings>({
    ...DEFAULT_SETTINGS,
    gfLow: 30,
    gfHigh: 70,
  });

  const [selectedDiveIndex, setSelectedDiveIndex] = useState(0);
  const [chartWidth, setChartWidth] = useState(300);
  const [tissueChartWidth, setTissueChartWidth] = useState(300);
  const [showScrubberModal, setShowScrubberModal] = useState(false);
  const [scrubberElapsed, setScrubberElapsed] = useState(0);

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

  const addGas = () => {
    const newId = String(Date.now());
    setGases([...gases, { id: newId, name: '', o2Percent: 50, hePercent: 0, switchDepth: 21, isBottomGas: false, cylinderVolume: 7, fillPressure: 207, reservePressure: 35 }]);
  };

  const removeGas = (id: string) => {
    if (gases.length <= 1) return;
    setGases(gases.filter(g => g.id !== id));
  };

  const updateGas = (id: string, field: keyof GasEntry, value: any) => {
    setGases(gases.map(g => g.id === id ? { ...g, [field]: value } : g));
  };

  const tissueColors = [
    '#FF6B6B', '#FF8E53', '#FFA94D', '#FFD93D', '#C0EB75', '#6BCB77',
    '#4ECDC4', '#45B7D1', '#5C7CFA', '#7950F2', '#BE4BDB', '#E64980',
    '#F06595', '#CC5DE8', '#845EF7', '#5C7CFA'
  ];

  const depthUnit = settings.units === 'imperial' ? 'ft' : 'm';
  const rateUnit = settings.units === 'imperial' ? 'ft/min' : 'm/min';

  const renderTabBar = () => (
    <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {(['plan', 'gases', 'settings'] as TabType[]).map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[
            styles.tab,
            activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }
          ]}
          onPress={() => setActiveTab(tab)}
        >
          <Feather
            name={tab === 'plan' ? 'activity' : tab === 'gases' ? 'wind' : 'settings'}
            size={18}
            color={activeTab === tab ? colors.primary : colors.textSecondary}
          />
          <Text style={[
            styles.tabText,
            { color: activeTab === tab ? colors.primary : colors.textSecondary }
          ]}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
        <View style={styles.sliderTrack}>
          <TouchableOpacity
            style={[styles.sliderButton, { backgroundColor: colors.card }]}
            onPress={() => onChange(Math.max(min, value - step))}
          >
            <Feather name="minus" size={16} color={colors.text} />
          </TouchableOpacity>
          <View style={[styles.sliderFill, { flex: 1, backgroundColor: colors.border }]}>
            <View style={[styles.sliderProgress, { width: `${((value - min) / (max - min)) * 100}%`, backgroundColor: colors.primary }]} />
          </View>
          <TouchableOpacity
            style={[styles.sliderButton, { backgroundColor: colors.card }]}
            onPress={() => onChange(Math.min(max, value + step))}
          >
            <Feather name="plus" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
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

    return (
      <View 
        style={[styles.chartContainer, { backgroundColor: colors.card }]}
        onLayout={(e) => setChartWidth(e.nativeEvent.layout.width - 32)}
      >
        <Text style={[styles.chartTitle, { color: colors.text }]}>Dive Profile with Tissue Loading</Text>
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
        </Svg>
        <Text style={[styles.chartSubtitle, { color: colors.textSecondary }]}>
          Thin colored lines show individual tissue compartment loading (fast tissues = warm colors, slow = cool colors)
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

        {currentResult.decoStops.length > 0 && (
          <View style={[styles.decoStopsContainer, { borderTopColor: colors.border }]}>
            <Text style={[styles.decoStopsTitle, { color: colors.text }]}>Decompression Stops</Text>
            {currentResult.decoStops.map((stop, i) => (
              <View key={i} style={styles.decoStopRow}>
                <Text style={[styles.decoStopDepth, { color: colors.text }]}>{stop.depth}{depthUnit}</Text>
                <Text style={[styles.decoStopDuration, { color: colors.primary }]}>{stop.duration} min</Text>
                <Text style={[styles.decoStopGas, { color: colors.textSecondary }]}>{stop.gasMix.name}</Text>
              </View>
            ))}
          </View>
        )}

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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Dive Parameters</Text>
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
        {renderSlider('GF Low', settings.gfLow, 10, 100, 5, (v) => setSettings({ ...settings, gfLow: v }), '%')}
        {renderSlider('GF High', settings.gfHigh, 10, 100, 5, (v) => setSettings({ ...settings, gfHigh: v }), '%')}
      </View>

      {renderDiveProfileChart()}
      {renderTissueChart()}
      {renderSummary()}
    </>
  );

  const renderGasesTab = () => (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Gas Mixes & Cylinders</Text>
      </View>
      
      {gases.map((gas, i) => {
        const gasConsumption = currentResult?.gasConsumption?.find(gc => gc.cylinderId === gas.id);
        const totalGas = gas.cylinderVolume * gas.fillPressure;
        
        return (
          <View key={gas.id} style={[styles.gasCard, { borderColor: colors.border }]}>
            <View style={styles.gasHeader}>
              <Text style={[styles.gasIndex, { color: colors.primary }]}>
                {gas.isBottomGas ? 'Bottom Gas' : `Deco Gas ${i}`}
              </Text>
              {!gas.isBottomGas && gases.length > 1 && (
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
                  style={[styles.gasInput, { color: colors.text, borderColor: colors.border }]}
                  value={String(gas.o2Percent)}
                  onChangeText={(v) => updateGas(gas.id, 'o2Percent', parseFloat(v) || 21)}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gasInputGroup}>
                <Text style={[styles.gasInputLabel, { color: colors.textSecondary }]}>He%</Text>
                <TextInput
                  style={[styles.gasInput, { color: colors.text, borderColor: colors.border }]}
                  value={String(gas.hePercent)}
                  onChangeText={(v) => updateGas(gas.id, 'hePercent', parseFloat(v) || 0)}
                  keyboardType="numeric"
                />
              </View>
              {!gas.isBottomGas && (
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
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {CYLINDER_PRESETS.map(preset => (
                      <TouchableOpacity
                        key={preset.label}
                        style={[
                          styles.cylinderDropdownItem,
                          { borderBottomColor: colors.border },
                          Math.abs(preset.volumeL - gas.cylinderVolume) < 0.5 && Math.abs(preset.fillBar - gas.fillPressure) < 10 &&
                            { backgroundColor: colors.primary + '15' }
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
                      </TouchableOpacity>
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
                      // Convert cu ft to liters (cu ft = L * bar / 28.3)
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
      })}
      <TouchableOpacity onPress={addGas} style={[styles.addGasButton, { borderColor: colors.primary }]}>
        <Feather name="plus" size={16} color={colors.primary} />
        <Text style={[styles.addGasText, { color: colors.primary }]}>Add Deco Gas</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSettingsTab = () => (
    <>
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Circuit & Model</Text>
        
        {renderPicker('Circuit Type', [
          { value: 'open', label: 'Open Circuit' },
          { value: 'ccr', label: 'CCR' },
        ], settings.circuit, (v) => setSettings({ ...settings, circuit: v as CircuitType }))}

        {settings.circuit === 'ccr' && (
          <>
            {renderSlider('CCR Setpoint', settings.ccrSetpoint, 0.7, 1.6, 0.1, 
              (v) => setSettings({ ...settings, ccrSetpoint: Math.round(v * 10) / 10 }), ' bar')}
            {renderSlider('Scrubber Duration', settings.scrubberDuration, 60, 300, 30,
              (v) => setSettings({ ...settings, scrubberDuration: v }), ' min')}
          </>
        )}

        <View style={styles.modelPicker}>
          <Text style={[styles.pickerLabel, { color: colors.text }]}>Deco Model</Text>
          {DECO_MODELS.map(model => (
            <TouchableOpacity
              key={model.value}
              style={[
                styles.modelOption,
                { borderColor: colors.border },
                settings.decoModel === model.value && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
              ]}
              onPress={() => setSettings({ ...settings, decoModel: model.value })}
            >
              <View style={styles.modelOptionHeader}>
                <View style={[
                  styles.modelRadio,
                  { borderColor: settings.decoModel === model.value ? colors.primary : colors.border }
                ]}>
                  {settings.decoModel === model.value && (
                    <View style={[styles.modelRadioInner, { backgroundColor: colors.primary }]} />
                  )}
                </View>
                <Text style={[styles.modelLabel, { color: colors.text }]}>{model.label}</Text>
              </View>
              <Text style={[styles.modelDesc, { color: colors.textSecondary }]}>{model.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Rates & Depths</Text>
        
        {renderSlider('Descent Rate', settings.descentRate, 5, 30, 1, 
          (v) => setSettings({ ...settings, descentRate: v }), ` ${rateUnit}`)}
        {renderSlider('Ascent Rate', settings.ascentRate, 3, 18, 1, 
          (v) => setSettings({ ...settings, ascentRate: v }), ` ${rateUnit}`)}
        {renderSlider('Last Stop Depth', settings.lastStopDepth, 3, 6, 3, 
          (v) => setSettings({ ...settings, lastStopDepth: v }), depthUnit)}
        {renderSlider('Gas Switch Time', settings.gasSwitchTime, 0, 5, 1, 
          (v) => setSettings({ ...settings, gasSwitchTime: v }), ' min')}
      </View>

      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Gas Consumption</Text>
        
        {renderSlider('SAC Rate (Bottom)', settings.sacRateBottom, 10, 30, 1, 
          (v) => setSettings({ ...settings, sacRateBottom: v }), ' L/min')}
        {renderSlider('SAC Rate (Deco)', settings.sacRateDeco, 8, 25, 1, 
          (v) => setSettings({ ...settings, sacRateDeco: v }), ' L/min')}
      </View>

      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.settingsSectionTitle, { color: colors.text }]}>Environment & Units</Text>
        
        {renderPicker('Water Type', [
          { value: 'salt', label: 'Salt Water' },
          { value: 'fresh', label: 'Fresh Water' },
        ], settings.waterType, (v) => setSettings({ ...settings, waterType: v as WaterType }))}

        {renderPicker('Units', [
          { value: 'metric', label: 'Metric (m)' },
          { value: 'imperial', label: 'Imperial (ft)' },
        ], settings.units, (v) => setSettings({ ...settings, units: v as UnitSystem }))}

        {renderToggle('O2 is Narcotic', settings.o2Narcotic, 
          (v) => setSettings({ ...settings, o2Narcotic: v }),
          'Include O2 in END calculation'
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Dive Planning</Text>
        <View style={{ width: 40 }} />
      </View>

      {renderTabBar()}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'plan' && renderPlanTab()}
        {activeTab === 'gases' && renderGasesTab()}
        {activeTab === 'settings' && renderSettingsTab()}
        <View style={{ height: 40 }} />
      </ScrollView>

      {renderScrubberModal()}
    </SafeAreaView>
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
  backButton: { padding: 8 },
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
});
