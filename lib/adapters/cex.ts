import { createHmac } from "crypto";
import { TARGET_BORROW_ASSETS, TARGET_COLLATERAL_ASSETS } from "../config";
import type { LoanMarket } from "../types";

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function apiCoin(asset: string) {
  return asset === "USDe" ? "USDE" : asset;
}

function displayCoin(asset: string) {
  return asset === "USDE" ? "USDe" : asset;
}

async function binanceSignedGet<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  const key = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_API_SECRET;
  if (!key || !secret) throw new Error("BINANCE_API_KEY/BINANCE_API_SECRET ausentes");

  const search = new URLSearchParams();
  Object.entries(params).forEach(([name, value]) => {
    if (value !== undefined && value !== "") search.set(name, String(value));
  });
  search.set("timestamp", String(Date.now()));
  search.set("recvWindow", "5000");
  const signature = createHmac("sha256", secret).update(search.toString()).digest("hex");
  search.set("signature", signature);

  const response = await fetch(`https://api.binance.com${path}?${search.toString()}`, {
    headers: { "X-MBX-APIKEY": key }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Binance ${response.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text) as T;
}

type BinanceLoanableResponse = {
  rows?: Array<{
    loanCoin: string;
    flexibleInterestRate?: string;
    flexibleMaxLimit?: string;
  }>;
};

type BinanceCollateralResponse = {
  rows?: Array<{
    collateralCoin: string;
    initialLTV?: string;
    marginCallLTV?: string;
    liquidationLTV?: string;
    maxLimit?: string;
  }>;
};

async function fetchBinanceMarkets(now: string): Promise<LoanMarket[]> {
  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) return [];

  try {
    const [loanableResponse, collateralResponse] = await Promise.all([
      binanceSignedGet<BinanceLoanableResponse>("/sapi/v2/loan/flexible/loanable/data"),
      binanceSignedGet<BinanceCollateralResponse>("/sapi/v2/loan/flexible/collateral/data")
    ]);

    const loanableByAsset = new Map(
      (loanableResponse.rows || [])
        .filter((row) => TARGET_BORROW_ASSETS.includes(displayCoin(row.loanCoin) as (typeof TARGET_BORROW_ASSETS)[number]))
        .map((row) => [displayCoin(row.loanCoin), row])
    );
    const collateralRows = (collateralResponse.rows || []).filter((row) =>
      TARGET_COLLATERAL_ASSETS.includes(displayCoin(row.collateralCoin) as (typeof TARGET_COLLATERAL_ASSETS)[number])
    );

    return TARGET_BORROW_ASSETS.map((asset) => {
      const loanable = loanableByAsset.get(asset);
      return {
        id: `BINANCE-${asset}`,
        platform: "BINANCE",
        venue: "Binance Flexible Loan",
        borrowAsset: asset,
        collateralAsset: TARGET_COLLATERAL_ASSETS.join(", "),
        borrowApr: asNumber(loanable?.flexibleInterestRate),
        borrowCap: asNumber(loanable?.flexibleMaxLimit),
        collateralBreakdown: TARGET_COLLATERAL_ASSETS.map((collateral) => {
          const row = collateralRows.find((item) => displayCoin(item.collateralCoin) === collateral);
          return {
            collateralAsset: collateral,
            initialLtv: asNumber(row?.initialLTV),
            marginCallLtv: asNumber(row?.marginCallLTV),
            liquidationLtv: asNumber(row?.liquidationLTV),
            supplyCap: asNumber(row?.maxLimit)
          };
        }).filter((item) => item.initialLtv !== undefined || item.supplyCap !== undefined),
        status: loanable ? "live" : "unavailable",
        source: "Binance SAPI /sapi/v2/loan/flexible",
        updatedAt: now,
        riskNotes: loanable
          ? "Taxa flexivel retornada pela Binance. LTV vem do endpoint de collateral data."
          : "Ativo nao retornou como loanable na Binance Flexible Loan."
      };
    });
  } catch (error) {
    return TARGET_BORROW_ASSETS.map((asset) => ({
      id: `BINANCE-${asset}-ERROR`,
      platform: "BINANCE",
      venue: "Binance Flexible Loan",
      borrowAsset: asset,
      collateralAsset: TARGET_COLLATERAL_ASSETS.join(", "),
      status: "error",
      source: "Binance SAPI /sapi/v2/loan/flexible",
      updatedAt: now,
      error: error instanceof Error ? error.message : String(error),
      riskNotes: "Falha ao consultar Binance com a chave configurada."
    }));
  }
}

