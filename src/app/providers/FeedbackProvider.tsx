import { useMemo, type ReactNode } from "react";
import { useFeedbackState } from "../hooks/useFeedbackState";
import { createRequiredContext } from "./createRequiredContext";

type FeedbackContextValue = ReturnType<typeof useFeedbackState>;
type FeedbackStateContextValue = Pick<FeedbackContextValue, "error" | "notice" | "noticeAction">;
type FeedbackActionsContextValue = Pick<FeedbackContextValue, "setActionNotice" | "setError" | "setNotice">;

const [FeedbackStateContext, useFeedbackStateValue] =
  createRequiredContext<FeedbackStateContextValue>("useFeedbackStateValue");
const [FeedbackActionsContext, useFeedbackActions] =
  createRequiredContext<FeedbackActionsContextValue>("useFeedbackActions");

export { useFeedbackActions };

export function useFeedback() {
  const state = useFeedbackStateValue();
  const actions = useFeedbackActions();

  return useMemo(
    () => ({
      ...state,
      ...actions,
    }),
    [actions, state],
  );
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const feedback = useFeedbackState();
  const state = useMemo<FeedbackStateContextValue>(
    () => ({
      error: feedback.error,
      notice: feedback.notice,
      noticeAction: feedback.noticeAction,
    }),
    [feedback.error, feedback.notice, feedback.noticeAction],
  );
  const actions = useMemo<FeedbackActionsContextValue>(
    () => ({
      setActionNotice: feedback.setActionNotice,
      setError: feedback.setError,
      setNotice: feedback.setNotice,
    }),
    [feedback.setActionNotice, feedback.setError, feedback.setNotice],
  );

  return (
    <FeedbackActionsContext.Provider value={actions}>
      <FeedbackStateContext.Provider value={state}>
        {children}
      </FeedbackStateContext.Provider>
    </FeedbackActionsContext.Provider>
  );
}
