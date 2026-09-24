"use client";

import { useState } from "react";
import { RefreshCw, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ActionButton,
  Notice,
  timestamp,
  titleCase,
  usd,
  useOperatingResource,
  type OperatingApi,
} from "./operating-pages";

type Finance = {
  mode: string;
  period: string;
  generatedAt: string;
  metrics: {
    grossSales: number;
    refunds: number;
    netSales: number;
    orderCount: number;
    aov: number | null;
    estimatedCogs: number | null;
    grossProfitEstimate: number | null;
    adSpend: number;
    reservedAdSpend: number;
    contributionBeforeUnrecordedCosts: number | null;
    netOperatingProfit: null;
    cashBalance: null;
    blendedMer: number | null;
    refundedOrderRate: number | null;
  };
  daily: {
    date: string;
    grossSales: number;
    refunds: number;
    adSpend: number;
  }[];
  products: {
    productId: string;
    name: string;
    units: number;
    grossSales: number;
    estimatedCogs: number | null;
  }[];
  dataQuality: {
    costBasis: string;
    missingCostLines: number;
    unavailable: string[];
    notes: string[];
  };
};
const amount = (value: number | null) =>
  value === null ? "Unavailable" : usd(value);

export function FinancePage({ api }: { api: OperatingApi }) {
  const [period, setPeriod] = useState("30d");
  const { data, error, loading, refresh } = useOperatingResource<Finance>(
    api,
    `finance?period=${period}`,
  );
  if (!data)
    return (
      <div className="panel os-panel">
        <Notice error={!!error}>
          {error || "Loading your financial ledger…"}
        </Notice>
        {error && (
          <ActionButton onClick={() => void refresh()}>Retry</ActionButton>
        )}
      </div>
    );
  const metrics = data.metrics;
  return (
    <div className="os-stack">
      <div className="os-toolbar">
        <div>
          <span className="eyebrow">
            {data.mode === "simulation"
              ? "SIMULATION LEDGER"
              : "RECORDED TRANSACTIONS"}
          </span>
          <p>Updated {timestamp(data.generatedAt)}</p>
        </div>
        <div className="os-toolbar-actions">
          <label className="os-select-label">
            <span className="sr-only">Finance period</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All recorded orders</option>
            </select>
          </label>
          <ActionButton onClick={() => void refresh()} busy={loading}>
            <RefreshCw size={15} />
            Refresh
          </ActionButton>
        </div>
      </div>
      {error && (
        <Notice error>
          {error} Values below are from the last successful refresh.
        </Notice>
      )}
      <Notice>
        Based on persisted orders and committed advertising reservations.
        Product costs are estimates from the current catalog. Net operating
        profit and cash balance remain unavailable until fees, expenses and cash
        are reconciled.
      </Notice>
      <div className="os-metric-grid">
        {[
          [
            "Net sales",
            usd(metrics.netSales),
            "Gross sales less recorded refunds",
          ],
          [
            "Estimated gross profit",
            amount(metrics.grossProfitEstimate),
            "Net sales less estimated landed costs",
          ],
          [
            "Recorded ad spend",
            usd(metrics.adSpend),
            `${usd(metrics.reservedAdSpend)} currently reserved`,
          ],
          [
            "Contribution estimate",
            amount(metrics.contributionBeforeUnrecordedCosts),
            "Before fees, taxes and operating costs",
          ],
        ].map(([name, value, description]) => (
          <div className="panel os-metric" key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
            <small>{description}</small>
          </div>
        ))}
      </div>
      <div className="os-finance-grid">
        <section className="panel os-panel">
          <div className="os-section-heading">
            <h2>
              <TrendingUp size={18} /> Sales and advertising
            </h2>
            <p>Refunds are attributed to the original order date.</p>
          </div>
          {data.daily.length ? (
            <div className="os-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily}>
                  <defs>
                    <linearGradient
                      id="finance-sales"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#71966e"
                        stopOpacity={0.25}
                      />
                      <stop offset="100%" stopColor="#71966e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "var(--muted)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted)" }}
                    tickFormatter={(value) => `$${value}`}
                    tickLine={false}
                    axisLine={false}
                    width={58}
                  />
                  <Tooltip
                    formatter={(value) => usd(Number(value))}
                    contentStyle={{
                      background: "var(--paper)",
                      borderColor: "var(--line)",
                      borderRadius: 8,
                    }}
                  />
                  <Area
                    name="Gross sales"
                    dataKey="grossSales"
                    type="monotone"
                    stroke="#71966e"
                    fill="url(#finance-sales)"
                    strokeWidth={2}
                  />
                  <Area
                    name="Ad spend"
                    dataKey="adSpend"
                    type="monotone"
                    stroke="#c6a76c"
                    fill="transparent"
                    strokeWidth={2}
                  />
                  <Area
                    name="Refunds"
                    dataKey="refunds"
                    type="monotone"
                    stroke="#c57d69"
                    fill="transparent"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="os-empty">No recorded transactions in this period.</p>
          )}
        </section>
        <section className="panel os-panel">
          <div className="os-section-heading">
            <h2>How the numbers add up</h2>
          </div>
          <dl className="os-ledger">
            {[
              ["Gross sales", usd(metrics.grossSales)],
              ["Refunds", usd(metrics.refunds)],
              ["Estimated landed costs", amount(metrics.estimatedCogs)],
              ["Orders", String(metrics.orderCount)],
              ["Average order value", amount(metrics.aov)],
              [
                "Blended marketing efficiency",
                metrics.blendedMer === null
                  ? "Unavailable"
                  : `${metrics.blendedMer.toFixed(2)}×`,
              ],
              ["Net operating profit", "Unavailable"],
              ["Cash balance", "Unavailable"],
            ].map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="os-footnote">
            Marketing efficiency is net sales ÷ recorded ad spend. It does not
            establish campaign attribution.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Product economics</h2>
            <p>Current cost estimates for units in the selected order cohort</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Units sold</th>
                <th>Gross sales</th>
                <th>Estimated landed costs</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((product) => (
                <tr key={product.productId}>
                  <td>{product.name}</td>
                  <td>{product.units}</td>
                  <td>{usd(product.grossSales)}</td>
                  <td>{amount(product.estimatedCogs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.products.length && (
            <p className="os-empty">
              No product sales recorded for this period.
            </p>
          )}
        </div>
      </section>
      <details className="panel os-panel os-data-quality">
        <summary>Data quality and calculation notes</summary>
        <ul>
          {data.dataQuality.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p>
          <strong>Missing evidence:</strong>{" "}
          {data.dataQuality.unavailable.map(titleCase).join(", ")}.
        </p>
        {data.dataQuality.missingCostLines > 0 && (
          <Notice error>
            {data.dataQuality.missingCostLines} order lines have no matching
            cost record. Cost and profit estimates remain unavailable.
          </Notice>
        )}
      </details>
    </div>
  );
}