type BybitLoanableResponse = {
  retCode: number;
  retMsg: string;
  result?: {
    list?: Array<{
      currency: string;
      flexibleBorrowable: boolean;
      maxBorrowingAmount?: string;
      flexibleAnnualizedInterestRate?: string;
    }>;
  };
};

type BybitCollateralResponse = {
  retCode: number;
  retMsg: string;
  result?: {
    collateralRatioConfigList?: Array<{
      collateralRatioList?: Array<{
        collateralRatio?: string;
        maxValue?: string;
      }>;
    }>;
  };
};

async function bybitGet<T>(path: string, params: Record<string, string>) {
  const url = new URL(`https://api.bybit.com${path}`);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`Bybit ${response.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text) as T;
}

async function fetchBybitMarkets(now: string): Promise<LoanMarket[]> {
  try {
    const [loanables, collaterals] = await Promise.all([
      Promise.all(
        TARGET_BORROW_ASSETS.map((asset) =>
          bybitGet<BybitLoanableResponse>("/v5/crypto-loan-common/loanable-data", { currency: apiCoin(asset) })
        )
      ),
      Promise.all(
        TARGET_COLLATERAL_ASSETS.map((asset) =>
          bybitGet<BybitCollateralResponse>("/v5/crypto-loan-common/collateral-data", { currency: apiCoin(asset) })
        )
      )
    ]);

    const loanableByAsset = new Map(
      loanables
        .filter((response) => response.retCode === 0)
        .flatMap((response) => response.result?.list || [])
        .map((row) => [displayCoin(row.currency), row])
    );

    const collateralBreakdown = TARGET_COLLATERAL_ASSETS.map((asset, index) => {
      const response = collaterals[index];
      const tier = response.result?.collateralRatioConfigList?.[0]?.collateralRatioList?.[0];
      return {
        collateralAsset: asset,
        initialLtv: asNumber(tier?.collateralRatio),
        supplyCap: asNumber(tier?.maxValue)
      };
    }).filter((item) => item.initialLtv !== undefined || item.supplyCap !== undefined);

    return TARGET_BORROW_ASSETS.map((asset) => {
      const row = loanableByAsset.get(asset);
      return {
        id: `BYBIT-${asset}`,
        platform: "BYBIT",
        venue: "Bybit Crypto Loan",
        borrowAsset: asset,
        collateralAsset: collateralBreakdown.map((item) => item.collateralAsset).join(", "),
        borrowApr: asNumber(row?.flexibleAnnualizedInterestRate),
        borrowCap: asNumber(row?.maxBorrowingAmount),
        collateralBreakdown,
        marginCallLtv: 0.85,
        liquidationLtv: 0.95,
        status: row?.flexibleBorrowable ? "live" : "unavailable",
        source: "Bybit public /v5/crypto-loan-common",
        updatedAt: now,
        riskNotes: row
          ? "Bybit retorna taxa anual flexivel publicamente; margin call/liquidacao sao parametros globais do produto."
          : "Ativo nao retornou como borrowable na Bybit Crypto Loan."
      };
    });
  } catch (error) {
    return TARGET_BORROW_ASSETS.map((asset) => ({
      id: `BYBIT-${asset}-ERROR`,
      platform: "BYBIT",
      venue: "Bybit Crypto Loan",
      borrowAsset: asset,
      collateralAsset: TARGET_COLLATERAL_ASSETS.join(", "),
      status: "error",
      source: "Bybit public /v5/crypto-loan-common",
      updatedAt: now,
      error: error instanceof Error ? error.message : String(error),
      riskNotes: "Falha ao consultar endpoint publico da Bybit."
    }));
  }
}

type GateCurrenciesResponse = {
  loan_currencies?: Array<{ currency: string }>;
  collateral_currencies?: Array<{ currency: string }>;
};

type GateLtvResponse = {
  init_ltv?: string;
  alert_ltv?: string;
  liquidate_ltv?: string;
};

type GateRateResponse = Array<{
  currency: string;
  current_rate?: string;
}>;

async function gateGet<T>(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.gateio.ws/api/v4${path}`);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`Gate ${response.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text) as T;
}

async function fetchGateMarkets(now: string): Promise<LoanMarket[]> {
  try {
    const [currencies, ltv, rates] = await Promise.all([
      gateGet<GateCurrenciesResponse>("/loan/multi_collateral/currencies"),
      gateGet<GateLtvResponse>("/loan/multi_collateral/ltv"),
      gateGet<GateRateResponse>("/loan/multi_collateral/current_rate", {
        currencies: TARGET_BORROW_ASSETS.map(apiCoin).join(",")
      })
    ]);

    const loanCoins = new Set((currencies.loan_currencies || []).map((item) => item.currency));
    const collateralCoins = new Set((currencies.collateral_currencies || []).map((item) => item.currency));
    const rateByAsset = new Map(rates.map((row) => [displayCoin(row.currency), row]));
    const collateralBreakdown = TARGET_COLLATERAL_ASSETS.filter((asset) => collateralCoins.has(apiCoin(asset))).map(
      (asset) => ({
        collateralAsset: asset,
        initialLtv: asNumber(ltv.init_ltv),
        marginCallLtv: asNumber(ltv.alert_ltv),
        liquidationLtv: asNumber(ltv.liquidate_ltv)
      })
    );

    return TARGET_BORROW_ASSETS.map((asset) => {
      const rate = rateByAsset.get(asset);
      const hourlyRate = asNumber(rate?.current_rate);
      const available = loanCoins.has(apiCoin(asset)) && !!rate;
      return {
        id: `GATE-${asset}`,
        platform: "GATE",
        venue: "Gate Multi-Collateral Loan",
        borrowAsset: asset,
        collateralAsset: collateralBreakdown.map((item) => item.collateralAsset).join(", "),
        borrowApr: hourlyRate === undefined ? undefined : hourlyRate * 24 * 365,
        collateralBreakdown,
        status: available ? "live" : "unavailable",
        source: "Gate public /loan/multi_collateral",
        updatedAt: now,
        riskNotes: available
          ? "Gate retorna current_rate horario; APR exibida e anualizada de forma simples. LTV e global do produto multi-collateral."
          : "Ativo nao retornou como moeda de emprestimo disponivel na Gate."
      };
    });
  } catch (error) {
    return TARGET_BORROW_ASSETS.map((asset) => ({
      id: `GATE-${asset}-ERROR`,
      platform: "GATE",
      venue: "Gate Multi-Collateral Loan",
      borrowAsset: asset,
      collateralAsset: TARGET_COLLATERAL_ASSETS.join(", "),
      status: "error",
      source: "Gate public /loan/multi_collateral",
      updatedAt: now,
      error: error instanceof Error ? error.message : String(error),
      riskNotes: "Falha ao consultar endpoints publicos da Gate."
    }));
  }
}

type BitgetLoanCoinsResponse = {
  code: string;
  msg: string;
  data?: {
    loanInfos?: Array<{
      coin: string;
      rateFlexible?: string;
      maxBorrowAmount?: string;
      maxBorrowLimit?: string;
    }>;
    pledgeInfos?: Array<{
      coin: string;
      initRate?: string;
      supRate?: string;
      forceRate?: string;
      maxPledgeAmount?: string;
    }>;
  };
};

async function bitgetSignedGet<T>(path: string, params: Record<string, string> = {}) {
  const key = process.env.BITGET_API_KEY;
  const secret = process.env.BITGET_API_SECRET;
  const passphrase = process.env.BITGET_API_PASSPHRASE;
  if (!key || !secret || !passphrase) {
    throw new Error("BITGET_API_KEY/BITGET_API_SECRET/BITGET_API_PASSPHRASE ausentes");
  }

  const search = new URLSearchParams(params);
  const query = search.toString();
  const requestPath = query ? `${path}?${query}` : path;
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}GET${requestPath}`)
    .digest("base64");

  const response = await fetch(`https://api.bitget.com${requestPath}`, {
    headers: {
      "ACCESS-KEY": key,
      "ACCESS-SIGN": signature,
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
      locale: "en-US"
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Bitget ${response.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text) as T;
}

async function fetchBitgetMarkets(now: string): Promise<LoanMarket[]> {
  if (!process.env.BITGET_API_KEY || !process.env.BITGET_API_SECRET || !process.env.BITGET_API_PASSPHRASE) {
    return TARGET_BORROW_ASSETS.map((asset) => ({
      id: `BITGET-${asset}`,
      platform: "BITGET",
      venue: "Bitget Crypto Loans",
      borrowAsset: asset,
      collateralAsset: TARGET_COLLATERAL_ASSETS.join(", "),
      collateralBreakdown: TARGET_COLLATERAL_ASSETS.map((collateralAsset) => ({ collateralAsset })),
      status: "needs_api_key",
      source: "Bitget /api/v3/loan/coins",
      updatedAt: now,
      riskNotes: "Configure chaves read-only da Bitget para consultar Crypto Loans."
    }));
  }

  try {
    const response = await bitgetSignedGet<BitgetLoanCoinsResponse>("/api/v3/loan/coins");
    if (response.code !== "00000") throw new Error(`Bitget ${response.code}: ${response.msg}`);

    const loanByAsset = new Map((response.data?.loanInfos || []).map((row) => [displayCoin(row.coin), row]));
    const pledgeByAsset = new Map((response.data?.pledgeInfos || []).map((row) => [displayCoin(row.coin), row]));
    const collateralBreakdown = TARGET_COLLATERAL_ASSETS.map((asset) => {
      const row = pledgeByAsset.get(asset);
      return {
        collateralAsset: asset,
        initialLtv: asNumber(row?.initRate),
        marginCallLtv: asNumber(row?.supRate),
        liquidationLtv: asNumber(row?.forceRate),
        supplyCap: asNumber(row?.maxPledgeAmount)
      };
    }).filter(
      (item) =>
        item.initialLtv !== undefined ||
        item.marginCallLtv !== undefined ||
        item.liquidationLtv !== undefined ||
        item.supplyCap !== undefined
    );

    return TARGET_BORROW_ASSETS.map((asset) => {
      const row = loanByAsset.get(asset);
      return {
        id: `BITGET-${asset}`,
        platform: "BITGET",
        venue: "Bitget Crypto Loans",
        borrowAsset: asset,
        collateralAsset: collateralBreakdown.map((item) => item.collateralAsset).join(", "),
        borrowApr: asNumber(row?.rateFlexible),
        borrowCap: asNumber(row?.maxBorrowAmount ?? row?.maxBorrowLimit),
        collateralBreakdown,
        status: row ? "live" : "unavailable",
        source: "Bitget /api/v3/loan/coins",
        updatedAt: now,
        riskNotes: row
          ? "Bitget retorna APR flexivel e parametros de pledge/collateral no endpoint de loan coins."
          : "Ativo nao retornou como loanable na Bitget Crypto Loans."
      };
    });
  } catch (error) {
    return TARGET_BORROW_ASSETS.map((asset) => ({
      id: `BITGET-${asset}-ERROR`,
      platform: "BITGET",
      venue: "Bitget Crypto Loans",
      borrowAsset: asset,
      collateralAsset: TARGET_COLLATERAL_ASSETS.join(", "),
      status: "error",
      source: "Bitget /api/v3/loan/coins",
      updatedAt: now,
      error: error instanceof Error ? error.message : String(error),
      riskNotes: "Falha ao consultar Bitget com a chave configurada."
    }));
  }
}

export async function fetchCexMarkets(now: string): Promise<LoanMarket[]> {
  const [binance, bybit, gate, bitget] = await Promise.all([
    fetchBinanceMarkets(now),
    fetchBybitMarkets(now),
    fetchGateMarkets(now),
    fetchBitgetMarkets(now)
  ]);
  return [...binance, ...bybit, ...gate, ...bitget];
}
