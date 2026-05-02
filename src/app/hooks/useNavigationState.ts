import { useCallback, useMemo, useState } from "react";
import { navToTab, tabToNav, type MainTab, type NavId } from "../model";

export function useNavigationState() {
  const [nav, setNavValue] = useState<NavId>("home");
  const [tab, setTabValue] = useState<MainTab>("overview");

  const setNav = useCallback((next: NavId) => {
    setNavValue(next);
    setTabValue(navToTab(next));
  }, []);

  const setTab = useCallback((next: MainTab) => {
    setTabValue(next);
    setNavValue(tabToNav(next));
  }, []);

  return useMemo(
    () => ({
      nav,
      tab,
      setNav,
      setTab,
    }),
    [nav, setNav, setTab, tab],
  );
}
