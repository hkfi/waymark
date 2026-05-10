import type { ReactNode } from "react";
import { useNavigationState } from "../hooks/useNavigationState";
import { createRequiredContext } from "./createRequiredContext";

type NavigationContextValue = ReturnType<typeof useNavigationState>;

const [NavigationContext, useNavigation] = createRequiredContext<NavigationContextValue>("useNavigation");

export { useNavigation };

export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigation = useNavigationState();

  return (
    <NavigationContext.Provider value={navigation}>
      {children}
    </NavigationContext.Provider>
  );
}
