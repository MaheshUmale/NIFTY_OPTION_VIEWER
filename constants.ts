import { NSEResponse } from './types';

export const REFRESH_INTERVAL = 60000; // 1 minute
export const DEFAULT_INDEX = 'NIFTY';

// A small subset of mock data to simulate the initial state or demo mode
export const MOCK_DATA: NSEResponse = {
  records: {
    expiryDates: ["28-Mar-2024", "04-Apr-2024"],
    timestamp: "28-Mar-2024 15:30:00",
    underlyingValue: 22123.65,
    strikePrices: [22000, 22050, 22100, 22150, 22200],
    data: []
  },
  filtered: {
    data: [],
    CE: { totOI: 1500000, totVol: 5000000 },
    PE: { totOI: 1200000, totVol: 4500000 }
  }
};

export const INDICES = [
  { label: 'NIFTY 50', value: 'NIFTY' },
  { label: 'BANK NIFTY', value: 'BANKNIFTY' },
  { label: 'FIN NIFTY', value: 'FINNIFTY' },
];
