import { DrillProvider } from "@/components/econ/DrillProvider";

/** All Economics modules share the drill-down provider so any card can open the
 *  rolling-24-month detail view for a series. */
export default function EconomicsLayout({ children }: { children: React.ReactNode }) {
  return <DrillProvider>{children}</DrillProvider>;
}
