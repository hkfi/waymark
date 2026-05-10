import type { ReactNode } from "react";
import { useFeedbackState } from "../hooks/useFeedbackState";
import { createRequiredContext } from "./createRequiredContext";

type FeedbackContextValue = ReturnType<typeof useFeedbackState>;

const [FeedbackContext, useFeedback] = createRequiredContext<FeedbackContextValue>("useFeedback");

export { useFeedback };

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const feedback = useFeedbackState();

  return (
    <FeedbackContext.Provider value={feedback}>
      {children}
    </FeedbackContext.Provider>
  );
}
