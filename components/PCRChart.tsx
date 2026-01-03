import React, { useMemo } from 'react';
import { Snapshot } from '../types';

interface PCRChartProps {
  history: Snapshot[];
}

export const PCRChart: React.FC<PCRChartProps> = ({ history }) => {
  const chartData = useMemo(() => {
    // Sort ascending by time
    return [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [history]);

  if (chartData.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm italic">
        Not enough history to show trend. Click "Backfill" or wait for updates.
      </div>
    );
  }

  // Dimensions
  const width = 1000;
  const height = 300;
  const padding = 40;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;

  // Scales
  const maxPCR = Math.max(...chartData.map(d => Math.max(d.pcr, d.pcrChangeOI || 0, 1.5))); // Ensure at least reasonable scale
  const minPCR = Math.min(...chartData.map(d => Math.min(d.pcr, d.pcrChangeOI !== undefined ? d.pcrChangeOI : 100))) || 0;
  
  // Normalize min/max for better view (add buffer)
  const yMax = maxPCR + 0.2;
  const yMin = Math.max(0, minPCR - 0.2);
  const yRange = yMax - yMin || 1;

  const getX = (index: number) => padding + (index / (chartData.length - 1)) * graphWidth;
  const getY = (value: number) => height - padding - ((value - yMin) / yRange) * graphHeight;

  // Generate Path D strings
  let pcrPath = "";
  let pcrChangePath = "";

  chartData.forEach((d, i) => {
    const x = getX(i);
    const y1 = getY(d.pcr);
    const y2 = getY(d.pcrChangeOI || 0);

    if (i === 0) {
      pcrPath += `M ${x} ${y1}`;
      pcrChangePath += `M ${x} ${y2}`;
    } else {
      pcrPath += ` L ${x} ${y1}`;
      pcrChangePath += ` L ${x} ${y2}`;
    }
  });

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[600px] h-[320px] relative select-none">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
          {/* Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
             const y = height - padding - (t * graphHeight);
             const val = yMin + (t * yRange);
             return (
               <g key={t}>
                 <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#374151" strokeWidth="1" strokeDasharray="4" />
                 <text x={padding - 10} y={y + 4} textAnchor="end" fill="#9ca3af" fontSize="10">{val.toFixed(2)}</text>
               </g>
             );
          })}

          {/* Time Labels (Show approx 5-6 labels) */}
          {chartData.map((d, i) => {
            const step = Math.ceil(chartData.length / 6);
            if (i % step === 0 || i === chartData.length - 1) {
               const x = getX(i);
               const timeLabel = d.timestamp.includes('T') 
                 ? new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                 : d.timestamp.split(' ')[1] || d.timestamp;
               return (
                  <text key={d.id} x={x} y={height - 15} textAnchor="middle" fill="#9ca3af" fontSize="10">{timeLabel}</text>
               );
            }
            return null;
          })}

          {/* Lines */}
          <path d={pcrPath} fill="none" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d={pcrChangePath} fill="none" stroke="#c084fc" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Dots on latest */}
          <circle cx={getX(chartData.length - 1)} cy={getY(chartData[chartData.length - 1].pcr)} r="4" fill="#60a5fa" />
          <circle cx={getX(chartData.length - 1)} cy={getY(chartData[chartData.length - 1].pcrChangeOI || 0)} r="4" fill="#c084fc" />

        </svg>

        {/* Legend */}
        <div className="absolute top-2 right-4 flex space-x-4 bg-gray-900/80 p-2 rounded border border-gray-700">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-400 mr-2"></div>
            <span className="text-xs text-gray-300">PCR (Total OI)</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-purple-400 mr-2"></div>
            <span className="text-xs text-gray-300">PCR (Change OI)</span>
          </div>
        </div>
      </div>
    </div>
  );
};