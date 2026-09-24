import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { diagnoseChildren } from "@/lib/diagnose.functions";

export const Route = createFileRoute("/diagnose")({
  head: () => ({
    meta: [
      { title: "Diagnostic — Children" },
      { name: "description", content: "Temporary diagnostic tool." },
    ],
  }),
  component: DiagnosePage,
});

function DiagnosePage() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [studentId, setStudentId] = useState("STU-421");
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await diagnoseChildren({ data: { studentId } });
      setReport(r);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">Children Diagnostic</h1>
      <div className="flex gap-2 mb-4">
        <input
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="border px-2 py-1"
          placeholder="Student ID"
        />
        <button
          onClick={run}
          disabled={loading}
          className="border px-4 py-1 bg-blue-600 text-white rounded"
        >
          {loading ? "Running..." : "Run Diagnostic"}
        </button>
      </div>
      {err && <pre className="text-red-600 bg-red-50 p-2">{err}</pre>}
      {report && (
        <pre className="bg-gray-100 p-3 overflow-auto text-xs whitespace-pre-wrap">
          {JSON.stringify(report, null, 2)}
        </pre>
      )}
    </div>
  );
}
