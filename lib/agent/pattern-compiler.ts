import type { A2UIComponent, A2UIMessage } from "./a2ui";
import { resolvePath } from "./a2ui";
import type { Manifest, Pattern, PatternCall } from "./manifest";
import { parsePatternCall, patternOf } from "./manifest";

// Compiles the pattern mini-language (see .agent/compilation-rules.md §2) into A2UI
// messages. Grammar per layout line:
//   [*@/path ][?ui-state[|ui-state…] ]Component[ #id][: rest]
// where rest is a quoted primary text, and/or `key=value` props (value: @/path binding,
// "quoted" literal, number, bool), and/or a trailing `-> event <name>`.

/** `scope` is the item path a line was expanded under, if it came from a `*@/path` repeat. */
type Line = { indent: number; text: string; scope?: string };

const PRIMARY_TEXT_PROP: Record<string, string> = { Text: "text", Button: "text" };

function parseValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("@/")) return { path: trimmed.slice(1) };
  if (/^".*"$/.test(trimmed)) return rewriteInterpolation(trimmed.slice(1, -1));
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "true" || trimmed === "false") return trimmed === "true";
  return trimmed;
}

/** `{@/path}` in authored strings becomes `{/path}` on the wire. */
function rewriteInterpolation(text: string) {
  return text.replaceAll("{@/", "{/");
}

function splitProps(rest: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of rest) {
    if (char === '"') inQuotes = !inQuotes;
    if (char === "," && !inQuotes) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Rewrite `@./field` (item-relative) to the absolute path of one item of a repeat. */
function scopePaths(text: string, itemPath: string) {
  return text.replaceAll("@./", `@${itemPath}/`);
}

/** Suffix explicit `#id`s so each instance of a repeated subtree gets unique ids. */
function suffixIds(text: string, index: number) {
  return text.replace(/#([\w-]+)/g, `#$1-${index}`);
}

/**
 * Expand `*@/path` repeats into one copy of the subtree per item, as a source-to-source
 * transform: everything after this sees ordinary lines. Nested repeats fall out of the
 * loop, because an inner `*@./sub` becomes `*@/path/0/sub` once its parent expands.
 */
function expandRepeats(lines: Line[], dataModel: Record<string, unknown>): Line[] {
  let current = lines;
  for (let guard = 0; guard < 10; guard += 1) {
    const at = current.findIndex((line) => line.text.startsWith("*@/"));
    if (at < 0) return current;

    const header = current[at];
    const marker = header.text.slice(1).split(/\s+/)[0]; // `@/venues/candidates`
    const listPath = marker.slice(1);
    const body = header.text.slice(1 + marker.length).trim();
    let end = at + 1;
    while (end < current.length && current[end].indent > header.indent) end += 1;
    const block = current.slice(at + 1, end);

    const items = resolvePath(dataModel, listPath);
    const expanded: Line[] = [];
    if (Array.isArray(items)) {
      items.forEach((_, index) => {
        const itemPath = `${listPath}/${index}`;
        expanded.push({ indent: header.indent, text: scopePaths(suffixIds(body, index), itemPath), scope: itemPath });
        for (const line of block) {
          expanded.push({
            indent: line.indent,
            text: scopePaths(suffixIds(line.text, index), itemPath),
            scope: line.scope ?? itemPath,
          });
        }
      });
    }
    current = [...current.slice(0, at), ...expanded, ...current.slice(end)];
  }
  throw new Error("Layout repeats nested more than 10 deep");
}

export function compileLayout(
  pattern: Pattern,
  uiState: string | null,
  dataModel: Record<string, unknown> = {},
): A2UIComponent[] {
  if (uiState !== null && pattern.states.length && !pattern.states.includes(uiState)) {
    throw new Error(`Pattern ${pattern.id} declares no UI state ${uiState}`);
  }
  const authored: Line[] = pattern.layout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim() }));
  const lines = expandRepeats(authored, dataModel);
  const bindings = eventBindings(pattern);

  const components: A2UIComponent[] = [];
  const autoIds = new Map<string, number>();
  // Stack of (indent, component) for parent lookup; null marks a pruned `?param` subtree.
  const stack: { indent: number; node: A2UIComponent | null }[] = [];

  for (const line of lines) {
    while (stack.length && stack[stack.length - 1].indent >= line.indent) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].node : undefined;
    const pruned = stack.length > 0 && parent === null;

    let text = line.text;
    let conditional: string[] | undefined;
    if (text.startsWith("?")) {
      const marker = text.slice(1).split(/\s+/)[0];
      text = text.slice(1 + marker.length).trim();
      conditional = marker.split("|");
      for (const name of conditional) {
        if (!pattern.states.includes(name)) {
          throw new Error(`Pattern ${pattern.id} layout conditions on undeclared UI state ${name}`);
        }
      }
    }
    if (pruned || (conditional && (uiState === null || !conditional.includes(uiState)))) {
      stack.push({ indent: line.indent, node: null });
      continue;
    }

    const head = text.match(/^(\w+)(?:\s+#([\w-]+))?\s*(?::\s*(.*))?$/);
    if (!head) throw new Error(`Unparseable layout line: ${line.text}`);
    const [, componentType, explicitId, rest = ""] = head;
    const count = (autoIds.get(componentType) ?? 0) + 1;
    autoIds.set(componentType, count);
    const id = explicitId ?? `${componentType.toLowerCase()}-${count}`;
    const node: A2UIComponent = { id, component: componentType };

    let props = rest;
    const eventMatch = props.match(/->\s*event\s+(\w+)\s*$/);
    if (eventMatch) {
      const name = eventMatch[1];
      node.action = { event: { name } };
      // A control inside a repeat carries its own bindings: every row emits the same event
      // name, so the payload can only be told apart per component.
      if (line.scope) {
        const scoped = Object.entries(bindings[name] ?? {}).map(([key, path]) => [
          key,
          path.startsWith("./") ? `${line.scope}${path.slice(1)}` : path,
        ]);
        if (scoped.length) node.action.event.bindings = Object.fromEntries(scoped);
      }
      props = props.slice(0, eventMatch.index).trim();
    }
    for (const part of splitProps(props)) {
      const pair = part.match(/^\s*([\w-]+)\s*=(.*)$/);
      if (pair) node[pair[1]] = parseValue(pair[2]);
      else if (part.trim()) {
        const primary = PRIMARY_TEXT_PROP[componentType] ?? "text";
        node[primary] = parseValue(part);
      }
    }

    if (parent) {
      if (parent.children) parent.children.push(id);
      else if (parent.child) {
        parent.children = [parent.child, id];
        delete parent.child;
      } else parent.child = id;
    }
    components.push(node);
    stack.push({ indent: line.indent, node });
  }
  return components;
}

