import { useCallback, useMemo, useRef, useState } from "react";

export function useFilterState() {
  const [search, setSearch] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleGapsOnly = useCallback(() => {
    setGapsOnly((current) => !current);
  }, []);

  return useMemo(
    () => ({
      search,
      setSearch,
      gapsOnly,
      toggleGapsOnly,
      searchInputRef,
    }),
    [gapsOnly, search, toggleGapsOnly],
  );
}
