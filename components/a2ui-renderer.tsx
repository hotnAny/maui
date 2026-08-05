"use client";

import { KeyboardEvent, useMemo, useState } from "react";
import type { A2UIComponent, A2UIMessage } from "@/lib/agent/a2ui";
import { interpolate, isBinding, resolvePath, setPath } from "@/lib/agent/a2ui";

// Client-side renderer for the weight-tracker/v1 A2UI catalog: Card, Column, Row,
// Text, LineChart, NumberField, Button. Consumes A2UI messages (flat, id-referenced
// component list + data model), sends user events back through onEvent — the back
// channel that re-enters the FSM as a `ui:` trigger.

type Props = {
  messages: A2UIMessage[];
  eventBindings: Record<string, Record<string, string>>;
  onEvent: (name: string, payload: Record<string, unknown>) => void;
  disabled?: boolean;
};

type Point = { date: string; kg: number };

function LineChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 320;
  const height = 96;
  const pad = { top: 14, right: 44, bottom: 18, left: 10 };

  if (points.length === 0) {
    return <p className="a2ui-empty meta">No entries in the past 7 days yet.</p>;
  }

  const kgs = points.map((point) => point.kg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const span = Math.max(max - min, 0.5); // avoid a flat line filling the frame
  const x = (index: number) =>
    points.length === 1
      ? width / 2
      : pad.left + (index * (width - pad.left - pad.right)) / (points.length - 1);
  const y = (kg: number) =>
    pad.top + (1 - (kg - min) / span) * (height - pad.top - pad.bottom);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.kg)}`).join(" ");
  const last = points.length - 1;

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(x(index) - mouseX) < Math.abs(x(nearest) - mouseX)) nearest = index;
    }
    setHover(nearest);
  }

  return (
    <svg
      className="a2ui-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Weight trend, ${points.length} entries from ${points[0].date} to ${points[last].date}`}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <line className="a2ui-chart-baseline" x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} />
      {hover !== null ? (
        <line className="a2ui-chart-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top - 6} y2={height - pad.bottom} />
      ) : null}
      <path className="a2ui-chart-line" d={path} />
      {points.map((point, index) => (
        <circle
          className="a2ui-chart-dot"
          key={point.date}
          cx={x(index)}
          cy={y(point.kg)}
          r={index === hover ? 5 : 4}
        />
      ))}
      <text className="a2ui-chart-label" x={x(last) + 8} y={y(points[last].kg) + 3}>
        {points[last].kg}
      </text>
      {hover !== null && hover !== last ? (
        <text
          className="a2ui-chart-label"
          x={x(hover)}
          y={y(points[hover].kg) - 9}
          textAnchor="middle"
        >{`${points[hover].date.slice(5)} · ${points[hover].kg}`}</text>
      ) : null}
    </svg>
  );
}

export function A2UIRenderer({ messages, eventBindings, onEvent, disabled }: Props) {
  const { components, initialModel } = useMemo(() => {
    const list: A2UIComponent[] = [];
    let model: Record<string, unknown> = {};
    for (const message of messages) {
      if ("updateComponents" in message) list.push(...message.updateComponents.components);
      if ("updateDataModel" in message) {
        const { path, value } = message.updateDataModel;
        if (path === "/") model = structuredClone(value) as Record<string, unknown>;
        else setPath(model, path, structuredClone(value));
      }
    }
    return { components: list, initialModel: model };
  }, [messages]);

  const [model, setModel] = useState(initialModel);
  const [prevInitial, setPrevInitial] = useState(initialModel);
  if (prevInitial !== initialModel) {
    // New surface arrived: reset the local (two-way-bound) model during render.
    setPrevInitial(initialModel);
    setModel(initialModel);
  }

  const byId = useMemo(
    () => new Map(components.map((component) => [component.id, component])),
    [components],
  );
  const referenced = useMemo(() => {
    const ids = new Set<string>();
    for (const component of components) {
      if (component.child) ids.add(component.child);
      for (const id of component.children ?? []) ids.add(id);
    }
    return ids;
  }, [components]);

  function emit(source: A2UIComponent) {
    if (!source.action) return;
    const { name, bindings } = source.action.event;
    const payload: Record<string, unknown> = {};
    // A control expanded from a repeat carries row-scoped bindings; otherwise the
    // surface-level map applies.
    for (const [key, path] of Object.entries(bindings ?? eventBindings[name] ?? {})) {
      payload[key] = resolvePath(model, path);
    }
    onEvent(name, payload);
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const button = components.find((component) => component.action);
    if (button) {
      event.preventDefault();
      emit(button);
    }
  }

  function prop(component: A2UIComponent, key: string): unknown {
    const value = component[key];
    return isBinding(value) ? resolvePath(model, value.path) : value;
  }

  function render(component: A2UIComponent): React.ReactNode {
    const childIds = component.children ?? (component.child ? [component.child] : []);
    const children = childIds.map((id) => {
      const child = byId.get(id);
      return child ? <span key={id} style={{ display: "contents" }}>{render(child)}</span> : null;
    });

    switch (component.component) {
      case "Card":
        return <section className="rich-card a2ui-card">{children}</section>;
      case "Column":
        return <div className="a2ui-column">{children}</div>;
      case "Row":
        return <div className="a2ui-row">{children}</div>;
      case "Text":
        return <p className="a2ui-text">{interpolate(String(component.text ?? ""), model)}</p>;
      case "LineChart": {
        const points = prop(component, "points");
        return <LineChart points={Array.isArray(points) ? (points as Point[]) : []} />;
      }
      case "NumberField": {
        const value = prop(component, "value");
        const binding = component.value;
        return (
          <label className="a2ui-field">
            <span className="meta">{String(component.label ?? "")}</span>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={value === null || value === undefined ? "" : String(value)}
              disabled={disabled}
              onKeyDown={onFieldKeyDown}
              onChange={(event) => {
                if (!isBinding(binding)) return;
                const next = structuredClone(model);
                setPath(next, binding.path, event.target.value === "" ? null : Number(event.target.value));
                setModel(next);
              }}
            />
          </label>
        );
      }
      case "Button":
        return (
          <button
            type="button"
            className="a2ui-button"
            disabled={disabled}
            onClick={() => emit(component)}
          >
            {interpolate(String(component.text ?? ""), model)}
          </button>
        );
      default:
        return <p className="a2ui-empty meta">Unsupported component: {component.component}</p>;
    }
  }

  const roots = components.filter((component) => !referenced.has(component.id));
  return <>{roots.map((component) => <div key={component.id}>{render(component)}</div>)}</>;
}
