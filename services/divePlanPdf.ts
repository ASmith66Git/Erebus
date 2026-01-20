import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DivePlanResult, DivePlanSettings, GasMix, TissueState, calculateMValueAtPressure, depthToPressure } from './divePlanner';
import { calculateGasDensity } from './gasMath';

interface DivePlanPdfInput {
  result: DivePlanResult;
  settings: DivePlanSettings;
  depth: number;
  bottomTime: number;
  gases: GasMix[];
  userName?: string;
  themeColor?: string;
}

const RHO_O2 = 1.429;
const RHO_N2 = 1.251;
const RHO_HE = 0.179;

function calculateCNS(ppo2: number, durationMinutes: number): number {
  if (ppo2 <= 0.5) return 0;
  const CNS_LIMITS: [number, number][] = [
    [0.60, 720], [0.70, 570], [0.80, 450], [0.90, 360], [1.00, 300],
    [1.10, 240], [1.20, 210], [1.30, 180], [1.40, 150], [1.50, 120],
    [1.60, 45], [1.70, 20], [1.80, 10], [1.90, 8], [2.00, 5]
  ];
  let limit = 720;
  for (const [threshold, minutes] of CNS_LIMITS) {
    if (ppo2 <= threshold) { limit = minutes; break; }
    limit = minutes;
  }
  return (durationMinutes / limit) * 100;
}

function calculateOTU(ppo2: number, durationMinutes: number): number {
  if (ppo2 <= 0.5) return 0;
  return durationMinutes * Math.pow((0.5 / (ppo2 - 0.5)), -5/6);
}

function colorToRgb(color: string): [number, number, number] {
  if (!color) return [210, 47, 0];
  
  const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (hexMatch) {
    return [parseInt(hexMatch[1], 16), parseInt(hexMatch[2], 16), parseInt(hexMatch[3], 16)];
  }
  
  const rgbaMatch = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/.exec(color);
  if (rgbaMatch) {
    return [parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3])];
  }
  
  return [210, 47, 0];
}

