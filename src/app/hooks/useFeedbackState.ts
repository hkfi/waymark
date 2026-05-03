import { useEffect, useMemo, useState } from "react";

export function useFeedbackState() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 9000);
    return () => window.clearTimeout(id);
  }, [error]);

  return useMemo(
    () => ({
      error,
      notice,
      setError,
      setNotice,
    }),
    [error, notice],
  );
}
