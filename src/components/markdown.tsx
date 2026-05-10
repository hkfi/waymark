import { useMemo, useState, type ReactNode } from "react";
import { cx } from "./primitives";

export type MarkdownDisplayMode = "preview" | "source";

type MarkdownAlign = "left" | "center" | "right";

type MarkdownBlockNode =
  | { type: "heading"; depth: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; language?: string; text: string }
  | { type: "blockquote"; children: MarkdownBlockNode[] }
  | { type: "list"; ordered: boolean; start?: number; items: MarkdownListItem[] }
  | { type: "table"; headers: string[]; aligns: MarkdownAlign[]; rows: string[][] }
  | { type: "hr" };

type MarkdownListItem = {
  text: string;
  checked?: boolean;
};

export function MarkdownBlock({
  value,
  label = "markdown",
  empty = "No Markdown.",
  defaultMode = "preview",
  compact = false,
  actions,
  className,
  contentClassName,
  sourceClassName,
}: {
  value: string;
  label?: string;
  empty?: string;
  defaultMode?: MarkdownDisplayMode;
  compact?: boolean;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
  sourceClassName?: string;
}) {
  const [mode, setMode] = useState<MarkdownDisplayMode>(defaultMode);
  const hasValue = value.trim().length > 0;

  return (
    <div className={cx("flex min-w-0 flex-col overflow-hidden rounded-[5px] border border-line-soft bg-surface-input-2", className)}>
      <div className="flex min-h-7 items-center gap-2 border-b border-line-soft bg-surface-3 px-2.5 py-1.5">
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint">
          {label}
        </span>
        <span className="flex-1" />
        {actions}
        <span className="inline-flex shrink-0 rounded-[3px] border border-line-soft bg-surface-input p-0.5">
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={cx(
              "h-5 rounded-[2px] px-1.5 text-[10.5px]",
              mode === "preview" ? "bg-surface-4 text-ink" : "text-ink-faint hover:text-ink",
            )}
          >
            Rendered
          </button>
          <button
            type="button"
            onClick={() => setMode("source")}
            className={cx(
              "h-5 rounded-[2px] px-1.5 text-[10.5px]",
              mode === "source" ? "bg-surface-4 text-ink" : "text-ink-faint hover:text-ink",
            )}
          >
            Source
          </button>
        </span>
      </div>
      {mode === "preview" ? (
        <MarkdownView
          source={value}
          empty={empty}
          compact={compact}
          className={cx("px-3 py-2.5", contentClassName)}
        />
      ) : hasValue ? (
        <pre
          className={cx(
            "m-0 overflow-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[11px] leading-[1.55] text-ink-soft",
            contentClassName,
            sourceClassName,
          )}
        >
          {value}
        </pre>
      ) : (
        <div className={cx("px-3 py-2.5 text-[12px] leading-[1.5] text-ink-mute", contentClassName)}>
          {empty}
        </div>
      )}
    </div>
  );
}

export function MarkdownView({
  source,
  empty = "No Markdown.",
  compact = false,
  className,
}: {
  source: string;
  empty?: string;
  compact?: boolean;
  className?: string;
}) {
  const blocks = useMemo(() => parseMarkdownBlocks(source), [source]);

  if (!source.trim()) {
    return <div className={cx("text-ink-mute", compact ? "text-[12px]" : "text-[12.5px]", className)}>{empty}</div>;
  }

  return (
    <div className={cx("min-w-0 text-ink-soft", compact ? "text-[12px] leading-[1.5]" : "text-[12.5px] leading-[1.6]", className)}>
      {blocks.map((block, index) => renderBlock(block, `block-${index}`, compact))}
    </div>
  );
}

