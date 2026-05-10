import { createContext, useContext } from "react";

export function createRequiredContext<T>(hookName: string) {
  const context = createContext<T | null>(null);

  function useRequiredValue() {
    const value = useContext(context);
    if (!value) {
      throw new Error(`${hookName} must be used inside AppProvider.`);
    }
    return value;
  }

  return [context, useRequiredValue] as const;
}
