import React from 'react';
import Svg, { Path, G, Circle } from 'react-native-svg';

interface LogoProps {
  size?: number;
  primaryColor?: string;
  highlightColor?: string;
}

export default function Logo({ 
  size = 44, 
  primaryColor = '#D22F00',
  highlightColor = '#FFFFFF'
}: LogoProps) {
  const viewBoxSize = 100;
  
  const arcRadius = 46;
  const arcCenter = { x: 50, y: 54 };
  const circumference = 2 * Math.PI * arcRadius;
  const arcPercent = 0.70;
  const dashLength = circumference * arcPercent;
  const gapLength = circumference * (1 - arcPercent);
  
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}>
      <G>
        {/* Arc using circle with stroke-dasharray - gap on left side, rotated counter-clockwise 20deg */}
        <Circle
          cx={arcCenter.x}
          cy={arcCenter.y}
          r={arcRadius}
          fill="none"
          stroke={primaryColor}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${dashLength} ${gapLength}`}
          strokeDashoffset={-circumference * 0.15}
          transform={`rotate(-130 ${arcCenter.x} ${arcCenter.y})`}
        />
        
        {/* Water droplet shape */}
        <Path
          d="M 50 18 C 50 18, 30 48, 30 64 C 30 80, 39 88, 50 88 C 61 88, 70 80, 70 64 C 70 48, 50 18, 50 18 Z"
          fill={primaryColor}
        />
        
        {/* White crescent highlight on bottom-right of droplet */}
        <Path
          d="M 52 74 Q 58 70, 55 64 Q 60 70, 56 78 Q 54 80, 52 74 Z"
          fill={highlightColor}
          opacity={0.95}
        />
      </G>
    </Svg>
  );
}
