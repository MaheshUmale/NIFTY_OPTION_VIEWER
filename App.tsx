import React, { useEffect, useState, useMemo } from 'react';
import { INDICES, REFRESH_INTERVAL } from './constants';
import { NSEResponse, AnalysisResult, Snapshot } from './types';
import { fetchOptionChainData, saveSnapshot, getSnapshots, clearSnapshots, saveBackfilledSnapshots } from './services/dataService';
import { getStockId, getExpiryDates, generateTimeIntervals, fetchTrendlyneSnapshot } from './services/trendlyne';
import { analyzeOptionChain } from './services/analysis';
import { OIChart } from './components/OIChart';
import { PCRChart } from './components/PCRChart';

const App: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = useState(INDICES[0].value);
  const [data, setData] = useState<NSEResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>([]);
  
  // Backfill States
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await fetchOptionChainData(selectedIndex);
      setData(response);
      setLastUpdated(new Date().toLocaleTimeString());
      
      const result = analyzeOptionChain(response.records.data, response.records.underlyingValue);
      setAnalysis(result);
      
      // Save to local DB
      saveSnapshot(response);
      setHistory(getSnapshots());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillProgress('Initializing...');
    try {
      // 1. Get Stock ID
      const stockId = await getStockId(selectedIndex);
      if (!stockId) {
        alert(`Connection Failed: Could not find Stock ID for ${selectedIndex}.\n\nPlease ensure 'node service.js' is running to bypass CORS.`);
        setBackfilling(false);
        return;
      }
      setBackfillProgress('Found Stock ID...');

      // 2. Get Expiry
      const expiries = await getExpiryDates(stockId);
      if (expiries.length === 0) {
        alert('Could not fetch expiry dates. Service proxy might be unreachable.');
        setBackfilling(false);
        return;
      }
      const expiry = expiries[0]; // Nearest expiry
      setBackfillProgress(`Using Expiry: ${expiry}`);

      // 3. Generate Time Intervals
      // Check if market is closed, if so use full day, else up to now
      const now = new Date();
      const isPostMarket = now.getHours() > 15 || (now.getHours() === 15 && now.getMinutes() >= 30);
      const endTime = isPostMarket ? "15:30" : `${now.getHours()}:${now.getMinutes()}`;
      
      const intervals = generateTimeIntervals("09:15", endTime, 15); // 15 min intervals
      const newSnapshots: Snapshot[] = [];

      for (const time of intervals) {
        setBackfillProgress(`Fetching ${time}...`);
        
        // Add slight delay to be nice to API
        await new Promise(r => setTimeout(r, 200)); 
        
        const response = await fetchTrendlyneSnapshot(stockId, expiry, time, selectedIndex);
        if (response) {
          const resAnalysis = analyzeOptionChain(response.records.data, response.records.underlyingValue);
          
          let pcrChangeOI = 0;
          if (resAnalysis.callChangeOI !== 0) {
              pcrChangeOI = Number((resAnalysis.putChangeOI / resAnalysis.callChangeOI).toFixed(2));
          }

          // Create Snapshot
          newSnapshots.push({
            id: `backfill-${time}-${Date.now()}`,
            timestamp: response.records.timestamp,
            underlyingValue: response.records.underlyingValue,
            pcr: resAnalysis.pcr,
            pcrChangeOI,
            maxPain: resAnalysis.maxPain,
            ceTotalOI: resAnalysis.callOI,
            peTotalOI: resAnalysis.putOI,
          });
          
          // If this is the last interval, update the main view data too
          if (time === intervals[intervals.length - 1]) {
            setData(response);
            setAnalysis(resAnalysis);
            setLastUpdated(`Backfilled ${time}`);
          }
        }
      }

      setBackfillProgress(`Saving ${newSnapshots.length} records...`);
      saveBackfilledSnapshots(newSnapshots);
      setHistory(getSnapshots());
      
    } catch (e) {
      console.error(e);
      alert('Backfill failed. See console for details.');
    } finally {
      setBackfilling(false);
      setBackfillProgress('');
    }
  };

  useEffect(() => {
    loadData();
    // Load initial history
    setHistory(getSnapshots());
  }, [selectedIndex]);

  useEffect(() => {
    let interval: any;
    if (autoRefresh) {
      interval = setInterval(loadData, REFRESH_INTERVAL);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, selectedIndex]);

  const handleDownloadJSON = () => {
    if (!data) return;
    const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `NSE_${selectedIndex}_${Date.now()}.json`;
    link.click();
  };

  const atmStrike = analysis?.atmStrike || 0;

  // Filter strikes for better view (e.g. 10 above and 10 below ATM)
  const displayStrikes = useMemo(() => {
    if (!data || !atmStrike) return [];
    return data.records.data.filter(d => 
      d.strikePrice >= atmStrike - 1000 && d.strikePrice <= atmStrike + 1000
    );
  }, [data, atmStrike]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-blue-400">NSE Option Chain Analyzer</h1>
            <span className="text-xs px-2 py-1 bg-gray-700 rounded text-gray-300">v2.1 Backfill</span>
          </div>
          
          <div className="flex items-center space-x-4">
            {backfilling && (
              <span className="text-xs text-yellow-400 animate-pulse">{backfillProgress}</span>
            )}
            
            {!backfilling && (
              <div className="text-sm text-gray-400 hidden md:block">
                {lastUpdated && `Last Updated: ${lastUpdated}`}
              </div>
            )}
            
            <select 
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(e.target.value)}
              className="bg-gray-700 border-none text-white text-sm rounded focus:ring-2 focus:ring-blue-500"
            >
              {INDICES.map(idx => (
                <option key={idx.value} value={idx.value}>{idx.label}</option>
              ))}
            </select>

            <button 
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 text-sm rounded transition-colors hidden sm:block ${
                autoRefresh ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-600 hover:bg-gray-500'
              }`}
            >
              {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
            </button>

            <button 
              onClick={loadData} 
              disabled={loading || backfilling}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded disabled:opacity-50"
            >
              Refresh
            </button>

            <button 
              onClick={handleBackfill} 
              disabled={backfilling}
              className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-sm rounded disabled:opacity-50"
              title="Fetch historical data from Trendlyne (Requires node service.js)"
            >
              {backfilling ? 'Busy...' : 'Backfill'}
            </button>
            
            <button 
              onClick={handleDownloadJSON} 
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded"
              title="Download Data JSON"
            >
              Export API
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Dashboard Summary */}
        {analysis && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <DashboardCard 
              title="Spot Price" 
              value={data?.records.underlyingValue.toFixed(2) || '---'} 
              trend={analysis.trend}
              subValue={`ATM: ${analysis.atmStrike}`}
            />
            <DashboardCard 
              title="PCR (OI)" 
              value={analysis.pcr.toString()} 
              trend={analysis.pcr > 1 ? 'Bullish' : analysis.pcr < 0.7 ? 'Bearish' : 'Neutral'}
              subValue={`Vol PCR: ${analysis.pcrVol}`}
            />
            <DashboardCard 
              title="Max Pain" 
              value={analysis.maxPain.toString()} 
              color="text-red-400"
              subValue="Expiry Pain Level"
            />
            <DashboardCard 
              title="Support / Resistance" 
              value={`${analysis.support} / ${analysis.resistance}`} 
              subValue="Based on Max OI"
            />
          </div>
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           {/* Main OI Chart */}
           <div className="lg:col-span-2 bg-gray-800 rounded-lg p-4 shadow border border-gray-700">
              <h3 className="text-lg font-medium mb-4 text-gray-300">Open Interest Distribution</h3>
              {data && <OIChart data={data.records.data} atm={atmStrike} />}
           </div>
           
           {/* New PCR Trend Widget */}
           <div className="bg-gray-800 rounded-lg p-4 shadow border border-gray-700 flex flex-col">
              <h3 className="text-lg font-medium mb-2 text-gray-300">PCR Trend (Today)</h3>
              <div className="flex-1">
                 <PCRChart history={history} />
              </div>
           </div>
        </div>

        {/* Snapshot History Table */}
        <div className="bg-gray-800 rounded-lg shadow border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex justify-between">
                <h3 className="text-lg font-medium text-gray-300">Historical Snapshots</h3>
                <button onClick={() => { clearSnapshots(); setHistory([]); }} className="text-xs text-red-400 hover:text-red-300">Clear History</button>
            </div>
            <div className="overflow-x-auto max-h-[300px]">
                <table className="w-full text-xs text-left text-gray-400">
                  <thead className="text-gray-200 sticky top-0 bg-gray-800">
                    <tr>
                      <th className="py-2 px-4">Time</th>
                      <th className="py-2 px-4">Spot</th>
                      <th className="py-2 px-4">PCR (Total)</th>
                      <th className="py-2 px-4">PCR (Change)</th>
                      <th className="py-2 px-4">Max Pain</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {history.map((snap) => {
                      const timeStr = snap.timestamp.includes('T') 
                        ? new Date(snap.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                        : snap.timestamp.split(' ')[1] || snap.timestamp;

                      return (
                        <tr key={snap.id} className="hover:bg-gray-750">
                          <td className="py-2 px-4">{timeStr}</td>
                          <td className="py-2 px-4 text-white">{snap.underlyingValue.toFixed(2)}</td>
                          <td className={`py-2 px-4 ${snap.pcr > 1 ? 'text-green-400' : 'text-red-400'}`}>{snap.pcr}</td>
                          <td className="py-2 px-4 text-purple-400">{snap.pcrChangeOI || '-'}</td>
                          <td className="py-2 px-4">{snap.maxPain}</td>
                        </tr>
                      );
                    })}
                    {history.length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-center italic">No history yet. Click Backfill to load today's data.</td></tr>
                    )}
                  </tbody>
                </table>
            </div>
        </div>

        {/* Option Chain Table */}
        <div className="bg-gray-800 rounded-lg shadow border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-medium text-gray-300">Option Chain (ATM ± 20 Strikes)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center">
              <thead className="bg-gray-700 text-gray-200 text-xs uppercase tracking-wider">
                <tr>
                  <th colSpan={4} className="py-2 border-r border-gray-600 bg-green-900/30">CALLS (Resistance)</th>
                  <th className="py-2 bg-gray-700 w-20">Strike</th>
                  <th colSpan={4} className="py-2 border-l border-gray-600 bg-red-900/30">PUTS (Support)</th>
                </tr>
                <tr className="text-[10px] text-gray-400">
                  <th className="py-2 px-1">OI</th>
                  <th className="py-2 px-1">Chng OI</th>
                  <th className="py-2 px-1">Vol</th>
                  <th className="py-2 px-1 border-r border-gray-600">LTP</th>
                  
                  <th className="py-2 px-2 bg-gray-700">Price</th>
                  
                  <th className="py-2 px-1 border-l border-gray-600">LTP</th>
                  <th className="py-2 px-1">Vol</th>
                  <th className="py-2 px-1">Chng OI</th>
                  <th className="py-2 px-1">OI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {displayStrikes.map((row) => {
                  const isATM = row.strikePrice === atmStrike;
                  const ce = row.CE;
                  const pe = row.PE;
                  
                  return (
                    <tr key={row.strikePrice} className={`${isATM ? 'bg-yellow-900/20' : 'hover:bg-gray-750'}`}>
                      {/* CALLS */}
                      <td className="py-1.5 px-1 relative">
                        {ce && (
                          <>
                            <div className="absolute top-1 bottom-1 left-0 bg-green-500/10" style={{ width: `${Math.min((ce.openInterest / analysis!.callOI) * 500, 100)}%` }}></div>
                            <span className="relative z-10 text-green-300">{ce.openInterest.toLocaleString()}</span>
                          </>
                        )}
                      </td>
                      <td className={`py-1.5 px-1 ${ce && ce.changeinOpenInterest > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {ce?.changeinOpenInterest.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-1 text-gray-400">{ce?.totalTradedVolume.toLocaleString()}</td>
                      <td className="py-1.5 px-1 border-r border-gray-600 font-medium">{ce?.lastPrice.toFixed(2)}</td>
                      
                      {/* STRIKE */}
                      <td className={`py-1.5 px-2 font-bold ${isATM ? 'text-yellow-400 bg-yellow-900/30' : 'text-gray-300 bg-gray-750'}`}>
                        {row.strikePrice}
                      </td>
                      
                      {/* PUTS */}
                      <td className="py-1.5 px-1 border-l border-gray-600 font-medium">{pe?.lastPrice.toFixed(2)}</td>
                      <td className="py-1.5 px-1 text-gray-400">{pe?.totalTradedVolume.toLocaleString()}</td>
                      <td className={`py-1.5 px-1 ${pe && pe.changeinOpenInterest > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {pe?.changeinOpenInterest.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-1 relative">
                         {pe && (
                          <>
                            <div className="absolute top-1 bottom-1 right-0 bg-red-500/10" style={{ width: `${Math.min((pe.openInterest / analysis!.putOI) * 500, 100)}%` }}></div>
                            <span className="relative z-10 text-red-300">{pe.openInterest.toLocaleString()}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

// Simple sub-component for dashboard cards
const DashboardCard: React.FC<{title: string, value: string, subValue?: string, trend?: string, color?: string}> = ({
  title, value, subValue, trend, color
}) => (
  <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow flex flex-col justify-between">
    <div className="text-gray-400 text-sm font-medium">{title}</div>
    <div className="flex items-end justify-between mt-2">
      <div className={`text-2xl font-bold ${color ? color : 'text-white'}`}>
        {value}
      </div>
      {trend && (
        <span className={`text-xs px-2 py-1 rounded font-bold uppercase ${
          trend === 'Bullish' ? 'bg-green-900 text-green-300' : 
          trend === 'Bearish' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'
        }`}>
          {trend}
        </span>
      )}
    </div>
    {subValue && <div className="text-xs text-gray-500 mt-1">{subValue}</div>}
  </div>
);

export default App;