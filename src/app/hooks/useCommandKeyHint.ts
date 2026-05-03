import { useEffect, useState } from "react";

export function useCommandKeyHint() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    function update(event: KeyboardEvent) {
      setActive(event.metaKey || event.ctrlKey);
    }

    function clear() {
      setActive(false);
    }

    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);

    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);

  return active;
}
