import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  Calendar as CalendarIcon,
  RefreshCw,
  Clock,
  ShieldCheck,
} from "lucide-react";
import type { TeacherTimecardEntry, Teacher, Classroom } from "@/lib/kiosk.types";
import {
  listTeacherTimecards,
  createTeacherTimecard,
  editTeacherTimecard,
  deleteTeacherTimecard,
  listTeachers,
  getClassrooms,
} from "@/lib/kiosk.functions";
import { getLocalDate, formatCrmTime, getLocalTime24 } from "@/lib/kiosk-time";
import { Button } from "@/components/ui/button";
import { KOALA_MASCOT_URL } from "@/lib/brand";
import { BrandName } from "@/components/BrandName";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { TimecardTable } from "@/components/timecard/TimecardTable";
import { CreateClockInModal } from "@/components/timecard/CreateClockInModal";
import { EditTimecardModal } from "@/components/timecard/EditTimecardModal";
import { DeleteTimecardModal } from "@/components/timecard/DeleteTimecardModal";
import { BulkDeleteTimecardModal } from "@/components/timecard/BulkDeleteTimecardModal";
import { bulkDeleteTeacherTimecards } from "@/lib/kiosk.functions";

export const Route = createFileRoute("/timecard")({
  head: () => ({
    meta: [
      { title: "Staff Timecard — Lizzie's Learning Academy" },
      {
        name: "description",
        content:
          "Admin tool to manage teacher timecards, manual clock-ins, clock-outs, and shift hours.",
      },
      { property: "og:title", content: "Staff Timecard — Lizzie's Learning Academy" },
      {
        property: "og:description",
        content:
          "Admin tool to manage teacher timecards, manual clock-ins, clock-outs, and shift hours.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffTimecardPage,
});

function StaffTimecardPage() {
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDate());
  const [viewTab, setViewTab] = useState<"daily" | "monthly">("daily");
  const [entries, setEntries] = useState<TeacherTimecardEntry[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TeacherTimecardEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TeacherTimecardEntry | null>(null);
  const [bulkDeletingEntries, setBulkDeletingEntries] = useState<TeacherTimecardEntry[]>([]);

  // Load teachers and classrooms once
  useEffect(() => {
    let cancelled = false;
    const fetchMetadata = async () => {
      try {
        const [tList, cList] = await Promise.all([listTeachers(), getClassrooms()]);
        if (!cancelled) {
          setTeachers(tList || []);
          setClassrooms(cList || []);
        }
      } catch (err: any) {
        console.warn("Could not load teachers or classrooms:", err);
      }
    };
    fetchMetadata();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load timecards for selected date
  const loadTimecards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTeacherTimecards({ data: { date: selectedDate } });
      setEntries(data || []);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || "Failed to load staff timecards");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadTimecards();
  }, [loadTimecards]);

  // Date navigation handlers
  const handlePrevDay = () => {
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handleNextDay = () => {
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  // Human-readable date formatted like Procare screenshot: "Sep 21, 2026"
  const formattedDateDisplay = useMemo(() => {
    try {
      const parts = selectedDate.split("-");
      if (parts.length === 3) {
        const d = new Date(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10),
        );
        return d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    } catch {}
    return selectedDate;
  }, [selectedDate]);

  // Export to CSV
  const handleExport = () => {
    if (entries.length === 0) return;
    const header = [
      "Staff Name",
      "Clock-In Room",
      "Clock-In Time",
      "Clock-Out Time",
      "Clock-In Hours",
      "Date",
    ];
    const rows = entries.map((e) => [
      `"${e.teacherName.replace(/"/g, '""')}"`,
      `"${e.classroomName.replace(/"/g, '""')}"`,
      `"${formatCrmTime(e.clockInTime) || ""}"`,
      `"${formatCrmTime(e.clockOutTime) || (e.isOpen ? "In Progress" : "")}"`,
      `"${e.hoursFormatted || ""}"`,
      `"${e.date}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Staff_Timecard_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handlers for modal actions
  const handleCreate = async (params: {
    teacherName: string;
    classroomName: string;
    date: string;
    clockInTime?: string;
    clockOutTime?: string;
  }) => {
    try {
      const result = await createTeacherTimecard({ data: params });
      if (!result.ok && result.duplicateOpenShift) {
        const dup = result.duplicateOpenShift;
        const inTime = formatCrmTime(dup.clockInTime) || "earlier";
        throw new Error(
          `${params.teacherName} is already clocked in to ${dup.classroomName} since ${inTime}. Close that shift first before clocking in elsewhere.`,
        );
      }
      await loadTimecards();
    } catch (err: any) {
      // Re-throw so the modal can display the error inline.
      throw err;
    }
  };

  const handleEdit = async (params: {
    recordId: string;
    classroomName?: string;
    date?: string;
    clockInTime?: string;
    clockOutTime?: string;
  }) => {
    await editTeacherTimecard({ data: params });
    await loadTimecards();
  };

  const handleDelete = async () => {
    if (!deletingEntry) return;
    await deleteTeacherTimecard({ data: { recordId: deletingEntry.id } });
    await loadTimecards();
  };

  const handleQuickClockOut = async (entry: TeacherTimecardEntry) => {
    const now = getLocalTime24();
    await editTeacherTimecard({
      data: { recordId: entry.id, clockOutTime: now },
    });
    await loadTimecards();
  };

  const handleBulkDelete = async () => {
    const ids = bulkDeletingEntries.map((e) => e.id);
    const result = await bulkDeleteTeacherTimecards({ data: { recordIds: ids } });
    if (result.failed > 0) {
      console.warn(`[bulkDelete] ${result.failed} failed`, result.errors);
    }
    await loadTimecards();
  };

  return (
    <div className="flex flex-col h-screen bg-[#F6F8FA] text-[#1E293B] overflow-hidden">
      {/* Top Header */}
      <header className="shrink-0 bg-white border-b border-[#E2E8F0] px-4 py-2.5 sm:px-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
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
              <BrandName className="text-base sm:text-lg tracking-tight" />
              <div className="flex items-center gap-1.5 -mt-0.5">
                <span className="text-[11px] font-semibold text-[#0284C7] uppercase tracking-wider">
                  Admin Portal
                </span>
                <span className="text-[10px] text-[#94A3B8]">•</span>
                <span className="text-[11px] text-[#64748B] font-medium">Staff Management</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadTimecards}
              disabled={loading}
              className="text-xs font-semibold text-[#475569] gap-1.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#0284C7]" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Link to="/">
              <Button
                variant="outline"
                size="sm"
                className="text-xs font-semibold text-[#0284C7] border-[#BAE6FD] bg-[#F0F9FF] hover:bg-[#E0F2FE]"
              >
                Kiosk Tablet
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Body: Procare Layout */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        <DashboardSidebar lastUpdated={lastUpdated} currentRoute="timecard" />

        <main className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-6 pb-24">
            {/* Page Title & Daily/Monthly Tabs matching Procare screenshot */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Staff Timecard</h1>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Track shift hours, manage teacher clock-in/out records, or manually close open
                  shifts
                </p>
              </div>

              {/* Action Buttons top-right */}
              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={entries.length === 0}
                  className="gap-2 text-xs font-semibold border-[#CBD5E1] text-[#334155] hover:bg-[#F8FAFC]"
                >
                  <Download className="w-4 h-4 text-[#64748B]" />
                  <span>Export</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => setShowCreateModal(true)}
                  className="gap-2 text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Clock-In</span>
                </Button>
              </div>
            </div>

            {/* Daily / Monthly tab switcher */}
            <div className="border-b border-[#E2E8F0] flex items-center gap-6 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setViewTab("daily")}
                className={`pb-2.5 transition-colors relative ${
                  viewTab === "daily"
                    ? "text-[#0284C7] border-b-2 border-[#0284C7]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setViewTab("monthly")}
                className={`pb-2.5 transition-colors relative ${
                  viewTab === "monthly"
                    ? "text-[#0284C7] border-b-2 border-[#0284C7]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Monthly
              </button>
            </div>

            {/* Date Navigator + Results Count Card */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                {/* Back / Date / Forward navigator */}
                <div className="inline-flex items-center border border-[#CBD5E1] rounded-lg bg-white shadow-2xs overflow-hidden">
                  <button
                    type="button"
                    onClick={handlePrevDay}
                    className="p-2 hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A] border-r border-[#CBD5E1] transition-colors"
                    aria-label="Previous Day"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="relative flex items-center gap-2 px-3 py-1.5 cursor-pointer">
                    <span className="text-sm font-semibold text-[#0F172A] min-w-[100px] text-center">
                      {formattedDateDisplay}
                    </span>
                    <CalendarIcon className="w-4 h-4 text-[#64748B] pointer-events-none" />
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleNextDay}
                    className="p-2 hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A] border-l border-[#CBD5E1] transition-colors"
                    aria-label="Next Day"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
                  SHOWING {entries.length} RESULTS
                </div>
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Main Timecard Table */}
            <TimecardTable
              entries={entries}
              loading={loading}
              onEdit={(entry) => setEditingEntry(entry)}
              onDelete={(entry) => setDeletingEntry(entry)}
              onQuickClockOut={handleQuickClockOut}
              onBulkDelete={(selected) => setBulkDeletingEntries(selected)}
            />
          </div>
        </main>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateClockInModal
          teachers={teachers}
          classrooms={classrooms}
          initialDate={selectedDate}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
        />
      )}

      {editingEntry && (
        <EditTimecardModal
          entry={editingEntry}
          classrooms={classrooms}
          onClose={() => setEditingEntry(null)}
          onSubmit={handleEdit}
        />
      )}

      {deletingEntry && (
        <DeleteTimecardModal
          entry={deletingEntry}
          onClose={() => setDeletingEntry(null)}
          onConfirm={handleDelete}
        />
      )}

      {bulkDeletingEntries.length > 0 && (
        <BulkDeleteTimecardModal
          entries={bulkDeletingEntries}
          onClose={() => setBulkDeletingEntries([])}
          onConfirm={handleBulkDelete}
        />
      )}
    </div>
  );
}
