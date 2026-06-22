import { TARGET_BORROW_ASSETS, TARGET_COLLATERAL_ASSETS } from "./config";
import { fetchAaveMarkets } from "./adapters/aave";
import { fetchCexMarkets } from "./adapters/cex";
import { fetchMorphoMarkets } from "./adapters/morpho";
import { nextSuggestedUpdates } from "./schedule";
import type { Snapshot } from "./types";

export async function collectSnapshot(): Promise<Snapshot> {
  const now = new Date().toISOString();
  const [aave, morpho, cex] = await Promise.all([
    fetchAaveMarkets(now),
    fetchMorphoMarkets(now),
    fetchCexMarkets(now)
  ]);

  return {
    generatedAt: now,
    nextSuggestedUpdates: nextSuggestedUpdates(),
    assets: [...TARGET_BORROW_ASSETS],
    collateralAssets: [...TARGET_COLLATERAL_ASSETS],
    markets: [...aave, ...morpho, ...cex].filter((market) => market.status !== "unavailable").sort((a, b) => {
      const platform = a.platform.localeCompare(b.platform);
      if (platform !== 0) return platform;
      return a.borrowAsset.localeCompare(b.borrowAsset);
    })
  };
}
