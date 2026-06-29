import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface SimModeState {
  simEnabled: boolean;
  toggle: () => void;
}

const SimModeContext = createContext<SimModeState>({ simEnabled: false, toggle: () => {} });

const STORAGE_KEY = "qit-sim-mode";

export function SimModeProvider({ children }: { children: ReactNode }) {
  const [simEnabled, setSimEnabled] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setSimEnabled(true);
  }, []);

  const toggle = useCallback(() => {
    setSimEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  return (
    <SimModeContext.Provider value={{ simEnabled, toggle }}>
      {children}
    </SimModeContext.Provider>
  );
}

export function useSimMode() {
  return useContext(SimModeContext);
}
