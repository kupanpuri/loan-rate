import { createPublicClient, formatUnits, http, type Address } from "viem";
import { base, mainnet } from "viem/chains";
import { CHAINS, TARGET_BORROW_ASSETS, TARGET_COLLATERAL_ASSETS } from "../config";
import type { LoanMarket } from "../types";

const dataProviderAbi = [
  {
    name: "getAllReservesTokens",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "symbol", type: "string" },
          { name: "tokenAddress", type: "address" }
        ]
      }
    ]
  },
  {
    name: "getReserveConfigurationData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "decimals", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "liquidationThreshold", type: "uint256" },
      { name: "liquidationBonus", type: "uint256" },
      { name: "reserveFactor", type: "uint256" },
      { name: "usageAsCollateralEnabled", type: "bool" },
      { name: "borrowingEnabled", type: "bool" },
      { name: "stableBorrowRateEnabled", type: "bool" },
      { name: "isActive", type: "bool" },
      { name: "isFrozen", type: "bool" }
    ]
  },
  {
    name: "getReserveData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "unbacked", type: "uint256" },
      { name: "accruedToTreasuryScaled", type: "uint256" },
      { name: "totalAToken", type: "uint256" },
      { name: "totalStableDebt", type: "uint256" },
      { name: "totalVariableDebt", type: "uint256" },
      { name: "liquidityRate", type: "uint256" },
      { name: "variableBorrowRate", type: "uint256" },
      { name: "stableBorrowRate", type: "uint256" },
      { name: "averageStableBorrowRate", type: "uint256" },
      { name: "liquidityIndex", type: "uint256" },
      { name: "variableBorrowIndex", type: "uint256" },
      { name: "lastUpdateTimestamp", type: "uint40" }
    ]
  },
  {
    name: "getReserveCaps",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "borrowCap", type: "uint256" },
      { name: "supplyCap", type: "uint256" }
    ]
  }
] as const;

function normalizeSymbol(symbol: string) {
  if (symbol === "WETH") return "ETH";
  if (["WBTC", "cbBTC", "tBTC"].includes(symbol)) return "BTC";
  if (symbol === "WHYPE") return "HYPE";
  return symbol;
}

function rayToDecimal(value: bigint) {
  return Number(formatUnits(value, 27));
}

function bps(value: bigint) {
  return Number(value) / 10000;
}

function bonusToPenalty(value: bigint) {
  const bonus = Number(value) / 10000;
  return Math.max(0, bonus - 1);
}

