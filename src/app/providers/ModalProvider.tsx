import type { ReactNode } from "react";
import { useModalState } from "../hooks/useModalState";
import { createRequiredContext } from "./createRequiredContext";
import { useFeedback } from "./FeedbackProvider";

type ModalContextValue = ReturnType<typeof useModalState>;

const [ModalContext, useModals] = createRequiredContext<ModalContextValue>("useModals");

export { useModals };

export function ModalProvider({ children }: { children: ReactNode }) {
  const feedback = useFeedback();
  const modals = useModalState(feedback.setNotice);

  return (
    <ModalContext.Provider value={modals}>
      {children}
    </ModalContext.Provider>
  );
}
