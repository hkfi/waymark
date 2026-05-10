import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import type { CSSProperties } from "react";

const toastTheme = {
  "--normal-bg": "var(--color-surface-2)",
  "--normal-text": "var(--color-ink-soft)",
  "--normal-border": "var(--color-line)",
  "--success-bg":
    "linear-gradient(180deg, oklch(0.23 0.018 150 / 0.96), oklch(0.19 0.01 250 / 0.96))",
  "--success-border": "oklch(0.74 0.13 150 / 0.34)",
  "--success-text": "var(--color-lane-done)",
  "--info-bg":
    "linear-gradient(180deg, oklch(0.23 0.018 225 / 0.96), oklch(0.19 0.01 250 / 0.96))",
  "--info-border": "oklch(0.76 0.12 225 / 0.34)",
  "--info-text": "var(--color-ai-fg)",
  "--warning-bg":
    "linear-gradient(180deg, oklch(0.24 0.02 90 / 0.96), oklch(0.19 0.01 250 / 0.96))",
  "--warning-border": "oklch(0.82 0.14 90 / 0.34)",
  "--warning-text": "var(--color-warn)",
  "--error-bg":
    "linear-gradient(180deg, oklch(0.24 0.025 25 / 0.96), oklch(0.19 0.01 250 / 0.96))",
  "--error-border": "oklch(0.70 0.16 25 / 0.36)",
  "--error-text": "var(--color-danger)",
  "--border-radius": "6px",
} as CSSProperties;

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      richColors
      visibleToasts={4}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        actionButtonStyle: {
          background: "oklch(0.74 0.13 150 / 0.13)",
          border: "1px solid var(--color-lane-done)",
          color: "var(--color-lane-done)",
        },
        classNames: {
          toast: "font-sans leading-[1.45] shadow-[0_16px_48px_oklch(0_0_0_/_0.38)]",
          title: "text-[12px]",
          description: "text-[12px]",
        },
      }}
      style={toastTheme}
      {...props}
    />
  );
}

export { Toaster };
