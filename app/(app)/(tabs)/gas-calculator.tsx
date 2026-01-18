import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import {
  CYLINDER_CATALOG, Cylinder, getCylindersByMaterial, CylinderMaterial
} from '@/services/cylinderCatalog';
import {
  calculateGasDensity, calculateFillCapacity, calculateTrimixBlend,
  calculateTrimixBlendRealGas, calculateBestMix, calculateMOD, calculateEND, getMixName
} from '@/services/gasMath';
import { useSettings } from '@/contexts/SettingsContext';
import { useTheme } from '@/contexts/ThemeContext';
import PageHeader from '@/components/PageHeader';

type TabType = 'gases' | 'density' | 'fill' | 'mix' | 'bestmix';

export default function GasCalculatorScreen() {
  const { isDark } = useTheme();
  const navigation = useNavigation();
  const { units, getVolumeUnit, getPressureUnit, getDepthUnit, formatVolume, formatPressure, formatDepth } = useSettings();

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

  const [activeTab, setActiveTab] = useState<TabType>('gases');
  const [showCylinderPicker, setShowCylinderPicker] = useState(false);
  const [showCylinderRefPicker, setShowCylinderRefPicker] = useState(false);
  const [selectedCylinder, setSelectedCylinder] = useState<Cylinder>(CYLINDER_CATALOG.find(c => c.id === 'al80') || CYLINDER_CATALOG[0]);
  const [selectedRefCylinder, setSelectedRefCylinder] = useState<Cylinder>(CYLINDER_CATALOG.find(c => c.id === 'al80') || CYLINDER_CATALOG[0]);
  const [materialFilter, setMaterialFilter] = useState<CylinderMaterial | 'all'>('all');
  
  const [selectedO2, setSelectedO2] = useState('21');
  const [selectedHe, setSelectedHe] = useState('0');
  const [customMixName, setCustomMixName] = useState('');

  const STANDARD_MIXES = [
    { name: 'Air', o2: 21, he: 0 },
    { name: 'EAN28', o2: 28, he: 0 },
    { name: 'EAN30', o2: 30, he: 0 },
    { name: 'EAN32', o2: 32, he: 0 },
    { name: 'EAN34', o2: 34, he: 0 },
    { name: 'EAN36', o2: 36, he: 0 },
    { name: 'EAN40', o2: 40, he: 0 },
    { name: 'EAN50', o2: 50, he: 0 },
    { name: 'EAN80', o2: 80, he: 0 },
    { name: 'Oxygen', o2: 100, he: 0 },
    { name: 'Tx21/35', o2: 21, he: 35 },
    { name: 'Tx18/45', o2: 18, he: 45 },
    { name: 'Tx15/55', o2: 15, he: 55 },
    { name: 'Tx12/60', o2: 12, he: 60 },
    { name: 'Tx10/70', o2: 10, he: 70 },
    { name: 'Heliox 21/79', o2: 21, he: 79 },
  ];

  const [densityO2, setDensityO2] = useState('21');
  const [densityHe, setDensityHe] = useState('0');
  const [densityDepth, setDensityDepth] = useState('30');

  const [fillPressure, setFillPressure] = useState('200');
  const [fillReserve, setFillReserve] = useState('50');
  const [fillSac, setFillSac] = useState('20');

  const [mixTargetO2, setMixTargetO2] = useState('21');
  const [mixTargetHe, setMixTargetHe] = useState('35');
  const [mixFinalPressure, setMixFinalPressure] = useState('200');
  const [mixHasResidual, setMixHasResidual] = useState(false);
  const [mixResidualPressure, setMixResidualPressure] = useState('50');
  const [mixResidualO2, setMixResidualO2] = useState('21');
  const [mixResidualHe, setMixResidualHe] = useState('0');
  const [mixUseAir, setMixUseAir] = useState(true);
  const [mixNitroxO2, setMixNitroxO2] = useState('32');
  const [mixUseRealGas, setMixUseRealGas] = useState(true);
  const [mixTempCelsius, setMixTempCelsius] = useState('20');

  const [bestmixDepth, setBestmixDepth] = useState('40');
  const [bestmixPpo2, setBestmixPpo2] = useState('1.4');
  const [bestmixTargetEnd, setBestmixTargetEnd] = useState('30');
  const [bestmixO2Narcotic, setBestmixO2Narcotic] = useState(false);

  const filteredCylinders = useMemo(() => {
    if (materialFilter === 'all') return CYLINDER_CATALOG.filter(c => c.id !== 'custom');
    return getCylindersByMaterial(materialFilter).filter(c => c.id !== 'custom');
  }, [materialFilter]);

  const densityResult = useMemo(() => {
    return calculateGasDensity(
      { o2Percent: parseFloat(densityO2) || 21, hePercent: parseFloat(densityHe) || 0 },
      parseFloat(densityDepth) || 0
    );
  }, [densityO2, densityHe, densityDepth]);

  const fillResult = useMemo(() => {
    return calculateFillCapacity(
      selectedCylinder.volumeL,
      parseFloat(fillPressure) || 0,
      parseFloat(fillReserve) || 0,
      parseFloat(fillSac) || 20
    );
  }, [selectedCylinder, fillPressure, fillReserve, fillSac]);

  const mixResult = useMemo(() => {
    if (mixUseRealGas) {
      return calculateTrimixBlendRealGas(
        parseFloat(mixTargetO2) || 21,
        parseFloat(mixTargetHe) || 0,
        parseFloat(mixFinalPressure) || 200,
        mixHasResidual ? parseFloat(mixResidualPressure) || 0 : 0,
        mixHasResidual ? parseFloat(mixResidualO2) || 21 : 21,
        mixHasResidual ? parseFloat(mixResidualHe) || 0 : 0,
        mixUseAir,
        parseFloat(mixNitroxO2) || 32,
        parseFloat(mixTempCelsius) || 20
      );
    }
    return {
      ...calculateTrimixBlend(
        parseFloat(mixTargetO2) || 21,
        parseFloat(mixTargetHe) || 0,
        parseFloat(mixFinalPressure) || 200,
        mixHasResidual ? parseFloat(mixResidualPressure) || 0 : 0,
        mixHasResidual ? parseFloat(mixResidualO2) || 21 : 21,
        mixHasResidual ? parseFloat(mixResidualHe) || 0 : 0,
        mixUseAir,
        parseFloat(mixNitroxO2) || 32
      ),
      zFactorFinal: 1,
      tempCelsius: parseFloat(mixTempCelsius) || 20,
    };
  }, [mixTargetO2, mixTargetHe, mixFinalPressure, mixHasResidual, mixResidualPressure, mixResidualO2, mixResidualHe, mixUseAir, mixNitroxO2, mixUseRealGas, mixTempCelsius]);

  const bestmixResult = useMemo(() => {
    const depth = parseFloat(bestmixDepth) || 40;
    const targetEnd = parseFloat(bestmixTargetEnd);
    return calculateBestMix(
      depth,
      parseFloat(bestmixPpo2) || 1.4,
      isNaN(targetEnd) ? null : targetEnd,
      bestmixO2Narcotic
    );
  }, [bestmixDepth, bestmixPpo2, bestmixTargetEnd, bestmixO2Narcotic]);

  const renderTabBar = () => (
    <View style={[styles.tabBarContainer, { backgroundColor: colors.card }]}>
      <View style={styles.tabRow}>
        {(['gases', 'density', 'fill'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, styles.tabFlex, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
              {tab === 'gases' ? 'Cylinders' : tab === 'density' ? 'Density' : 'Fill'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.tabRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
        {(['mix', 'bestmix'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, styles.tabFlex, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
              {tab === 'mix' ? 'Mix' : 'Best Mix'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderInput = (label: string, value: string, onChangeText: (text: string) => void, unit: string = '', keyboardType: 'numeric' | 'default' = 'numeric') => (
    <View style={styles.inputRow}>
      <Text style={[styles.inputLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholderTextColor={colors.textSecondary}
        />
        {unit ? <Text style={[styles.unitText, { color: colors.textSecondary }]}>{unit}</Text> : null}
      </View>
    </View>
  );

  const renderResultRow = (label: string, value: string, warning?: boolean) => (
    <View style={styles.resultRow}>
      <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.resultValue, { color: warning ? colors.danger : colors.text }]}>{value}</Text>
    </View>
  );

  const applyMixToCalculators = (o2: number, he: number) => {
    setSelectedO2(String(o2));
    setSelectedHe(String(he));
    setDensityO2(String(o2));
    setDensityHe(String(he));
  };

  const currentMixMOD = calculateMOD(parseFloat(selectedO2) || 21, 1.4);
  const currentMixName = getMixName(parseFloat(selectedO2) || 21, parseFloat(selectedHe) || 0);

  const renderGasesTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Current Configuration</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Select cylinder and gas mix for calculations</Text>

      <View style={[styles.configCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
        <View style={styles.configHeader}>
          <Text style={[styles.configTitle, { color: colors.primary }]}>{currentMixName}</Text>
          <Text style={[styles.configMod, { color: colors.textSecondary }]}>MOD: {currentMixMOD}m</Text>
        </View>
        
        <TouchableOpacity
          style={[styles.configRow, { borderColor: colors.border }]}
          onPress={() => setShowCylinderPicker(true)}
        >
          <Text style={[styles.configLabel, { color: colors.textSecondary }]}>Cylinder</Text>
          <View style={styles.configValue}>
            <Text style={[styles.configValueText, { color: colors.text }]}>{selectedCylinder.label}</Text>
            <Feather name="chevron-right" size={18} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        <View style={styles.configMixRow}>
          <View style={styles.configMixInput}>
            <Text style={[styles.configLabel, { color: colors.textSecondary }]}>O2 %</Text>
            <TextInput
              style={[styles.mixInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              value={selectedO2}
              onChangeText={(val) => {
                setSelectedO2(val);
                setDensityO2(val);
              }}
              keyboardType="numeric"
              maxLength={3}
            />
          </View>
          <View style={styles.configMixInput}>
            <Text style={[styles.configLabel, { color: colors.textSecondary }]}>He %</Text>
            <TextInput
              style={[styles.mixInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              value={selectedHe}
              onChangeText={(val) => {
                setSelectedHe(val);
                setDensityHe(val);
              }}
              keyboardType="numeric"
              maxLength={3}
            />
          </View>
          <View style={styles.configMixInput}>
            <Text style={[styles.configLabel, { color: colors.textSecondary }]}>N2 %</Text>
            <View style={[styles.mixInput, styles.mixInputDisabled, { backgroundColor: colors.border }]}>
              <Text style={[styles.mixInputText, { color: colors.textSecondary }]}>
                {Math.max(0, 100 - (parseFloat(selectedO2) || 0) - (parseFloat(selectedHe) || 0))}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Standard Mixes</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Tap to apply</Text>

      <Text style={[styles.mixCategoryLabel, { color: colors.textSecondary }]}>Nitrox</Text>
      <View style={styles.mixGrid}>
        {STANDARD_MIXES.filter(m => m.he === 0 && m.o2 <= 40).map((mix) => (
          <TouchableOpacity
            key={mix.name}
            style={[styles.mixChip, { 
              backgroundColor: (parseFloat(selectedO2) === mix.o2 && parseFloat(selectedHe) === mix.he) ? colors.primary : colors.card 
            }]}
            onPress={() => applyMixToCalculators(mix.o2, mix.he)}
          >
            <Text style={[styles.mixChipText, { 
              color: (parseFloat(selectedO2) === mix.o2 && parseFloat(selectedHe) === mix.he) ? '#FFF' : colors.text 
            }]}>{mix.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.mixCategoryLabel, { color: colors.textSecondary }]}>Deco Gases</Text>
      <View style={styles.mixGrid}>
        {STANDARD_MIXES.filter(m => m.he === 0 && m.o2 > 40).map((mix) => (
          <TouchableOpacity
            key={mix.name}
            style={[styles.mixChip, { 
              backgroundColor: (parseFloat(selectedO2) === mix.o2 && parseFloat(selectedHe) === mix.he) ? colors.primary : colors.card 
            }]}
            onPress={() => applyMixToCalculators(mix.o2, mix.he)}
          >
            <Text style={[styles.mixChipText, { 
              color: (parseFloat(selectedO2) === mix.o2 && parseFloat(selectedHe) === mix.he) ? '#FFF' : colors.text 
            }]}>{mix.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.mixCategoryLabel, { color: colors.textSecondary }]}>Trimix / Heliox</Text>
      <View style={styles.mixGrid}>
        {STANDARD_MIXES.filter(m => m.he > 0).map((mix) => (
          <TouchableOpacity
            key={mix.name}
            style={[styles.mixChip, { 
              backgroundColor: (parseFloat(selectedO2) === mix.o2 && parseFloat(selectedHe) === mix.he) ? colors.primary : colors.card 
            }]}
            onPress={() => applyMixToCalculators(mix.o2, mix.he)}
          >
            <Text style={[styles.mixChipText, { 
              color: (parseFloat(selectedO2) === mix.o2 && parseFloat(selectedHe) === mix.he) ? '#FFF' : colors.text 
            }]}>{mix.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Cylinder Reference</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Select a cylinder to view specs</Text>

      <View style={styles.filterRow}>
        {(['all', 'steel', 'aluminum'] as const).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterChip, { backgroundColor: materialFilter === filter ? colors.primary : colors.card }]}
            onPress={() => setMaterialFilter(filter)}
          >
            <Text style={[styles.filterChipText, { color: materialFilter === filter ? '#FFF' : colors.text }]}>
              {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.dropdownButton, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => setShowCylinderRefPicker(true)}
      >
        <Text style={[styles.dropdownButtonText, { color: colors.text }]}>{selectedRefCylinder.label}</Text>
        <Feather name="chevron-down" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={[styles.resultsCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
        <Text style={[styles.resultsTitle, { color: colors.text }]}>Cylinder Specifications</Text>
        {renderResultRow('Volume', `${selectedRefCylinder.volumeL} L`)}
        {renderResultRow('Working Pressure', units === 'imperial' ? `${Math.round(selectedRefCylinder.workingPressureBar * 14.5038)} psi` : `${selectedRefCylinder.workingPressureBar} bar`)}
        {renderResultRow('Capacity', units === 'imperial' ? `${selectedRefCylinder.volumeCuft} cuft` : `${(selectedRefCylinder.volumeL * selectedRefCylinder.workingPressureBar).toFixed(0)} L`)}
        {renderResultRow('Material', selectedRefCylinder.material.charAt(0).toUpperCase() + selectedRefCylinder.material.slice(1))}
      </View>
    </ScrollView>
  );

  const renderDensityTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Gas Density Calculator</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Calculate breathing gas density at depth</Text>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {renderInput('O2 %', densityO2, setDensityO2, '%')}
        {renderInput('He %', densityHe, setDensityHe, '%')}
        {renderInput('Depth', densityDepth, setDensityDepth, getDepthUnit())}
      </View>

      <View style={[styles.resultsCard, { backgroundColor: colors.card, borderColor: densityResult.isHighDensity ? colors.danger : colors.success }]}>
        <Text style={[styles.resultsTitle, { color: colors.text }]}>Results</Text>
        {renderResultRow('Surface Density', `${densityResult.surfaceDensity.toFixed(3)} g/L`)}
        {renderResultRow('Depth Density', `${densityResult.depthDensity.toFixed(3)} g/L`, densityResult.isHighDensity)}
        {renderResultRow('Mix', getMixName(parseFloat(densityO2) || 21, parseFloat(densityHe) || 0))}
        {renderResultRow('MOD (1.4 PPO2)', units === 'imperial' ? `${Math.round(calculateMOD(parseFloat(densityO2) || 21, 1.4) * 3.28084)} ft` : `${calculateMOD(parseFloat(densityO2) || 21, 1.4)} m`)}
        
        {densityResult.warningMessage && (
          <View style={[styles.warningBox, { backgroundColor: colors.danger + '20' }]}>
            <Feather name="alert-triangle" size={16} color={colors.danger} />
            <Text style={[styles.warningText, { color: colors.danger }]}>{densityResult.warningMessage}</Text>
          </View>
        )}

        <View style={[styles.densityBar, { backgroundColor: colors.border }]}>
          <View style={[styles.densityFill, { 
            width: `${Math.min(100, (densityResult.depthDensity / 8) * 100)}%`,
            backgroundColor: densityResult.depthDensity > 6.2 ? colors.danger : densityResult.depthDensity > 5.7 ? colors.warning : colors.success
          }]} />
          <View style={[styles.densityMarker, { left: '65%' }]} />
          <View style={[styles.densityMarker, { left: '77.5%' }]} />
        </View>
        <Text style={[styles.densityScale, { color: colors.textSecondary }]}>0 -------- 5.2 ---- 6.2 -------- 8</Text>
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.infoTitle, { color: colors.text }]}>Gas Density Thresholds</Text>
        <View style={styles.infoRow}>
          <View style={[styles.infoDot, { backgroundColor: colors.success }]} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>Ideal Maximum: 5.2 g/L</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>Considered safe and optimal for minimizing work of breathing and physiological risks.</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <View style={[styles.infoDot, { backgroundColor: colors.danger }]} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>Hard Maximum: 6.2 g/L</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>Absolute upper limit. Exceeding this significantly increases risk of CO2 retention, oxygen toxicity, inert gas narcosis, decompression illness, and immersion pulmonary edema.</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderFillTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Fill Capacity Calculator</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Calculate gas volume and dive time for {selectedCylinder.label}</Text>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={styles.cylinderSelector}
          onPress={() => setShowCylinderPicker(true)}
        >
          <Text style={[styles.inputLabel, { color: colors.text }]}>Cylinder</Text>
          <View style={[styles.cylinderSelectorValue, { backgroundColor: colors.border }]}>
            <Text style={[styles.cylinderLabel, { color: colors.text }]}>{selectedCylinder.label}</Text>
            <Feather name="chevron-down" size={20} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
        {renderInput('Fill Pressure', fillPressure, setFillPressure, getPressureUnit())}
        {renderInput('Reserve Pressure', fillReserve, setFillReserve, getPressureUnit())}
        {renderInput('SAC Rate', fillSac, setFillSac, 'L/min')}
      </View>

      <View style={[styles.resultsCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.resultsTitle, { color: colors.text }]}>Results</Text>
        {renderResultRow('Cylinder Volume', units === 'imperial' ? `${selectedCylinder.volumeCuft} cuft` : `${selectedCylinder.volumeL} L`)}
        {renderResultRow('Total Gas', units === 'imperial' ? `${fillResult.totalGasCuft.toFixed(0)} cuft` : `${fillResult.totalGasLiters.toFixed(0)} L`)}
        {renderResultRow('Usable Gas', units === 'imperial' ? `${fillResult.usableGasCuft.toFixed(0)} cuft` : `${fillResult.usableGasLiters.toFixed(0)} L`)}
        {renderResultRow('Surface Time @ SAC', `${fillResult.bottomTimeMinutes.toFixed(0)} min`)}
      </View>
    </ScrollView>
  );

  const renderMixTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Gas Blending Calculator</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Calculate blending sequence for any gas mix</Text>

      <View style={[styles.warningCard, { backgroundColor: '#FFF3CD', borderColor: '#856404' }]}>
        <View style={styles.warningHeader}>
          <Feather name="alert-triangle" size={18} color="#856404" />
          <Text style={[styles.warningTitle, { color: '#856404' }]}>Oxygen Safety Warning</Text>
        </View>
        <Text style={[styles.warningText, { color: '#664D03' }]}>
          Gas blending with pure oxygen requires specialized training, oxygen-clean equipment, and proper safety procedures. High-pressure oxygen is extremely hazardous and can cause fires or explosions if handled improperly. Only qualified gas blenders should perform these operations.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Target Mix</Text>
        {renderInput('Target O2 %', mixTargetO2, setMixTargetO2, '%')}
        {renderInput('Target He %', mixTargetHe, setMixTargetHe, '%')}
        <View style={styles.inputRow}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>N2 % (auto)</Text>
          <View style={[styles.mixInputAuto, { backgroundColor: colors.border }]}>
            <Text style={[styles.mixInputAutoText, { color: colors.text }]}>
              {Math.max(0, 100 - (parseFloat(mixTargetO2) || 0) - (parseFloat(mixTargetHe) || 0))}%
            </Text>
          </View>
        </View>
        {renderInput('Final Pressure', mixFinalPressure, setMixFinalPressure, getPressureUnit())}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.switchRow}>
          <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>Residual Gas in Cylinder</Text>
          <TouchableOpacity
            style={[styles.toggle, mixHasResidual && { backgroundColor: colors.primary }]}
            onPress={() => setMixHasResidual(!mixHasResidual)}
          >
            <Text style={{ color: '#FFF' }}>{mixHasResidual ? 'Yes' : 'No'}</Text>
          </TouchableOpacity>
        </View>
        {mixHasResidual && (
          <View style={{ marginTop: 12 }}>
            {renderInput('Residual Pressure', mixResidualPressure, setMixResidualPressure, getPressureUnit())}
            {renderInput('Residual O2 %', mixResidualO2, setMixResidualO2, '%')}
            {renderInput('Residual He %', mixResidualHe, setMixResidualHe, '%')}
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Top-up Gas</Text>
        <View style={styles.switchRow}>
          <Text style={[styles.inputLabel, { color: colors.text }]}>Use Air for top-up</Text>
          <TouchableOpacity
            style={[styles.toggle, mixUseAir && { backgroundColor: colors.primary }]}
            onPress={() => setMixUseAir(!mixUseAir)}
          >
            <Text style={{ color: '#FFF' }}>{mixUseAir ? 'Air' : 'Nitrox'}</Text>
          </TouchableOpacity>
        </View>
        {!mixUseAir && renderInput('Nitrox O2 %', mixNitroxO2, setMixNitroxO2, '%')}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Real Gas Correction</Text>
        <View style={styles.switchRow}>
          <Text style={[styles.inputLabel, { color: colors.text }]}>Van der Waals (Z-factor)</Text>
          <TouchableOpacity
            style={[styles.toggle, mixUseRealGas && { backgroundColor: colors.primary }]}
            onPress={() => setMixUseRealGas(!mixUseRealGas)}
          >
            <Text style={{ color: '#FFF' }}>{mixUseRealGas ? 'Real' : 'Ideal'}</Text>
          </TouchableOpacity>
        </View>
        {mixUseRealGas && renderInput('Fill Temperature', mixTempCelsius, setMixTempCelsius, '°C')}
        {mixUseRealGas && (
          <Text style={[styles.realGasNote, { color: colors.textSecondary }]}>
            Accounts for gas compressibility at high pressure
          </Text>
        )}
      </View>

      <View style={[styles.resultsCard, { backgroundColor: colors.card, borderColor: mixResult.isValid ? colors.success : colors.danger }]}>
        <Text style={[styles.resultsTitle, { color: colors.text }]}>Blending Sequence</Text>
        
        {mixHasResidual && (
          <View style={[styles.residualInfo, { backgroundColor: colors.background }]}>
            <Feather name="info" size={14} color={colors.textSecondary} />
            <Text style={[styles.residualInfoText, { color: colors.textSecondary }]}>
              Starting with {mixResidualPressure} {getPressureUnit()} of {getMixName(parseFloat(mixResidualO2) || 21, parseFloat(mixResidualHe) || 0)}
            </Text>
          </View>
        )}

        {(() => {
          const residualBar = mixHasResidual ? parseFloat(mixResidualPressure) || 0 : 0;
          const afterHeBar = residualBar + mixResult.hePressureToAdd;
          const afterO2Bar = afterHeBar + mixResult.o2PressureToAdd;
          const finalBar = parseFloat(mixFinalPressure) || 200;
          const hasHeliumStep = parseFloat(mixTargetHe) > 0 || (mixHasResidual && parseFloat(mixResidualHe) > 0);
          const PSI_PER_BAR = 14.5038;
          
          return (
            <>
              {hasHeliumStep && renderResultRow('1. Add Helium to', 
                units === 'imperial' 
                  ? `${(afterHeBar * PSI_PER_BAR).toFixed(0)} psi` 
                  : `${afterHeBar.toFixed(0)} bar`
              )}
              
              {renderResultRow(hasHeliumStep ? '2. Add Pure O2 to' : '1. Add Pure O2 to', 
                units === 'imperial' 
                  ? `${(afterO2Bar * PSI_PER_BAR).toFixed(0)} psi` 
                  : `${afterO2Bar.toFixed(0)} bar`
              )}
              
              {renderResultRow(
                `${hasHeliumStep ? '3' : '2'}. Top with ${mixUseAir ? 'Air' : 'EAN' + mixNitroxO2} to`, 
                units === 'imperial' 
                  ? `${(finalBar * PSI_PER_BAR).toFixed(0)} psi` 
                  : `${finalBar.toFixed(0)} bar`
              )}
            </>
          );
        })()}
        
        <View style={styles.divider} />
        
        <View style={styles.bigResult}>
          <Text style={[styles.bigResultText, { color: colors.primary }]}>
            {getMixName(mixResult.actualO2Percent, mixResult.actualHePercent)}
          </Text>
        </View>
        
        {renderResultRow('Final O2', `${mixResult.actualO2Percent}%`)}
        {renderResultRow('Final He', `${mixResult.actualHePercent}%`)}
        {renderResultRow('Final N2', `${100 - mixResult.actualO2Percent - mixResult.actualHePercent}%`)}
        {renderResultRow('MOD (1.4 PPO2)', units === 'imperial' 
          ? `${(calculateMOD(mixResult.actualO2Percent, 1.4) * 3.28084).toFixed(0)} ft` 
          : `${calculateMOD(mixResult.actualO2Percent, 1.4)} m`)}
        
        {mixUseRealGas && (
          <View style={[styles.zFactorInfo, { backgroundColor: colors.background }]}>
            <Text style={[styles.zFactorLabel, { color: colors.textSecondary }]}>Z-Factor (Van der Waals)</Text>
            <Text style={[styles.zFactorValue, { color: colors.accent }]}>{mixResult.zFactorFinal.toFixed(4)}</Text>
          </View>
        )}
        
        {mixResult.warningMessage && (
          <View style={[styles.warningBox, { backgroundColor: colors.danger + '20' }]}>
            <Feather name="alert-triangle" size={16} color={colors.danger} />
            <Text style={[styles.warningText, { color: colors.danger }]}>{mixResult.warningMessage}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderBestMixTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Best Mix Calculator</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Calculate optimal gas mix for a target depth</Text>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {renderInput('Target Depth', bestmixDepth, setBestmixDepth, 'm')}
        {renderInput('Max PPO2', bestmixPpo2, setBestmixPpo2, 'bar')}
        {renderInput('Target END (optional)', bestmixTargetEnd, setBestmixTargetEnd, 'm')}
        
        <View style={styles.switchRow}>
          <Text style={[styles.inputLabel, { color: colors.text }]}>O2 is Narcotic</Text>
          <TouchableOpacity
            style={[styles.toggle, bestmixO2Narcotic && { backgroundColor: colors.primary }]}
            onPress={() => setBestmixO2Narcotic(!bestmixO2Narcotic)}
          >
            <Text style={{ color: '#FFF' }}>{bestmixO2Narcotic ? 'Yes' : 'No'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.resultsCard, { backgroundColor: colors.card, borderColor: bestmixResult.isValidMix ? colors.success : colors.danger }]}>
        <Text style={[styles.resultsTitle, { color: colors.text }]}>Recommended Mix</Text>
        
        <View style={styles.bigResult}>
          <Text style={[styles.bigResultText, { color: colors.primary }]}>{bestmixResult.mixName}</Text>
        </View>
        
        {renderResultRow('O2', `${bestmixResult.o2Percent}%`)}
        {renderResultRow('He', `${bestmixResult.hePercent}%`)}
        {renderResultRow('N2', `${bestmixResult.n2Percent}%`)}
        <View style={styles.divider} />
        {renderResultRow('MOD', `${bestmixResult.mod} m`)}
        {renderResultRow('END at depth', `${bestmixResult.end} m`)}
        
        <View style={[styles.densityInfo, { backgroundColor: colors.background }]}>
          <Text style={[styles.densityInfoLabel, { color: colors.textSecondary }]}>Density at {bestmixDepth}m:</Text>
          <Text style={[styles.densityInfoValue, { 
            color: calculateGasDensity({ o2Percent: bestmixResult.o2Percent, hePercent: bestmixResult.hePercent }, parseFloat(bestmixDepth) || 0).isHighDensity ? colors.danger : colors.success 
          }]}>
            {calculateGasDensity({ o2Percent: bestmixResult.o2Percent, hePercent: bestmixResult.hePercent }, parseFloat(bestmixDepth) || 0).depthDensity.toFixed(2)} g/L
          </Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'gases': return renderGasesTab();
      case 'density': return renderDensityTab();
      case 'fill': return renderFillTab();
      case 'mix': return renderMixTab();
      case 'bestmix': return renderBestMixTab();
      default: return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PageHeader title="Gas Calculator" />

      {renderTabBar()}
      {renderContent()}

      <Modal visible={showCylinderPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Cylinder</Text>
              <TouchableOpacity onPress={() => setShowCylinderPicker(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.filterRow}>
              {(['all', 'steel', 'aluminum'] as const).map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterChip, { backgroundColor: materialFilter === filter ? colors.primary : colors.border }]}
                  onPress={() => setMaterialFilter(filter)}
                >
                  <Text style={[styles.filterChipText, { color: materialFilter === filter ? '#FFF' : colors.text }]}>
                    {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <FlatList
              data={filteredCylinders}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.cylinderOption, selectedCylinder.id === item.id && { backgroundColor: colors.primary + '20' }]}
                  onPress={() => {
                    setSelectedCylinder(item);
                    setShowCylinderPicker(false);
                  }}
                >
                  <Text style={[styles.cylinderOptionLabel, { color: colors.text }]}>{item.label}</Text>
                  <Text style={[styles.cylinderOptionDetails, { color: colors.textSecondary }]}>
                    {units === 'imperial' ? `${item.volumeCuft} cuft` : `${item.volumeL}L`} | {units === 'imperial' ? `${(item.workingPressureBar * 14.5038).toFixed(0)} psi` : `${item.workingPressureBar} bar`}
                  </Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 400 }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showCylinderRefPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Cylinder</Text>
              <TouchableOpacity onPress={() => setShowCylinderRefPicker(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={filteredCylinders}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.cylinderOption, selectedRefCylinder.id === item.id && { backgroundColor: colors.primary + '20' }]}
                  onPress={() => {
                    setSelectedRefCylinder(item);
                    setShowCylinderRefPicker(false);
                  }}
                >
                  <Text style={[styles.cylinderOptionLabel, { color: colors.text }]}>{item.label}</Text>
                  <Text style={[styles.cylinderOptionDetails, { color: colors.textSecondary }]}>
                    {units === 'imperial' ? `${item.volumeCuft} cuft` : `${item.volumeL}L`} | {units === 'imperial' ? `${(item.workingPressureBar * 14.5038).toFixed(0)} psi` : `${item.workingPressureBar} bar`}
                  </Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 400 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  tabBarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#38383A',
  },
  tabRow: {
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tabFlex: {
    flex: 1,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  configCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  configHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  configTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  configMod: {
    fontSize: 14,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  configLabel: {
    fontSize: 14,
  },
  configValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  configValueText: {
    fontSize: 16,
    fontWeight: '500',
  },
  configMixRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  configMixInput: {
    flex: 1,
  },
  mixInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  mixInputDisabled: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mixInputText: {
    fontSize: 18,
    fontWeight: '600',
  },
  mixCategoryLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 8,
  },
  mixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  mixChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#38383A',
  },
  mixChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  resultsCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    marginBottom: 16,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  inputRow: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  unitText: {
    marginLeft: 8,
    fontSize: 14,
    minWidth: 40,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  resultLabel: {
    fontSize: 14,
  },
  resultValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#38383A',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  dropdownButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  selectedCylinder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  cylinderLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  cylinderDetails: {
    fontSize: 12,
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#38383A',
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#38383A20',
  },
  tableCell: {
    fontSize: 13,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
  },
  densityBar: {
    height: 12,
    borderRadius: 6,
    marginTop: 16,
    overflow: 'hidden',
  },
  densityFill: {
    height: '100%',
    borderRadius: 6,
  },
  densityMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#FFF',
  },
  densityScale: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  infoCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  infoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#38383A',
  },
  divider: {
    height: 1,
    backgroundColor: '#38383A',
    marginVertical: 12,
  },
  bigResult: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  bigResultText: {
    fontSize: 32,
    fontWeight: '700',
  },
  densityInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  densityInfoLabel: {
    fontSize: 14,
  },
  densityInfoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  cylinderSelector: {
    marginBottom: 12,
  },
  cylinderSelectorValue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#38383A',
    borderRadius: 8,
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  cylinderOption: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  cylinderOptionLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  cylinderOptionDetails: {
    fontSize: 12,
    marginTop: 2,
  },
  mixInputAuto: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
    minWidth: 60,
  },
  mixInputAutoText: {
    fontSize: 16,
    fontWeight: '600',
  },
  residualInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  residualInfoText: {
    fontSize: 13,
    flex: 1,
  },
  realGasNote: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  zFactorInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  zFactorLabel: {
    fontSize: 13,
  },
  zFactorValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  warningCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
