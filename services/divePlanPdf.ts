import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DivePlanResult, DivePlanSettings, GasMix, TissueState, calculateMValueAtPressure, depthToPressure } from './divePlanner';

interface DivePlanPdfInput {
  result: DivePlanResult;
  settings: DivePlanSettings;
  depth: number;
  bottomTime: number;
  gases: GasMix[];
  userName?: string;
  themeColor?: string;
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

const TISSUE_COLORS = [
  '#F44336', '#FF5722', '#FF9800', '#FFC107', 
  '#CDDC39', '#8BC34A', '#4CAF50', '#009688',
  '#00BCD4', '#03A9F4', '#2196F3', '#3F51B5',
  '#673AB7', '#9C27B0', '#E91E63', '#F44336'
];

function drawDiveProfileWithTissues(
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
  
  const profileHeight = 50;
  const padding = { top: 12, right: 10, bottom: 12, left: 25 };
  const chartW = width - padding.left - padding.right;
  const chartH = profileHeight - padding.top - padding.bottom;
  
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(x + padding.left, y + padding.top, chartW, chartH);
  
  doc.setFontSize(6);
  doc.setTextColor(100);
  
  const depthUnit = settings.units === 'metric' ? 'm' : 'ft';
  doc.text(`0${depthUnit}`, x + padding.left - 2, y + padding.top + 2, { align: 'right' });
  doc.text(`${Math.round(maxDepth)}${depthUnit}`, x + padding.left - 2, y + padding.top + chartH, { align: 'right' });
  
  doc.text('0', x + padding.left, y + padding.top + chartH + 6, { align: 'center' });
  doc.text(`${Math.round(totalTime)}min`, x + padding.left + chartW, y + padding.top + chartH + 6, { align: 'center' });
  
  doc.setDrawColor(themeRgb[0], themeRgb[1], themeRgb[2]);
  doc.setLineWidth(0.8);
  
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
  
  let currentY = y + profileHeight + 5;
  const finalTissues = result.tissueHistory[result.tissueHistory.length - 1];
  
  if (finalTissues && finalTissues.length > 0) {
    doc.setFontSize(7);
    doc.setTextColor(60);
    doc.text('Tissue Compartment Saturation (End of Dive)', x + padding.left, currentY);
    currentY += 5;
    
    const numCols = 2;
    const compartmentsPerCol = 8;
    const colWidth = (chartW - 10) / numCols;
    const barHeight = 2.5;
    const barGap = 1.5;
    const maxBarWidth = colWidth * 0.55;
    const baselinePpInert = 0.74;
    
    finalTissues.forEach((tissue, i) => {
      const col = Math.floor(i / compartmentsPerCol);
      const row = i % compartmentsPerCol;
      const colX = x + padding.left + col * colWidth;
      const barY = currentY + row * (barHeight + barGap);
      
      const Pamb = 1.0;
      const mValue = calculateMValueAtPressure(tissue, i, Pamb);
      const Plimit = mValue;
      
      const current = tissue.ppInert;
      const numerator = current - baselinePpInert;
      const denominator = Plimit - baselinePpInert;
      const percent = denominator > 0 ? (numerator / denominator) * 100 : 0;
      const clampedPercent = Math.max(0, Math.min(percent, 100));
      
      const barWidth = (clampedPercent / 100) * maxBarWidth;
      
      doc.setFontSize(5);
      doc.setTextColor(100);
      doc.text(`${i + 1}`, colX + 6, barY + barHeight - 0.3, { align: 'right' });
      
      doc.setFillColor(230, 230, 230);
      doc.rect(colX + 8, barY, maxBarWidth, barHeight, 'F');
      
      const color = colorToRgb(TISSUE_COLORS[i]);
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(colX + 8, barY, Math.max(barWidth, 0.5), barHeight, 'F');
      
      doc.setTextColor(60);
      doc.text(`${Math.round(percent)}%`, colX + 8 + maxBarWidth + 2, barY + barHeight - 0.3);
    });
    
    currentY += compartmentsPerCol * (barHeight + barGap) + 3;
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
  doc.text('DIVE PROFILE & TISSUE LOADING', margin, yPos);
  yPos += 5;
  
  const chartHeight = drawDiveProfileWithTissues(doc, result, settings, margin, yPos, contentWidth, 100, themeRgb);
  yPos += chartHeight + 8;
  
  if (result.decoStops.length > 0) {
    doc.setTextColor(themeRgb[0], themeRgb[1], themeRgb[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DECOMPRESSION SCHEDULE', margin, yPos);
    yPos += 5;
    
    const decoData = result.decoStops.map((stop, i) => [
      `${i + 1}`,
      `${stop.depth} ${depthUnit}`,
      `${formatDuration(stop.duration)} min`,
      formatGas(stop.gasMix),
      `${Math.round(stop.ceiling)} ${depthUnit}`
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Depth', 'Duration', 'Gas', 'Ceiling']],
      body: decoData,
      theme: 'striped',
      margin: { left: margin, right: margin },
      headStyles: { fillColor: themeRgb, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 30 }
      },
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
