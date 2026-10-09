"use client";

/**
 * HOTL design-system primitives.
 *
 * Small, unopinionated building blocks shared by every cockpit surface. Each
 * one is presentational: it renders real values it is given and calls the
 * handlers it is handed. Nothing here fabricates data, and no primitive is a
 * placeholder — a control is only rendered when it has a real action attached.
 */

import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";

/* ------------------------------------------------------------------ layout */

export function Stack({
  children,
  gap = 5,
  className = "",
}: {
  children: ReactNode;
  gap?: 2 | 3 | 4 | 5 | 6 | 7;
  className?: string;
}) {
  return (
    <div className={`ds-stack${gap === 3 ? " tight" : ""} ${className}`}>{children}</div>
  );
}

export function Row({
  children,
  between = false,
  end = false,
  className = "",
}: {
  children: ReactNode;
  between?: boolean;
  end?: boolean;
  className?: string;
}) {
  const variant = between ? " between" : end ? " end" : "";
  return <div className={`ds-row${variant} ${className}`}>{children}</div>;
}

export function Grid({
  children,
  min = 260,
  className = "",
}: {
  children: ReactNode;
  min?: number;
  className?: string;
}) {
  return (
    <div
      className={`ds-grid ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- card */

export function Card({
  title,
  subtitle,
  actions,
  footer,
  children,
  flush = false,
  headingLevel = 3,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <section className="ds-card">
      {(title || actions) && (
        <header className="ds-card-header">
          <div>
            {title && <Heading className="ds-card-title">{title}</Heading>}
            {subtitle && <p className="ds-card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="ds-row">{actions}</div>}
        </header>
      )}
      <div className={`ds-card-body${flush ? " flush" : ""}`}>{children}</div>
      {footer && <footer className="ds-card-footer">{footer}</footer>}
    </section>
  );
}

/* ------------------------------------------------------------------ button */

export function Button({
  children,
  busy = false,
  variant = "default",
  icon,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "default" | "primary" | "danger";
  icon?: ReactNode;
}) {
  const tone = variant === "default" ? "" : ` ${variant}`;
  return (
    <button
      {...props}
      className={`button${tone}${props.className ? ` ${props.className}` : ""}`}
      disabled={props.disabled || busy}
    >
      {busy ? <LoaderCircle size={15} className="spin" /> : icon}
      {children}
    </button>
  );
}

/** A link styled as a button that opens in a new tab. */
export function ExternalAction({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="button" href={href} target="_blank" rel="noreferrer noopener">
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}

/* ------------------------------------------------------------------- field */

export function Field({
  label,
  hint,
  htmlFor,
  help,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ds-field">
      <label className="ds-label" htmlFor={htmlFor}>
        {label}
        {hint && <span className="ds-hint-inline">{hint}</span>}
      </label>
      {children}
      {help && <p className="ds-help">{help}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={`ds-input ${className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea {...rest} className={`ds-textarea ${className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select {...rest} className={`ds-select ${className ?? ""}`}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  note,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; note?: ReactNode }) {
  return (
    <label className="ds-checkbox">
      <input {...props} type="checkbox" />
      <span>
        {label}
        {note && <small>{note}</small>}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------- badge */

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "brand";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`ds-badge ${tone}`}>{children}</span>;
}

/**
 * Maps a raw service status string to a tone. Deliberately conservative:
 * anything unrecognised is neutral, never green. An unknown status must not be
 * rendered as a passing one.
 */
export function statusTone(value = ""): Tone {
  const v = value.toLowerCase();
  if (/reject|denied|blocked|killed|failed|fail|error|expired|missing|invalid|danger/.test(v))
    return "danger";
  if (/pending|review|escalat|held|paused|medium|manual|unverified|not_run|partial|warn|unknown|unavailable|disconnected|not configured/.test(v))
    return "warn";
  if (/approved|allow|complete|pass|verified|active|running|connected|configured|ready|enabled|healthy|ok/.test(v))
    return "ok";
  return "neutral";
}

export function StatusBadge({ value }: { value: string }) {
  return <Badge tone={statusTone(value)}>{value.replaceAll("_", " ")}</Badge>;
}

/* ------------------------------------------------------------- data display */

export function Ledger({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="ds-ledger">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="ds-stat">
      <span className="ds-stat-label">{label}</span>
      <span className="ds-stat-value">{value}</span>
      {note && <span className="ds-stat-note">{note}</span>}
    </div>
  );
}

export type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  numeric?: boolean;
};

/**
 * A real data table. `caption` is rendered only when supplied. Rows must come
 * from a real response; there is no demo-seeded fallback.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty = "No records.",
}: {
  caption?: ReactNode;
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty?: ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className="ds-table-wrap">
      <table className="ds-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.numeric ? "num" : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Definition({
  label,
  note,
  value,
}: {
  label: ReactNode;
  note?: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="ds-def">
      <div>
        <div className="ds-def-label">{label}</div>
        {note && <p className="ds-def-note">{note}</p>}
      </div>
      <div className="ds-def-value">{value}</div>
    </div>
  );
}

export function Callout({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: "neutral" | "warn" | "danger";
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`ds-callout${tone === "neutral" ? "" : ` ${tone}`}`}>
      {icon ?? (tone === "danger" ? <TriangleAlert size={16} /> : <Check size={16} />)}
      <div>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ states */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ds-state">
      <span className="ds-state-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ds-state error" role="alert">
      <span className="ds-state-icon">
        <TriangleAlert size={20} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="ds-state loading" role="status" aria-live="polite">
      <span className="ds-state-icon">
        <LoaderCircle size={20} className="spin" />
      </span>
      <p>{label}…</p>
      <div className="ds-stack tight" style={{ width: "100%", maxWidth: 320 }}>
        <div className="ds-skeleton" style={{ height: 12, width: "78%" }} />
        <div className="ds-skeleton" style={{ height: 12, width: "54%" }} />
        <div className="ds-skeleton" style={{ height: 12, width: "66%" }} />
      </div>
    </div>
  );
}

/** Loading/error/empty triage used by every settings panel. */
export function ResourceState<T>({
  loading,
  error,
  data,
  empty,
  children,
}: {
  loading: boolean;
  error: string;
  data: T | null;
  empty?: { title: string; description: string };
  children: (data: T) => ReactNode;
}) {
  if (loading && data === null) return <LoadingState />;
  if (error && data === null)
    return <ErrorState title="This could not be loaded" description={error} />;
  if (data === null)
    return (
      <EmptyState
        title={empty?.title ?? "Nothing to show yet"}
        description={empty?.description ?? "The service returned no data."}
      />
    );
  return <>{children(data)}</>;
}