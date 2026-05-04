import { useCallback, useMemo, useState } from "react";
import type { NavId } from "../model";

export function useNavigationState() {
  const [nav, setNavValue] = useState<NavId>("home");

  const setNav = useCallback((next: NavId) => {
    setNavValue(next);
  }, []);

  return useMemo(
    () => ({
      nav,
      setNav,
    }),
    [nav, setNav],
  );
}
