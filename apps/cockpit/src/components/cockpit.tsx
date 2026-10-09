"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  Activity as ActivityIcon,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  Box,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Cable,
  Clock3,
  Command,
  ExternalLink,
  FlaskConical,
  Headphones,
  HelpCircle,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Moon,
  MoreHorizontal,
  Package,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Target,
  TrendingUp,
  TriangleAlert,
  Truck,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  Activity,
  Agent,
  Interrupt,
  Order,
  Product,
  Section,
  Telemetry,
} from "@/lib/types";
import {
  ConstitutionPage,
  Notice,
  type ConstitutionResponse,
} from "./operating-pages";
import { FinancePage } from "./finance-page";
import { IntegrationsPage } from "./integrations-page";
import { ProductEditor, RefundEditor } from "./manual-actions";
import { ExpiredProposalAction } from "./expired-proposal-action";
import { runContinuationNotice } from "@/lib/run-continuation";
import {
  approvalRequest,
  approvalAmountKey,
  legacyReviewContext,
} from "@/lib/approval-review";

const NAV: { id: Section; name: string; icon: LucideIcon }[] = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "agents", name: "Agents", icon: Bot },
  { id: "approvals", name: "Approvals", icon: CheckCheck },
  { id: "products", name: "Products", icon: Package },
  { id: "orders", name: "Orders", icon: ShoppingBag },
  { id: "finance", name: "Finance", icon: CircleDollarSign },
  { id: "integrations", name: "Integrations", icon: Cable },
  { id: "autonomy", name: "Autonomy & policy", icon: BookOpen },
  { id: "guardrails", name: "Guardrails", icon: ShieldCheck },
  { id: "activity", name: "Activity", icon: ActivityIcon },
];
const HEADINGS: Record<Section, { title: string; subtitle: string }> = {
  autonomy: {
    title: "Your business. Your operating rules.",
    subtitle:
      "Set your goals, choose where agents can act, and review every policy version.",
  },
  integrations: {
    title: "A connected view of your business.",
    subtitle:
      "Connect your stores and understand exactly what each integration can do.",
  },
  finance: {
    title: "Know what your business earns.",
    subtitle:
      "Recorded sales, refund exposure and cost estimates, with the gaps made visible.",
  },
  overview: {
    title: "Your business, in motion.",
    subtitle:
      "A little oversight. A lot of possibility. Here’s how your team is doing.",
  },
  agents: {
    title: "Meet your always-on team.",
    subtitle:
      "Specialized agents, working together within the boundaries you set.",
  },
  approvals: {
    title: "Your judgment goes here.",
    subtitle:
      "Review the decisions that need a human touch. You have the final say.",
  },
  products: {
    title: "Good finds. Healthy margins.",
    subtitle: "Your product catalog, sourced and checked by your team.",
  },
  orders: {
    title: "From checkout to doorstep.",
    subtitle:
      "Follow every order as your fulfillment agent keeps things moving.",
  },
  guardrails: {
    title: "Autonomy, on your terms.",
    subtitle:
      "Clear boundaries for every dollar, listing, and customer resolution.",
  },
  activity: {
    title: "Nothing behind the scenes.",
    subtitle:
      "An auditable record of every action, decision, and owner intervention.",
  },
};
const money = (n = 0, decimals = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
  }).format(n);
