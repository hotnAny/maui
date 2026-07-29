import type { ComponentBlock } from "@/lib/domain";
import { componentBlockSchema } from "@/lib/schemas";

function StatCard({ props }: { props: Record<string, unknown> }) {
  return (
    <article className="rich-card stat-card">
      <span className="meta">{String(props.label ?? "Metric")}</span>
      <strong>{String(props.value ?? "—")}</strong>
      {props.detail ? <small>{String(props.detail)}</small> : null}
    </article>
  );
}

function NoteCard({ props }: { props: Record<string, unknown> }) {
  return (
    <article className="rich-card note-card">
      <strong>{String(props.title ?? "Note")}</strong>
      <p>{String(props.body ?? "")}</p>
    </article>
  );
}

function DataTable({ props }: { props: Record<string, unknown> }) {
  const columns = Array.isArray(props.columns) ? props.columns.map(String) : [];
  const rows = Array.isArray(props.rows) ? props.rows.filter(Array.isArray) : [];
  if (!columns.length) return <Fallback text="This table has no columns." />;
  return (
    <div className="table-wrap rich-card">
      <table>
        <thead><tr>{columns.map((column) => <th className="meta" key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => (
          <tr key={rowIndex}>{columns.map((_, index) => <td key={index}>{String(row[index] ?? "")}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Fallback({ text }: { text: string }) {
  return <div className="rich-card fallback">{text}</div>;
}

export function RichRenderer({ block }: { block: ComponentBlock }) {
  const parsed = componentBlockSchema.safeParse(block);
  if (!parsed.success) return <Fallback text={block.fallback ?? "This content could not be displayed."} />;

  switch (parsed.data.component) {
    case "stat": return <StatCard props={parsed.data.props} />;
    case "note": return <NoteCard props={parsed.data.props} />;
    case "table": return <DataTable props={parsed.data.props} />;
  }
}
