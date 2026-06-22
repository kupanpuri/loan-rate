import { TARGET_BORROW_ASSETS, TARGET_COLLATERAL_ASSETS } from "../config";
import type { LoanMarket } from "../types";

type MorphoMarket = {
  marketId: string;
  lltv: string;
  chain?: { id: number; network: string } | null;
  loanAsset: { symbol: string };
  collateralAsset?: { symbol: string } | null;
  state?: {
    borrowApy?: number | null;
    borrowAssetsUsd?: number | null;
    supplyAssetsUsd?: number | null;
    liquidityAssetsUsd?: number | null;
  } | null;
};

const MIN_MORPHO_LIQUIDITY_USD = 1000;

function normalizeSymbol(symbol: string) {
  if (symbol === "WETH") return "ETH";
  if (["WBTC", "cbBTC", "tBTC"].includes(symbol)) return "BTC";
  if (symbol === "WHYPE") return "HYPE";
  return symbol;
}

const query = `
  query LoanDashboardMarkets($search: String!) {
    markets(
      first: 100
      where: { search: $search, listed: true }
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
    ) {
      items {
        marketId
        lltv
        chain { id network }
        loanAsset { symbol }
        collateralAsset { symbol }
        state {
          borrowApy
          borrowAssetsUsd
          supplyAssetsUsd
          liquidityAssetsUsd
        }
      }
    }
  }
`;

export async function fetchMorphoMarkets(now: string): Promise<LoanMarket[]> {
  try {
    const responses = await Promise.all(
      TARGET_BORROW_ASSETS.map(async (asset) => {
        const response = await fetch("https://blue-api.morpho.org/graphql", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, variables: { search: asset } }),
          next: { revalidate: 60 }
        });

        if (!response.ok) {
          throw new Error(`Morpho GraphQL ${response.status}`);
        }

        const payload = (await response.json()) as {
          data?: { markets?: { items?: MorphoMarket[] } };
          errors?: Array<{ message: string }>;
        };

        if (payload.errors?.length) {
          throw new Error(payload.errors.map((error) => error.message).join("; "));
        }

        return payload.data?.markets?.items || [];
      })
    );

    const bestByPair = new Map<string, MorphoMarket>();
    responses
      .flat()
      .filter((market) => {
        const loan = normalizeSymbol(market.loanAsset.symbol);
        const collateral = normalizeSymbol(market.collateralAsset?.symbol || "");
        const liquidity = market.state?.liquidityAssetsUsd ?? market.state?.supplyAssetsUsd ?? 0;
        return (
          TARGET_BORROW_ASSETS.includes(loan as (typeof TARGET_BORROW_ASSETS)[number]) &&
          TARGET_COLLATERAL_ASSETS.includes(collateral as (typeof TARGET_COLLATERAL_ASSETS)[number]) &&
          liquidity >= MIN_MORPHO_LIQUIDITY_USD
        );
      })
      .forEach((market) => {
        const loan = normalizeSymbol(market.loanAsset.symbol);
        const collateral = normalizeSymbol(market.collateralAsset?.symbol || "");
        const key = `${loan}-${collateral}`;
        const current = bestByPair.get(key);
        const liquidity = market.state?.liquidityAssetsUsd ?? market.state?.supplyAssetsUsd ?? 0;
        const currentLiquidity = current?.state?.liquidityAssetsUsd ?? current?.state?.supplyAssetsUsd ?? -1;

        if (!current || liquidity > currentLiquidity) {
          bestByPair.set(key, market);
        }
      });

    return [...bestByPair.values()].map((market) => {
      const ltv = Number(market.lltv) / 1e18;
      const shortMarketId = market.marketId.slice(0, 8);
      return {
        id: `MORPHO-${market.marketId}`,
        platform: "MORPHO",
        venue: `Morpho Blue ${market.chain?.network || ""}`.trim(),
        borrowAsset: normalizeSymbol(market.loanAsset.symbol),
        collateralAsset: market.collateralAsset
          ? normalizeSymbol(market.collateralAsset.symbol) === market.collateralAsset.symbol
            ? market.collateralAsset.symbol
            : `${normalizeSymbol(market.collateralAsset.symbol)} (${market.collateralAsset.symbol})`
          : "N/A",
        borrowApy: market.state?.borrowApy ?? undefined,
        borrowApr: market.state?.borrowApy ? Math.log1p(market.state.borrowApy) : undefined,
        initialLtv: ltv,
        liquidationLtv: ltv,
        availableLiquidityUsd: market.state?.liquidityAssetsUsd ?? market.state?.supplyAssetsUsd ?? undefined,
        status: "live",
        source: "Morpho Blue GraphQL",
        updatedAt: now,
        riskNotes:
          `Mostrando o mercado com maior liquidez para este par. Market ${shortMarketId}; Morpho usa LLTV por mercado.`
      };
    });
  } catch (error) {
    return TARGET_BORROW_ASSETS.flatMap((asset) =>
      TARGET_COLLATERAL_ASSETS.map((collateral) => ({
        id: `MORPHO-${asset}-${collateral}-ERROR`,
        platform: "MORPHO",
        venue: "Morpho Blue",
        borrowAsset: asset,
        collateralAsset: collateral,
        status: "error",
        source: "Morpho Blue GraphQL",
        updatedAt: now,
        error: error instanceof Error ? error.message : String(error),
        riskNotes: "Nao foi possivel consultar o endpoint publico do Morpho nesta execucao."
      }))
    );
  }
}
