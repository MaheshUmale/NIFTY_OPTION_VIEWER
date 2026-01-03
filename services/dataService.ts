import { NSEResponse, Snapshot, StrikeRecord } from '../types';
import { generateMockData, analyzeOptionChain } from './analysis';
import { getStockId, getExpiryDates, fetchTrendlyneSnapshot } from './trendlyne';

const STORAGE_KEY = 'nse_option_chain_snapshots';

export const saveSnapshot = (data: NSEResponse): void => {
  try {
    const analysis = analyzeOptionChain(data.records.data, data.records.underlyingValue);
    const snapshot: Snapshot = {
      id: Date.now().toString(),
      timestamp: data.records.timestamp.includes('T') 
                 ? data.records.timestamp 
                 : new Date().toISOString(),
      underlyingValue: data.records.underlyingValue,
      pcr: analysis.pcr,
      maxPain: analysis.maxPain,
      ceTotalOI: analysis.callOI,
      peTotalOI: analysis.putOI,
    };

    const existingData = localStorage.getItem(STORAGE_KEY);
    const snapshots: Snapshot[] = existingData ? JSON.parse(existingData) : [];
    
    // Keep last 100 snapshots
    const newSnapshots = [snapshot, ...snapshots].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSnapshots));
  } catch (error) {
    console.error("Failed to save snapshot to local storage", error);
  }
};

export const saveBackfilledSnapshots = (snapshots: Snapshot[]): void => {
  try {
    const existingData = localStorage.getItem(STORAGE_KEY);
    const existingSnapshots: Snapshot[] = existingData ? JSON.parse(existingData) : [];
    
    // Merge and deduplicate based on timestamp roughly
    const combined = [...snapshots, ...existingSnapshots];
    
    // Sort descending by time
    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Limit storage
    const unique = combined.filter((v, i, a) => a.findIndex(t => t.timestamp === v.timestamp) === i);
    const sliced = unique.slice(0, 200); // Allow more history for backfill
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sliced));
  } catch (error) {
    console.error("Failed to save backfilled snapshots", error);
  }
};

export const getSnapshots = (): Snapshot[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    return [];
  }
};

export const clearSnapshots = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const fetchOptionChainData = async (symbol: string): Promise<NSEResponse> => {
  console.log(`[DataService] Initiating fetch for ${symbol}...`);
  
  try {
    // 1. Get Stock ID
    const stockId = await getStockId(symbol);
    if (!stockId) {
      throw new Error(`Stock ID not found for ${symbol}`);
    }

    // 2. Get Expiries
    const expiries = await getExpiryDates(stockId);
    if (!expiries || expiries.length === 0) {
      throw new Error(`No expiry dates found for ${symbol}`);
    }
    
    // Use the nearest expiry (first in the list)
    const currentExpiry = expiries[0];
    console.log(`[DataService] Using Expiry: ${currentExpiry}`);

    // 3. Determine Timestamp
    // We want the latest available data. 
    // If market is closed (after 15:30), use 15:30. 
    // If market is open, use current time.
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();

    // Check if we are after market close (15:30)
    // Adjust logic as needed. Assuming 15:30 is the cutoff for intraday snapshots.
    if (hours > 15 || (hours === 15 && minutes >= 30)) {
      hours = 15;
      minutes = 30;
    } else if (hours < 9 || (hours === 9 && minutes < 15)) {
      // Before market open, default to yesterday's close or let API handle it
      hours = 15;
      minutes = 30;
    }

    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    console.log(`[DataService] Fetching snapshot for time: ${timeStr}`);

    // 4. Fetch Snapshot
    const data = await fetchTrendlyneSnapshot(stockId, currentExpiry, timeStr, symbol);
    
    if (data) {
      return data;
    } else {
      throw new Error("API returned empty or invalid data");
    }

  } catch (error) {
    console.error("[DataService] Error fetching real data:", error);
    console.warn("[DataService] Falling back to MOCK DATA.");
    
    // Fallback to Mock Data so UI doesn't crash, but log the error
    return new Promise((resolve) => {
      setTimeout(() => {
        const basePrice = symbol === 'NIFTY' ? 22000 : symbol === 'BANKNIFTY' ? 47000 : 20500;
        const currentPrice = basePrice + (Math.random() - 0.5) * 100;
        const strikes = generateMockData(currentPrice);
        
        resolve({
          records: {
            expiryDates: ["MOCK-DATA"],
            data: strikes,
            timestamp: new Date().toISOString(),
            underlyingValue: currentPrice,
            strikePrices: strikes.map(s => s.strikePrice)
          },
          filtered: {
            data: strikes,
            CE: { totOI: 0, totVol: 0 },
            PE: { totOI: 0, totVol: 0 }
          }
        });
      }, 500);
    });
  }
};