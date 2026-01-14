import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  useColorScheme, Dimensions, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Svg, { Path, Line, Text as SvgText, Rect, G, Circle } from 'react-native-svg';
import {
  calculateDivePlan, calculateMultiDivePlan, createGasMix, initializeTissues,
  DEFAULT_SETTINGS, GasMix, DivePlanResult, TissueState, DivePlanInput, DivePlanSettings
} from '../../services/divePlanner';

const { width: screenWidth } = Dimensions.get('window');
const CHART_WIDTH = screenWidth - 48;
const CHART_HEIGHT = 200;
const TISSUE_CHART_HEIGHT = 120;

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
}

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
  };

  const [dives, setDives] = useState<DiveEntry[]>([
    { id: '1', depth: 30, bottomTime: 25, surfaceInterval: 0 }
  ]);

  const [gases, setGases] = useState<GasEntry[]>([
    { id: '1', name: 'Air', o2Percent: 21, hePercent: 0, switchDepth: null, isBottomGas: true },
  ]);

  const [settings, setSettings] = useState<DivePlanSettings>({
    ...DEFAULT_SETTINGS,
    gfLow: 30,
    gfHigh: 70,
  });

  const [showSettings, setShowSettings] = useState(true);
  const [showGases, setShowGases] = useState(false);
  const [selectedDiveIndex, setSelectedDiveIndex] = useState(0);

  const gasMixes = useMemo(() => {
    return gases.map(g => {
      const mix = createGasMix(g.o2Percent, g.hePercent, g.name);
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
    setGases([...gases, { id: newId, name: '', o2Percent: 50, hePercent: 0, switchDepth: 21, isBottomGas: false }]);
  };

  const removeGas = (id: string) => {
    if (gases.length <= 1) return;
    setGases(gases.filter(g => g.id !== id));
  };

  const updateGas = (id: string, field: keyof GasEntry, value: any) => {
    setGases(gases.map(g => g.id === id ? { ...g, [field]: value } : g));
  };

  const renderDiveProfileChart = () => {
    if (!currentResult || currentResult.segments.length === 0) {
      return (
        <View style={[styles.chartContainer, { backgroundColor: colors.card }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>Dive Profile</Text>
          <View style={styles.emptyChart}>
            <Text style={{ color: colors.textSecondary }}>Configure dive parameters to see profile</Text>
          </View>
        </View>
      );
    }

    const maxDepth = currentResult.maxDepth;
    const totalTime = currentResult.totalRunTime;
    const padding = { top: 30, right: 20, bottom: 30, left: 50 };
    const chartW = CHART_WIDTH - padding.left - padding.right;
    const chartH = CHART_HEIGHT - padding.top - padding.bottom;

    let pathD = '';
    let currentTime = 0;

    currentResult.segments.forEach((seg, i) => {
      const x1 = (currentTime / totalTime) * chartW;
      const y1 = (seg.startDepth / maxDepth) * chartH;
      const x2 = ((currentTime + seg.duration) / totalTime) * chartW;
      const y2 = (seg.endDepth / maxDepth) * chartH;

      if (i === 0) {
        pathD += `M ${x1} ${y1}`;
      }
      pathD += ` L ${x2} ${y2}`;
      currentTime += seg.duration;
    });

    const decoStopMarkers = currentResult.decoStops.map((stop, i) => {
      const segTime = currentResult.segments.find(s => s.type === 'deco_stop' && s.startDepth === stop.depth);
      if (!segTime) return null;
      const idx = currentResult.segments.indexOf(segTime);
      let time = 0;
      for (let j = 0; j < idx; j++) {
        time += currentResult.segments[j].duration;
      }
      const x = (time / totalTime) * chartW + padding.left;
      const y = (stop.depth / maxDepth) * chartH + padding.top;
      return (
        <Circle key={i} cx={x} cy={y} r={4} fill={colors.warning} />
      );
    });

    const depthLabels = [0, maxDepth / 2, maxDepth].map((d, i) => (
      <SvgText
        key={i}
        x={padding.left - 10}
        y={padding.top + (d / maxDepth) * chartH + 4}
        fontSize={10}
        fill={colors.textSecondary}
        textAnchor="end"
      >
        {Math.round(d)}m
      </SvgText>
    ));

    const timeLabels = [0, totalTime / 2, totalTime].map((t, i) => (
      <SvgText
        key={i}
        x={padding.left + (t / totalTime) * chartW}
        y={CHART_HEIGHT - 5}
        fontSize={10}
        fill={colors.textSecondary}
        textAnchor="middle"
      >
        {Math.round(t)}min
      </SvgText>
    ));

    return (
      <View style={[styles.chartContainer, { backgroundColor: colors.card }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>Dive Profile</Text>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <Rect x={padding.left} y={padding.top} width={chartW} height={chartH} fill={isDark ? '#2C2C2E' : '#E5E5EA'} />
          <G transform={`translate(${padding.left}, ${padding.top})`}>
            <Path d={pathD} stroke={colors.primary} strokeWidth={2} fill="none" />
          </G>
          {decoStopMarkers}
          {depthLabels}
          {timeLabels}
          <Line x1={padding.left} y1={padding.top} x2={padding.left} y2={CHART_HEIGHT - padding.bottom} stroke={colors.border} strokeWidth={1} />
          <Line x1={padding.left} y1={CHART_HEIGHT - padding.bottom} x2={CHART_WIDTH - padding.right} y2={CHART_HEIGHT - padding.bottom} stroke={colors.border} strokeWidth={1} />
        </Svg>
      </View>
    );
  };

  const renderTissueChart = () => {
    if (!currentResult || currentResult.tissueHistory.length === 0) {
      return null;
    }

    const finalTissues = currentResult.tissueHistory[currentResult.tissueHistory.length - 1];
    const padding = { top: 20, right: 20, bottom: 30, left: 30 };
    const chartW = CHART_WIDTH - padding.left - padding.right;
    const chartH = TISSUE_CHART_HEIGHT - padding.top - padding.bottom;
    const barWidth = chartW / 16 - 4;

    const maxInert = Math.max(...finalTissues.map(t => t.ppInert), 1);

    const bars = finalTissues.map((tissue, i) => {
      const height = (tissue.ppInert / maxInert) * chartH;
      const x = padding.left + i * (barWidth + 4);
      const y = padding.top + chartH - height;
      const percent = tissue.percentMValue;
      let fillColor = colors.success;
      if (percent > 80) fillColor = colors.primary;
      else if (percent > 60) fillColor = colors.warning;
      else if (percent > 40) fillColor = colors.accent;

      return (
        <Rect key={i} x={x} y={y} width={barWidth} height={height} fill={fillColor} rx={2} />
      );
    });

    const compLabels = [1, 4, 8, 12, 16].map(c => (
      <SvgText
        key={c}
        x={padding.left + (c - 1) * (barWidth + 4) + barWidth / 2}
        y={TISSUE_CHART_HEIGHT - 5}
        fontSize={8}
        fill={colors.textSecondary}
        textAnchor="middle"
      >
        {c}
      </SvgText>
    ));

    return (
      <View style={[styles.chartContainer, { backgroundColor: colors.card }]}>
        <Text style={[styles.chartTitle, { color: colors.text }]}>Tissue Loading (16 Compartments)</Text>
        <Svg width={CHART_WIDTH} height={TISSUE_CHART_HEIGHT}>
          {bars}
          {compLabels}
        </Svg>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>{'<40%'}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>40-60%</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>60-80%</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>{'>80%'}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSummary = () => {
    if (!currentResult) return null;

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
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Max Depth (m)</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: currentResult.ndl !== null ? colors.success : colors.textSecondary }]}>
              {currentResult.ndl !== null ? currentResult.ndl : 'N/A'}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>NDL (min)</Text>
          </View>
        </View>

        {currentResult.decoStops.length > 0 && (
          <View style={styles.decoStopsContainer}>
            <Text style={[styles.decoStopsTitle, { color: colors.text }]}>Decompression Stops</Text>
            {currentResult.decoStops.map((stop, i) => (
              <View key={i} style={styles.decoStopRow}>
                <Text style={[styles.decoStopDepth, { color: colors.text }]}>{stop.depth}m</Text>
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Dive Planning</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
                  <Text style={[styles.inputUnit, { color: colors.textSecondary }]}>m</Text>
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

        <TouchableOpacity
          style={[styles.collapseHeader, { backgroundColor: colors.card }]}
          onPress={() => setShowSettings(!showSettings)}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>
          <Feather name={showSettings ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text} />
        </TouchableOpacity>

        {showSettings && (
          <View style={[styles.section, { backgroundColor: colors.card, marginTop: 0, borderTopWidth: 0 }]}>
            {renderSlider('GF Low', settings.gfLow, 10, 100, 5, (v) => setSettings({ ...settings, gfLow: v }), '%')}
            {renderSlider('GF High', settings.gfHigh, 10, 100, 5, (v) => setSettings({ ...settings, gfHigh: v }), '%')}
            {renderSlider('Descent Rate', settings.descentRate, 5, 30, 1, (v) => setSettings({ ...settings, descentRate: v }), ' m/min')}
            {renderSlider('Ascent Rate', settings.ascentRate, 3, 18, 1, (v) => setSettings({ ...settings, ascentRate: v }), ' m/min')}
            {renderSlider('Last Stop', settings.lastStopDepth, 3, 6, 3, (v) => setSettings({ ...settings, lastStopDepth: v }), 'm')}
          </View>
        )}

        <TouchableOpacity
          style={[styles.collapseHeader, { backgroundColor: colors.card }]}
          onPress={() => setShowGases(!showGases)}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Gas Mixes ({gases.length})</Text>
          <Feather name={showGases ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text} />
        </TouchableOpacity>

        {showGases && (
          <View style={[styles.section, { backgroundColor: colors.card, marginTop: 0, borderTopWidth: 0 }]}>
            {gases.map((gas, i) => (
              <View key={gas.id} style={[styles.gasCard, { borderColor: colors.border }]}>
                <View style={styles.gasHeader}>
                  <Text style={[styles.gasIndex, { color: colors.primary }]}>Gas {i + 1}</Text>
                  {!gas.isBottomGas && gases.length > 1 && (
                    <TouchableOpacity onPress={() => removeGas(gas.id)}>
                      <Feather name="x" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
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
                        placeholder="m"
                        placeholderTextColor={colors.textSecondary}
                      />
                    </View>
                  )}
                </View>
                <Text style={[styles.gasMod, { color: colors.textSecondary }]}>
                  MOD: {Math.floor(((1.4 / (gas.o2Percent / 100)) - 1) * 10)}m (1.4) / {Math.floor(((1.6 / (gas.o2Percent / 100)) - 1) * 10)}m (1.6)
                </Text>
              </View>
            ))}
            <TouchableOpacity onPress={addGas} style={[styles.addGasButton, { borderColor: colors.primary }]}>
              <Feather name="plus" size={16} color={colors.primary} />
              <Text style={[styles.addGasText, { color: colors.primary }]}>Add Deco Gas</Text>
            </TouchableOpacity>
          </View>
        )}

        {renderDiveProfileChart()}
        {renderTissueChart()}
        {renderSummary()}

        <View style={{ height: 40 }} />
      </ScrollView>
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
  collapseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 0,
  },
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
  chartContainer: { borderRadius: 12, padding: 16, marginBottom: 16 },
  chartTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  emptyChart: {
    height: CHART_HEIGHT - 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 10 },
  summaryContainer: { borderRadius: 12, padding: 16, marginBottom: 16 },
  summaryTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  summaryItem: { width: '50%', marginBottom: 16 },
  summaryValue: { fontSize: 24, fontWeight: '700' },
  summaryLabel: { fontSize: 12, marginTop: 2 },
  decoStopsContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  decoStopsTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  decoStopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 16 },
  decoStopDepth: { fontSize: 14, fontWeight: '500', width: 40 },
  decoStopDuration: { fontSize: 14, fontWeight: '600' },
  decoStopGas: { fontSize: 12, flex: 1 },
  warningsContainer: { marginTop: 16 },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, marginBottom: 8 },
  warningText: { fontSize: 12, flex: 1 },
});
