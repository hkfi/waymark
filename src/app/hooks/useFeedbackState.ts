import { useCallback, useEffect, useMemo, useState } from "react";

export type FeedbackNoticeAction = {
  label: string;
  onClick: () => void;
};

export function useFeedbackState() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNoticeValue] = useState<string | null>(null);
  const [noticeAction, setNoticeAction] = useState<FeedbackNoticeAction | null>(null);

  const setNotice = useCallback((value: string | null) => {
    setNoticeValue(value);
    setNoticeAction(null);
  }, []);

  const setActionNotice = useCallback((value: string, action: FeedbackNoticeAction | null) => {
    setNoticeValue(value);
    setNoticeAction(action);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), noticeAction ? 7000 : 4500);
    return () => window.clearTimeout(id);
  }, [notice, noticeAction, setNotice]);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 9000);
    return () => window.clearTimeout(id);
  }, [error]);

  return useMemo(
    () => ({
      error,
      notice,
      noticeAction,
      setActionNotice,
      setError,
      setNotice,
    }),
    [error, notice, noticeAction, setActionNotice, setNotice],
  );
}
