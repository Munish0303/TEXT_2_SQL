"use client";

import { useState } from "react";
import { SCHEMA_TABLES } from "@/lib/schema";

type Correction = { sql: string; error: string };
type QueryResult = {
  sql: string;
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  attempts: number;
  corrections: Correction[];
};

type TableData = {
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};

const EXAMPLES = [
  "What are the top 10 product categories by revenue?",
  "How many orders were placed in each state?",
  "What is the average review score by payment type?",
  "Which sellers have the most orders?",
  "Show monthly order counts in 2018",
  "Average delivery time in days by customer state",
];

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Shared tabular renderer used for both query results and the table browser.
function DataTable({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return <div className="meta">No rows.</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th className="rownum">#</th>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="rownum">{i + 1}</td>
              {columns.map((c) => {
                const text = formatCell(row[c]);
                return (
                  <td key={c} title={text}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSql, setErrorSql] = useState<string | null>(null);

  // Schema / data browser
  const [showSchema, setShowSchema] = useState(false);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  async function run(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setErrorSql(null);
    setResult(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setErrorSql(data.sql || null);
      } else {
        setResult(data as QueryResult);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTable(name: string) {
    setActiveTable(name);
    setTableLoading(true);
    setTableError(null);
    setTableData(null);
    try {
      const res = await fetch(`/api/table?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!res.ok) setTableError(data.error || "Failed to load table.");
      else setTableData(data as TableData);
    } catch (e) {
      setTableError((e as Error).message);
    } finally {
      setTableLoading(false);
    }
  }

  function toggleSchema() {
    const next = !showSchema;
    setShowSchema(next);
    if (next && !activeTable) loadTable(SCHEMA_TABLES[0].name);
  }

  const activeDef = SCHEMA_TABLES.find((t) => t.name === activeTable);

  return (
    <main className="container">
      <div className="header">
        <h1>
          Olist <span className="brand">Text-to-SQL</span>
        </h1>
        <p>Ask the Brazilian e-commerce dataset a question in plain English. It writes the SQL and runs it.</p>
      </div>

      <div className="card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(question);
          }}
        >
          <input
            type="text"
            placeholder="e.g. Top 10 product categories by revenue"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
          />
          <button type="submit" disabled={loading || !question.trim()}>
            {loading ? <span className="spinner" /> : "Ask"}
          </button>
        </form>

        <div className="examples">
          {EXAMPLES.map((ex) => (
            <span
              key={ex}
              className="chip"
              onClick={() => {
                setQuestion(ex);
                run(ex);
              }}
            >
              {ex}
            </span>
          ))}
        </div>

        <button type="button" className="link-btn" onClick={toggleSchema}>
          {showSchema ? "▾ Hide schema & data browser" : "▸ Browse schema & data (100 rows/table)"}
        </button>
      </div>

      {showSchema && (
        <div className="card">
          <div className="label">Database — 8 tables · click one to inspect</div>
          <div className="table-tabs">
            {SCHEMA_TABLES.map((t) => (
              <button
                key={t.name}
                className={`table-tab${activeTable === t.name ? " active" : ""}`}
                onClick={() => loadTable(t.name)}
              >
                {t.name}
              </button>
            ))}
          </div>

          {activeDef && (
            <>
              <div className="subhead">
                <code>{activeDef.name}</code> — {activeDef.note}
              </div>

              <div className="label" style={{ marginTop: 14 }}>Columns</div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Type</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDef.columns.map((c) => (
                      <tr key={c.name}>
                        <td><code>{c.name}</code></td>
                        <td className="type-cell">{c.type}</td>
                        <td>{c.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="label" style={{ marginTop: 18 }}>
                Data {tableData ? `— first ${tableData.rowCount} rows` : ""}
              </div>
              {tableLoading ? (
                <div className="meta"><span className="spinner dark" /> Loading rows…</div>
              ) : tableError ? (
                <div className="error">{tableError}</div>
              ) : tableData ? (
                <DataTable columns={tableData.columns} rows={tableData.rows} />
              ) : null}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="card">
          <div className="error">{error}</div>
          {errorSql && (
            <>
              <div className="label" style={{ marginTop: 14 }}>Last generated SQL</div>
              <pre className="sql">{errorSql}</pre>
            </>
          )}
        </div>
      )}

      {result && (
        <div className="card">
          {result.attempts > 1 && (
            <div className="badge">
              ✓ Self-corrected — the agent fixed its own SQL after {result.attempts - 1}{" "}
              failed {result.attempts - 1 === 1 ? "attempt" : "attempts"}.
            </div>
          )}

          <div className="label">Generated SQL</div>
          <pre className="sql">{result.sql}</pre>

          <div className="label" style={{ marginTop: 18 }}>
            Result — {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
          </div>
          <DataTable columns={result.columns} rows={result.rows} />
        </div>
      )}

      <div className="footer">
        Built with Next.js · Groq (Llama 3.3) · Supabase Postgres. Self-correcting · read-only · SELECT only.
      </div>
    </main>
  );
}
