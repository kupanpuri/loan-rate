"use client";

import { RefreshCw, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { numberCompact, percent } from "@/lib/format";
import type { Platform, Snapshot, SourceStatus } from "@/lib/types";

const platforms: Array<Platform | "ALL"> = [
  "ALL",
  "AAVE",
  "MORPHO",
  "BINANCE",
  "GATE",
  "BYBIT",
  "BITGET"
];

const statuses: Array<SourceStatus | "ALL"> = ["ALL", "live", "needs_api_key", "error", "fallback"];

function statusLabel(status: SourceStatus) {
  const labels: Record<SourceStatus, string> = {
    live: "Live",
    needs_api_key: "Precisa API key",
    fallback: "Fallback",
    error: "Erro",
    unavailable: "Indisponivel"
  };
  return labels[status];
}

function riskLines(
  market: Snapshot["markets"][number],
  field: "initialLtv" | "marginCallLtv" | "liquidationLtv" | "liquidationPenalty"
) {
  if (!market.collateralBreakdown?.length) {
    return percent(market[field]);
  }

  return (
    <div className="riskList">
      {market.collateralBreakdown.map((collateral) => (
        <span key={`${collateral.collateralAsset}-${field}`}>
          {collateral.collateralAsset}: {percent(collateral[field])}
        </span>
      ))}
    </div>
  );
}

function collateralCell(market: Snapshot["markets"][number]) {
  if (!market.collateralBreakdown?.length) return market.collateralAsset || "-";

  return (
    <div className="riskList">
      {market.collateralBreakdown.map((collateral) => (
        <span key={collateral.collateralAsset}>{collateral.collateralAsset}</span>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [platform, setPlatform] = useState<Platform | "ALL">("ALL");
  const [asset, setAsset] = useState("ALL");
  const [collateral, setCollateral] = useState("ALL");
  const [status, setStatus] = useState<SourceStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    setError(null);
    force ? setRefreshing(true) : setLoading(true);
    try {
      const response = await fetch("/api/snapshot", { method: force ? "POST" : "GET" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSnapshot(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return (snapshot?.markets || []).filter((market) => {
      if (platform !== "ALL" && market.platform !== platform) return false;
      if (asset !== "ALL" && market.borrowAsset !== asset) return false;
      if (collateral !== "ALL" && !(market.collateralAsset || "").includes(collateral)) return false;
      if (status !== "ALL" && market.status !== status) return false;
      return true;
    });
  }, [asset, collateral, platform, snapshot, status]);

  const summary = useMemo(() => {
    const markets = snapshot?.markets || [];
    return {
      total: markets.length,
      live: markets.filter((market) => market.status === "live").length,
      needsKey: markets.filter((market) => market.status === "needs_api_key").length,
      error: markets.filter((market) => market.status === "error").length
    };
  }, [snapshot]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Painel Loan</p>
          <h1>Taxas, LTV e liquidação por protocolo</h1>
        </div>
        <button className="primaryButton" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw size={18} className={refreshing ? "spin" : ""} />
          Atualizar agora
        </button>
      </header>

      {error && <div className="banner error">Falha ao carregar snapshot: {error}</div>}

      <section className="summaryGrid">
        <div className="metric">
          <span>Mercados monitorados</span>
          <strong>{loading ? "-" : summary.total}</strong>
        </div>
        <div className="metric">
          <span>Fontes live</span>
          <strong>{loading ? "-" : summary.live}</strong>
        </div>
        <div className="metric">
          <span>Dependem de chave</span>
          <strong>{loading ? "-" : summary.needsKey}</strong>
        </div>
        <div className="metric">
          <span>Com erro</span>
          <strong>{loading ? "-" : summary.error}</strong>
        </div>
      </section>

      <section className="controls" aria-label="Filtros">
        <div className="controlTitle">
          <SlidersHorizontal size={18} />
          Filtros
        </div>
        <select value={platform} onChange={(event) => setPlatform(event.target.value as Platform | "ALL")}>
          {platforms.map((item) => (
            <option key={item} value={item}>
              {item === "ALL" ? "Todas plataformas" : item}
            </option>
          ))}
        </select>
        <select value={asset} onChange={(event) => setAsset(event.target.value)}>
          <option value="ALL">Todos borrows</option>
          {snapshot?.assets.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={collateral} onChange={(event) => setCollateral(event.target.value)}>
          <option value="ALL">Todos colaterais</option>
          {snapshot?.collateralAssets.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value as SourceStatus | "ALL")}>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item === "ALL" ? "Todos status" : statusLabel(item)}
            </option>
          ))}
        </select>
      </section>

      <section className="meta">
        <div>
          <span>Ultimo snapshot</span>
          <strong>{snapshot ? new Date(snapshot.generatedAt).toLocaleString("pt-BR") : "-"}</strong>
        </div>
        <div>
          <span>Agenda sugerida</span>
          <strong>00:00, 06:00, 12:00, 18:00 BRT</strong>
        </div>
      </section>

      <section className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Plataforma</th>
              <th>Ativo</th>
              <th>Colateral</th>
              <th>Borrow</th>
              <th>LTV inicial</th>
              <th>Call</th>
              <th>Liquidação</th>
              <th>Penalidade</th>
              <th>Caps/Liquidez</th>
              <th>Status</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, index) => (
                <tr key={index}>
                  <td colSpan={11}>
                    <div className="skeleton" />
                  </td>
                </tr>
              ))}
            {!loading &&
              filtered.map((market) => (
                <tr key={market.id}>
                  <td>
                    <strong>{market.platform}</strong>
                    <span>{market.venue}</span>
                  </td>
                  <td>{market.borrowAsset}</td>
                  <td>{collateralCell(market)}</td>
                  <td>
                    <strong>{percent(market.borrowApr)}</strong>
                    <span>APY {percent(market.borrowApy)}</span>
                  </td>
                  <td>{riskLines(market, "initialLtv")}</td>
                  <td>{riskLines(market, "marginCallLtv")}</td>
                  <td>{riskLines(market, "liquidationLtv")}</td>
                  <td>{riskLines(market, "liquidationPenalty")}</td>
                  <td>
                    <span>Borrow cap {numberCompact(market.borrowCap)}</span>
                    <span>Supply/liquidez {numberCompact(market.supplyCap ?? market.availableLiquidityUsd)}</span>
                  </td>
                  <td>
                    <span className={`pill ${market.status}`}>{statusLabel(market.status)}</span>
                  </td>
                  <td>
                    <strong>{market.source}</strong>
                    <span>{market.error || market.riskNotes || "-"}</span>
                  </td>
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="empty">
                  Nenhum mercado com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="callout">
        <ShieldAlert size={20} />
        <p>
          CEXs precisam de chaves read-only para refletir sua conta, VIP level, produto e região. Guarde as chaves em
          `.env.local`; nunca coloque permissão de saque.
        </p>
      </section>
    </main>
  );
}
