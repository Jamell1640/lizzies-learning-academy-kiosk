import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Calendar as CalendarIcon,
  ShieldAlert,
  Printer,
} from "lucide-react";
import type { ManualAttendanceEntry } from "@/lib/kiosk.types";
import {
  listAttendanceByDate,
  bulkDeleteManualAttendance,
  getClassrooms,
  getMainBookWeeklyDcfReport,
} from "@/lib/kiosk.functions";
import { getLocalDate } from "@/lib/kiosk-time";
import { Button } from "@/components/ui/button";
import { KOALA_MASCOT_URL } from "@/lib/brand";
import { BrandName } from "@/components/BrandName";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { CreateAttendanceModal } from "@/components/attendance/CreateAttendanceModal";
import { EditAttendanceModal } from "@/components/attendance/EditAttendanceModal";
import { DeleteAttendanceModal } from "@/components/attendance/DeleteAttendanceModal";
import { BulkDeleteAttendanceModal } from "@/components/attendance/BulkDeleteAttendanceModal";
import { AttendanceTable } from "@/components/attendance/AttendanceTable";
import { openPrintWindow } from "@/lib/print-window";
import { buildMainBookHtml } from "@/lib/print-html";

type RangePreset = "day" | "week" | "month" | "custom";

/**
 * Compute the [start, end] date range (YYYY-MM-DD, America/Chicago) for a
 * preset. Week starts on SUNDAY (the US calendar week, matching the app's
 * en-US Intl usage elsewhere). Month is the current calendar month.
 */
function computeRange(preset: RangePreset, anchor: string): { start: string; end: string } {
  const [y, m, d] = anchor.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  if (preset === "day") return { start: anchor, end: anchor };
  if (preset === "week") {
    const day = base.getUTCDay(); // 0 = Sun
    const start = new Date(base);
    start.setUTCDate(base.getUTCDate() - day);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }
  if (preset === "month") {
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }
  return { start: anchor, end: anchor };
}

