export interface OptionData {
  strikePrice: number;
  expiryDate: string;
  underlying: string;
  identifier: string;
  openInterest: number;
  changeinOpenInterest: number;
  pchangeinOpenInterest: number;
  totalTradedVolume: number;
  impliedVolatility: number;
  lastPrice: number;
  change: number;
  pChange: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
  bidQty: number;
  bidprice: number;
  askQty: number;
  askPrice: number;
  underlyingValue: number;
}

export interface StrikeRecord {
  strikePrice: number;
  expiryDate: string;
  CE?: OptionData;
  PE?: OptionData;
}

export interface NSEResponse {
  records: {
    expiryDates: string[];
    data: StrikeRecord[];
    timestamp: string;
    underlyingValue: number;
    strikePrices: number[];
  };
  filtered: {
    data: StrikeRecord[];
    CE: { totOI: number; totVol: number };
    PE: { totOI: number; totVol: number };
  };
}

export interface AnalysisResult {
  pcr: number;
  pcrVol: number;
  maxPain: number;
  callOI: number;
  putOI: number;
  callChangeOI: number;
  putChangeOI: number;
  atmStrike: number;
  trend: 'Bullish' | 'Bearish' | 'Neutral';
  support: number;
  resistance: number;
}

export interface Snapshot {
  id: string; // timestamp
  timestamp: string;
  underlyingValue: number;
  pcr: number;
  maxPain: number;
  ceTotalOI: number;
  peTotalOI: number;
}
