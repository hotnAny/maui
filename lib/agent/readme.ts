import type { Manifest, Transition } from "./manifest";
import { parsePatternCall, transitionsOf } from "./manifest";

// The documentation artifact (see .agent/compilation-rules.md §3): the manifest rendered
// for people, with the FSM drawn as Mermaid. Regenerated wholesale on every compile.

export const GENERATED_HEADER = "<!-- generated from manifest.yaml; do not edit -->";

/** Mermaid labels are single-line; `;` and `"` would end the statement or the label. */
function escapeLabel(text: string) {
  return text.replace(/\s*\n\s*/g, " ").replaceAll(";", "#59;").replaceAll('"', "#quot;");
}

function signature(effect: { name: string; args: string[] }) {
  return effect.args.length ? `${effect.name}(${effect.args.join(", ")})` : effect.name;
}

/**
 * One icon per notation kind, so a reader can tell the four things apart at a glance
 * without decoding position. The legend under the diagram spells them out.
 */
const ICON = {
  state: "📍",
  ui: "🖥️",
  chat: "👨🏻‍💻",
  agent: "🤔",
  tool: "🧰",
} as const;

/** The user drives `chat`/`ui`; the agent's own verdict drives `agent`. */
const channelIcon = (channel: string) => (channel === "agent" ? ICON.agent : ICON.chat);

export const DIAGRAM_LEGEND =
  `${ICON.state} state · ${ICON.ui} UI pattern[state] · ${ICON.chat} user input · ` +
  `${ICON.agent} agent verdict · ${ICON.tool} agent tool use (absent = pure transition)`;

// Styling follows the "Mist" palette of the beautiful-mermaid skill
// (~/dev/agentic-minions/minions/beautiful-mermaid): light desaturated fills, dark neutral
// text, 1.5px strokes, explicit direction and font. `fontFamily` is one plain family name
// on purpose: mermaid's directive sanitizer blanks any value containing a comma or a
// hyphen (so no font stack and no `sans-serif` keyword), and a quoted family drops the
// whole themeVariables block. Helvetica substitutes to Arial on Windows and to Liberation
// Sans on Linux.
const MERMAID_THEME = `%%{init: {'theme': 'base', 'themeVariables': {
  'primaryColor':       '#dde2f2',
  'primaryTextColor':   '#374151',
  'primaryBorderColor': '#7b86bb',
  'lineColor':          '#b0b7c3',
  'background':         '#fafafa',
  'fontSize':           '14px',
  'fontFamily':         'Helvetica'
}}}%%`;

const MERMAID_CLASSES = [
  "    classDef primary fill:#dde2f2,stroke:#7b86bb,color:#374151,stroke-width:1.5px",
  "    classDef success fill:#d0eadb,stroke:#5a9e7a,color:#374151,stroke-width:1.5px",
  "    classDef neutral fill:#f1f3f5,stroke:#b0b7c3,color:#6b7280,stroke-width:1.5px",
];

/** R7 — one node per state, one edge per transition *channel*. */
export function mermaidOf(manifest: Manifest): string {
  const { initial, states } = manifest.interaction.fsm;
  const lines = [MERMAID_THEME, "stateDiagram-v2", "    direction LR", ...MERMAID_CLASSES, ""];

  for (const [id, state] of Object.entries(states)) {
    const label = `${ICON.state} ${id} — ${state.desc}` + (state.ui ? `<br/>${ICON.ui} ${state.ui}` : "");
    lines.push(`    state "${escapeLabel(label)}" as ${id}`);
  }
  lines.push("");
  lines.push(`    [*] --> ${initial}`);
  for (const transition of transitionsOf(manifest)) {
    // The user's half reads as prose (`desc:`, falling back to the canonical name); the
    // agent's half stays canonical. Both are always shown, one per line — and no 🧰 is
    // what a pure transition looks like.
    // the default verdict is marked: it is the branch taken when the agent cannot decide
    const input =
      `${channelIcon(transition.channel)} ${transition.channel}: ${transition.desc ?? signature(transition)}` +
      (transition.default ? " (default)" : "");
    const tool = transition.effects.map(signature).join(", ");
    const label = tool ? `${input}<br/>${ICON.tool} ${tool}` : input;
    lines.push(`    ${transition.from} --> ${transition.to}: ${escapeLabel(label)}`);
  }
  for (const [id, state] of Object.entries(states)) {
    if (state.end) lines.push(`    ${id} --> [*]`);
  }

  // entry point, terminals, everything else — the three roles the machine actually has
  const role = (id: string) => (id === initial ? "primary" : states[id].end ? "success" : "neutral");
  lines.push("");
  for (const className of ["primary", "success", "neutral"]) {
    const members = Object.keys(states).filter((id) => role(id) === className);
    if (members.length) lines.push(`    class ${members.join(",")} ${className}`);
  }
  return lines.join("\n");
}