function formatDuration(minutes: number): string {
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  return secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}`;
}

function formatGas(gas: GasMix): string {
  if (gas.hePercent > 0) {
    return `${gas.o2Percent}/${gas.hePercent}`;
  } else if (gas.o2Percent === 21) {
    return 'Air';
  } else {
    return `EAN${gas.o2Percent}`;
  }
}

const DEPTH_LINE_COLOR: [number, number, number] = [0, 122, 255]; // #007AFF blue
const CEILING_LINE_COLOR: [number, number, number] = [255, 59, 48]; // Red
const CNS_LINE_COLOR: [number, number, number] = [255, 149, 0]; // Orange
const OTU_LINE_COLOR: [number, number, number] = [175, 82, 222]; // Purple #AF52DE
const DENSITY_LINE_COLOR: [number, number, number] = [52, 199, 89]; // Green

function drawDiveProfileWithMetrics(
  doc: jsPDF, 
  result: DivePlanResult, 
  settings: DivePlanSettings,
  x: number, 
  y: number, 
  width: number, 
  height: number,
  themeRgb: [number, number, number]
): number {
  const segments = result.segments;
  if (segments.length === 0) return height;
  
  const maxDepth = Math.max(...segments.map(s => Math.max(s.startDepth, s.endDepth)));
  const totalTime = segments[segments.length - 1].runTime;
  const waterFactor = settings.waterType === 'salt' ? 10 : 10.3;
  
  const profileHeight = 65;
  const padding = { top: 12, right: 10, bottom: 18, left: 25 };
  const chartW = width - padding.left - padding.right;
  const chartH = profileHeight - padding.top - padding.bottom;
  const depthUnit = settings.units === 'metric' ? 'm' : 'ft';
  
  doc.setFillColor(245, 245, 247);
  doc.rect(x + padding.left, y + padding.top, chartW, chartH, 'F');
  
  doc.setDrawColor(220);
  doc.setLineWidth(0.15);
  const depthSteps = [0, 0.25, 0.5, 0.75, 1];
  depthSteps.forEach(ratio => {
    const lineY = y + padding.top + ratio * chartH;
    doc.line(x + padding.left, lineY, x + padding.left + chartW, lineY);
  });
  
  const timeSteps = 5;
  for (let i = 0; i <= timeSteps; i++) {
    const ratio = i / timeSteps;
    const lineX = x + padding.left + ratio * chartW;
    doc.line(lineX, y + padding.top, lineX, y + padding.top + chartH);
  }
  
  const numSamples = 50;
  const samplePoints: { time: number; depth: number; cns: number; otu: number; density: number; ceiling: number }[] = [];
  let cumulativeCNS = 0;
  let cumulativeOTU = 0;
  
  for (let i = 0; i <= numSamples; i++) {
    const sampleTime = (i / numSamples) * totalTime;
    let currentDepth = 0;
    let currentGas = segments[0]?.gasMix;
    let runningCNS = 0;
    let runningOTU = 0;
    
    for (const seg of segments) {
      const segStart = seg.runTime - seg.duration;
      const segEnd = seg.runTime;
      if (sampleTime >= segStart && sampleTime <= segEnd) {
        const t = seg.duration > 0 ? (sampleTime - segStart) / seg.duration : 1;
        currentDepth = seg.startDepth + t * (seg.endDepth - seg.startDepth);
        currentGas = seg.gasMix;
        break;
      } else if (sampleTime > segEnd) {
        currentDepth = seg.endDepth;
        currentGas = seg.gasMix;
      }
    }
    
    for (const seg of segments) {
      const segEnd = seg.runTime;
      if (segEnd <= sampleTime) {
        const avgDepth = (seg.startDepth + seg.endDepth) / 2;
        const pressure = 1 + avgDepth / waterFactor;
        const ppo2 = (seg.gasMix.o2Percent / 100) * pressure;
        runningCNS += calculateCNS(ppo2, seg.duration);
        runningOTU += calculateOTU(ppo2, seg.duration);
      }
    }
    
    const pressure = 1 + currentDepth / waterFactor;
    const o2Frac = (currentGas?.o2Percent || 21) / 100;
    const heFrac = (currentGas?.hePercent || 0) / 100;
    const n2Frac = 1 - o2Frac - heFrac;
    const surfaceDensity = (o2Frac * RHO_O2) + (n2Frac * RHO_N2) + (heFrac * RHO_HE);
    const density = surfaceDensity * pressure;
    
    let ceiling = 0;
    if (result.tissueHistory && result.tissueHistory.length > 0) {
      const historyIndex = Math.min(Math.floor((sampleTime / totalTime) * (result.tissueHistory.length - 1)), result.tissueHistory.length - 1);
      const tissues = result.tissueHistory[historyIndex];
      if (tissues) {
        tissues.forEach(t => { if (t.ceiling > ceiling) ceiling = t.ceiling; });
      }
    }
    
    samplePoints.push({ time: sampleTime, depth: currentDepth, cns: runningCNS, otu: runningOTU, density, ceiling });
  }
  
  const maxCNS = Math.max(100, ...samplePoints.map(p => p.cns));
  const maxOTU = Math.max(100, ...samplePoints.map(p => p.otu));
  const maxDensity = Math.max(6.2, ...samplePoints.map(p => p.density));
  
  doc.setDrawColor(CEILING_LINE_COLOR[0], CEILING_LINE_COLOR[1], CEILING_LINE_COLOR[2]);
  doc.setLineWidth(0.5);
  for (let i = 1; i < samplePoints.length; i++) {
    const prev = samplePoints[i - 1];
    const curr = samplePoints[i];
    if (prev.ceiling <= 0 && curr.ceiling <= 0) continue;
    const x1 = x + padding.left + (prev.time / totalTime) * chartW;
    const y1 = y + padding.top + (prev.ceiling / maxDepth) * chartH;
    const x2 = x + padding.left + (curr.time / totalTime) * chartW;
    const y2 = y + padding.top + (curr.ceiling / maxDepth) * chartH;
    doc.line(x1, y1, x2, y2);
  }
  
  doc.setDrawColor(DENSITY_LINE_COLOR[0], DENSITY_LINE_COLOR[1], DENSITY_LINE_COLOR[2]);
  doc.setLineWidth(0.4);
  for (let i = 1; i < samplePoints.length; i++) {
    const prev = samplePoints[i - 1];
    const curr = samplePoints[i];
    const x1 = x + padding.left + (prev.time / totalTime) * chartW;
    const y1 = y + padding.top + chartH - (prev.density / maxDensity) * chartH;
    const x2 = x + padding.left + (curr.time / totalTime) * chartW;
    const y2 = y + padding.top + chartH - (curr.density / maxDensity) * chartH;
    doc.line(x1, y1, x2, y2);
  }
  
  doc.setDrawColor(CNS_LINE_COLOR[0], CNS_LINE_COLOR[1], CNS_LINE_COLOR[2]);
  doc.setLineWidth(0.4);
  for (let i = 1; i < samplePoints.length; i++) {
    const prev = samplePoints[i - 1];
    const curr = samplePoints[i];
    const x1 = x + padding.left + (prev.time / totalTime) * chartW;
    const y1 = y + padding.top + chartH - (Math.min(prev.cns, maxCNS) / maxCNS) * chartH;
    const x2 = x + padding.left + (curr.time / totalTime) * chartW;
    const y2 = y + padding.top + chartH - (Math.min(curr.cns, maxCNS) / maxCNS) * chartH;
    doc.line(x1, y1, x2, y2);
  }
  
  doc.setDrawColor(OTU_LINE_COLOR[0], OTU_LINE_COLOR[1], OTU_LINE_COLOR[2]);
  doc.setLineWidth(0.4);
  for (let i = 1; i < samplePoints.length; i++) {
    const prev = samplePoints[i - 1];
    const curr = samplePoints[i];
    const x1 = x + padding.left + (prev.time / totalTime) * chartW;
    const y1 = y + padding.top + chartH - (Math.min(prev.otu, maxOTU) / maxOTU) * chartH;
    const x2 = x + padding.left + (curr.time / totalTime) * chartW;
    const y2 = y + padding.top + chartH - (Math.min(curr.otu, maxOTU) / maxOTU) * chartH;
    doc.line(x1, y1, x2, y2);
  }
  
  doc.setDrawColor(DEPTH_LINE_COLOR[0], DEPTH_LINE_COLOR[1], DEPTH_LINE_COLOR[2]);
  doc.setLineWidth(1.2);
  
  let prevX = x + padding.left;
  let prevY = y + padding.top;
  
  segments.forEach((seg, i) => {
    const startTimeRatio = (seg.runTime - seg.duration) / totalTime;
    const endTimeRatio = seg.runTime / totalTime;
    const startDepthRatio = seg.startDepth / maxDepth;
    const endDepthRatio = seg.endDepth / maxDepth;
    
    const x1 = x + padding.left + startTimeRatio * chartW;
    const y1 = y + padding.top + startDepthRatio * chartH;
    const x2 = x + padding.left + endTimeRatio * chartW;
    const y2 = y + padding.top + endDepthRatio * chartH;
    
    if (i === 0) {
      prevX = x1;
      prevY = y1;
    }
    
    doc.line(prevX, prevY, x1, y1);
    doc.line(x1, y1, x2, y2);
    
    prevX = x2;
    prevY = y2;
  });
  
  if (result.decoStops && result.decoStops.length > 0) {
    result.decoStops.forEach(stop => {
      const stopDepthRatio = stop.depth / maxDepth;
      const stopY = y + padding.top + stopDepthRatio * chartH;
      doc.setFillColor(255, 152, 0);
      doc.circle(x + padding.left + chartW - 3, stopY, 1.5, 'F');
    });
  }
  
  doc.setDrawColor(150);
  doc.setLineWidth(0.5);
  doc.line(x + padding.left, y + padding.top, x + padding.left, y + padding.top + chartH);
  doc.line(x + padding.left, y + padding.top + chartH, x + padding.left + chartW, y + padding.top + chartH);
  
  doc.setFontSize(6);
  doc.setTextColor(100);
  
  depthSteps.forEach((ratio, i) => {
    const depthVal = Math.round(maxDepth * ratio);
    const labelY = y + padding.top + ratio * chartH + 2;
    doc.text(`${depthVal}${depthUnit}`, x + padding.left - 2, labelY, { align: 'right' });
  });
  
  for (let i = 0; i <= timeSteps; i++) {
    const ratio = i / timeSteps;
    const timeVal = Math.round(totalTime * ratio);
    const labelX = x + padding.left + ratio * chartW;
    doc.text(`${timeVal}`, labelX, y + padding.top + chartH + 6, { align: 'center' });
  }
  
  doc.setFontSize(7);
  doc.text('Time (min)', x + padding.left + chartW / 2, y + profileHeight - 5, { align: 'center' });
  
  let currentY = y + profileHeight + 3;
  
  doc.setFontSize(6);
  const legendItems = [
    { color: DEPTH_LINE_COLOR, label: 'Depth' },
    { color: CEILING_LINE_COLOR, label: 'Ceiling' },
    { color: CNS_LINE_COLOR, label: 'CNS' },
    { color: OTU_LINE_COLOR, label: 'OTU' },
    { color: DENSITY_LINE_COLOR, label: 'Density' },
  ];
  let legendX = x + padding.left;
  legendItems.forEach(item => {
    doc.setDrawColor(item.color[0], item.color[1], item.color[2]);
    doc.setLineWidth(1);
    doc.line(legendX, currentY, legendX + 8, currentY);
    doc.setTextColor(80);
    doc.text(item.label, legendX + 10, currentY + 1);
    legendX += 28;
  });
  
  currentY += 10;
  
  const finalTissues = result.tissueHistory?.[result.tissueHistory.length - 1];
  if (finalTissues && finalTissues.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(60);
    doc.text('Tissue Compartment Saturation (End of Dive)', x + padding.left, currentY);
    currentY += 5;
    
    const barHeight = 3;
    const barGap = 0.8;
    const labelWidth = 18;
    const maxBarWidth = chartW - labelWidth;
    const baselinePpInert = 0.74;
    const tissueChartHeight = 16 * (barHeight + barGap);
    
    doc.setDrawColor(150);
    doc.setLineWidth(0.5);
    doc.line(x + padding.left, currentY, x + padding.left, currentY + tissueChartHeight);
    doc.line(x + padding.left + chartW, currentY, x + padding.left + chartW, currentY + tissueChartHeight);
    
    const TISSUE_COLORS = [
      [244, 67, 54], [255, 87, 34], [255, 152, 0], [255, 193, 7], 
      [205, 220, 57], [139, 195, 74], [76, 175, 80], [0, 150, 136],
      [0, 188, 212], [3, 169, 244], [33, 150, 243], [63, 81, 181],
      [103, 58, 183], [156, 39, 176], [233, 30, 99], [244, 67, 54]
    ];
    
    finalTissues.forEach((tissue, i) => {
      const barY = currentY + i * (barHeight + barGap);
      
      const Pamb = 1.0;
      const mValue = calculateMValueAtPressure(tissue, i, Pamb);
      const Plimit = mValue;
      
      const current = tissue.ppInert;
      const numerator = current - baselinePpInert;
      const denominator = Plimit - baselinePpInert;
      const percent = denominator > 0 ? (numerator / denominator) * 100 : 0;
      const clampedPercent = Math.max(0, Math.min(percent, 100));
      
      const barWidth = (clampedPercent / 100) * maxBarWidth;
      
      doc.setFillColor(235, 235, 235);
      doc.rect(x + padding.left, barY, maxBarWidth, barHeight, 'F');
      
      const color = TISSUE_COLORS[i];
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(x + padding.left, barY, Math.max(barWidth, 0.5), barHeight, 'F');
      
      doc.setFontSize(5);
      doc.setTextColor(60);
      doc.text(`${i + 1}: ${Math.round(percent)}%`, x + padding.left + maxBarWidth + 2, barY + barHeight - 0.5);
    });
    
    currentY += tissueChartHeight + 3;
  }
  
  return currentY - y;
}

export function generateDivePlanPdf(input: DivePlanPdfInput): void {
  const { result, settings, depth, bottomTime, gases, userName, themeColor } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  
  const themeRgb = themeColor ? colorToRgb(themeColor) : [0, 80, 130] as [number, number, number];
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  
  doc.setFillColor(themeRgb[0], themeRgb[1], themeRgb[2]);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('DIVE PLAN', margin, 18);
  
  if (userName) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Diver: ${userName}`, margin, 28);
  }
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const date = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  doc.text(date, margin, userName ? 36 : 28);
  
  doc.setTextColor(220);
  doc.setFontSize(8);
  doc.text('Generated by Erebus Dive Planner', pageWidth - margin, 36, { align: 'right' });
  
  let yPos = 50;
  
  doc.setTextColor(themeRgb[0], themeRgb[1], themeRgb[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DIVE SUMMARY', margin, yPos);
  yPos += 8;
  
  const depthUnit = settings.units === 'metric' ? 'm' : 'ft';
  const summaryData = [
    ['Maximum Depth', `${depth} ${depthUnit}`],
    ['Bottom Time', `${bottomTime} min`],
    ['Total Runtime', `${formatDuration(result.totalRunTime)} min`],
    ['Deco Stops', result.decoStops.length > 0 ? `${result.decoStops.length} stops` : 'None (NDL dive)'],
    ['CNS Oxygen', `${Math.round(result.cns || 0)}%`],
    ['OTU', `${Math.round(result.otu || 0)} units`],
  ];
  
  autoTable(doc, {
    startY: yPos,
    head: [],
    body: summaryData,
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { cellWidth: 50 }
    },
    tableWidth: 90,
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  doc.setTextColor(themeRgb[0], themeRgb[1], themeRgb[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DIVE PROFILE CHART', margin, yPos);
  yPos += 5;
  
  const chartHeight = drawDiveProfileWithMetrics(doc, result, settings, margin, yPos, contentWidth, 100, themeRgb);
  yPos += chartHeight + 8;
  
  const filteredSegments = result.segments.filter(s => s.type !== 'surface_interval');
  if (filteredSegments.length > 0) {
    doc.setTextColor(themeRgb[0], themeRgb[1], themeRgb[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DIVE PROFILE TABLE', margin, yPos);
    yPos += 5;
    
    const waterFactor = settings.waterType === 'salt' ? 10 : 10.3;
    
    const getPhaseSymbol = (type: string): string => {
      switch (type) {
        case 'descent': return 'v';
        case 'ascent': return '^';
        case 'deco_stop': return 'D';
        case 'gas_switch': return 'G';
        case 'bottom': return '-';
        default: return '-';
      }
    };
    
    let cumulativeCNS = 0;
    let cumulativeOTU = 0;
    
    const profileData = filteredSegments.map((seg, idx) => {
      const segDepth = seg.type === 'descent' || seg.type === 'ascent' ? seg.endDepth : seg.startDepth;
      const avgDepth = (seg.startDepth + seg.endDepth) / 2;
      const pressure = 1 + segDepth / waterFactor;
      const avgPressure = 1 + avgDepth / waterFactor;
      const po2 = (seg.gasMix.o2Percent / 100) * pressure;
      const avgPo2 = (seg.gasMix.o2Percent / 100) * avgPressure;
      
      cumulativeCNS += calculateCNS(avgPo2, seg.duration);
      cumulativeOTU += calculateOTU(avgPo2, seg.duration);
      
      const o2Frac = seg.gasMix.o2Percent / 100;
      const heFrac = (seg.gasMix.hePercent || 0) / 100;
      const n2Frac = 1 - o2Frac - heFrac;
      const surfaceDensity = (o2Frac * RHO_O2) + (n2Frac * RHO_N2) + (heFrac * RHO_HE);
      const density = surfaceDensity * pressure;
      
      let gf99 = 0;
      if (result.tissueHistory && result.tissueHistory.length > 0) {
        const historyIndex = Math.min(
          Math.floor((seg.runTime / result.totalRunTime) * (result.tissueHistory.length - 1)),
          result.tissueHistory.length - 1
        );
        const tissues = result.tissueHistory[historyIndex];
        if (tissues) {
          const Pamb = 1 + segDepth / waterFactor;
          let maxGf = 0;
          tissues.forEach((tissue, ti) => {
            const mValue = calculateMValueAtPressure(tissue, ti, Pamb);
            const gf = ((tissue.ppInert - Pamb) / (mValue - Pamb)) * 100;
            if (gf > maxGf) maxGf = gf;
          });
          gf99 = Math.max(0, Math.round(maxGf));
        }
      }
      
      return [
        getPhaseSymbol(seg.type),
        `${segDepth}`,
        formatDuration(seg.duration),
        formatDuration(seg.runTime),
        seg.gasMix.name || formatGas(seg.gasMix),
        po2.toFixed(2),
        `${Math.round(cumulativeCNS)}`,
        `${Math.round(cumulativeOTU)}`,
        `${gf99}`,
        density.toFixed(1)
      ];
    });
    
    autoTable(doc, {
      startY: yPos,
      head: [['', 'Depth', 'Stop', 'Run', 'Gas', 'PO2', 'CNS%', 'OTU', 'GF99', 'g/L']],
      body: profileData,
      theme: 'striped',
      margin: { left: margin, right: margin },
      headStyles: { fillColor: themeRgb, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' },
        1: { cellWidth: 14 },
        2: { cellWidth: 14 },
        3: { cellWidth: 14 },
        4: { cellWidth: 28 },
        5: { cellWidth: 14 },
        6: { cellWidth: 14 },
        7: { cellWidth: 14 },
        8: { cellWidth: 14 },
        9: { cellWidth: 14 }
      },
      didParseCell: function(data) {
        if (data.column.index === 5 && data.section === 'body') {
          const po2Val = parseFloat(data.cell.raw as string);
          if (po2Val > 1.6) {
            data.cell.styles.textColor = [200, 0, 0];
          } else if (po2Val > 1.4) {
            data.cell.styles.textColor = [255, 152, 0];
          }
        }
        if (data.column.index === 6 && data.section === 'body') {
          const cnsVal = parseInt(data.cell.raw as string);
          if (cnsVal > 100) {
            data.cell.styles.textColor = [200, 0, 0];
          } else if (cnsVal > 80) {
            data.cell.styles.textColor = [255, 152, 0];
          }
        }
        if (data.column.index === 8 && data.section === 'body') {
          const gfVal = parseInt(data.cell.raw as string);
          if (gfVal > settings.gfHigh) {
            data.cell.styles.textColor = [200, 0, 0];
          } else if (gfVal > settings.gfLow) {
            data.cell.styles.textColor = [255, 152, 0];
          }
        }
        if (data.column.index === 9 && data.section === 'body') {
          const densityVal = parseFloat(data.cell.raw as string);
          if (densityVal > 6.2) {
            data.cell.styles.textColor = [200, 0, 0];
          } else if (densityVal > 5.7) {
            data.cell.styles.textColor = [255, 152, 0];
          }
        }
        if (data.column.index === 0 && data.section === 'body') {
          const symbol = data.cell.raw as string;
          if (symbol === 'v') data.cell.styles.textColor = themeRgb;
          else if (symbol === '^') data.cell.styles.textColor = [76, 175, 80];
          else if (symbol === 'D') data.cell.styles.textColor = [255, 152, 0];
          else if (symbol === 'G') data.cell.styles.textColor = [33, 150, 243];
        }
      }
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }
  
  doc.setTextColor(themeRgb[0], themeRgb[1], themeRgb[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('GAS CONFIGURATION', margin, yPos);
  yPos += 5;
  
  const gasData = gases.map(gas => [
    gas.name,
    formatGas(gas),
    `${gas.switchDepth !== null ? gas.switchDepth + depthUnit : '-'}`,
    `MOD: ${gas.modPpo2_14} ${depthUnit}`,
    `${gas.cylinderVolume}L @ ${gas.fillPressure}bar`
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Name', 'Mix', 'Switch', 'MOD (1.4)', 'Cylinder']],
    body: gasData,
    theme: 'striped',
    margin: { left: margin, right: margin },
    headStyles: { fillColor: themeRgb, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3 },
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  if (result.gasConsumption && result.gasConsumption.length > 0 && yPos < 240) {
    doc.setTextColor(themeRgb[0], themeRgb[1], themeRgb[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('GAS CONSUMPTION', margin, yPos);
    yPos += 5;
    
    const consumptionData = result.gasConsumption.map(gc => [
      gc.gasName,
      `${Math.round(gc.gasAvailable)} L`,
      `${Math.round(gc.gasRequired)} L`,
      `${Math.round(gc.gasRemaining)} L`,
      `${Math.round(gc.percentUsed)}%`,
      gc.isSufficient ? 'OK' : 'LOW'
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Gas', 'Available', 'Required', 'Remaining', 'Used', 'Status']],
      body: consumptionData,
      theme: 'striped',
      margin: { left: margin, right: margin },
      headStyles: { fillColor: themeRgb, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2 },
      didParseCell: function(data) {
        if (data.column.index === 5 && data.section === 'body') {
          const value = data.cell.raw as string;
          if (value === 'LOW') {
            data.cell.styles.textColor = [200, 0, 0];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [0, 150, 0];
          }
        }
      }
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }
  
  if (yPos < 250) {
    doc.setTextColor(themeRgb[0], themeRgb[1], themeRgb[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('SETTINGS', margin, yPos);
    yPos += 5;
    
    const rateUnit = settings.units === 'metric' ? 'm' : 'ft';
    const settingsData = [
      ['Circuit', settings.circuit === 'open' ? 'Open Circuit' : 'CCR'],
      ['Gradient Factors', `${settings.gfLow}/${settings.gfHigh}`],
      ['Descent Rate', `${settings.descentRate} ${rateUnit}/min`],
      ['Ascent Rate', `${settings.ascentRate} ${rateUnit}/min`],
      ['SAC Bottom', `${settings.sacRateBottom} L/min`],
      ['SAC Deco', `${settings.sacRateDeco} L/min`],
      ['Water Type', settings.waterType === 'salt' ? 'Salt Water' : 'Fresh Water'],
      ['Last Stop', `${settings.lastStopDepth} ${depthUnit}`],
    ];
    
    autoTable(doc, {
      startY: yPos,
      head: [],
      body: settingsData,
      theme: 'plain',
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 35 },
        1: { cellWidth: 40 }
      },
      tableWidth: 75,
    });
  }
  
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
  
  doc.setTextColor(150);
  doc.setFontSize(7);
  doc.text('This dive plan is for reference only. Always verify calculations and follow safe diving practices.', margin, pageHeight - 10);
  doc.text('Erebus Dive Planner', pageWidth - margin, pageHeight - 10, { align: 'right' });
  
  const filename = `dive-plan-${depth}${depthUnit}-${bottomTime}min-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

export function downloadDivePlanPdf(input: DivePlanPdfInput): void {
  try {
    generateDivePlanPdf(input);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}
