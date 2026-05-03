import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react";
import type { TicketStatus } from "../types";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Pin({ kind, className }: { kind: string; className?: string }) {
  return <span className={cx("lane-pin", kind, className)} />;
}

export function StatusChip({ status }: { status: TicketStatus }) {
  const label = status === "idea" ? "IDEA" : status.toUpperCase();
  return <span className={cx("status-chip", status)}>{label}</span>;
}

export function Btn({
  variant = "default",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" }) {
  const base =
    "h-7 px-2.5 rounded-[5px] inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap border disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    default:
      "border-line bg-surface-2 text-ink-soft hover:bg-surface-4 hover:text-ink",
    primary:
      "border-accent-deep bg-accent text-accent-ink font-semibold hover:brightness-110",
    ghost:
      "border-transparent bg-transparent text-ink-faint hover:bg-surface-2 hover:text-ink",
  };
  return (
    <button {...rest} className={cx(base, variants[variant], className)}>
      {children}
    </button>
  );
}

export function CommandShortcutBadge({
  value,
  tone = "default",
}: {
  value: string;
  tone?: "default" | "primary" | "active" | "subtle";
}) {
  const toneClass = {
    default: "bg-surface-input border-line text-ink-faint",
    primary: "bg-[oklch(0_0_0_/_0.22)] border-[oklch(0_0_0_/_0.3)] text-accent-ink",
    active: "border-accent-deep bg-accent-soft text-accent",
    subtle: "bg-surface-2 border-line-soft text-ink-faint",
  }[tone];

  return (
    <span
      className={cx(
        "h-[17px] min-w-[30px] justify-center inline-flex items-center gap-0.5 rounded-[3px] border border-b-2 px-1 font-mono text-[10.5px] leading-none tabular-nums shrink-0",
        toneClass,
      )}
    >
      <span className="font-sans text-[12px] leading-none">⌘</span>
      <span className="leading-none">{value}</span>
    </span>
  );
}

export function SectionHead({ children, more }: { children: ReactNode; more?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-2 px-0.5 min-w-0">
      <h2 className="m-0 text-[11px] uppercase tracking-[0.10em] text-ink-faint font-semibold flex items-center gap-2 whitespace-nowrap shrink-0">
        {children}
      </h2>
      <div className="flex-1 h-px bg-line-soft" />
      {more}
    </div>
  );
}

export function Card({ children, className, ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...rest} className={cx("border border-line rounded-[5px] bg-surface-2 overflow-hidden", className)}>
      {children}
    </div>
  );
}

export function Flag({
  tone = "default",
  title,
  children,
}: {
  tone?: "default" | "ok" | "muted";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    default: "bg-surface-row-selected border-line text-ink-faint",
    ok: "text-lane-done border-[oklch(0.74_0.13_150_/_0.25)] bg-[oklch(0.74_0.13_150_/_0.10)]",
    muted: "bg-surface-row-selected border-line text-ink-mute",
  } as const;
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-0.5 h-4 px-1 rounded-[3px] border font-mono text-[9.5px] shrink-0",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------- table primitives --------------------------- */

type CellTone = "ink" | "soft" | "faint" | "mute";

const CELL_TONE: Record<CellTone, string> = {
  ink: "text-ink",
  soft: "text-ink-soft",
  faint: "text-ink-faint",
  mute: "text-ink-mute",
};

export function Cell({
  children,
  mono,
  size = 12,
  tone = "soft",
  align = "start",
  truncate = true,
  title,
  className,
  style,
}: {
  children: ReactNode;
  mono?: boolean;
  /** font-size in px */
  size?: number;
  tone?: CellTone;
  align?: "start" | "end";
  truncate?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      title={title}
      style={{ fontSize: size, ...style }}
      className={cx(
        "min-w-0 leading-tight",
        CELL_TONE[tone],
        mono && "font-mono",
        align === "end" && "text-right",
        truncate && "truncate",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Container for a row inside a Card-like table. The grid template comes from the
 * caller (e.g. `grid-cols-ticket`) so Tailwind can statically detect the class.
 */
export function DataRow({
  cols,
  height = 32,
  paddingX = 14,
  gap = 10,
  selected,
  ariaLabel,
  className,
  onClick,
  children,
}: {
  /** Tailwind class for grid template columns (e.g. "grid-cols-ticket"). */
  cols: string;
  height?: number;
  paddingX?: number;
  gap?: number;
  selected?: boolean;
  ariaLabel?: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onClick();
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      aria-selected={selected || undefined}
      className={cx(
        "grid items-center border-b border-line-soft last:border-b-0",
        cols,
        onClick && "cursor-pointer hover:bg-surface-row-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent focus-visible:outline-offset-[-2px]",
        selected && "bg-surface-row-selected shadow-[inset_2px_0_0_var(--color-accent)]",
        className,
      )}
      style={{ height, paddingLeft: paddingX, paddingRight: paddingX, columnGap: gap }}
    >
      {children}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "warn" | "err"; children: ReactNode }) {
  const tones = {
    ok: "text-lane-done border-[oklch(0.74_0.13_150_/_0.3)] bg-[oklch(0.74_0.13_150_/_0.08)]",
    warn: "text-warn border-[oklch(0.82_0.14_90_/_0.3)] bg-[oklch(0.82_0.14_90_/_0.08)]",
    err: "text-danger border-[oklch(0.70_0.16_25_/_0.3)] bg-[oklch(0.70_0.16_25_/_0.08)]",
  };
  return (
    <div className={cx("text-[12px] px-3 py-2 rounded-[5px] border mb-3 flex items-start gap-2 flex-wrap", tones[tone])}>
      {children}
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <div className="px-4 py-4 text-ink-mute text-center text-[12px]">{children}</div>;
}
