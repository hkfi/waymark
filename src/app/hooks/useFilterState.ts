import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useFilterState() {
  const [search, setSearch] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleGapsOnly = useCallback(() => {
    setGapsOnly((current) => !current);
  }, []);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
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
