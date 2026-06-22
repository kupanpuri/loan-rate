export type SourceStatus = "live" | "needs_api_key" | "fallback" | "error" | "unavailable";

export type Platform =
  | "AAVE"
  | "MORPHO"
  | "BINANCE"
  | "GATE"
  | "BYBIT"
  | "BITGET";

export type LoanMarket = {
  id: string;
  platform: Platform;
  venue: string;
  borrowAsset: string;
  collateralAsset?: string;
  borrowApr?: number;
  borrowApy?: number;
  dailyRate?: number;
  initialLtv?: number;
  marginCallLtv?: number;
  liquidationLtv?: number;
  liquidationPenalty?: number;
  liquidationBonus?: number;
  borrowCap?: number;
  supplyCap?: number;
  availableLiquidityUsd?: number;
  riskNotes?: string;
  status: SourceStatus;
  source: string;
  updatedAt: string;
  error?: string;
  collateralBreakdown?: CollateralRisk[];
};

export type Snapshot = {
  generatedAt: string;
  nextSuggestedUpdates: string[];
  assets: string[];
  collateralAssets: string[];
  markets: LoanMarket[];
};

export type CollateralRisk = {
  collateralAsset: string;
  initialLtv?: number;
  marginCallLtv?: number;
  liquidationLtv?: number;
  liquidationPenalty?: number;
  liquidationBonus?: number;
  supplyCap?: number;
};
