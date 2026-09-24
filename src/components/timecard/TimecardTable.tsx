import { useState } from "react";
import { MoreHorizontal, Edit, Trash2, User, Clock, CheckCircle2, LogOut } from "lucide-react";
import { formatCrmTime } from "@/lib/kiosk-time";
import type { TeacherTimecardEntry } from "@/lib/kiosk.types";

interface Props {
  entries: TeacherTimecardEntry[];
  loading: boolean;
  onEdit: (entry: TeacherTimecardEntry) => void;
  onDelete: (entry: TeacherTimecardEntry) => void;
  onQuickClockOut?: (entry: TeacherTimecardEntry) => void;
  onBulkDelete?: (entries: TeacherTimecardEntry[]) => void;
}

export function TimecardTable({
  entries,
  loading,
  onEdit,
  onDelete,
  onQuickClockOut,
  onBulkDelete,
}: Props) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map((e) => e.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedEntries = entries.filter((e) => selectedIds.has(e.id));

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center text-[#64748B]">
        <div className="inline-block w-6 h-6 border-2 border-[#0284C7] border-t-transparent rounded-full animate-spin mb-3" />
        <div className="text-sm font-medium">Loading staff timecards...</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center text-[#64748B]">
        <Clock className="w-10 h-10 mx-auto text-[#CBD5E1] mb-3" />
        <div className="text-base font-bold text-[#0F172A]">No timecard records for this day</div>
        <p className="text-xs text-[#94A3B8] mt-1 max-w-sm mx-auto">
          Staff have not clocked in or no shift entries were logged for this date. Click
          &quot;Create Clock-In&quot; above to log an entry.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {selectedEntries.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-[#0F172A] text-white rounded-xl px-4 py-2.5 shadow-md animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-white/15 text-xs font-bold">
              {selectedEntries.length}
            </span>
            <span className="text-sm font-semibold">
              {selectedEntries.length === 1 ? "entry" : "entries"} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              Clear
            </button>
            {onBulkDelete && (
              <button
                type="button"
                onClick={() => onBulkDelete(selectedEntries)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-2xs overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                <th className="py-3 px-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-[#CBD5E1] text-[#0284C7] accent-[#0284C7] cursor-pointer focus:ring-[#0284C7]"
                    aria-label="Select all"
                  />
                </th>
                <th className="py-3 px-5">Staff Name ↑</th>
                <th className="py-3 px-5">Clock-In Room</th>
                <th className="py-3 px-5 text-center">Clock-In Time</th>
                <th className="py-3 px-5 text-center">Clock-Out Time</th>
                <th className="py-3 px-5 text-right">Clock-In Hours</th>
                <th className="py-3 px-4 text-center w-14">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {entries.map((entry) => {
                const inStr = formatCrmTime(entry.clockInTime);
                const outStr = formatCrmTime(entry.clockOutTime);
                const isMenuOpen = openMenuId === entry.id;
                const isLastRow = entries.indexOf(entry) >= entries.length - 2;
                const isSelected = selectedIds.has(entry.id);

                return (
                  <tr
                    key={entry.id}
                    className={`hover:bg-[#F8FAFC] transition-colors group ${
                      isSelected ? "bg-[#F0F9FF]" : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(entry.id)}
                        className="w-4 h-4 rounded border-[#CBD5E1] text-[#0284C7] accent-[#0284C7] cursor-pointer focus:ring-[#0284C7]"
                        aria-label={`Select ${entry.teacherName}`}
                      />
                    </td>

                    {/* Staff Name with avatar */}
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#E2E8F0] text-[#475569] flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-[#64748B]" />
                        </div>
                        <div>
                          <div className="font-semibold text-[#0284C7] hover:underline cursor-pointer">
                            {entry.teacherName}
                          </div>
                          {entry.isOpen && (
                            <div className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Clocked In (Active)
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Room */}
                    <td className="py-3 px-5 font-medium text-[#334155]">
                      {entry.classroomName || "—"}
                    </td>

                    {/* Clock-In Time */}
                    <td className="py-3 px-5 text-center font-medium text-[#0F172A]">
                      {inStr ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F1F5F9] text-xs font-semibold">
                          {inStr}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>

                    {/* Clock-Out Time */}
                    <td className="py-3 px-5 text-center font-medium text-[#0F172A]">
                      {outStr ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F1F5F9] text-xs font-semibold">
                          {outStr}
                        </span>
                      ) : entry.isOpen ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                            In Progress
                          </span>
                          {onQuickClockOut && (
                            <button
                              type="button"
                              onClick={() => onQuickClockOut(entry)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold transition-colors shadow-xs"
                              title="Clock out now"
                            >
                              <LogOut className="w-3 h-3" />
                              Clock Out
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>

                    {/* Clock-In Hours */}
                    <td className="py-3 px-5 text-right font-semibold text-[#0F172A]">
                      <span
                        className={entry.isOpen ? "text-emerald-700 font-bold" : "text-[#0F172A]"}
                      >
                        {entry.hoursFormatted || "—"}
                      </span>
                    </td>

                    {/* Actions (⋯ menu) */}
                    <td className="py-3 px-4 text-center relative">
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(isMenuOpen ? null : entry.id)}
                          className="p-1.5 rounded-md text-[#64748B] hover:text-[#0F172A] hover:bg-[#E2E8F0] transition-colors"
                          aria-label="Actions"
                        >
                          <MoreHorizontal className="w-4 h-4 text-[#0284C7]" />
                        </button>

                        {isMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-20"
                              onClick={() => setOpenMenuId(null)}
                            />
                            <div
                              className={`absolute right-0 w-32 bg-white rounded-lg shadow-xl border border-[#E2E8F0] py-1 z-30 animate-in fade-in zoom-in-95 duration-100 ${
                                isLastRow ? "bottom-full mb-1" : "top-full mt-1"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onEdit(entry);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#334155] hover:bg-[#F8FAFC] transition-colors"
                              >
                                <Edit className="w-3.5 h-3.5 text-[#0284C7]" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onDelete(entry);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
