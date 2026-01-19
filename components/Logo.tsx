import React from 'react';
import Svg, { Path, Circle, G } from 'react-native-svg';

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
  
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}>
      <G>
        {/* Arc around the droplet - starts at ~7 o'clock, goes clockwise to ~11 o'clock */}
        {/* Gap is on the upper-left side */}
        <Path
          d="M 25 75 
             A 35 35 0 1 1 30 22"
          fill="none"
          stroke={primaryColor}
          strokeWidth={4}
          strokeLinecap="round"
        />
        
        {/* Water droplet shape */}
        <Path
          d="M 50 25
             C 50 25, 35 45, 35 58
             C 35 70, 41 78, 50 78
             C 59 78, 65 70, 65 58
             C 65 45, 50 25, 50 25
             Z"
          fill={primaryColor}
        />
        
        {/* White crescent highlight on bottom-right of droplet */}
        <Path
          d="M 52 68
             Q 56 64, 54 60
             Q 58 64, 56 70
             Q 54 72, 52 68
             Z"
          fill={highlightColor}
          opacity={0.9}
        />
      </G>
    </Svg>
  );
}
