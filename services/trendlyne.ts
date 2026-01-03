import { NSEResponse, StrikeRecord } from '../types';

// Use 127.0.0.1 to avoid Node.js/Browser localhost IPv4/IPv6 resolution mismatches
// Port 5001 is used to avoid conflict with macOS AirPlay Receiver (port 5000)
const BASE_URL = 'http://127.0.0.1:5001/phoenix/api';

// Updated Fallback IDs based on user research
const FALLBACK_IDS: Record<string, string> = {
  'NIFTY': '1887',       // Nifty 50
  'BANKNIFTY': '1889',   // Nifty Bank (Common ID, validated via search usually)
  'FINNIFTY': '20374'    // Nifty Fin Service
};

const QUERY_MAP: Record<string, string> = {
  'NIFTY': 'Nifty 50',
  'BANKNIFTY': 'Nifty Bank',
  'FINNIFTY': 'Nifty Fin Service'
};

/**
 * Searches for the internal Stock ID used by Trendlyne for a given symbol.
 */
export const getStockId = async (symbol: string): Promise<string | null> => {
  // 1. Prioritize known IDs to ensure we get the main index
  if (FALLBACK_IDS[symbol]) {
    console.log(`[API] Using known Stock ID for ${symbol}: ${FALLBACK_IDS[symbol]}`);
    return FALLBACK_IDS[symbol];
  }

  const query = QUERY_MAP[symbol] || symbol;
  const url = `${BASE_URL}/search-contract-stock/?query=${encodeURIComponent(query)}`;
  
  try {
    console.log(`[API] Searching Stock ID for: ${symbol} (Query: ${query})`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
        console.error(`[API] Stock ID search failed: ${response.status} ${response.statusText}`);
        return null;
    }
    
    const json = await response.json();
    // Structure: body.data[0].stock_id
    const stockId = json?.body?.data?.[0]?.stock_id;
    
    if (stockId) {
        console.log(`[API] Found Stock ID for ${symbol}: ${stockId}`);
        return stockId.toString();
    }

    return null;
  } catch (e) {
    console.warn(`[API] Proxy lookup failed for ${symbol}. Is 'node service.js' running on port 5001? Error:`, e);
    return null;
  }
};

/**
 * Fetches available expiry dates for the stock.
 */
export const getExpiryDates = async (stockId: string): Promise<string[]> => {
  // New endpoint provided: search-contract-expiry-dates/?stock_pk=...
  const url = `${BASE_URL}/search-contract-expiry-dates/?stock_pk=${stockId}`;
  
  try {
    console.log(`[API] Fetching Expiry Dates for Stock ID: ${stockId}`);
    const response = await fetch(url);
    if (!response.ok) {
        console.error(`[API] Expiry fetch failed: ${response.status} ${response.statusText}`);
        return [];
    }
    const json = await response.json();
    
    // Structure: body.data.all_exp_list
    const dates: string[] = json?.body?.data?.all_exp_list || [];

    if (dates.length > 0) {
      console.log(`[API] Found ${dates.length} expiry dates. Using nearest: ${dates[0]}`);
      return dates;
    }
    
    console.warn("[API] No expiry dates returned.");
    return [];
  } catch (e) {
    console.error(`[API] Error fetching expiry dates. Is 'node service.js' running on port 5001? Details:`, e);
    return [];
  }
};

/**
 * Generates time intervals (HH:MM) from start to end time.
 */
export const generateTimeIntervals = (startTime = "09:15", endTime = "15:30", intervalMinutes = 15): string[] => {
  const times: string[] = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  let current = new Date();
  current.setHours(startHour, startMin, 0, 0);
  
  const end = new Date();
  end.setHours(endHour, endMin, 0, 0);
  
  while (current <= end) {
    const h = current.getHours().toString().padStart(2, '0');
    const m = current.getMinutes().toString().padStart(2, '0');
    times.push(`${h}:${m}`);
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }
  return times;
};

