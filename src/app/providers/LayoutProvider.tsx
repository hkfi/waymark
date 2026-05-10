import type { ReactNode } from "react";
import { usePaneLayout } from "../hooks/usePaneLayout";
import { createRequiredContext } from "./createRequiredContext";

type LayoutContextValue = ReturnType<typeof usePaneLayout>;

const [LayoutContext, useLayout] = createRequiredContext<LayoutContextValue>("useLayout");

export { useLayout };

export function LayoutProvider({ children }: { children: ReactNode }) {
  const layout = usePaneLayout();

  return (
    <LayoutContext.Provider value={layout}>
      {children}
    </LayoutContext.Provider>
  );
}