function parseMarkdownBlocks(source: string): MarkdownBlockNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = parseFenceOpen(trimmed);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]?.trim().startsWith(fence.marker)) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence.language, text: codeLines.join("\n") });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", depth: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && (lines[index]?.trim().startsWith(">") || !lines[index]?.trim())) {
        const quoteLine = lines[index] ?? "";
        quoteLines.push(quoteLine.trim().startsWith(">") ? quoteLine.replace(/^\s*>\s?/, "") : "");
        index += 1;
      }
      blocks.push({ type: "blockquote", children: parseMarkdownBlocks(quoteLines.join("\n")) });
      continue;
    }

    if (isTableStart(lines, index)) {
      const table = parseTable(lines, index);
      blocks.push(table.block);
      index = table.nextIndex;
      continue;
    }

    const listItem = parseListLine(line);
    if (listItem) {
      const list = parseList(lines, index, listItem.ordered);
      blocks.push(list.block);
      index = list.nextIndex;
      continue;
    }

    const paragraphLines: string[] = [line.trimEnd()];
    index += 1;
    while (index < lines.length && shouldContinueParagraph(lines, index)) {
      paragraphLines.push((lines[index] ?? "").trimEnd());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join("\n").trim() });
  }

  return blocks;
}

function shouldContinueParagraph(lines: string[], index: number) {
  const line = lines[index] ?? "";
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (parseFenceOpen(trimmed)) return false;
  if (/^(#{1,6})\s+/.test(trimmed)) return false;
  if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) return false;
  if (trimmed.startsWith(">")) return false;
  if (parseListLine(line)) return false;
  if (isTableStart(lines, index)) return false;
  return true;
}

function parseFenceOpen(trimmed: string) {
  const match = trimmed.match(/^(```+|~~~+)\s*([\w.-]+)?\s*$/);
  if (!match) return null;
  return { marker: match[1][0].repeat(match[1].length), language: match[2] };
}

function parseList(lines: string[], startIndex: number, ordered: boolean) {
  const first = parseListLine(lines[startIndex] ?? "");
  const items: MarkdownListItem[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const parsed = parseListLine(lines[index] ?? "");
    if (!parsed || parsed.ordered !== ordered) break;

    const itemLines = [parsed.text];
    index += 1;
    while (index < lines.length) {
      const continuation = lines[index] ?? "";
      if (!continuation.trim()) {
        index += 1;
        break;
      }
      if (parseListLine(continuation) || !/^\s{2,}/.test(continuation)) break;
      itemLines.push(continuation.trim());
      index += 1;
    }
    items.push({ text: itemLines.join("\n"), checked: parsed.checked });
  }

  return {
    block: { type: "list" as const, ordered, start: first?.start, items },
    nextIndex: index,
  };
}

function parseListLine(line: string) {
  const unordered = line.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.+)$/);
  if (unordered) {
    return {
      ordered: false,
      checked: unordered[1] ? unordered[1].toLowerCase() === "x" : undefined,
      text: unordered[2].trim(),
    };
  }

  const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
  if (ordered) {
    return {
      ordered: true,
      start: Number(ordered[1]),
      text: ordered[2].trim(),
      checked: undefined,
    };
  }

  return null;
}

function isTableStart(lines: string[], index: number) {
  const header = splitTableRow(lines[index] ?? "");
  const divider = splitTableRow(lines[index + 1] ?? "");
  if (header.length < 2 || divider.length !== header.length) return false;
  return divider.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTable(lines: string[], startIndex: number) {
  const headers = splitTableRow(lines[startIndex] ?? "");
  const divider = splitTableRow(lines[startIndex + 1] ?? "");
  const aligns = divider.map((cell): MarkdownAlign => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
    if (trimmed.endsWith(":")) return "right";
    return "left";
  });
  const rows: string[][] = [];
  let index = startIndex + 2;

  while (index < lines.length) {
    const row = splitTableRow(lines[index] ?? "");
    if (row.length !== headers.length) break;
    rows.push(row);
    index += 1;
  }

  return {
    block: { type: "table" as const, headers, aligns, rows },
    nextIndex: index,
  };
}

function splitTableRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";

  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === "\\" && inner[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function renderBlock(block: MarkdownBlockNode, key: string, compact: boolean): ReactNode {
  if (block.type === "heading") {
    const size = block.depth === 1
      ? compact ? "text-[14px]" : "text-[16px]"
      : block.depth === 2
        ? compact ? "text-[13px]" : "text-[14px]"
        : "text-[12.5px]";
    return (
      <div
        key={key}
        role="heading"
        aria-level={block.depth}
        className={cx("mb-2 mt-3 first:mt-0 font-semibold leading-[1.3] text-ink", size)}
      >
        {renderInline(block.text, `${key}-heading`)}
      </div>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p key={key} className="m-0 mb-2 last:mb-0">
        {renderInline(block.text, `${key}-paragraph`)}
      </p>
    );
  }

  if (block.type === "code") {
    return (
      <pre key={key} className="mb-2 mt-0 overflow-x-auto rounded-[4px] border border-line-soft bg-surface px-2.5 py-2 font-mono text-[11px] leading-[1.5] text-ink-soft last:mb-0">
        <code className="bg-transparent p-0 text-[inherit] text-inherit">
          {block.language ? <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-ink-mute">{block.language}</span> : null}
          {block.text}
        </code>
      </pre>
    );
  }

  if (block.type === "blockquote") {
    return (
      <blockquote key={key} className="m-0 mb-2 border-l-2 border-line bg-surface-input px-3 py-2 text-ink-faint last:mb-0">
        {block.children.map((child, index) => renderBlock(child, `${key}-quote-${index}`, compact))}
      </blockquote>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag
        key={key}
        start={block.ordered ? block.start : undefined}
        className={cx(
          "mb-2 mt-0 grid gap-1 pl-4 last:mb-0",
          block.ordered ? "list-decimal" : "list-disc",
        )}
      >
        {block.items.map((item, index) => (
          <li key={`${key}-item-${index}`} className={cx(item.checked !== undefined && "list-none")}>
            <span className="inline-flex min-w-0 items-start gap-2">
              {item.checked !== undefined ? (
                <span className={cx(
                  "mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border text-[9px] leading-none",
                  item.checked ? "border-accent-deep bg-accent text-accent-ink" : "border-line bg-surface-input",
                )}>
                  {item.checked ? "x" : null}
                </span>
              ) : null}
              <span>{renderInline(item.text, `${key}-item-${index}`)}</span>
            </span>
          </li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "table") {
    return (
      <div key={key} className="mb-2 overflow-x-auto rounded-[4px] border border-line-soft last:mb-0">
        <table className="w-full border-collapse text-left text-[11.5px]">
          <thead className="bg-surface-3 text-ink">
            <tr>
              {block.headers.map((header, index) => (
                <th key={`${key}-head-${index}`} className={cx("border-b border-line-soft px-2 py-1.5 font-semibold", tableAlignClass(block.aligns[index]))}>
                  {renderInline(header, `${key}-head-${index}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${key}-row-${rowIndex}`} className="border-b border-line-soft last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td key={`${key}-cell-${rowIndex}-${cellIndex}`} className={cx("px-2 py-1.5 align-top", tableAlignClass(block.aligns[cellIndex]))}>
                    {renderInline(cell, `${key}-cell-${rowIndex}-${cellIndex}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <hr key={key} className="my-3 border-0 border-t border-line-soft" />;
}

function tableAlignClass(align?: MarkdownAlign) {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  let textIndex = 0;

  function pushText(value: string) {
    if (!value) return;
    const parts = value.split("\n");
    parts.forEach((part, partIndex) => {
      if (part) {
        nodes.push(part);
        textIndex += 1;
      }
      if (partIndex < parts.length - 1) {
        nodes.push(<br key={`${keyPrefix}-br-${textIndex}`} />);
        textIndex += 1;
      }
    });
  }

  while (index < text.length) {
    const candidates = [
      findCodeSpan(text, index),
      findLink(text, index),
      findDelimited(text, index, "**", "strong"),
      findDelimited(text, index, "~~", "strike"),
      findDelimited(text, index, "*", "em"),
    ].filter((candidate): candidate is InlineCandidate => Boolean(candidate));
    candidates.sort((left, right) => left.start - right.start || left.priority - right.priority);
    const candidate = candidates[0];

    if (!candidate) {
      pushText(text.slice(index));
      break;
    }

    pushText(text.slice(index, candidate.start));
    nodes.push(candidate.render(`${keyPrefix}-inline-${nodes.length}`));
    index = candidate.end;
  }

  return nodes;
}

type InlineCandidate = {
  start: number;
  end: number;
  priority: number;
  render: (key: string) => ReactNode;
};

function findCodeSpan(text: string, startAt: number): InlineCandidate | null {
  const start = text.indexOf("`", startAt);
  if (start < 0) return null;
  const end = text.indexOf("`", start + 1);
  if (end < 0) return null;
  return {
    start,
    end: end + 1,
    priority: 0,
    render: (key) => (
      <code key={key} className="font-mono text-[0.92em] text-ink-soft">
        {text.slice(start + 1, end)}
      </code>
    ),
  };
}

function findLink(text: string, startAt: number): InlineCandidate | null {
  const start = text.indexOf("[", startAt);
  if (start < 0) return null;
  const labelEnd = text.indexOf("]", start + 1);
  if (labelEnd < 0 || text[labelEnd + 1] !== "(") return null;
  const hrefEnd = text.indexOf(")", labelEnd + 2);
  if (hrefEnd < 0) return null;
  const label = text.slice(start + 1, labelEnd);
  const href = text.slice(labelEnd + 2, hrefEnd).trim();
  const safe = safeHref(href);

  return {
    start,
    end: hrefEnd + 1,
    priority: 1,
    render: (key) => safe ? (
      <a key={key} href={safe} target="_blank" rel="noreferrer" className="text-accent-fg underline decoration-line underline-offset-2 hover:text-accent">
        {renderInline(label, `${key}-label`)}
      </a>
    ) : (
      <span key={key} className="text-accent-fg underline decoration-line underline-offset-2" title={href}>
        {renderInline(label, `${key}-label`)}
      </span>
    ),
  };
}

function findDelimited(
  text: string,
  startAt: number,
  marker: "**" | "~~" | "*",
  kind: "strong" | "strike" | "em",
): InlineCandidate | null {
  let start = text.indexOf(marker, startAt);
  while (start >= 0) {
    if (marker === "*" && (text[start - 1] === "*" || text[start + 1] === "*")) {
      start = text.indexOf(marker, start + 1);
      continue;
    }
    const end = text.indexOf(marker, start + marker.length);
    if (end < 0) return null;
    if (marker === "*" && text[end + 1] === "*") {
      start = text.indexOf(marker, start + 1);
      continue;
    }
    const inner = text.slice(start + marker.length, end);
    if (!inner.trim()) {
      start = text.indexOf(marker, start + 1);
      continue;
    }
    return {
      start,
      end: end + marker.length,
      priority: marker === "**" ? 2 : marker === "~~" ? 3 : 4,
      render: (key) => {
        const children = renderInline(inner, `${key}-${kind}`);
        if (kind === "strong") return <strong key={key} className="font-semibold text-ink">{children}</strong>;
        if (kind === "strike") return <del key={key} className="text-ink-faint">{children}</del>;
        return <em key={key}>{children}</em>;
      },
    };
  }

  return null;
}

function safeHref(href: string) {
  const trimmed = href.trim().replace(/^<|>$/g, "");
  if (/^(https?:|mailto:|#)/i.test(trimmed)) return trimmed;
  return undefined;
}
