import { useState, useEffect } from "react";
import {
  RefreshCw,
  ClipboardList,
  LogIn,
  LogOut,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import type { ManualAttendanceEntry } from "@/lib/kiosk.types";
import { formatCrmTime } from "@/lib/kiosk-time";

interface AttendanceTableProps {
  entries: ManualAttendanceEntry[];
  isLoading: boolean;
  onEdit: (entry: ManualAttendanceEntry) => void;
  onDelete: (entry: ManualAttendanceEntry) => void;
  onBulkDelete?: (entries: ManualAttendanceEntry[]) => void;
}

export function AttendanceTable({
  entries,
  isLoading,
  onEdit,
  onDelete,
  onBulkDelete,
}: AttendanceTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Close row menu on outside click
  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    if (openMenuId) {
      window.addEventListener("click", handler);
      return () => window.removeEventListener("click", handler);
    }
  }, [openMenuId]);

  // Clear selection when the entries list changes (date switch / refresh)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [entries]);

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

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {selectedEntries.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-[#0F172A] text-white rounded-lg px-4 py-2.5 shadow-md animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-white/15 text-xs font-bold">
              {selectedEntries.length}
            </span>
            <span className="text-sm font-semibold">
              {selectedEntries.length === 1 ? "record" : "records"} selected
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

      <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-xs overflow-hidden">
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
                <th className="py-3 px-4">Child</th>
                <th className="py-3 px-4">DOB</th>
                <th className="py-3 px-4">Classroom</th>
                <th className="py-3 px-4 text-center">Type</th>
                <th className="py-3 px-4 text-center">In Time</th>
                <th className="py-3 px-4 text-center">Out Time</th>
                <th className="py-3 px-4 text-center">Date</th>
                <th className="py-3 px-4">Signed By</th>
                <th className="py-3 px-4 text-center">Facility ID</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {isLoading && entries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-sm text-[#64748B]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-[#0284C7]" />
                      <span>Loading attendance records...</span>
                    </div>
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-sm text-[#64748B]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ClipboardList className="w-8 h-8 text-[#CBD5E1]" />
                      <span className="font-medium text-[#475569]">
                        No attendance records for this date.
                      </span>
                      <span className="text-xs text-[#94A3B8]">
                        Use "Create Sign-In" to add a manual entry.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const hasIn =
                    entry.checkInTime !== undefined &&
                    entry.checkInTime !== null &&
                    entry.checkInTime !== "";
                  const hasOut =
                    entry.checkOutTime !== undefined &&
                    entry.checkOutTime !== null &&
                    entry.checkOutTime !== "";
                  const isSignedIn = hasIn && !hasOut;
                  const isSelected = selectedIds.has(entry.id);
                  return (
                    <>
                      {/* Desktop / wide row */}
                      <tr
                        key={entry.id}
                        className={`hover:bg-[#F8FAFC] transition-colors hidden md:table-row ${
                          isSelected ? "bg-[#F0F9FF]" : ""
                        }`}
                      >
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(entry.id)}
                            className="w-4 h-4 rounded border-[#CBD5E1] text-[#0284C7] accent-[#0284C7] cursor-pointer focus:ring-[#0284C7]"
                            aria-label={`Select ${entry.childName}`}
                          />
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#0F172A]">
                          {entry.childName}
                        </td>
                        <td className="py-3 px-4 text-[#475569] font-medium whitespace-nowrap">
                          {entry.dob || "—"}
                        </td>
                        <td className="py-3 px-4 text-[#475569] font-medium">
                          {entry.classroom || "—"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isSignedIn ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#DCFCE7] text-[#15803D]">
                              <LogIn className="w-3 h-3" />
                              In
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF3C7] text-[#B45309]">
                              <LogOut className="w-3 h-3" />
                              Out
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-[#475569] font-medium">
                          {hasIn ? formatCrmTime(entry.checkInTime) : "—"}
                        </td>
                        <td className="py-3 px-4 text-center text-[#475569] font-medium">
                          {hasOut ? formatCrmTime(entry.checkOutTime) : "—"}
                        </td>
                        <td className="py-3 px-4 text-center text-[#475569] font-medium whitespace-nowrap">
                          {entry.recordDate || entry.date || "—"}
                        </td>
                        <td className="py-3 px-4 text-[#475569] font-medium">
                          {entry.signerName || "—"}
                        </td>
                        <td className="py-3 px-4 text-center text-[#475569] font-mono text-xs whitespace-nowrap">
                          {entry.facilityId || "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="relative inline-block">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === entry.id ? null : entry.id);
                              }}
                              className="p-1.5 rounded-md hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] transition-colors"
                              title="More actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openMenuId === entry.id && (
                              <div
                                className="absolute right-0 top-full mt-1 z-20 bg-white border border-[#E2E8F0] rounded-md shadow-lg py-1 min-w-[120px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    onEdit(entry);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F1F5F9] transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-[#0284C7]" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDelete(entry);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#B91C1C] hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Mobile / narrow condensed row */}
                      <tr
                        key={`${entry.id}-mobile`}
                        className={`hover:bg-[#F8FAFC] transition-colors md:hidden ${
                          isSelected ? "bg-[#F0F9FF]" : ""
                        }`}
                      >
                        <td className="py-3 px-3 align-top">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(entry.id)}
                            className="w-4 h-4 rounded border-[#CBD5E1] text-[#0284C7] accent-[#0284C7] cursor-pointer focus:ring-[#0284C7]"
                            aria-label={`Select ${entry.childName}`}
                          />
                        </td>
                        <td className="py-3 px-4" colSpan={10}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-[#0F172A]">
                                  {entry.childName}
                                </span>
                                {isSignedIn ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#DCFCE7] text-[#15803D]">
                                    <LogIn className="w-3 h-3" />
                                    In
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF3C7] text-[#B45309]">
                                    <LogOut className="w-3 h-3" />
                                    Out
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-[#64748B] space-y-0.5">
                                <div>
                                  <span className="text-[#94A3B8]">DOB:</span>{" "}
                                  <span className="font-medium text-[#475569]">
                                    {entry.dob || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#94A3B8]">Room:</span>{" "}
                                  <span className="font-medium text-[#475569]">
                                    {entry.classroom || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#94A3B8]">In/Out:</span>{" "}
                                  <span className="font-medium text-[#475569]">
                                    {hasIn ? formatCrmTime(entry.checkInTime) : "—"} /{" "}
                                    {hasOut ? formatCrmTime(entry.checkOutTime) : "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#94A3B8]">Date:</span>{" "}
                                  <span className="font-medium text-[#475569]">
                                    {entry.recordDate || entry.date || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#94A3B8]">Signed By:</span>{" "}
                                  <span className="font-medium text-[#475569]">
                                    {entry.signerName || "—"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#94A3B8]">Facility ID:</span>{" "}
                                  <span className="font-mono text-[#475569]">
                                    {entry.facilityId || "—"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="relative inline-block shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(openMenuId === entry.id ? null : entry.id);
                                }}
                                className="p-1.5 rounded-md hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] transition-colors"
                                title="More actions"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                              {openMenuId === entry.id && (
                                <div
                                  className="absolute right-0 top-full mt-1 z-20 bg-white border border-[#E2E8F0] rounded-md shadow-lg py-1 min-w-[120px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onEdit(entry);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#334155] hover:bg-[#F1F5F9] transition-colors"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-[#0284C7]" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDelete(entry);
                                      setOpenMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#B91C1C] hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