export const Route = createFileRoute("/main-book")({
  head: () => ({
    meta: [
      { title: "Main Book — Lizzie's Learning Academy" },
      {
        name: "description",
        content:
          "Front-desk daily sign-in and sign-out book for every child at Lizzie's Learning Academy.",
      },
      { property: "og:title", content: "Main Book — Lizzie's Learning Academy" },
      {
        property: "og:description",
        content:
          "Front-desk daily sign-in and sign-out book for every child at Lizzie's Learning Academy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MainBookPage,
});

function MainBookPage() {
  const today = getLocalDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [preset, setPreset] = useState<RangePreset>("day");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [classroomOptions, setClassroomOptions] = useState<string[]>([]);
  const [selectedClassrooms, setSelectedClassrooms] = useState<string[]>(["All"]);

  const [entries, setEntries] = useState<ManualAttendanceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ManualAttendanceEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManualAttendanceEntry | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<ManualAttendanceEntry[]>([]);

  // Human-friendly label for the active classroom filter.
  const classroomFilterLabel = useMemo(() => {
    if (selectedClassrooms.includes("All") || selectedClassrooms.length === 0)
      return "All Classrooms";
    return selectedClassrooms.join(", ");
  }, [selectedClassrooms]);

  // Human-friendly label for the active date range.
  const rangeFilterLabel = useMemo(() => {
    const fmt = (iso: string) => {
      const [y, m, d] = iso.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
    };
    if (startDate === endDate) return fmt(startDate);
    return `${fmt(startDate)} — ${fmt(endDate)}`;
  }, [startDate, endDate]);

  // Open an isolated print window with the fully self-contained DCF-F-2438 report HTML.
  // window.print() fires only after that document loads in the new window.
  const [isPrinting, setIsPrinting] = useState(false);
  const triggerPrint = useCallback(async () => {
    setIsPrinting(true);
    try {
      const activeClassrooms =
        selectedClassrooms.includes("All") || selectedClassrooms.length === 0
          ? []
          : selectedClassrooms;
      const report = await getMainBookWeeklyDcfReport({
        data: {
          anchorDate: startDate,
          classrooms: activeClassrooms,
        },
      });
      const html = buildMainBookHtml({ report });
      openPrintWindow(html);
    } catch (err: any) {
      console.error("[MainBook print error]", err);
      alert(err?.message || "Could not generate attendance printout.");
    } finally {
      setIsPrinting(false);
    }
  }, [startDate, selectedClassrooms]);

  // Load classroom list once for the filter dropdown.
  useEffect(() => {
    getClassrooms()
      .then((rooms) => setClassroomOptions((rooms || []).map((r) => r.name).filter(Boolean)))
      .catch(() => {});
  }, []);

  // When the anchor date or preset changes, recompute the start/end range.
  useEffect(() => {
    if (preset === "custom") return; // custom keeps manual start/end
    const r = computeRange(preset, selectedDate);
    setStartDate(r.start);
    setEndDate(r.end);
  }, [preset, selectedDate]);

  const loadEntries = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const classrooms =
        selectedClassrooms.includes("All") || selectedClassrooms.length === 0
          ? []
          : selectedClassrooms;
      const data = await listAttendanceByDate({
        data: { startDate, endDate, classrooms },
      });
      setEntries(data || []);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || "Could not load attendance records from CRM.");
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, selectedClassrooms]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const signedInCount = useMemo(
    () => entries.filter((e) => e.checkInTime && !e.checkOutTime).length,
    [entries],
  );
  const signedOutCount = useMemo(() => entries.filter((e) => e.checkOutTime).length, [entries]);

  const rangeLabel = useMemo(() => {
    if (startDate === endDate) return startDate;
    return `${startDate} → ${endDate}`;
  }, [startDate, endDate]);

  const toggleClassroom = (name: string) => {
    setSelectedClassrooms((prev) => {
      if (name === "All") return ["All"];
      const next = prev.filter((c) => c !== "All");
      if (next.includes(name)) return next.filter((c) => c !== name);
      return [...next, name];
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F6F8FA] text-[#1E293B]">
      {/* ===== On-screen app UI (hidden when printing) ===== */}
      <div className="print:hidden flex flex-col min-h-screen bg-[#F6F8FA] text-[#1E293B]">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-[#E2E8F0] px-4 py-2.5 sm:px-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white border border-[#E2E8F0] p-1 flex items-center justify-center shrink-0 shadow-xs">
                <img
                  src={KOALA_MASCOT_URL}
                  alt="Lizzie's Learning Academy"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-base sm:text-lg font-bold tracking-tight text-[#0F172A]">
                  <BrandName />
                </span>
                <span className="text-[11px] font-semibold text-[#0284C7] uppercase tracking-wider">
                  Main Book
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                asChild
                className="h-8 gap-1.5 text-xs font-medium border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]"
              >
                <Link to="/dashboard">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>
              </Button>
            </div>
          </div>
        </header>

        {/* Main Body */}
        <div className="flex flex-1 overflow-hidden">
          <DashboardSidebar lastUpdated={lastUpdated} currentRoute="main-book" />

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Page Title + Filters + Create Button */}
              <div className="flex flex-col gap-4 border-b border-[#E2E8F0] pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
                      Main Book
                    </h1>
                    <span className="text-xs font-medium text-[#64748B] bg-white border border-[#CBD5E1] px-2.5 py-1 rounded-full">
                      {entries.length} Records
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap print:hidden">
                    <Button
                      size="sm"
                      onClick={() => setShowCreateForm(true)}
                      className="h-8 gap-1.5 text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create Sign-In
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={triggerPrint}
                      disabled={isPrinting}
                      className="h-8 gap-1.5 text-xs font-semibold border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {isPrinting ? "Loading…" : "Print / Print Preview"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadEntries}
                      disabled={isLoading}
                      className="h-8 gap-1.5 text-xs font-medium border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                      <span className="hidden sm:inline">Refresh</span>
                    </Button>
                  </div>
                </div>

                {/* Filter row: preset chips + anchor date + custom range + classroom */}
                <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                  {/* Preset chips */}
                  <div className="flex items-center gap-1.5">
                    {(["day", "week", "month", "custom"] as RangePreset[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPreset(p)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                          preset === p
                            ? "bg-[#0284C7] text-white"
                            : "bg-white border border-[#CBD5E1] text-[#475569] hover:bg-[#F8FAFC]"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Anchor date (drives Day/Week/Month) */}
                  {preset !== "custom" && (
                    <div className="flex items-center gap-2 bg-white border border-[#CBD5E1] rounded-md px-3 py-1.5">
                      <CalendarIcon className="w-4 h-4 text-[#0284C7]" />
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="text-sm font-medium text-[#0F172A] bg-transparent border-none focus:outline-none cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Custom start/end */}
                  {preset === "custom" && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-md px-2.5 py-1.5">
                        <span className="text-[11px] font-semibold text-[#94A3B8] uppercase">
                          From
                        </span>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="text-sm font-medium text-[#0F172A] bg-transparent border-none focus:outline-none cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-md px-2.5 py-1.5">
                        <span className="text-[11px] font-semibold text-[#94A3B8] uppercase">
                          To
                        </span>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="text-sm font-medium text-[#0F172A] bg-transparent border-none focus:outline-none cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {/* Classroom multi-select */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-[#94A3B8] uppercase">Room</span>
                    <button
                      type="button"
                      onClick={() => toggleClassroom("All")}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                        selectedClassrooms.includes("All")
                          ? "bg-[#0284C7] text-white"
                          : "bg-white border border-[#CBD5E1] text-[#475569] hover:bg-[#F8FAFC]"
                      }`}
                    >
                      All
                    </button>
                    {classroomOptions.map((room) => (
                      <button
                        key={room}
                        type="button"
                        onClick={() => toggleClassroom(room)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                          selectedClassrooms.includes(room)
                            ? "bg-[#0284C7] text-white"
                            : "bg-white border border-[#CBD5E1] text-[#475569] hover:bg-[#F8FAFC]"
                        }`}
                      >
                        {room}
                      </button>
                    ))}
                  </div>

                  {/* Active range label */}
                  <div className="lg:ml-auto text-xs font-medium text-[#64748B]">
                    Range: <span className="text-[#0F172A] font-semibold">{rangeLabel}</span>
                  </div>
                </div>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-lg border border-[#E2E8F0] p-3 text-center">
                  <div className="text-2xl font-bold text-[#0F172A]">{entries.length}</div>
                  <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                    Total Records
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-[#DCFCE7] p-3 text-center">
                  <div className="text-2xl font-bold text-[#15803D]">{signedInCount}</div>
                  <div className="text-[11px] font-semibold text-[#15803D] uppercase tracking-wider">
                    Currently Signed In
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-[#E2E8F0] p-3 text-center">
                  <div className="text-2xl font-bold text-[#64748B]">{signedOutCount}</div>
                  <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                    Signed Out
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-600" />
                    <span>{error}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadEntries}
                    className="h-7 text-xs bg-white"
                  >
                    Retry
                  </Button>
                </div>
              )}

              {/* Records Table */}
              <AttendanceTable
                entries={entries}
                isLoading={isLoading}
                onEdit={(entry) => setEditingEntry(entry)}
                onDelete={(entry) => setDeleteTarget(entry)}
                onBulkDelete={(selected) => setBulkDeleteTargets(selected)}
              />
            </div>
          </main>
        </div>
      </div>
      {/* ===== End on-screen app UI ===== */}

      {/* Modals */}
      <CreateAttendanceModal
        open={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        selectedDate={selectedDate}
        onSaved={() => {
          setShowCreateForm(false);
          loadEntries();
        }}
      />
      <EditAttendanceModal
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        onSaved={() => {
          setEditingEntry(null);
          loadEntries();
        }}
      />
      <DeleteAttendanceModal
        entry={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          loadEntries();
        }}
      />
      {bulkDeleteTargets.length > 0 && (
        <BulkDeleteAttendanceModal
          entries={bulkDeleteTargets}
          onClose={() => setBulkDeleteTargets([])}
          onConfirm={async () => {
            const result = await bulkDeleteManualAttendance({
              data: {
                entries: bulkDeleteTargets.map((e) => ({ recordId: e.id })),
              },
            });
            if (result.failed > 0) {
              console.warn(`[bulkDeleteAttendance] ${result.failed} failed`, result.errors);
            }
            await loadEntries();
          }}
        />
      )}
    </div>
  );
}
