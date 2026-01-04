export interface Player {
  id: string;
  name: string;
  isDealer: boolean; // Vital for table draw algorithm
}

export interface PlayerSession {
  playerId: string;
  buyIns: number; // Count of buy-ins
  rebuys: number; // Count of rebuys
  addOns: number; // Count of add-ons
  rank: number | null; // Null if not eliminated yet, 1 = Winner
}

export interface Table {
  id: number;
  players: string[]; // Player IDs
}

export interface FinancialConfig {
  buyInCost: number;
  rebuyCost: number;
  addOnCost: number;
  bbqCost: number; // Total BBQ cost to split
}

export interface FinancialResult {
  grossTotal: number;
  adminTax: number; // 15%
  mainEventPot: number; // 5%
  netPrizePool: number;
  prizes: {
    first: number;
    second: number;
    third: number;
  };
  roundingAdjustment: number; // The "quebrado" logic
  playerBalances: {
    playerId: string;
    totalPaid: number;
    prizeReceived: number;
    bbqShare: number;
    netBalance: number; // Positive = Receive, Negative = Pay
  }[];
}

export interface RoundResult {
  playerId: string;
  points: number;
}

export interface HistoricalRound {
  id: number;
  date: string;
  totalPot: number;
  playerResults: {
    playerId: string;
    points: number;
    netBalance: number;
    rank: number | null;
  }[];
}