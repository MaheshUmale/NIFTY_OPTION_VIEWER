import { StrikeRecord, AnalysisResult } from '../types';

/**
 * Calculates the Max Pain strike price.
 * Max Pain is the strike at which option writers (sellers) lose the least money.
 */
export const calculateMaxPain = (data: StrikeRecord[]): number => {
  if (!data || data.length === 0) return 0;

  let minTotalLoss = Number.MAX_VALUE;
  let maxPainStrike = 0;

  // Iterate through each potential expiration strike (using the available strike prices)
  const strikes = data.map(d => d.strikePrice).sort((a, b) => a - b);

  for (const expirationStrike of strikes) {
    let totalLoss = 0;

    for (const record of data) {
      const strike = record.strikePrice;
      const ceOI = record.CE?.openInterest || 0;
      const peOI = record.PE?.openInterest || 0;

      // Call Writer Loss: If Expiry > Strike, Loss = (Expiry - Strike) * OI
      if (expirationStrike > strike) {
        totalLoss += (expirationStrike - strike) * ceOI;
      }

      // Put Writer Loss: If Strike > Expiry, Loss = (Strike - Expiry) * OI
      if (strike > expirationStrike) {
        totalLoss += (strike - expirationStrike) * peOI;
      }
    }

    if (totalLoss < minTotalLoss) {
      minTotalLoss = totalLoss;
      maxPainStrike = expirationStrike;
    }
  }

  return maxPainStrike;
};

/**
 * Finds the ATM (At The Money) strike based on the spot price.
 */
export const getATMStrike = (spotPrice: number, strikes: number[]): number => {
  if (!strikes.length) return 0;
  return strikes.reduce((prev, curr) => 
    Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
  );
};

/**
 * Analyzes the option chain to return summary metrics.
 */
export const analyzeOptionChain = (
  data: StrikeRecord[], 
  underlyingValue: number
): AnalysisResult => {
  let totalCallOI = 0;
  let totalPutOI = 0;
  let totalCallVol = 0;
  let totalPutVol = 0;
  let totalCallChangeOI = 0;
  let totalPutChangeOI = 0;

  let maxCallOI = 0;
  let maxPutOI = 0;
  let resistance = 0;
  let support = 0;

  const validData = data.filter(d => d.CE && d.PE); // Ensure we have both sides usually

  validData.forEach(record => {
    const ceOI = record.CE?.openInterest || 0;
    const peOI = record.PE?.openInterest || 0;
    const ceVol = record.CE?.totalTradedVolume || 0;
    const peVol = record.PE?.totalTradedVolume || 0;
    const ceChangeOI = record.CE?.changeinOpenInterest || 0;
    const peChangeOI = record.PE?.changeinOpenInterest || 0;

    totalCallOI += ceOI;
    totalPutOI += peOI;
    totalCallVol += ceVol;
    totalPutVol += peVol;
    totalCallChangeOI += ceChangeOI;
    totalPutChangeOI += peChangeOI;

    if (ceOI > maxCallOI) {
      maxCallOI = ceOI;
      resistance = record.strikePrice;
    }
    if (peOI > maxPutOI) {
      maxPutOI = peOI;
      support = record.strikePrice;
    }
  });

  const pcr = totalCallOI === 0 ? 0 : Number((totalPutOI / totalCallOI).toFixed(2));
  const pcrVol = totalCallVol === 0 ? 0 : Number((totalPutVol / totalCallVol).toFixed(2));
  const maxPain = calculateMaxPain(validData);
  const atmStrike = getATMStrike(underlyingValue, validData.map(d => d.strikePrice));

  // Simple Trend logic based on PCR and OI Change
  let trend: 'Bullish' | 'Bearish' | 'Neutral' = 'Neutral';
  if (pcr > 1.2) trend = 'Bullish';
  else if (pcr < 0.6) trend = 'Bearish';
  else if (totalPutChangeOI > totalCallChangeOI) trend = 'Bullish';
  else if (totalCallChangeOI > totalPutChangeOI) trend = 'Bearish';

  return {
    pcr,
    pcrVol,
    maxPain,
    callOI: totalCallOI,
    putOI: totalPutOI,
    callChangeOI: totalCallChangeOI,
    putChangeOI: totalPutChangeOI,
    atmStrike,
    trend,
    support,
    resistance
  };
};

/**
 * Helper to generate random data for demo purposes if fetch fails or is in demo mode.
 */
export const generateMockData = (basePrice: number): StrikeRecord[] => {
  const strikes: StrikeRecord[] = [];
  const startStrike = Math.floor(basePrice / 50) * 50 - 1000;
  for (let i = 0; i < 40; i++) {
    const strike = startStrike + (i * 50);
    strikes.push({
      strikePrice: strike,
      expiryDate: 'Demo',
      CE: {
        strikePrice: strike,
        expiryDate: 'Demo',
        underlying: 'NIFTY',
        identifier: `CE${strike}`,
        openInterest: Math.floor(Math.random() * 100000),
        changeinOpenInterest: Math.floor(Math.random() * 20000) - 5000,
        pchangeinOpenInterest: 0,
        totalTradedVolume: Math.floor(Math.random() * 500000),
        impliedVolatility: 12 + Math.random() * 5,
        lastPrice: Math.max(0, basePrice - strike + (Math.random() * 50)),
        change: 0,
        pChange: 0,
        totalBuyQuantity: 0,
        totalSellQuantity: 0,
        bidQty: 0,
        bidprice: 0,
        askQty: 0,
        askPrice: 0,
        underlyingValue: basePrice
      },
      PE: {
        strikePrice: strike,
        expiryDate: 'Demo',
        underlying: 'NIFTY',
        identifier: `PE${strike}`,
        openInterest: Math.floor(Math.random() * 100000),
        changeinOpenInterest: Math.floor(Math.random() * 20000) - 5000,
        pchangeinOpenInterest: 0,
        totalTradedVolume: Math.floor(Math.random() * 500000),
        impliedVolatility: 14 + Math.random() * 5,
        lastPrice: Math.max(0, strike - basePrice + (Math.random() * 50)),
        change: 0,
        pChange: 0,
        totalBuyQuantity: 0,
        totalSellQuantity: 0,
        bidQty: 0,
        bidprice: 0,
        askQty: 0,
        askPrice: 0,
        underlyingValue: basePrice
      }
    });
  }
  return strikes;
};
