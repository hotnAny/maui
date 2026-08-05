import type { A2UIComponent, A2UIMessage } from "./a2ui";
import type { Manifest, Pattern, PatternCall } from "./manifest";
import { parsePatternCall, patternOf } from "./manifest";

// Compiles the pattern mini-language (see .agent/compilation-rules.md §2) into A2UI
// messages. Grammar per layout line:
//   [?ui-state[|ui-state…] ]Component[ #id][: rest]
// where rest is a quoted primary text, and/or `key=value` props (value: @/path binding,
// "quoted" literal, number, bool), and/or a trailing `-> event <name>`.

type Line = { indent: number; text: string };

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

export function compileLayout(pattern: Pattern, uiState: string | null): A2UIComponent[] {
  if (uiState !== null && pattern.states.length && !pattern.states.includes(uiState)) {
    throw new Error(`Pattern ${pattern.id} declares no UI state ${uiState}`);
  }
  const lines: Line[] = pattern.layout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim() }));

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
      node.action = { event: { name: eventMatch[1] } };
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

/** Parse `events:` entries like `log_weight(kg=@/entry/kg)` into payload bindings. */
export function eventBindings(pattern: Pattern): Record<string, Record<string, string>> {
  const bindings: Record<string, Record<string, string>> = {};
  for (const entry of pattern.events) {
    const match = entry.match(/^(\w+)(?:\((.*)\))?$/);
    if (!match) throw new Error(`Unparseable event entry: ${entry}`);
    const payload: Record<string, string> = {};
    for (const pair of (match[2] ?? "").split(",").filter(Boolean)) {
      const [key, raw] = pair.split("=").map((part) => part.trim());
      if (!raw?.startsWith("@/")) throw new Error(`Event payload must bind a @/path: ${entry}`);
      payload[key] = raw.slice(1);
    }
    bindings[match[1]] = payload;
  }
  return bindings;
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
    { updateComponents: { surfaceId, components: compileLayout(pattern, uiState) } },
    { updateDataModel: { surfaceId, path: "/", value: dataModel } },
  ];
  return { messages, fallback: rewriteInterpolation(pattern.fallback), eventBindings: eventBindings(pattern) };
}
