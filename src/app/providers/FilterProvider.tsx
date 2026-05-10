import type { ReactNode } from "react";
import { useFilterState } from "../hooks/useFilterState";
import { createRequiredContext } from "./createRequiredContext";

type FilterContextValue = ReturnType<typeof useFilterState>;

const [FilterContext, useFilters] = createRequiredContext<FilterContextValue>("useFilters");

export { useFilters };

export function FilterProvider({ children }: { children: ReactNode }) {
  const filters = useFilterState();

  return (
    <FilterContext.Provider value={filters}>
      {children}
    </FilterContext.Provider>
  );
}