/**
 * Parse `events:` entries like `log_weight(kg=@/entry/kg)` into payload bindings.
 * `@./field` is item-relative — only meaningful for a control inside a `*@/path` repeat,
 * where the compiler resolves it per instance.
 */
export function eventBindings(pattern: Pattern): Record<string, Record<string, string>> {
  const bindings: Record<string, Record<string, string>> = {};
  for (const entry of pattern.events) {
    const match = entry.match(/^(\w+)(?:\((.*)\))?$/);
    if (!match) throw new Error(`Unparseable event entry: ${entry}`);
    const payload: Record<string, string> = {};
    for (const pair of (match[2] ?? "").split(",").filter(Boolean)) {
      const [key, raw] = pair.split("=").map((part) => part.trim());
      if (!raw?.startsWith("@/") && !raw?.startsWith("@./")) {
        throw new Error(`Event payload must bind a @/path or @./path: ${entry}`);
      }
      payload[key] = raw.slice(1);
    }
    bindings[match[1]] = payload;
  }
  return bindings;
}

/** Item-relative bindings mean nothing outside their row; the components carry those. */
function surfaceBindings(pattern: Pattern) {
  return Object.fromEntries(
    Object.entries(eventBindings(pattern))
      .map(([name, payload]) => [
        name,
        Object.fromEntries(Object.entries(payload).filter(([, path]) => !path.startsWith("./"))),
      ])
      .filter(([, payload]) => Object.keys(payload as Record<string, string>).length > 0),
  ) as Record<string, Record<string, string>>;
}

export type CompiledSurface = {
  messages: A2UIMessage[];
  fallback: string;
  eventBindings: Record<string, Record<string, string>>;
};

export function compileSurface(
  manifest: Manifest,
  call: PatternCall | string,
  surfaceId: string,
  dataModel: Record<string, unknown>,
): CompiledSurface {
  const { patternId, uiState } = typeof call === "string" ? parsePatternCall(call) : call;
  const pattern = patternOf(manifest, patternId);
  const messages: A2UIMessage[] = [
    { createSurface: { surfaceId, catalogId: manifest.genui.catalog } },
    { updateComponents: { surfaceId, components: compileLayout(pattern, uiState, dataModel) } },
    { updateDataModel: { surfaceId, path: "/", value: dataModel } },
  ];
  return { messages, fallback: rewriteInterpolation(pattern.fallback), eventBindings: surfaceBindings(pattern) };
}
