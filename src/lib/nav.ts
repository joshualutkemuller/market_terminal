import {
  Activity,
  LayoutDashboard,
  Landmark,
  Briefcase,
  Layers,
  Wallet,
  GitMerge,
  Cpu,
  LineChart,
  Bot,
  BellRing,
  Globe,
  Spline,
  Percent,
  CalendarClock,
  Sigma,
  BrainCircuit,
  Banknote,
  Flame,
  Globe2,
  Gavel,
  SquareStack,
  Gauge,
  Telescope,
  CandlestickChart,
  AreaChart,
  Clapperboard,
  Newspaper,
  Droplets,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  /** Bloomberg-style mnemonic command, e.g. "SLAB". */
  code: string;
  label: string;
  href: string;
  icon: LucideIcon;
  desc: string;
  group: "MARKETS" | "FINANCE" | "OPTIMIZATION" | "DESK" | "ECONOMICS" | "INTELLIGENCE";
}

export const NAV: NavItem[] = [
  { code: "HOME", label: "Command Center", href: "/", icon: LayoutDashboard, desc: "Cross-desk overview & KPIs", group: "MARKETS" },
  { code: "MKT", label: "Live Markets", href: "/markets", icon: Activity, desc: "Real-time multi-asset monitor", group: "MARKETS" },
  { code: "SNAP", label: "Market Snapshot", href: "/market-snapshot", icon: Gauge, desc: "Cross-asset returns, drawdowns & regime", group: "MARKETS" },
  { code: "QUILT", label: "Asset Quilt", href: "/asset-quilt", icon: SquareStack, desc: "Annual asset-class return rankings", group: "MARKETS" },
  { code: "IRET", label: "Index Returns", href: "/index-returns", icon: LineChart, desc: "Monthly index returns & drawdowns", group: "MARKETS" },
  { code: "LENS", label: "Market Lens Studio", href: "/market-lens", icon: Telescope, desc: "Configurable analytics workspace", group: "MARKETS" },
  { code: "MKC", label: "Market Chart Studio", href: "/market-chart", icon: CandlestickChart, desc: "Freeform technical market charting", group: "MARKETS" },
  { code: "SLAB", label: "Securities Lending", href: "/securities-lending", icon: Landmark, desc: "Inventory, loan book & revenue", group: "FINANCE" },
  { code: "SQZ", label: "Squeeze Radar", href: "/securities-lending/squeeze", icon: Flame, desc: "Borrow demand, heat score & squeeze risk", group: "FINANCE" },
  { code: "PB", label: "Prime Finance", href: "/prime-finance", icon: Briefcase, desc: "Hedge fund financing & risk", group: "FINANCE" },
  { code: "COLL", label: "Collateral Mgmt", href: "/collateral", icon: Layers, desc: "Margin & collateral optimization", group: "OPTIMIZATION" },
  { code: "CASH", label: "Cash Optimizer", href: "/cash-optimizer", icon: Wallet, desc: "Treasury funding optimization", group: "OPTIMIZATION" },
  { code: "REINV", label: "Cash Reinvestment", href: "/reinvestment", icon: Banknote, desc: "Cash collateral yield ladder", group: "OPTIMIZATION" },
  { code: "LIQ", label: "Liquidity Stress", href: "/liquidity", icon: Wallet, desc: "Funding stress and survival ladder", group: "OPTIMIZATION" },
  { code: "SXU", label: "Sources & Uses", href: "/sources-uses", icon: GitMerge, desc: "Matching & internalization engine", group: "OPTIMIZATION" },
  { code: "OPT", label: "Optimization Center", href: "/optimization", icon: Cpu, desc: "Solver runs & impact analysis", group: "OPTIMIZATION" },
  { code: "DESK", label: "Trading Desk", href: "/trading-desk", icon: LineChart, desc: "Scorecards & execution analytics", group: "DESK" },
  { code: "ECON", label: "Macro Dashboard", href: "/economics", icon: Globe, desc: "FRED-connected economic analytics", group: "ECONOMICS" },
  { code: "CURV", label: "Treasury Curve Lab", href: "/economics/curve", icon: Spline, desc: "Curve shape, history & inversions", group: "ECONOMICS" },
  { code: "INFL", label: "Inflation Explorer", href: "/economics/inflation", icon: Flame, desc: "CPI/PCE to item level, MoM & YoY", group: "ECONOMICS" },
  { code: "GCPI", label: "Global Inflation", href: "/economics/global-cpi", icon: Globe2, desc: "CPI by country, trend & streaks", group: "ECONOMICS" },
  { code: "GPOL", label: "Global Policy Rates", href: "/economics/policy-rates", icon: Gavel, desc: "Central-bank rates & cycles", group: "ECONOMICS" },
  { code: "CRDT", label: "Credit Spreads", href: "/economics/credit", icon: SquareStack, desc: "IG/HY OAS deep dive & stress", group: "ECONOMICS" },
  { code: "FOMC", label: "Rate Probabilities", href: "/economics/rates", icon: Percent, desc: "Fed path & hike/cut odds", group: "ECONOMICS" },
  { code: "CAL", label: "Economic Calendar", href: "/economics/calendar", icon: CalendarClock, desc: "Releases & events", group: "ECONOMICS" },
  { code: "STAT", label: "Statistical Analysis", href: "/economics/stats", icon: Sigma, desc: "Correlations, regressions, regimes", group: "ECONOMICS" },
  { code: "REGIME", label: "Macro Regime", href: "/economics/regime", icon: BrainCircuit, desc: "Macro states to desk playbooks", group: "ECONOMICS" },
  { code: "EML", label: "ML Applications", href: "/economics/ml", icon: BrainCircuit, desc: "Recession, nowcast & rate models", group: "ECONOMICS" },
  { code: "SFE", label: "Sec-Finance Economics", href: "/economics/sec-finance", icon: Banknote, desc: "Rates → repo, funding & lending", group: "ECONOMICS" },
  { code: "FUND", label: "Funding & Liquidity", href: "/economics/funding", icon: Droplets, desc: "Repo, corridor, balances & funding stress", group: "ECONOMICS" },
  { code: "BMRK", label: "Benchmark Rates", href: "/economics/benchmark", icon: Activity, desc: "Daily rates — trend, status, comparison & regime", group: "ECONOMICS" },
  { code: "MGC", label: "Macro Chart Studio", href: "/macro-chart", icon: AreaChart, desc: "Freeform economic & macro charting", group: "ECONOMICS" },
  { code: "MOTN", label: "Macro Motion Studio", href: "/economics/motion", icon: Clapperboard, desc: "Animate economic series over time", group: "ECONOMICS" },
  { code: "NEWS", label: "News & Signal Intel", href: "/news", icon: Newspaper, desc: "Market news, social & signal engine", group: "INTELLIGENCE" },
  { code: "SENT", label: "Investor Sentiment", href: "/sentiment", icon: Gauge, desc: "Survey + social fear/greed & positioning", group: "INTELLIGENCE" },
  { code: "AI", label: "AI Copilot", href: "/copilot", icon: Bot, desc: "Natural-language intelligence", group: "INTELLIGENCE" },
  { code: "DATAOPS", label: "Data Ops", href: "/dataops", icon: Cpu, desc: "Provider health and lineage", group: "INTELLIGENCE" },
  { code: "ALRT", label: "Alert Center", href: "/alerts", icon: BellRing, desc: "Streaming risk & ops alerts", group: "INTELLIGENCE" },
];

export const NAV_GROUPS: { id: NavItem["group"]; label: string }[] = [
  { id: "MARKETS", label: "Markets" },
  { id: "FINANCE", label: "Financing" },
  { id: "OPTIMIZATION", label: "Optimization" },
  { id: "DESK", label: "Trading Desk" },
  { id: "ECONOMICS", label: "Economics & Macro" },
  { id: "INTELLIGENCE", label: "Intelligence" },
];