/**
 * Fetches a snapshot of Option Chain data.
 */
export const fetchTrendlyneSnapshot = async (
  stockId: string, 
  expiryDate: string, 
  timestamp: string, // HH:MM
  symbol: string
): Promise<NSEResponse | null> => {
  try {
    const url = `${BASE_URL}/live-oi-data/?stockId=${stockId}&expDateList=${expiryDate}&minTime=09:15&maxTime=${timestamp}&format=json`;
    console.log(`[API] Fetching Snapshot: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
        console.error(`[API] Snapshot fetch failed: ${response.status}`);
        return null;
    }
    const json = await response.json();
    
    // Check for explicit error in head or if body is missing
    if (json.head?.status && json.head?.status !== 0 && json.head?.status !== '0') {
        console.error(`[API] Error in response content: ${json.head?.description || json.head?.statusDescription}`);
        return null;
    }

    const body = json.body;
    if (!body) return null;

    const oiData = body.oiData || {};
    const strikes: StrikeRecord[] = [];
    
    // Parse underlying value safely
    let underlyingValue = 0;
    if (body.inputData?.lp) {
        underlyingValue = parseFloat(body.inputData.lp);
    } else if (body.stockData?.lp) {
        underlyingValue = parseFloat(body.stockData.lp);
    }

    const tradingDate = body.inputData?.tradingDate || new Date().toISOString().split('T')[0];

    console.log(`[API] Snapshot Received. Spot Price: ${underlyingValue}`);

    if (underlyingValue === 0 && Object.keys(oiData).length === 0) {
        console.warn("[API] Received empty data/zero price.");
        return null;
    }

    Object.keys(oiData).forEach(strikeStr => {
      const sData = oiData[strikeStr];
      const strikePrice = parseFloat(strikeStr);
      
      strikes.push({
        strikePrice,
        expiryDate,
        CE: {
           strikePrice,
           expiryDate,
           underlying: symbol,
           identifier: `CE${strikePrice}`,
           openInterest: parseInt(sData.callOi || '0'),
           changeinOpenInterest: parseInt(sData.callOiChange || '0'),
           pchangeinOpenInterest: 0,
           totalTradedVolume: parseInt(sData.callVol || '0'),
           impliedVolatility: 0,
           lastPrice: parseFloat(sData.callLtp || '0'),
           change: 0,
           pChange: 0,
           totalBuyQuantity: 0,
           totalSellQuantity: 0,
           bidQty: 0,
           bidprice: 0,
           askQty: 0,
           askPrice: 0,
           underlyingValue
        },
        PE: {
           strikePrice,
           expiryDate,
           underlying: symbol,
           identifier: `PE${strikePrice}`,
           openInterest: parseInt(sData.putOi || '0'),
           changeinOpenInterest: parseInt(sData.putOiChange || '0'),
           pchangeinOpenInterest: 0,
           totalTradedVolume: parseInt(sData.putVol || '0'),
           impliedVolatility: 0,
           lastPrice: parseFloat(sData.putLtp || '0'),
           change: 0,
           pChange: 0,
           totalBuyQuantity: 0,
           totalSellQuantity: 0,
           bidQty: 0,
           bidprice: 0,
           askQty: 0,
           askPrice: 0,
           underlyingValue
        }
      });
    });

    return {
      records: {
        expiryDates: [expiryDate],
        data: strikes.sort((a,b) => a.strikePrice - b.strikePrice),
        timestamp: `${tradingDate} ${timestamp}:00`,
        underlyingValue,
        strikePrices: strikes.map(s => s.strikePrice)
      },
      filtered: {
        data: strikes,
        CE: { totOI: 0, totVol: 0 },
        PE: { totOI: 0, totVol: 0 }
      }
    };

  } catch (e) {
    console.error(`[API] Failed to fetch snapshot for ${timestamp}`, e);
    return null;
  }
};