const number = (n = 0) => new Intl.NumberFormat("en-US").format(n);
const pct = (n = 0) => `${(n * 100).toFixed(1)}%`;
const label = (v = "") =>
  v.replace(/[_\.]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
function ago(value?: string) {
  if (!value) return "Just now";
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  if (delta < 60000) return "Just now";
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
function agentIcon(name = ""): LucideIcon {
  if (/sourc/i.test(name)) return Search;
  if (/market/i.test(name)) return Sparkles;
  if (/support/i.test(name)) return Headphones;
  if (/order|fulfill/i.test(name)) return Truck;
  return Bot;
}
function tone(value = "") {
  if (/reject|denied|blocked|killed|failed|high/i.test(value)) return "red";
  if (/pending|review|escalat|held|paused|medium/i.test(value)) return "amber";
  return "green";
}
function Status({ value, dot = false }: { value: string; dot?: boolean }) {
  return (
    <span className={`badge ${tone(value)}`}>
      {dot && <span className="status-dot" />}
      {label(value)}
    </span>
  );
}
function Button({
  children,
  className = "",
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      className={`button ${className}`}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy && <LoaderCircle size={15} className="spin" />}
      {children}
    </button>
  );
}
function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <CheckCircle2 size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function Dialog({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const elements = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex="0"]',
        );
        if (!elements?.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type Session = {
  mode: "simulation" | "live";
  supabaseUrl: string;
  supabaseAnonKey: string;
};
type Api = (
  path: string,
  method?: string,
  body?: unknown,
  customToken?: string,
) => Promise<Record<string, unknown>>;

export function Cockpit({ initialSection }: { initialSection: string }) {
  const section = NAV.some((nav) => nav.id === initialSection)
    ? (initialSection as Section)
    : "overview";
  const [data, setData] = useState<Telemetry | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{
    text: string;
    warning?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [killOpen, setKillOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [detail, setDetail] = useState<{
    kind: "agent" | "product" | "order" | "activity";
    item: Agent | Product | Order | Activity;
  } | null>(null);
  const [approval, setApproval] = useState<Interrupt | null>(null);
  const [feed, setFeed] = useState<"polling" | "realtime">("polling");
  const [pendingResume, setPendingResume] = useState<
    { runId: string; interruptId: string }[]
  >([]);
  const [constitution, setConstitution] = useState<ConstitutionResponse | null>(
    null,
  );
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [productEditor, setProductEditor] = useState<Product | "new" | null>(
    null,
  );
  const [refundEditor, setRefundEditor] = useState<Order | null>(null);
  const pendingRequests = useRef(new Map<string, string>());

  const api = useCallback<Api>(
    async (path, method = "GET", body, customToken) => {
      const authorization = customToken ?? token;
      // Store a digest, never credential-bearing request JSON, in retry metadata.
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify({ path, method, body })),
      );
      const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      let idempotencyKey = pendingRequests.current.get(fingerprint);
      if (method !== "GET" && !idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        pendingRequests.current.set(fingerprint, idempotencyKey);
      }
      const response = await fetch(`/api/${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-hotl-cockpit": "1",
          ...(authorization
            ? { Authorization: `Bearer ${authorization}` }
            : {}),
          ...(method !== "GET" ? { "Idempotency-Key": idempotencyKey! } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json();
      // Network/server failures retain their key. A completed response can be
      // retried intentionally as a new owner action after correcting inputs.
      if (response.status < 500) pendingRequests.current.delete(fingerprint);
      if (!response.ok)
        throw new Error(
          result.error?.message ??
            result.message ??
            "The request could not be completed.",
        );
      return result;
    },
    [token],
  );

  useEffect(() => {
    const saved = localStorage.getItem("hotl-theme");
    const selected =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(selected);
    document.documentElement.dataset.theme = selected;
  }, []);
  const refreshConstitution = useCallback(async () => {
    if (!session || (session.mode === "live" && !token)) return;
    try {
      setConstitution(
        (await api("constitution")) as unknown as ConstitutionResponse,
      );
    } catch {
      setConstitution(null);
    }
  }, [api, session, token]);
  useEffect(() => {
    void refreshConstitution();
  }, [refreshConstitution]);
  useEffect(() => {
    document.title = `${constitution?.constitution.projectName ?? "HOTL"} — ${HEADINGS[section].title}`;
  }, [constitution, section]);

  useEffect(() => {
    let cleanup = () => {};
    fetch("/api/session")
      .then((response) => response.json())
      .then(async (info: Session) => {
        setSession(info);
        if (info.supabaseUrl && info.supabaseAnonKey) {
          const client = createClient(info.supabaseUrl, info.supabaseAnonKey);
          setSupabase(client);
          const { data: auth } = await client.auth.getSession();
          setToken(auth.session?.access_token ?? "");
          setEmail(auth.session?.user.email ?? "");
          const { data: sub } = client.auth.onAuthStateChange(
            (_event, authSession) => {
              setToken(authSession?.access_token ?? "");
              setEmail(authSession?.user.email ?? "");
            },
          );
          cleanup = () => sub.subscription.unsubscribe();
        }
      })
      .catch(() => {
        setError("Unable to initialize the cockpit. Refresh to try again.");
        setLoading(false);
      });
    return () => cleanup();
  }, []);

  const refresh = useCallback(async () => {
    if (!session || (session.mode === "live" && !token)) {
      if (session) setLoading(false);
      return;
    }
    try {
      const result = await api("telemetry");
      setData(result as unknown as Telemetry);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not refresh your dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, session, token]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!supabase || !token) return;
    const channel = supabase
      .channel("owner-cockpit")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "interrupts" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_actions" },
        () => void refresh(),
      )
      .subscribe((status) =>
        setFeed(status === "SUBSCRIBED" ? "realtime" : "polling"),
      );
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, token, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(null),
      toast.warning ? 12000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((value) => !value);
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  async function mutate(
    action: string,
    path: string,
    method: string,
    body?: unknown,
  ) {
    setBusy(action);
    setError("");
    try {
      const result = await api(path, method, body);
      await refresh();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }
  async function togglePause() {
    const releasing = data?.status === "paused";
    const result = await mutate(
      "pause",
      "pause",
      releasing ? "DELETE" : "POST",
    );
    if (result)
      setToast({
        text: releasing
          ? "Your team is back in motion."
          : "All new agent actions are paused.",
      });
  }
  async function runCycle() {
    const result = await mutate("run", "runs", "POST", { cycle: "daily" });
    if (result)
      setToast({
        text:
          result.status === "interrupted"
            ? "Daily cycle is waiting for your approval."
            : `Daily cycle ${result.status === "completed" ? "completed" : "started"}. Follow its progress in Activity.`,
      });
  }
  const pending =
    data?.interrupts.filter((item) => item.status === "pending") ?? [];
  const status = data?.status ?? "connecting";
  const paused = status === "paused" || status === "killed";
  const heading = HEADINGS[section];
  const closeApproval = useCallback(() => setApproval(null), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeKill = useCallback(() => setKillOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <Link className="brand" href="/" aria-label="HOTL overview">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            hotl<span className="brand-period">.</span>
          </span>
        </Link>
        <Link className="workspace-switch" href="/autonomy">
          <span className="workspace-icon">
            <Leaf size={18} />
          </span>
          <span>
            <strong>
              {constitution?.constitution.projectName ?? "Owner workspace"}
            </strong>
            <small>Owner workspace</small>
          </span>
          <ChevronDown size={15} />
        </Link>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {NAV.map((item) => (
            <Link
              key={item.id}
              onClick={() => setMobileOpen(false)}
              className={`nav-item ${section === item.id ? "active" : ""}`}
              href={item.id === "overview" ? "/" : `/${item.id}`}
              aria-current={section === item.id ? "page" : undefined}
            >
              <item.icon size={18} strokeWidth={1.7} />
              <span>{item.name}</span>
              {item.id === "approvals" && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="autonomy-card">
            <div>
              <span className={`live-dot ${paused ? "muted" : ""}`} />
              <strong>
                {status === "running"
                  ? "Your team is on it"
                  : status === "paused"
                    ? "Your team is paused"
                    : status === "killed"
                      ? "Emergency stop engaged"
                      : "Connecting to your team"}
              </strong>
            </div>
            <p>
              {paused
                ? "You’re in control of what happens next."
                : `${label(constitution?.constitution.mode ?? "Unknown")} mode · Action authority follows your constitution.`}
            </p>
            <Link href="/agents">
              Meet your agents <ArrowUpRight size={14} />
            </Link>
          </div>
          <button
            className="nav-item help-button"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle size={18} />
            <span>Help & getting started</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="owner-profile">
            <span className="avatar">
              {email ? email.slice(0, 2).toUpperCase() : "EG"}
            </span>
            <span>
              <strong>{email || "Workspace owner"}</strong>
              <small>
                {session?.mode === "live"
                  ? "Owner account"
                  : "Local simulation"}
              </small>
            </span>
            {session?.mode === "live" && token ? (
              <button
                className="icon-button"
                title="Sign out"
                onClick={() => void supabase?.auth.signOut()}
              >
                <ArrowRight size={17} />
              </button>
            ) : (
              <LockKeyhole size={15} />
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{NAV.find((item) => item.id === section)?.name}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              onClick={() => {
                const next = theme === "light" ? "dark" : "light";
                setTheme(next);
                document.documentElement.dataset.theme = next;
                localStorage.setItem("hotl-theme", next);
              }}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <Link
              className="os-mode-pill"
              href="/autonomy"
              title={`Autonomy mode: ${label(constitution?.constitution.mode ?? "Policy unavailable")}`}
            >
              {label(constitution?.constitution.mode ?? "Policy unavailable")}
            </Link>
            <span className="mode-pill">
              <FlaskConical size={13} />
              {session?.mode === "live" ? "Live workspace" : "Simulation mode"}
            </span>
            <button
              className="global-search"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={16} />
              <span>Search anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <button
              className="notification-button icon-button"
              aria-label={`${pending.length} pending approvals`}
              onClick={() => window.location.assign("/approvals")}
            >
              <Bell size={19} />
              {pending.length > 0 && <i />}
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow greeting">
                YOUR OWNER COCKPIT <span />{" "}
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <h1>{heading.title}</h1>
              <p>{heading.subtitle}</p>
            </div>
            <div className="heading-actions">
              <Button
                onClick={togglePause}
                busy={busy === "pause"}
                disabled={!data || status === "killed"}
              >
                {status === "paused" ? <Play size={15} /> : <Pause size={15} />}
                {status === "paused" ? "Resume agents" : "Pause agents"}
              </Button>
              <Button
                className="primary"
                onClick={runCycle}
                busy={busy === "run"}
                disabled={!data || paused}
              >
                <Play size={14} fill="currentColor" />
                Run a cycle
              </Button>
            </div>
          </div>
          {session?.mode === "simulation" && (
            <div className="simulation-strip">
              <FlaskConical size={15} />
              <span>
                <strong>A safe place to explore.</strong> You’re viewing
                simulated commerce data. No real money moves.
              </span>
              <span className="strip-tag">SANDBOX</span>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {status === "paused" && (
            <div className="pause-banner">
              <Pause size={18} />
              <span>
                <strong>Agents are paused.</strong> New actions are on hold.
                Existing data is still available.
              </span>
              <button onClick={togglePause}>
                Resume agents <ArrowRight size={15} />
              </button>
            </div>
          )}
          {status === "killed" && (
            <div className="error-banner">
              <Square size={18} />
              <span>
                <strong>Emergency stop engaged.</strong> Recovery requires
                credential replacement and the manual recovery runbook.
              </span>
            </div>
          )}
          {session?.mode === "live" && !token ? (
            <Login supabase={supabase} onSuccess={() => void refresh()} />
          ) : loading ? (
            <DashboardSkeleton />
          ) : !data ? (
            <Empty
              title="Your cockpit is waiting to connect"
              description="Start the guardrail service and refresh. Your dashboard will appear as soon as the connection is restored."
            />
          ) : (
            <>
              {section === "overview" && (
                <>
                  <Metrics data={data} />
                  <div className="overview-grid">
                    <RevenueChart data={data} />
                    <ApprovalPanel pending={pending} onReview={setApproval} />
                  </div>
                  <div className="overview-grid bottom-grid">
                    <AgentPanel
                      agents={data.agents}
                      paused={paused}
                      onDetail={(item) => setDetail({ kind: "agent", item })}
                    />
                    <GuardrailPanel data={data} />
                  </div>
                  <ActivityPanel
                    activity={data.activity.slice(0, 5)}
                    onDetail={(item) => setDetail({ kind: "activity", item })}
                    compact
                  />
                </>
              )}
              {section === "agents" && (
                <AgentsPage
                  data={data}
                  onDetail={(item) => setDetail({ kind: "agent", item })}
                />
              )}
              {section === "approvals" && (
                <ApprovalsPage
                  interrupts={data.interrupts}
                  onReview={setApproval}
                  api={api}
                  paused={paused}
                  onUpdated={refresh}
                />
              )}
              {section === "products" && (
                <>
                  <div className="os-toolbar os-product-toolbar">
                    <span>Owner-managed simulation catalog</span>
                    <Button
                      className="primary"
                      onClick={() => setProductEditor("new")}
                      disabled={paused}
                    >
                      <Plus size={15} />
                      Add product
                    </Button>
                  </div>
                  <ProductsPage
                    products={data.products}
                    onDetail={(item) => setDetail({ kind: "product", item })}
                  />
                </>
              )}
              {section === "orders" && (
                <OrdersPage
                  orders={data.orders}
                  onDetail={(item) => setDetail({ kind: "order", item })}
                />
              )}
              {section === "guardrails" && (
                <GuardrailsPage data={data} onKill={() => setKillOpen(true)} />
              )}
              {section === "autonomy" && (
                <ConstitutionPage
                  api={api}
                  onSaved={async () => {
                    await refreshConstitution();
                    await refresh();
                  }}
                />
              )}
              {section === "integrations" && <IntegrationsPage api={api} />}
              {section === "finance" && <FinancePage api={api} />}
              {section === "activity" && (
                <>
                  {pendingResume.map((item) => (
                    <div className="pause-banner" key={item.interruptId}>
                      <Clock3 size={18} />
                      <span>
                        Decision saved. Run {item.runId.slice(0, 8)} needs to
                        resume.
                      </span>
                      <button
                        onClick={async () => {
                          const result = await mutate(
                            "resume",
                            `runs/${item.runId}/resume`,
                            "POST",
                            { interruptId: item.interruptId },
                          );
                          if (result) {
                            setPendingResume((items) =>
                              items.filter(
                                (pendingItem) =>
                                  pendingItem.interruptId !== item.interruptId,
                              ),
                            );
                            setToast(runContinuationNotice(result));
                          }
                        }}
                      >
                        Retry resume
                      </button>
                    </div>
                  ))}
                  <ActivityPage
                    activity={data.activity}
                    api={api}
                    onDetail={(item) => setDetail({ kind: "activity", item })}
                  />
                </>
              )}
              <footer className="page-footer">
                <span>
                  <span className={`live-dot ${error ? "muted" : ""}`} />
                  {error
                    ? "Connection interrupted"
                    : feed === "realtime"
                      ? "Realtime updates connected"
                      : "Auto-refreshes every 10 seconds"}
                  <span className="footer-separator">·</span>Updated{" "}
                  {ago(data.updatedAt)}
                </span>
                <span>
                  <ShieldCheck size={14} /> Human on the loop. Always.
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.warning ? "toast-warning" : ""}`}
          role="status"
        >
          {toast.warning ? (
            <TriangleAlert size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {approval && (
        <ApprovalDialog
          item={approval}
          api={api}
          paused={paused}
          onClose={closeApproval}
          onResolved={async (result) => {
            if (result.warning) {
              setPendingResume((items) => [
                ...items,
                {
                  runId: String(
                    result.runId ?? result.resumedThreadId ?? approval.runId,
                  ),
                  interruptId: approval.id,
                },
              ]);
              setToast({ text: String(result.warning), warning: true });
            } else
              setToast({
                text: "Decision recorded. Your agent can continue with your instructions.",
              });
            setApproval(null);
            await refresh();
          }}
        />
      )}
      {detail && (
        <DetailDialog
          detail={detail}
          onClose={closeDetail}
          onEditProduct={(product) => {
            setDetail(null);
            setProductEditor(product);
          }}
          onRefund={(order) => {
            setDetail(null);
            setRefundEditor(order);
          }}
          paused={paused}
        />
      )}
      {productEditor && (
        <Dialog
          title={
            productEditor === "new"
              ? "Create a product"
              : `Edit ${productEditor.name}`
          }
          eyebrow="OWNER CATALOG ACTION"
          onClose={() => setProductEditor(null)}
          wide
        >
          <ProductEditor
            product={productEditor === "new" ? undefined : productEditor}
            api={api}
            onCancel={() => setProductEditor(null)}
            onSaved={async () => {
              setProductEditor(null);
              setToast({ text: "Product saved and audited." });
              await refresh();
            }}
          />
        </Dialog>
      )}
      {refundEditor && (
        <Dialog
          title="Request an order refund"
          eyebrow="OWNER REFUND ACTION"
          onClose={() => setRefundEditor(null)}
        >
          <RefundEditor
            order={refundEditor}
            api={api}
            onCancel={() => setRefundEditor(null)}
            onSaved={async (result) => {
              setRefundEditor(null);
              setToast({
                text:
                  result.decision === "escalate" ||
                  result.decision === "interrupt"
                    ? "Refund request is waiting in Approvals for a separate owner decision."
                    : "Refund evaluation recorded. Review the order and audit trail for its outcome.",
              });
              await refresh();
            }}
          />
        </Dialog>
      )}
      {searchOpen && (
        <SearchDialog
          data={data}
          onClose={closeSearch}
          onSelect={(kind, item) => {
            setSearchOpen(false);
            if (kind === "approval") setApproval(item as Interrupt);
            else setDetail({ kind, item: item as Agent | Product | Order });
          }}
        />
      )}
      {killOpen && (
        <KillDialog
          mode={session?.mode ?? "live"}
          supabase={supabase}
          email={email}
          api={api}
          onClose={closeKill}
          onEngaged={async () => {
            setKillOpen(false);
            setToast({
              text: "Emergency stop engaged. Review the isolated service action report.",
              warning: true,
            });
            await refresh();
          }}
        />
      )}
      {helpOpen && (
        <Dialog
          title="A business that works with you."
          eyebrow="WELCOME TO HOTL"
          onClose={closeHelp}
        >
          <div className="modal-body help-content">
            <p>
              Your specialized team handles sourcing, marketing, fulfillment,
              and support. You set the boundaries and review the exceptions.
            </p>
            <div className="help-step">
              <span>01</span>
              <div>
                <strong>Set your guardrails</strong>
                <p>
                  Choose your daily spend ceiling, minimum margin, and refund
                  threshold.
                </p>
              </div>
            </div>
            <div className="help-step">
              <span>02</span>
              <div>
                <strong>Run a daily cycle</strong>
                <p>
                  Watch your agents prepare products, evaluate campaigns, and
                  handle customer requests.
                </p>
              </div>
            </div>
            <div className="help-step">
              <span>03</span>
              <div>
                <strong>Step in where it matters</strong>
                <p>
                  Review escalations in Approvals. Your decision and note stay
                  in the audit trail.
                </p>
              </div>
            </div>
            <div className="callout">
              <FlaskConical size={18} />
              <p>
                Simulation mode uses local sample data and simulated
                integrations. Live operation requires configured services and an
                authenticated owner account.
              </p>
            </div>
            <Link
              className="button primary"
              onClick={closeHelp}
              href="/guardrails"
            >
              Set your boundaries <ArrowRight size={15} />
            </Link>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Metrics({ data }: { data: Telemetry }) {
  const { metrics: m, synthetic: s } = data;
  // `metrics` holds only ledger-derived values. Trend percentages and net margin come from
  // `synthetic` and are labelled as illustrative, because presenting them beside measured
  // revenue would imply they were observed (AGENTS.md rule 6).
  const values = [
    {
      name: "Total revenue",
      value: money(m.revenue),
      icon: CircleDollarSign,
      change: `${s.revenueChange >= 0 ? "+" : ""}${s.revenueChange}%`,
      note: "Illustrative trend, not observed",
      points: "0,29 10,25 20,29 30,16 40,21 50,18 60,23 70,8 80,12 90,3 100,9",
    },
    {
      name: "Orders fulfilled",
      value: number(m.orders),
      icon: ShoppingBag,
      change: `${s.ordersChange >= 0 ? "+" : ""}${s.ordersChange}%`,
      note: "Illustrative trend, not observed",
      points: "0,31 10,26 20,25 30,18 40,24 50,15 60,18 70,13 80,16 90,5 100,6",
    },
    {
      name: "Net margin",
      value: pct(s.margin),
      icon: TrendingUp,
      change: `+${(s.marginChange * 100).toFixed(1)} pts`,
      note: `Illustrative, not observed · ${pct(data.config.marginFloor)} minimum`,
      points: "0,26 10,25 20,20 30,23 40,13 50,17 60,12 70,16 80,7 90,10 100,3",
    },
  ];
  return (
    <div className="metrics-grid">
      {values.map((metric, i) => (
        <section className="metric-card" key={metric.name}>
          <div className="metric-label">
            {metric.name}
            <metric.icon size={16} />
          </div>
          <div className="metric-value-row">
            <strong>{metric.value}</strong>
            <svg className="sparkline" viewBox="0 0 100 36" aria-hidden="true">
              <path
                d={`M${metric.points.replaceAll(" ", " L")}`}
                fill="none"
                stroke={i === 1 ? "#8d9c7c" : "#4e8060"}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="metric-context">
            <span>
              <ArrowUpRight size={13} />
              {metric.change}
            </span>
            <small>{metric.note}</small>
          </div>
        </section>
      ))}
      <section className="metric-card">
        <div className="metric-label">
          Ad spend today
          <Target size={16} />
        </div>
        <div className="metric-value-row">
          <strong>{money(m.adSpend, 2)}</strong>
          <span className="metric-limit">
            / {money(data.config.dailyAdSpendCeiling)}
          </span>
        </div>
        <div className="spend-progress">
          <div
            style={{
              width: `${Math.min(100, (m.adSpend / Math.max(data.config.dailyAdSpendCeiling, 1)) * 100)}%`,
            }}
          />
        </div>
        <div className="metric-context">
          <span className="neutral">
            {money(Math.max(0, data.config.dailyAdSpendCeiling - m.adSpend), 2)}{" "}
            remaining
          </span>
          {/* Derived, not hardcoded. Previously this read "Within budget" unconditionally, so it
              still claimed headroom while showing $0.00 remaining against an exhausted ceiling. */}
          <small className={m.adSpend > data.config.dailyAdSpendCeiling ? "warn" : undefined}>
            {m.adSpend > data.config.dailyAdSpendCeiling
              ? "Ceiling exceeded"
              : `${pct(data.config.dailyAdSpendCeiling === 0 ? 0 : m.adSpend / data.config.dailyAdSpendCeiling)} of ceiling used`}
          </small>
        </div>
      </section>
    </div>
  );
}

function RevenueChart({ data }: { data: Telemetry }) {
  const [days, setDays] = useState("30");
  const chart = days === "7" ? data.synthetic.chart.slice(-7) : data.synthetic.chart;
  const chartRevenue = chart.reduce((sum, point) => sum + point.revenue, 0);
  return (
    <section className="panel revenue-panel">
      <div className="panel-header">
        <div>
          <h2>Revenue overview</h2>
          <p>A clear view of your momentum.</p>
        </div>
        <select
          aria-label="Revenue chart period"
          className="select-control"
          value={days}
          onChange={(event) => setDays(event.target.value)}
        >
          <option value="30">Last 30 days</option>
          <option value="7">Last 7 days</option>
        </select>
      </div>
      <div className="revenue-summary">
        <strong>{money(chartRevenue, 2)}</strong>
        <span className="chart-legend">
          <i />
          Revenue
          <span className="spend-legend" />
          Ad spend
        </span>
      </div>
      <div
        className="chart-wrap"
        role="img"
        aria-label={`Illustrative revenue and advertising spend for the last ${days} days. This series is illustrative, not observed commerce data. Illustrative total ${money(chartRevenue)}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chart}
            margin={{ top: 12, right: 6, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7eaa86" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#7eaa86" stopOpacity={0.015} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 5"
              vertical={false}
              stroke="#e7ebe4"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#8b9187", fontSize: 11 }}
              minTickGap={30}
              dy={9}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#8b9187", fontSize: 11 }}
              tickFormatter={(value) =>
                value >= 1000 ? `$${value / 1000}k` : `$${value}`
              }
            />
            <Tooltip
              formatter={(value, name) => [
                money(Number(value), 2),
                label(String(name)),
              ]}
              contentStyle={{
                border: "1px solid #e3e8dd",
                borderRadius: 10,
                fontSize: 12,
                boxShadow: "0 5px 20px #2033260d",
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#467154"
              fill="url(#revenueFill)"
              strokeWidth={2.2}
            />
            <Area
              type="monotone"
              dataKey="spend"
              stroke="#b0b8a1"
              fill="transparent"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-caption">
        <TrendingUp size={14} />
        {/* This panel plots data.synthetic.chart -- the guardrail's illustrative series, not
            observed commerce data. The guardrail ships this wording in synthetic.note and it
            must be rendered verbatim; a local "measured" claim is a rule 6 violation and the
            headline number here legitimately differs from Total revenue above. */}
        <span>{data.synthetic.note}</span>
      </div>
    </section>
  );
}

function ApprovalPanel({
  pending,
  onReview,
}: {
  pending: Interrupt[];
  onReview: (item: Interrupt) => void;
}) {
  return (
    <section className="panel approval-panel">
      <div className="panel-header">
        <div>
          <h2>
            Needs your attention{" "}
            <span className="count-badge">{pending.length}</span>
          </h2>
          <p>A few decisions only you can make.</p>
        </div>
        <span className="attention-icon">
          <Bell size={17} />
        </span>
      </div>
      {pending.length === 0 ? (
        <Empty
          title="You’re all caught up"
          description="Your team will bring important decisions here."
        />
      ) : (
        <div className="approval-list">
          {pending.slice(0, 3).map((item) => {
            const Icon = agentIcon(item.agentName || item.category);
            return (
              <button
                className="approval-item"
                key={item.id}
                onClick={() => onReview(item)}
              >
                <span
                  className={`agent-icon small ${item.category === "refund_escrow" ? "peach" : item.category === "spend" ? "sand" : "sage"}`}
                >
                  <Icon size={17} />
                </span>
                <span className="approval-info">
                  <span className="approval-item-label">
                    {label(item.category)}
                    <small>{ago(item.createdAt)}</small>
                  </span>
                  <strong>{item.title || item.summary}</strong>
                  <span className="review-link">
                    Review decision <ArrowRight size={13} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <Link className="panel-footer-link" href="/approvals">
        View all approvals <ArrowRight size={15} />
      </Link>
    </section>
  );
}

function AgentPanel({
  agents,
  paused,
  onDetail,
}: {
  agents: Agent[];
  paused: boolean;
  onDetail: (agent: Agent) => void;
}) {
  return (
    <section className="panel agent-panel">
      <div className="panel-header">
        <div>
          <h2>Your agent team</h2>
          <p>Working independently. Moving together.</p>
        </div>
        <Link className="text-link" href="/agents">
          View team <ArrowRight size={14} />
        </Link>
      </div>
      <div className="agent-table">
        {agents.slice(0, 4).map((agent, i) => {
          const Icon = agentIcon(agent.name);
          return (
            <button
              className="agent-row"
              key={agent.id}
              onClick={() => onDetail(agent)}
            >
              <span
                className={`agent-icon ${["sage", "sand", "blue", "peach"][i % 4]}`}
              >
                <Icon size={20} />
              </span>
              <span className="agent-description">
                <strong>{agent.name}</strong>
                <small>{agent.currentTask}</small>
              </span>
              <span className="agent-row-status">
                <Status value={paused ? "paused" : agent.status} dot />
                <small>{number(agent.actionsToday)} actions today</small>
              </span>
              <ChevronRight size={15} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function GuardrailPanel({ data }: { data: Telemetry }) {
  const { config, metrics } = data;
  return (
    <section className="panel guardrail-panel">
      <div className="panel-header">
        <div>
          <h2>Guardrails are watching</h2>
          <p>Your boundaries. Applied to every action.</p>
        </div>
        <span className="shield-icon">
          <ShieldCheck size={23} />
        </span>
      </div>
      <div className="guardrail-rule">
        <span>
          <CircleDollarSign size={15} />
          Daily ad budget
        </span>
        <strong>
          {money(metrics.adSpend, 2)}{" "}
          <small>/ {money(config.dailyAdSpendCeiling)}</small>
        </strong>
        <div className="rule-progress">
          <i
            style={{
              width: `${Math.min(100, (metrics.adSpend / Math.max(1, config.dailyAdSpendCeiling)) * 100)}%`,
            }}
          />
        </div>
      </div>
      <div className="guardrail-rule">
        <span>
          <TrendingUp size={15} />
          Minimum margin
        </span>
        <strong>
          {pct(config.marginFloor)}
          <CheckCircle2 size={14} />
        </strong>
      </div>
      <div className="guardrail-rule">
        <span>
          <ArrowDownLeft size={15} />
          Auto-refund limit
        </span>
        <strong>
          {money(config.autoRefundThreshold)}
          <CheckCircle2 size={14} />
        </strong>
      </div>
      <div className="guardrail-assurance">
        <ShieldCheck size={14} />
        Deterministic rules. No exceptions.
      </div>
      <Link className="panel-footer-link" href="/guardrails">
        Manage guardrails <ArrowRight size={15} />
      </Link>
    </section>
  );
}

function activitySummary(item: Activity) {
  return (
    item.summary ||
    String(item.payload?.summary ?? "") ||
    label(
      item.action ??
        item.actionType ??
        item.action_type ??
        "Agent action recorded",
    )
  );
}
function activityActor(item: Activity) {
  return label(
    item.agentName ??
      item.actor ??
      item.actorId ??
      item.actorType ??
      item.actor_type ??
      "System",
  );
}
function ActivityPanel({
  activity,
  onDetail,
  compact = false,
}: {
  activity: Activity[];
  onDetail: (item: Activity) => void;
  compact?: boolean;
}) {
  return (
    <section className="panel activity-panel">
      <div className="panel-header">
        <div>
          <h2>{compact ? "While you were away" : "Activity log"}</h2>
          <p>
            {compact
              ? "The small actions moving your business forward."
              : "Every action is recorded before it reports success."}
          </p>
        </div>
        {compact ? (
          <Link className="text-link" href="/activity">
            View activity <ArrowRight size={14} />
          </Link>
        ) : (
          <span className="badge green">
            <LockKeyhole size={12} />
            Append-only record
          </span>
        )}
      </div>
      {!activity.length ? (
        <Empty
          title="No activity yet"
          description="Run a cycle to see your agents at work."
        />
      ) : (
        <div className="activity-list">
          {activity.map((item) => {
            const Icon = agentIcon(activityActor(item));
            return (
              <button
                className="activity-row"
                key={item.id}
                onClick={() => onDetail(item)}
              >
                <span
                  className={`activity-indicator ${tone(item.decision ?? "")}`}
                >
                  <Icon size={15} />
                </span>
                <span className="activity-copy">
                  <strong>{activitySummary(item)}</strong>
                  <small>
                    {activityActor(item)}
                    {item.decision ? (
                      <>
                        <span>·</span>
                        <span
                          className={`decision-text ${tone(item.decision)}`}
                        >
                          {label(item.decision)}
                        </span>
                      </>
                    ) : null}
                  </small>
                </span>
                <time>{ago(item.createdAt ?? item.created_at)}</time>
                <ArrowUpRight size={14} />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AgentsPage({
  data,
  onDetail,
}: {
  data: Telemetry;
  onDetail: (item: Agent) => void;
}) {
  return (
    <>
      <div className="team-banner">
        <span className="team-orbit">
          <Bot size={28} />
        </span>
        <div>
          <span className="eyebrow">MASTER ORCHESTRATOR</span>
          <h2>One plan. A team of specialists.</h2>
          <p>
            Coordinates daily milestones, checks system health, and routes work
            to the right agent.
          </p>
        </div>
        <Status value={data.status} dot />
      </div>
      <div className="agents-grid">
        {data.agents.map((agent, i) => {
          const Icon = agentIcon(agent.name);
          return (
            <button
              className="panel agent-detail-card"
              key={agent.id}
              onClick={() => onDetail(agent)}
            >
              <div className="agent-card-top">
                <span
                  className={`agent-icon ${["sage", "sand", "blue", "peach"][i % 4]}`}
                >
                  <Icon size={22} />
                </span>
                <Status
                  value={data.status === "running" ? agent.status : data.status}
                  dot
                />
              </div>
              <h2>{agent.name}</h2>
              <p>{agent.role}</p>
              <div className="current-task">
                <span className="live-dot" />
                <span>{agent.currentTask}</span>
              </div>
              <div className="agent-card-metrics">
                <div>
                  <strong>{number(agent.actionsToday)}</strong>
                  <small>Actions today</small>
                </div>
                <div>
                  <strong>
                    {agent.successRate > 1
                      ? agent.successRate
                      : agent.successRate * 100}
                    %
                  </strong>
                  <small>Success rate</small>
                </div>
                <div>
                  <strong>{number(agent.tokenUsage)}</strong>
                  <small>Tokens used</small>
                </div>
              </div>
              <span className="text-link">
                View agent details <ArrowUpRight size={14} />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function FilterBar({
  search,
  setSearch,
  placeholder,
  status,
  setStatus,
  options,
  count,
}: {
  search: string;
  setSearch: (value: string) => void;
  placeholder: string;
  status: string;
  setStatus: (value: string) => void;
  options: string[];
  count: number;
}) {
  return (
    <div className="filter-bar">
      <label className="table-search">
        <Search size={17} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {search && (
          <button aria-label="Clear search" onClick={() => setSearch("")}>
            <X size={14} />
          </button>
        )}
      </label>
      <div className="filter-controls">
        <label className="filter-select">
          <SlidersHorizontal size={15} />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {options.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <span className="result-count">{count} results</span>
      </div>
    </div>
  );
}

function ApprovalsPage({
  interrupts,
  onReview,
  api,
  paused,
  onUpdated,
}: {
  interrupts: Interrupt[];
  onReview: (item: Interrupt) => void;
  api: Api;
  paused: boolean;
  onUpdated: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("pending");
  const expiredCount = interrupts.filter((item) => item.status === "expired").length;
  const filtered = interrupts.filter(
    (item) =>
      (status === "all" || item.status === status) &&
      `${item.title} ${item.summary} ${item.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      {expiredCount > 0 && status !== "expired" && (
        <div className="os-expired-summary">
          <span>
            {expiredCount} expired {expiredCount === 1 ? "proposal" : "proposals"}.
            An interrupted run may need to replan against your latest changes.
          </span>
          <Button onClick={() => setStatus("expired")}>View expired proposals</Button>
        </div>
      )}
      <FilterBar
        search={search}
        setSearch={setSearch}
        placeholder="Search approvals..."
        status={status}
        setStatus={setStatus}
        options={["pending", "approved", "rejected", "modified", "expired"]}
        count={filtered.length}
      />
      {!filtered.length ? (
        <Empty
          title={
            status === "pending"
              ? "Your queue is clear"
              : "No matching decisions"
          }
          description="When an agent reaches a boundary, its request will appear here for your review."
        />
      ) : (
        <div className="full-approval-list">
          {filtered.map((item) => {
            const Icon = agentIcon(item.agentName);
            return (
              <div className="full-approval" key={item.id}>
                <span className="agent-icon sand">
                  <Icon size={22} />
                </span>
                <div>
                  <div className="approval-tags">
                    <span className="eyebrow">{label(item.category)}</span>
                    <Status value={item.status} />
                  </div>
                  <h3>{item.title || item.summary}</h3>
                  <p>{item.summary}</p>
                  <span className="muted-small">
                    {label(item.agentName)}
                    <span className="inline-dot">·</span>
                    {ago(item.createdAt)}
                    <span className="inline-dot">·</span>Run{" "}
                    {item.runId.slice(0, 8)}
                  </span>
                  {item.status === "expired" && (
                    <ExpiredProposalAction
                      item={item}
                      api={api}
                      paused={paused}
                      onUpdated={onUpdated}
                    />
                  )}
                </div>
                <Button onClick={() => onReview(item)}>
                  {item.status === "pending"
                    ? "Review decision"
                    : "View decision"}
                  <ArrowRight size={15} />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProductArt({ item }: { item: Product }) {
  const art =
    item.image?.match(/^\/products\/[a-z-]+\.svg$/)?.[0] ??
    `/products/${/lamp|light/i.test(item.name) ? "lamp" : /bottle/i.test(item.name) ? "bottle" : /tote|bag/i.test(item.name) ? "tote" : /planter/i.test(item.name) ? "planter" : /diffuser/i.test(item.name) ? "diffuser" : "organizer"}.svg`;
  return (
    <span className="product-art">
      <img src={art} width="80" height="80" alt="" loading="lazy" />
    </span>
  );
}
function ProductsPage({
  products,
  onDetail,
}: {
  products: Product[];
  onDetail: (item: Product) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = products.filter(
    (item) =>
      (status === "all" || item.status === status) &&
      `${item.name} ${item.sku} ${item.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      <FilterBar
        search={search}
        setSearch={setSearch}
        placeholder="Search products or SKU..."
        status={status}
        setStatus={setStatus}
        options={[...new Set(products.map((item) => item.status))]}
        count={filtered.length}
      />
      {filtered.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Price</th>
                <th>Net margin</th>
                <th>Inventory</th>
                <th>Revenue</th>
                <th>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      className="product-cell"
                      onClick={() => onDetail(item)}
                    >
                      <ProductArt item={item} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.sku} · {item.category}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td>{money(item.price, 2)}</td>
                  <td>
                    <span className="margin-value">
                      {pct(item.margin)} <ArrowUpRight size={13} />
                    </span>
                  </td>
                  <td>
                    <span className={item.inventory < 10 ? "low-stock" : ""}>
                      {number(item.inventory)} units
                    </span>
                  </td>
                  <td>{money(item.revenue, 2)}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View ${item.name}`}
                      onClick={() => onDetail(item)}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No products found"
          description="Try another search or status. Sourcing agents add products after their margin check."
        />
      )}
    </section>
  );
}
function OrdersPage({
  orders,
  onDetail,
}: {
  orders: Order[];
  onDetail: (item: Order) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = orders.filter(
    (item) =>
      (status === "all" || item.status === status) &&
      `${item.id} ${item.customer.name} ${item.customer.email}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      <FilterBar
        search={search}
        setSearch={setSearch}
        placeholder="Search orders or customers..."
        status={status}
        setStatus={setStatus}
        options={[...new Set(orders.map((item) => item.status))]}
        count={filtered.length}
      />
      {filtered.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total</th>
                <th>Placed</th>
                <th>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      className="table-link"
                      onClick={() => onDetail(item)}
                    >
                      {item.id.startsWith("#") ? item.id : `#${item.id}`}
                    </button>
                  </td>
                  <td>
                    <span className="customer-cell">
                      <span className="customer-avatar">
                        {item.customer.name
                          .split(" ")
                          .map((value) => value[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <span>
                        <strong>{item.customer.name}</strong>
                        <small>{item.customer.email}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td>
                    {item.items.reduce((sum, line) => sum + line.quantity, 0)}
                  </td>
                  <td>{money(item.total, 2)}</td>
                  <td className="muted-small">
                    {new Date(item.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View order ${item.id}`}
                      onClick={() => onDetail(item)}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No orders found"
          description="Try a different customer name, order ID, or status."
        />
      )}
    </section>
  );
}

function GuardrailsPage({
  data,
  onKill,
}: {
  data: Telemetry;
  onKill: () => void;
}) {
  const config = data.config;
  const fields = [
    {
      key: "dailyAdSpendCeiling" as const,
      title: "Daily advertising budget",
      description:
        "The most your marketing agent can spend across all campaigns in a day.",
      prefix: "$",
      min: 0,
      max: 1000000,
      step: 1,
      icon: Target,
    },
    {
      key: "marginFloor" as const,
      title: "Minimum net margin",
      description:
        "Every listing must meet this margin after landed cost and estimated acquisition cost.",
      prefix: "%",
      min: 40,
      max: 99,
      step: 1,
      icon: TrendingUp,
    },
    {
      key: "autoRefundThreshold" as const,
      title: "Automatic refund threshold",
      description:
        "Refunds above this amount always require your approval. The hard limit is $25.",
      prefix: "$",
      min: 0,
      max: 25,
      step: 0.01,
      icon: ArrowDownLeft,
    },
  ];
  return (
    <div className="settings-layout">
      <section className="panel settings-panel">
        <div className="panel-header">
          <div>
            <h2>Financial boundaries</h2>
            <p>These rules apply before an agent can take action.</p>
          </div>
          <ShieldCheck size={21} />
        </div>
        {fields.map((field) => (
          <div className="setting-row" key={field.key}>
            <span className="setting-icon">
              <field.icon size={19} />
            </span>
            <div>
              <strong>{field.title}</strong>
              <p>{field.description}</p>
            </div>
            <strong className="os-boundary-value">
              {field.key === "marginFloor"
                ? pct(config.marginFloor)
                : money(config[field.key], 2)}
            </strong>
          </div>
        ))}
        <div className="settings-footer">
          <span>
            <LockKeyhole size={14} />
            Policy changes require a reason and a current version.
          </span>
          <Link className="button primary" href="/autonomy">
            Edit Constitution <ArrowRight size={15} />
          </Link>
        </div>
      </section>
      <aside className="settings-note">
        <span className="shield-large">
          <ShieldCheck size={30} />
        </span>
        <h3>Built to hold the line.</h3>
        <p>
          Guardrails are deterministic checks in code. Agents cannot reason
          their way around your limits.
        </p>
        <ul>
          <li>
            <Check size={14} />
            Minimum 40% net margin
          </li>
          <li>
            <Check size={14} />
            Maximum $25 auto-refunds
          </li>
          <li>
            <Check size={14} />
            Daily spend enforced centrally
          </li>
          <li>
            <Check size={14} />
            Every change leaves a record
          </li>
        </ul>
      </aside>
      <section className="panel emergency-panel">
        <div>
          <span className="eyebrow">EMERGENCY CONTROL</span>
          <h2>Irreversible emergency stop</h2>
          <p>
            Permanently blocks new actions and requests the configured emergency
            shutdown steps. Check the stop report for each result. Use Pause for
            a temporary hold.
          </p>
        </div>
        <Button
          className="danger-outline"
          onClick={onKill}
          disabled={data.status === "killed"}
        >
          <Square size={14} />
          {data.status === "killed" ? "Stop already engaged" : "Emergency stop"}
        </Button>
      </section>
    </div>
  );
}

function AuditIntegrityPanel({ api }: { api: Api }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; integrity: string; entries: number; head: string | null }
  >({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await api("audit-log");
      const entries = Array.isArray(data.entries) ? (data.entries as Activity[]) : [];
      const last = entries.length ? entries[entries.length - 1] : null;
      setState({
        status: "ready",
        integrity: String(data.integrity ?? "UNKNOWN"),
        entries: entries.length,
        head: last?.hash ?? null,
      });
    } catch (error) {
      // Fail honestly: an unreadable audit log must not render as healthy.
      setState({ status: "error", message: error instanceof Error ? error.message : "The audit log could not be read." });
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const verified = state.status === "ready" && state.integrity === "verified";
  return (
    <section className="panel" aria-labelledby="audit-integrity-title">
      <div className="panel-header">
        <div>
          <h2 id="audit-integrity-title">Audit chain integrity</h2>
          <p className="panel-subtitle">
            The guardrail re-derives every hash and link when it serves this log. The verdict
            below is computed by the service, not by this page.
          </p>
        </div>
        <Button type="button" onClick={() => void load()}>Re-verify chain</Button>
      </div>
      {state.status === "loading" && <div className="empty-state">Verifying the audit chain...</div>}
      {state.status === "error" && (
        <div className="os-notice os-error" role="alert">
          <TriangleAlert size={17} />
          <span>{state.message} The chain could not be verified, so its state is unknown.</span>
        </div>
      )}
      {state.status === "ready" && (
        <div className="metric-context">
          <span className={verified ? undefined : "warn"}>
            <strong>{verified ? "Chain verified" : `Chain state: ${state.integrity}`}</strong>
          </span>
          <span className="neutral">{state.entries} entries returned by the guardrail</span>
          <small>
            {state.head
              ? `Head ${state.head.slice(0, 12)}...`
              : "No entries returned"}
          </small>
        </div>
      )}
    </section>
  );
}

function ActivityPage({
  activity,
  api,
  onDetail,
}: {
  activity: Activity[];
  api: Api;
  onDetail: (item: Activity) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = activity.filter(
    (item) =>
      (status === "all" || item.decision === status) &&
      `${activitySummary(item)} ${activityActor(item)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <section className="panel filter-panel">
        <FilterBar
          search={search}
          setSearch={setSearch}
          placeholder="Search actions, agents, or decisions..."
          status={status}
          setStatus={setStatus}
          options={[
            ...new Set(
              activity
                .map((item) => item.decision)
                .filter((value): value is string => Boolean(value)),
            ),
          ]}
          count={filtered.length}
        />
      </section>
      <AuditIntegrityPanel api={api} />
      <ActivityPanel activity={filtered} onDetail={onDetail} />
    </>
  );
}

function ApprovalDialog({
  item,
  api,
  onResolved,
  onClose,
  paused,
}: {
  item: Interrupt;
  api: Api;
  onResolved: (result: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  paused: boolean;
}) {
  const request = approvalRequest(item);
  const amountKey = approvalAmountKey(item);
  const [decision, setDecision] = useState("approve");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(
    String(amountKey ? (request[amountKey] ?? "") : ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = item.status === "pending";
  const legacy = item.payload.legacyReviewRequired === true;
  const [review, setReview] = useState<{
    policy: ConstitutionResponse;
    telemetry: Telemetry;
    serviceProposals: number | null;
    serviceRevisionCount: number;
  } | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const loadReview = useCallback(async () => {
    setReview(null);
    setReviewed(false);
    setReviewError("");
    try {
      // `operating-state` is the service's own view of pending proposals and resource
      // revisions. The legacy-review derivation below infers freshness from telemetry; the
      // service already reports it authoritatively, so fetch both and show which is which
      // rather than presenting a reconstruction as if it came from the ledger.
      const [policy, telemetry, operating] = await Promise.all([
        api("constitution"),
        api("telemetry"),
        api("operating-state"),
      ]);
      legacyReviewContext(
        item,
        (policy as unknown as ConstitutionResponse).constitution.version,
        telemetry as unknown as Telemetry,
      );
      const revisions = (operating as { resourceRevisions?: Record<string, Record<string, number>> }).resourceRevisions ?? {};
      setReview({
        policy: policy as unknown as ConstitutionResponse,
        telemetry: telemetry as unknown as Telemetry,
        serviceProposals: Array.isArray((operating as { proposals?: unknown[] }).proposals)
          ? ((operating as { proposals: unknown[] }).proposals).length
          : null,
        serviceRevisionCount: Object.keys(revisions).reduce((sum, group) => sum + Object.keys(revisions[group] ?? {}).length, 0),
      });
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : "Current review context is unavailable.",
      );
    }
  }, [api, item]);
  useEffect(() => {
    if (legacy && pending) void loadReview();
  }, [legacy, pending, loadReview]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const modifiedPayload =
        decision === "modify" && amountKey
          ? { [amountKey]: Number(amount) }
          : null;
      if (decision !== "reject" && legacy && (!review || !reviewed))
        throw new Error(
          "Review the current policy and resource, then confirm you have checked them.",
        );
      const context =
        decision !== "reject" && legacy && review
          ? legacyReviewContext(
              item,
              review.policy.constitution.version,
              review.telemetry,
            )
          : {};
      await onResolved(
        await api(`interrupts/${item.id}/resolve`, "POST", {
          decision,
          note,
          modifiedPayload,
          ...context,
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Decision could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={item.title || "Review agent request"}
      eyebrow={label(item.category)}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="detail-status">
            <Status value={item.status} />
            <span>
              {label(item.agentName)} · {ago(item.createdAt)}
            </span>
          </div>
          <p className="detail-intro">{item.summary}</p>
          <div className="detail-facts">
            {Object.entries(request).map(([key, value]) => (
              <div key={key}>
                <span>{label(key)}</span>
                <strong>
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : /amount|price|cost/i.test(key) &&
                        typeof value === "number"
                      ? money(value, 2)
                      : String(value)}
                </strong>
              </div>
            ))}
          </div>
          {!legacy && item.payload.constitutionVersion != null && (
            <Notice>
              Prepared under Constitution version{" "}
              {String(item.payload.constitutionVersion)}
              {item.payload.resourceRevision != null
                ? ` · Resource revision ${String(item.payload.resourceRevision)}`
                : ""}
              . If either version has changed, the agent must prepare a new
              proposal.
            </Notice>
          )}
          {legacy && pending && (
            <section className="os-review-context">
              <h3>Review this earlier proposal against current records</h3>
              {review ? (
                <>
                  <p>
                    Constitution version {review.policy.constitution.version} ·{" "}
                    {review.policy.constitution.projectName} ·{" "}
                    {label(review.policy.constitution.mode)} mode
                  </p>
                  <p>
                    Daily advertising ceiling{" "}
                    {money(review.policy.constitution.dailyAdSpendCeiling, 2)} ·
                    Margin floor {pct(review.policy.constitution.marginFloor)} ·
                    Automatic refund threshold{" "}
                    {money(review.policy.constitution.autoRefundThreshold, 2)}
                  </p>
                  {review.telemetry.products
                    .filter((product) => product.id === request.productId)
                    .map((product) => (
                      <p key={product.id}>
                        Product revision {product.revision}: {product.name} ·{" "}
                        {money(product.price, 2)} · {product.inventory} in stock
                        · {label(product.status)}
                      </p>
                    ))}
                  {review.telemetry.orders
                    .filter((order) => order.id === request.orderId)
                    .map((order) => (
                      <p key={order.id}>
                        Order revision {order.revision}: {order.id} · Total{" "}
                        {money(order.total, 2)} · Refunded{" "}
                        {money(order.refunded ?? 0, 2)} · {label(order.status)}
                      </p>
                    ))}
                  <label className="os-checkbox">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(event) => setReviewed(event.target.checked)}
                    />
                    I reviewed this proposal against the current policy and
                    records above.
                  </label>
                </>
              ) : (
                <Notice error={!!reviewError}>
                  {reviewError || "Loading current policy and records…"}
                </Notice>
              )}
              <div className="os-toolbar-actions">
                <Link className="text-link" href="/autonomy">
                  Read Constitution <ArrowUpRight size={14} />
                </Link>
                <Button type="button" onClick={() => void loadReview()}>
                  Refresh review context
                </Button>
              </div>
              {review && (
                <div className="metric-context">
                  <span className="neutral">
                    Reported by the guardrail:{" "}
                    {review.serviceProposals ?? 0} pending proposal
                    {review.serviceProposals === 1 ? "" : "s"},{" "}
                    {review.serviceRevisionCount} resource revision
                    {review.serviceRevisionCount === 1 ? "" : "s"} tracked
                  </span>
                  <small>
                    Ledger-reported. The comparison below is derived client-side from
                    telemetry and is shown separately so it is not mistaken for it.
                  </small>
                </div>
              )}
            </section>
          )}
          {pending && (
            <>
              <span className="form-label" id="decision-group-label">
                Your decision
              </span>
              {/* A financial action: which of the three is armed must be conveyed
                  programmatically, not only by a CSS class. `aria-pressed` does that while
                  keeping the elements buttons -- the browser e2e contract addresses them by
                  button role and name, and overriding the role would silently break it. */}
              <div className="decision-options" role="group" aria-labelledby="decision-group-label">
                {[
                  { value: "approve", icon: Check, name: "Approve" },
                  { value: "reject", icon: X, name: "Reject" },
                  { value: "modify", icon: Settings2, name: "Modify" },
                ]
                  .filter((option) => option.value !== "modify" || amountKey)
                  .map((option) => (
                    <button
                      type="button"
                      aria-pressed={decision === option.value}
                      key={option.value}
                      className={
                        decision === option.value
                          ? `selected ${option.value}`
                          : ""
                      }
                      onClick={() => setDecision(option.value)}
                    >
                      <option.icon size={16} />
                      {option.name}
                    </button>
                  ))}
              </div>
              {decision === "modify" && (
                <label className="form-label">
                  {amountKey === "quantity"
                    ? "Adjusted quantity"
                    : amountKey === "sellingPrice"
                      ? "Adjusted selling price (USD)"
                      : "Adjusted amount (USD)"}
                  <input
                    required
                    type="number"
                    step={amountKey === "quantity" ? "1" : "0.01"}
                    min={amountKey === "quantity" ? "1" : "0.01"}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
              )}
              <label className="form-label">
                Decision note <span>Required for the audit trail</span>
                <textarea
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={3}
                  placeholder="Share the reason for your decision..."
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div className="callout">
                <ShieldCheck size={17} />
                <p>
                  Your decision is saved before the agent resumes. Guardrails
                  still apply to the resulting action.
                </p>
              </div>
            </>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <Button type="button" onClick={onClose}>
            {pending ? "Cancel" : "Close"}
          </Button>
          {pending && (
            <Button
              type="submit"
              className={decision === "reject" ? "danger" : "primary"}
              busy={busy}
              disabled={
                // Rejecting remains available while paused on purpose: the guardrail
                // deliberately skips its block() check for rejections, so it can still
                // succeed. Approving or modifying cannot, so it is disabled like every
                // other financial control while the platform is paused.
                (decision !== "reject" && paused) ||
                (decision !== "reject" && legacy && (!review || !reviewed))
              }
              title={
                decision !== "reject" && paused
                  ? "Agents are paused, so this action cannot execute. Reject the request instead, or resume agents first."
                  : undefined
              }
            >
              {decision === "approve"
                ? "Approve request"
                : decision === "reject"
                  ? "Reject request"
                  : "Save modified decision"}
              <ArrowRight size={15} />
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

function DetailDialog({
  detail,
  onClose,
  onEditProduct,
  onRefund,
  paused,
}: {
  detail: { kind: string; item: Agent | Product | Order | Activity };
  onClose: () => void;
  onEditProduct: (product: Product) => void;
  onRefund: (order: Order) => void;
  paused: boolean;
}) {
  const { kind } = detail;
  const item = detail.item as unknown as Record<string, unknown>;
  const title =
    kind === "activity"
      ? activitySummary(detail.item as Activity)
      : String(item.name ?? `Order ${item.id}`);
  return (
    <Dialog title={title} eyebrow={`${kind} details`} onClose={onClose}>
      <div className="modal-body">
        {kind === "product" && (
          <div className="detail-product">
            <ProductArt item={detail.item as Product} />
            <div>
              <Status value={String(item.status)} />
              <p>
                {String(item.category)} · {String(item.sku)}
              </p>
            </div>
          </div>
        )}
        {kind === "agent" && (
          <>
            <div className="detail-status">
              <Status value={String(item.status)} dot />
              <span>{String(item.role)}</span>
            </div>
            <p className="detail-intro">{String(item.currentTask)}</p>
          </>
        )}
        {kind === "order" && (
          <>
            <div className="detail-status">
              <Status value={String(item.status)} />
              <span>{new Date(String(item.createdAt)).toLocaleString()}</span>
            </div>
            <p className="detail-intro">
              {(detail.item as Order).customer.name}
              <br />
              <span className="muted-small">
                {(detail.item as Order).customer.email}
              </span>
            </p>
            <div className="order-lines">
              {(detail.item as Order).items.map((line) => (
                <div key={line.productId}>
                  <span>
                    {line.name} <small>× {line.quantity}</small>
                  </span>
                  <strong>{money(line.price * line.quantity, 2)}</strong>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="detail-facts">
          {Object.entries(item)
            .filter(
              ([key]) =>
                ![
                  "name",
                  "role",
                  "currentTask",
                  "items",
                  "customer",
                  "color",
                  "image",
                  "payload",
                ].includes(key),
            )
            .map(([key, value]) => (
              <div key={key}>
                <span>{label(key)}</span>
                <strong className={/id|hash/i.test(key) ? "mono" : ""}>
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : /margin/i.test(key) && typeof value === "number"
                      ? pct(value)
                      : /price|revenue|total|cost|cac/i.test(key) &&
                          typeof value === "number"
                        ? money(value, 2)
                        : String(value ?? "—")}
                </strong>
              </div>
            ))}
        </div>
        {kind === "activity" && item.payload != null && (
          <details className="payload-details">
            <summary>View recorded payload</summary>
            <pre>{JSON.stringify(item.payload, null, 2)}</pre>
          </details>
        )}
        <div className="callout">
          <ShieldCheck size={16} />
          <p>
            Consequential changes flow through the guardrail service and are
            recorded in your audit log.
          </p>
        </div>
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>Close details</Button>
        {kind === "product" && (
          <Button
            className="primary"
            disabled={paused}
            onClick={() => onEditProduct(detail.item as Product)}
          >
            <Settings2 size={15} />
            Edit product
          </Button>
        )}
        {kind === "order" && (
          <Button
            className="primary"
            disabled={
              paused ||
              item.status === "refunded" ||
              item.status === "payment_failed"
            }
            onClick={() => onRefund(detail.item as Order)}
          >
            <ArrowDownLeft size={15} />
            Request refund
          </Button>
        )}
      </div>
    </Dialog>
  );
}

function SearchDialog({
  data,
  onClose,
  onSelect,
}: {
  data: Telemetry | null;
  onClose: () => void;
  onSelect: (
    kind: "approval" | "agent" | "product" | "order",
    item: Interrupt | Agent | Product | Order,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const all = data
    ? [
        ...data.interrupts.map((item) => ({
          kind: "approval" as const,
          title: item.title || item.summary,
          subtitle: "Approval",
          item,
        })),
        ...data.agents.map((item) => ({
          kind: "agent" as const,
          title: item.name,
          subtitle: item.role,
          item,
        })),
        ...data.products.map((item) => ({
          kind: "product" as const,
          title: item.name,
          subtitle: item.sku,
          item,
        })),
        ...data.orders.map((item) => ({
          kind: "order" as const,
          title: `${item.id} · ${item.customer.name}`,
          subtitle: "Order",
          item,
        })),
      ]
    : [];
  const results = all
    .filter((item) =>
      `${item.title} ${item.subtitle}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .slice(0, 10);
  return (
    <Dialog title="Find something in your workspace" onClose={onClose}>
      <div className="modal-body">
        <label className="search-dialog-input">
          <Search size={19} />
          <input
            autoFocus
            placeholder="Search agents, orders, products, approvals..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="search-results">
          {results.length ? (
            results.map((result) => (
              <button
                key={`${result.kind}-${result.item.id}`}
                onClick={() => onSelect(result.kind, result.item)}
              >
                <span>
                  <small>{label(result.kind)}</small>
                  <strong>{result.title}</strong>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <Empty
              title="No results found"
              description="Try a product name, customer, order number, or agent."
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}

function KillDialog({
  mode,
  supabase,
  email,
  api,
  onEngaged,
  onClose,
}: {
  mode: "simulation" | "live";
  supabase: SupabaseClient | null;
  email: string;
  api: Api;
  onEngaged: () => Promise<void>;
  onClose: () => void;
}) {
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let reauthToken: string | undefined;
      let freshToken: string | undefined;
      if (mode === "simulation") {
        const result = await api("reauth", "POST", { password });
        reauthToken = String(result.reauthToken);
      } else {
        if (!supabase || !email)
          throw new Error("An authenticated owner account is required.");
        const { data, error: authError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (authError || !data.session)
          throw new Error(authError?.message ?? "Reauthentication failed.");
        freshToken = data.session.access_token;
      }
      const result = await api(
        "kill-switch",
        "POST",
        {
          reason,
          confirmationPhrase: phrase,
          ...(reauthToken ? { reauthToken } : {}),
        },
        freshToken,
      );
      setReport(result);
      setPassword("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Emergency stop request failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={report ? "Emergency stop report" : "Stop everything. Permanently."}
      eyebrow="ISOLATED EMERGENCY CONTROL"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          {report ? (
            <>
              <div className="callout danger-callout">
                <Square size={20} />
                <p>
                  The isolated emergency service returned this result. Recovery
                  is manual; there is no restart button.
                </p>
              </div>
              <pre className="kill-report">
                {JSON.stringify(report, null, 2)}
              </pre>
            </>
          ) : (
            <>
              <div className="callout danger-callout">
                <TriangleAlert size={22} />
                <p>
                  This permanently blocks new actions and requests the
                  configured emergency shutdown steps. The report confirms which
                  steps succeeded. This cannot be undone from the cockpit.
                </p>
              </div>
              <label className="form-label">
                Why are you stopping the system?
                <textarea
                  minLength={10}
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  placeholder="Describe the incident for the audit record..."
                />
              </label>
              <label className="form-label">
                Type <strong>STOP EVERYTHING</strong> to confirm
                <input
                  required
                  autoComplete="off"
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  placeholder="STOP EVERYTHING"
                />
              </label>
              <label className="form-label">
                {mode === "simulation"
                  ? "Local drill password"
                  : "Re-enter your owner account password"}
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {mode === "simulation" && (
                <p className="muted-small">
                  For the default local drill, use{" "}
                  <code>confirm-local-stop</code>. A custom password may be set
                  in your local environment.
                </p>
              )}
            </>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          {report ? (
            <Button
              className="primary"
              type="button"
              onClick={() => void onEngaged()}
            >
              Acknowledge stop report
            </Button>
          ) : (
            <>
              <Button type="button" onClick={onClose}>
                Keep system running
              </Button>
              <Button
                type="submit"
                className="danger"
                busy={busy}
                disabled={
                  phrase !== "STOP EVERYTHING" ||
                  reason.trim().length < 10 ||
                  !password
                }
              >
                <Square size={14} />
                Engage emergency stop
              </Button>
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}

function Login({
  supabase,
  onSuccess,
}: {
  supabase: SupabaseClient | null;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError(
        "Supabase authentication is not configured for this deployment.",
      );
      return;
    }
    setBusy(true);
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (loginError) setError(loginError.message);
    else onSuccess();
    setBusy(false);
  }
  return (
    <form className="panel login-panel" onSubmit={submit}>
      <span className="shield-large">
        <LockKeyhole size={28} />
      </span>
      <h2>Welcome back, owner.</h2>
      <p>Sign in to view and manage your live workspace.</p>
      <label className="form-label">
        Email
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="form-label">
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="primary" busy={busy}>
        Sign in securely <ArrowRight size={15} />
      </Button>
    </form>
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="skeleton-layout"
      aria-label="Loading your cockpit"
      role="status"
    >
      <span className="sr-only">Loading your cockpit...</span>
      <div className="metrics-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="metric-card" key={i}>
            <span className="skeleton skeleton-short" />
            <span className="skeleton skeleton-value" />
            <span className="skeleton" />
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <div className="panel skeleton-chart">
          <span className="skeleton skeleton-short" />
          <div className="skeleton" />
        </div>
        <div className="panel skeleton-chart">
          <span className="skeleton skeleton-short" />
          <div className="skeleton" />
        </div>
      </div>
    </div>
  );
}
