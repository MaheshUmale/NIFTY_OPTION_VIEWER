import React, { useMemo } from 'react';
import { StrikeRecord } from '../types';

interface OIChartProps {
  data: StrikeRecord[];
  atm: number;
}

export const OIChart: React.FC<OIChartProps> = ({ data, atm }) => {
  // Filter relevant range around ATM for the chart (e.g., +/- 10 strikes)
  const chartData = useMemo(() => {
    if (!atm || data.length === 0) return [];
    const strikes = data.filter(d => d.strikePrice >= atm - 1000 && d.strikePrice <= atm + 1000);
    return strikes;
  }, [data, atm]);

  if (chartData.length === 0) return <div className="text-center p-4 text-gray-500">No data available for chart</div>;

  const maxOI = Math.max(
    ...chartData.map(d => Math.max(d.CE?.openInterest || 0, d.PE?.openInterest || 0))
  );

  const height = 300;
  const width = chartData.length * 40; // Approx width
  const barWidth = 12;
  const gap = 40;

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[800px] h-[320px] relative">
        <svg width="100%" height="100%" viewBox={`0 0 ${chartData.length * gap + 50} ${height + 30}`} preserveAspectRatio="none">
          {/* Grid lines */}
          <line x1="0" y1={height} x2="100%" y2={height} stroke="#374151" strokeWidth="1" />
          
          {chartData.map((d, i) => {
            const x = i * gap + 30;
            const ceHeight = ((d.CE?.openInterest || 0) / maxOI) * height;
            const peHeight = ((d.PE?.openInterest || 0) / maxOI) * height;
            const isATM = d.strikePrice === atm;

            return (
              <g key={d.strikePrice}>
                {/* Call OI Bar */}
                <rect
                  x={x}
                  y={height - ceHeight}
                  width={barWidth}
                  height={ceHeight}
                  fill="#ef4444" // red-500
                  opacity={0.8}
                >
                  <title>Call OI: {d.CE?.openInterest}</title>
                </rect>

                {/* Put OI Bar */}
                <rect
                  x={x + barWidth + 2}
                  y={height - peHeight}
                  width={barWidth}
                  height={peHeight}
                  fill="#22c55e" // green-500
                  opacity={0.8}
                >
                  <title>Put OI: {d.PE?.openInterest}</title>
                </rect>

                {/* Strike Label */}
                <text
                  x={x + barWidth}
                  y={height + 15}
                  textAnchor="middle"
                  fill={isATM ? "#fbbf24" : "#9ca3af"}
                  fontSize="10"
                  fontWeight={isATM ? "bold" : "normal"}
                >
                  {d.strikePrice}
                </text>
              </g>
            );
          })}
        </svg>
        
        {/* Legend */}
        <div className="absolute top-0 right-0 flex space-x-4 text-xs bg-gray-900/80 p-2 rounded">
          <div className="flex items-center"><div className="w-3 h-3 bg-red-500 mr-1"></div> Call OI (Res)</div>
          <div className="flex items-center"><div className="w-3 h-3 bg-green-500 mr-1"></div> Put OI (Sup)</div>
        </div>
      </div>
    </div>
  );
};