async function fetchChainAaveMarkets(
  key: keyof typeof CHAINS,
  now: string
): Promise<LoanMarket[]> {
  const chainConfig = CHAINS[key];
  const chain = key === "base" ? base : mainnet;
  const errors: string[] = [];

  for (const rpcUrl of chainConfig.rpcUrls as string[]) {
    try {
      const client = createPublicClient({
        chain,
        transport: http(rpcUrl)
      });

      const reserves = await client.readContract({
        address: chainConfig.aavePoolDataProvider as Address,
        abi: dataProviderAbi,
        functionName: "getAllReservesTokens"
      });

      const borrowReserves = reserves.filter((reserve) =>
        TARGET_BORROW_ASSETS.includes(normalizeSymbol(reserve.symbol) as (typeof TARGET_BORROW_ASSETS)[number])
      );
      const collateralReserves = reserves.filter((reserve) =>
        TARGET_COLLATERAL_ASSETS.includes(
          normalizeSymbol(reserve.symbol) as (typeof TARGET_COLLATERAL_ASSETS)[number]
        )
      );

      const borrowData = await Promise.all(
        borrowReserves.map(async (reserve) => {
          const [config, data, caps] = await Promise.all([
            client.readContract({
              address: chainConfig.aavePoolDataProvider as Address,
              abi: dataProviderAbi,
              functionName: "getReserveConfigurationData",
              args: [reserve.tokenAddress]
            }),
            client.readContract({
              address: chainConfig.aavePoolDataProvider as Address,
              abi: dataProviderAbi,
              functionName: "getReserveData",
              args: [reserve.tokenAddress]
            }),
            client.readContract({
              address: chainConfig.aavePoolDataProvider as Address,
              abi: dataProviderAbi,
              functionName: "getReserveCaps",
              args: [reserve.tokenAddress]
            })
          ]);

          return {
            symbol: normalizeSymbol(reserve.symbol),
            rawSymbol: reserve.symbol,
            config,
            data,
            caps
          };
        })
      );

      const collateralData = await Promise.all(
        collateralReserves.map(async (reserve) => {
          const [config, data, caps] = await Promise.all([
            client.readContract({
              address: chainConfig.aavePoolDataProvider as Address,
              abi: dataProviderAbi,
              functionName: "getReserveConfigurationData",
              args: [reserve.tokenAddress]
            }),
            client.readContract({
              address: chainConfig.aavePoolDataProvider as Address,
              abi: dataProviderAbi,
              functionName: "getReserveData",
              args: [reserve.tokenAddress]
            }),
            client.readContract({
              address: chainConfig.aavePoolDataProvider as Address,
              abi: dataProviderAbi,
              functionName: "getReserveCaps",
              args: [reserve.tokenAddress]
            })
          ]);

          return {
            symbol: normalizeSymbol(reserve.symbol),
            rawSymbol: reserve.symbol,
            config,
            data,
            caps
          };
        })
      );

      const enabledCollaterals = collateralData.filter((collateral) => collateral.config[5]);
      const markets = borrowData.map((borrow) => {
        const borrowCap = Number(borrow.caps[0]) === 0 ? undefined : Number(borrow.caps[0]);
        const borrowApr = rayToDecimal(borrow.data[6]);
        const collateralBreakdown = enabledCollaterals.map((collateral) => {
          const label =
            collateral.symbol === collateral.rawSymbol
              ? collateral.symbol
              : `${collateral.symbol} (${collateral.rawSymbol})`;

          return {
            collateralAsset: label,
            initialLtv: bps(collateral.config[1]),
            liquidationLtv: bps(collateral.config[2]),
            liquidationBonus: Number(collateral.config[3]) / 10000,
            liquidationPenalty: bonusToPenalty(collateral.config[3]),
            supplyCap: Number(collateral.caps[1]) === 0 ? undefined : Number(collateral.caps[1])
          };
        });

        return {
          id: `AAVE-${chainConfig.name}-${borrow.symbol}`,
          platform: "AAVE",
          venue: `Aave V3 ${chainConfig.name}`,
          borrowAsset: borrow.symbol,
          collateralAsset: collateralBreakdown.map((collateral) => collateral.collateralAsset).join(", "),
          collateralBreakdown,
          borrowApr,
          borrowApy: Math.expm1(borrowApr),
          borrowCap,
          availableLiquidityUsd: undefined,
          status: borrow.config[6] && borrow.config[8] && !borrow.config[9] ? "live" : "unavailable",
          source: `${chainConfig.name} RPC / AaveProtocolDataProvider (${new URL(rpcUrl).host})`,
          updatedAt: now,
          riskNotes: `Borrow rate vem da reserva ${borrow.rawSymbol}. LTV/liquidacao variam por colateral e estao detalhados nas colunas de risco.`
        } satisfies LoanMarket;
      }
      );

      return markets;
    } catch (error) {
      errors.push(`${rpcUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join(" | "));
}

export async function fetchAaveMarkets(now: string): Promise<LoanMarket[]> {
  const results = await Promise.allSettled([
    fetchChainAaveMarkets("ethereum", now),
    fetchChainAaveMarkets("base", now)
  ]);

  const chainKeys = ["ethereum", "base"] as const;
  const markets = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const chain = CHAINS[chainKeys[index]];
    return TARGET_BORROW_ASSETS.flatMap((asset) =>
      TARGET_COLLATERAL_ASSETS.map((collateral) => ({
        id: `AAVE-${chain.name}-${asset}-${collateral}-ERROR`,
        platform: "AAVE" as const,
        venue: `Aave V3 ${chain.name}`,
        borrowAsset: asset,
        collateralAsset: collateral,
        status: "error" as const,
        source: `${chain.name} RPC / AaveProtocolDataProvider`,
        updatedAt: now,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        riskNotes: `Nao foi possivel consultar ${chain.name}. Configure um RPC confiavel em .env.local.`
      }))
    );
  });
  if (markets.length > 0) return markets;

  return TARGET_BORROW_ASSETS.flatMap((asset) =>
    TARGET_COLLATERAL_ASSETS.map((collateral) => ({
      id: `AAVE-${asset}-${collateral}-ERROR`,
      platform: "AAVE",
      venue: "Aave V3",
      borrowAsset: asset,
      collateralAsset: collateral,
      status: "error",
      source: "AaveProtocolDataProvider",
      updatedAt: now,
      riskNotes: "Nao foi possivel consultar o RPC. Configure ETHEREUM_RPC_URL/BASE_RPC_URL em .env.local."
    }))
  );
}
