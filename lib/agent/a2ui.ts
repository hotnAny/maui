// A2UI v0.9-shaped wire types. Kept minimal: only what the maui runtime emits and the
// client renderer consumes. Prop names should be re-checked against the A2UI component
// gallery before targeting real A2UI clients (see .agent/compilation-rules.md).

export type A2UIBinding = { path: string };

export type A2UIComponent = {
  id: string;
  component: string;
  child?: string;
  children?: string[];
  action?: { event: { name: string } };
} & Record<string, unknown>;

export type A2UIMessage =
  | { createSurface: { surfaceId: string; catalogId: string } }
  | { updateComponents: { surfaceId: string; components: A2UIComponent[] } }
  | { updateDataModel: { surfaceId: string; path: string; value: unknown } };

export function isBinding(value: unknown): value is A2UIBinding {
  return typeof value === "object" && value !== null && "path" in value &&
    typeof (value as A2UIBinding).path === "string";
}

/** Resolve a `/slash/path` against a nested data model object. */
export function resolvePath(model: Record<string, unknown>, path: string): unknown {
  return path.split("/").filter(Boolean).reduce<unknown>(
    (node, key) => (typeof node === "object" && node !== null ? (node as Record<string, unknown>)[key] : undefined),
    model,
  );
}

/** Set a `/slash/path` in a data model object, creating intermediate objects. */
export function setPath(model: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split("/").filter(Boolean);
  let node = model;
  for (const key of keys.slice(0, -1)) {
    if (typeof node[key] !== "object" || node[key] === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
}

/** Interpolate `{/slash/path}` placeholders in a string against the data model. */
export function interpolate(text: string, model: Record<string, unknown>) {
  return text.replace(/\{(\/[^}]+)\}/g, (_, path: string) => {
    const value = resolvePath(model, path);
    return value === undefined || value === null ? "—" : String(value);
  });
}
