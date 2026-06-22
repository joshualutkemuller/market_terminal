import { Outlet, Route, Routes } from "react-router-dom";
import { RootLayout } from "./app/RootLayout";
import { DrillProvider } from "@/components/econ/DrillProvider";

// Top-level modules
import Home from "./app/page";
import Markets from "./app/markets/page";
import MarketSnapshot from "./app/market-snapshot/page";
import AssetQuilt from "./app/asset-quilt/page";
import IndexReturns from "./app/index-returns/page";
import MarketLens from "./app/market-lens/page";
import MarketChart from "./app/market-chart/page";
import SecuritiesLending from "./app/securities-lending/page";
import Squeeze from "./app/securities-lending/squeeze/page";
import PrimeFinance from "./app/prime-finance/page";
import Collateral from "./app/collateral/page";
import CashOptimizer from "./app/cash-optimizer/page";
import Reinvestment from "./app/reinvestment/page";
import Liquidity from "./app/liquidity/page";
import SourcesUses from "./app/sources-uses/page";
import Optimization from "./app/optimization/page";
import TradingDesk from "./app/trading-desk/page";
import MacroChart from "./app/macro-chart/page";
import News from "./app/news/page";
import Sentiment from "./app/sentiment/page";
import Copilot from "./app/copilot/page";
import DataOps from "./app/dataops/page";
import Alerts from "./app/alerts/page";

// Economics modules (share the DrillProvider layout)
import Economics from "./app/economics/page";
import EconCurve from "./app/economics/curve/page";
import EconInflation from "./app/economics/inflation/page";
import EconGlobalCpi from "./app/economics/global-cpi/page";
import EconPolicyRates from "./app/economics/policy-rates/page";
import EconCredit from "./app/economics/credit/page";
import EconRates from "./app/economics/rates/page";
import EconCalendar from "./app/economics/calendar/page";
import EconStats from "./app/economics/stats/page";
import EconRegime from "./app/economics/regime/page";
import EconMl from "./app/economics/ml/page";
import EconSecFinance from "./app/economics/sec-finance/page";
import EconFunding from "./app/economics/funding/page";
import EconMotion from "./app/economics/motion/page";

import NotFound from "./app/not-found";

export function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Home />} />
        <Route path="markets" element={<Markets />} />
        <Route path="market-snapshot" element={<MarketSnapshot />} />
        <Route path="asset-quilt" element={<AssetQuilt />} />
        <Route path="index-returns" element={<IndexReturns />} />
        <Route path="market-lens" element={<MarketLens />} />
        <Route path="market-chart" element={<MarketChart />} />
        <Route path="securities-lending" element={<SecuritiesLending />} />
        <Route path="securities-lending/squeeze" element={<Squeeze />} />
        <Route path="prime-finance" element={<PrimeFinance />} />
        <Route path="collateral" element={<Collateral />} />
        <Route path="cash-optimizer" element={<CashOptimizer />} />
        <Route path="reinvestment" element={<Reinvestment />} />
        <Route path="liquidity" element={<Liquidity />} />
        <Route path="sources-uses" element={<SourcesUses />} />
        <Route path="optimization" element={<Optimization />} />
        <Route path="trading-desk" element={<TradingDesk />} />
        <Route path="macro-chart" element={<MacroChart />} />
        <Route path="news" element={<News />} />
        <Route path="sentiment" element={<Sentiment />} />
        <Route path="copilot" element={<Copilot />} />
        <Route path="dataops" element={<DataOps />} />
        <Route path="alerts" element={<Alerts />} />

        {/* Economics modules share the drill-down provider (was economics/layout.tsx). */}
        <Route
          path="economics"
          element={
            <DrillProvider>
              <EconomicsOutlet />
            </DrillProvider>
          }
        >
          <Route index element={<Economics />} />
          <Route path="curve" element={<EconCurve />} />
          <Route path="inflation" element={<EconInflation />} />
          <Route path="global-cpi" element={<EconGlobalCpi />} />
          <Route path="policy-rates" element={<EconPolicyRates />} />
          <Route path="credit" element={<EconCredit />} />
          <Route path="rates" element={<EconRates />} />
          <Route path="calendar" element={<EconCalendar />} />
          <Route path="stats" element={<EconStats />} />
          <Route path="regime" element={<EconRegime />} />
          <Route path="ml" element={<EconMl />} />
          <Route path="sec-finance" element={<EconSecFinance />} />
          <Route path="funding" element={<EconFunding />} />
          <Route path="motion" element={<EconMotion />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

// Economics layout: renders its nested routes inside the shared DrillProvider.
function EconomicsOutlet() {
  return <Outlet />;
}