function shape(fields: Record<string, string>) {
  return Object.entries(fields).map(([key, type]) => `${key}: ${type}`).join(", ");
}

function table(headers: string[], rows: string[][]) {
  // A `|` in manifest prose (`number | null`) would end the cell — GFM wants it escaped
  // even inside a code span.
  const cells = (row: string[]) => row.map((cell) => cell.replaceAll("|", "\\|")).join(" | ");
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${cells(row)} |`),
  ].join("\n");
}

/** States whose outgoing edges `do:` this tool — the R2 allowlist, computed. */
function statesExposing(transitions: Transition[], toolName: string) {
  const states = transitions
    .filter((transition) => transition.effects.some((effect) => effect.name === toolName))
    .map((transition) => transition.from);
  return [...new Set(states)].sort();
}

/** R6 — the generated README for one agent manifest. */
export function renderReadme(manifest: Manifest): string {
  const { agent, tools, data, genui } = manifest;
  const { states } = manifest.interaction.fsm;
  const transitions = transitionsOf(manifest);
  const endStates = Object.entries(states).filter(([, state]) => state.end).map(([id]) => id);

  const sections = [
    GENERATED_HEADER,
    `# ${agent.id}\n\n${agent.purpose}\n\nInvoke with \`${agent.invocation}\`.`,
    [
      "## Interaction model",
      "",
      "```mermaid",
      mermaidOf(manifest),
      "```",
      "",
      DIAGRAM_LEGEND,
      "",
      table(
        ["state", "does", "UI pattern[state]", "end"],
        Object.entries(states).map(([id, state]) => [
          `\`${id}\``,
          state.desc,
          state.ui ? `\`${state.ui}\`` : "—",
          state.end ? "yes" : "",
        ]),
      ),
      "",
      table(
        ["from", "fired by", "agent tool use", "to"],
        transitions.map((transition) => [
          `\`${transition.from}\``,
          `${transition.channel}: \`${signature(transition)}\`${transition.desc ? ` — ${transition.desc}` : ""}`,
          transition.effects.length ? transition.effects.map((effect) => `\`${signature(effect)}\``).join(", ") : "— (pure)",
          `\`${transition.to}\``,
        ]),
      ),
      "",
      endStates.length
        ? `Reaching ${endStates.map((id) => `\`${id}\``).join(", ")} ends the machine for this ` +
          "invocation. The surface persists — it stays stacked above the prompt textbox and chat " +
          `stays live; a later chat message starts a new run at \`${manifest.interaction.fsm.initial}\`.`
        : "No end state: the machine runs until the invocation is abandoned.",
    ].join("\n"),
    [
      "## Tools",
      "",
      table(
        ["tool", "does", "input", "output", "callable from"],
        tools.map((tool) => [
          `\`${tool.name}\``,
          tool.desc,
          `\`${shape(tool.input)}\``,
          `\`${shape(tool.output)}\``,
          statesExposing(transitions, tool.name).map((id) => `\`${id}\``).join(", ") || "— (unreachable)",
        ]),
      ),
    ].join("\n"),
    [
      "## Data model",
      "",
      table(
        ["path", "shape", "bound by"],
        Object.entries(data).map(([path, desc]) => [
          `\`${path}\``,
          desc,
          genui.patterns
            .filter((pattern) => pattern.binds.includes(path))
            .map((pattern) => `\`${pattern.id}\``)
            .join(", ") || "—",
        ]),
      ),
    ].join("\n"),
    [
      `## UI patterns\n\nRendered through the \`${genui.catalog}\` A2UI catalog.`,
      ...genui.patterns.map((pattern) => {
        const usedBy = Object.entries(states)
          .filter(([, state]) => state.ui && parsePatternCall(state.ui).patternId === pattern.id)
          .map(([id, state]) => `\`${id}\` (\`${state.ui}\`)`);
        return [
          `### \`${pattern.id}\``,
          "",
          pattern.desc,
          "",
          `- UI states: ${pattern.states.map((state) => `\`${state}\``).join(", ") || "one rendering, unnamed"}`,
          `- used by: ${usedBy.join(", ") || "— (unused)"}`,
          `- emits: ${pattern.events.map((event) => `\`${event}\``).join(", ") || "no events"}`,
          `- fallback: ${pattern.fallback}`,
          "",
          "```",
          pattern.layout.trimEnd(),
          "```",
        ].join("\n");
      }),
    ].join("\n\n"),
  ];
  return `${sections.join("\n\n")}\n`;
}
