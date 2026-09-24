import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Clock, LogIn, LogOut, Pencil, RefreshCw, Calendar as CalendarIcon } from "lucide-react";
import type { ManualAttendanceEntry } from "@/lib/kiosk.types";
import { editManualAttendance } from "@/lib/kiosk.functions";
import { getLocalTime24 } from "@/lib/kiosk-time";
import { Button } from "@/components/ui/button";

interface EditAttendanceModalProps {
  entry: ManualAttendanceEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Parse a stored CRM time value (which may be "HH:MM", "HHMM", or "h:MM AM/PM")
 * into a "HH:MM" 24h string suitable for an <input type="time">.
 */
function parseTimeTo24(raw: string): string {
  if (!raw) return getLocalTime24();
  const s = String(raw).trim();

  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    return `${String(h).padStart(2, "0")}:${m24[2]}`;
  }

  const ampm = s.match(/(\d{1,2}):(\d{2})\s*([APap][Mm])/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const isPM = /p/i.test(ampm[3]);
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${ampm[2]}`;
  }

  if (/^\d{3,4}$/.test(s)) {
    const padded = s.length === 3 ? "0" + s : s;
    return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
  }

  return getLocalTime24();
}

export function EditAttendanceModal({ entry, onClose, onSaved }: EditAttendanceModalProps) {
  const [editClassroom, setEditClassroom] = useState("");
  const [editSignerName, setEditSignerName] = useState("");
  const [editTime24, setEditTime24] = useState("");
  const [editType, setEditType] = useState<"in" | "out">("in");
  const [editPickup, setEditPickup] = useState("");
  const [editDate, setEditDate] = useState("");
  const [isEditSaving, setIsEditSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setEditClassroom(entry.classroom);
      setEditSignerName(entry.signerName);
      setEditTime24(parseTimeTo24(entry.checkInTime || entry.checkOutTime || ""));
      setEditType(entry.checkInTime ? "in" : "out");
      setEditPickup(entry.pickupPerson);
      setEditDate(entry.date || "");
    }
  }, [entry]);

  if (!entry) return null;

  const handleSave = async () => {
    if (!editSignerName.trim()) {
      toast.error("Please enter who signed them in/out.");
      return;
    }
    setIsEditSaving(true);
    try {
      const result = await editManualAttendance({
        data: {
          recordId: entry.id,
          classroom: editClassroom,
          signerName: editSignerName.trim(),
          time24: editTime24,
          type: editType,
          pickupPerson: editPickup.trim(),
          date: editDate,
        },
      });
      if (result?.ok) {
        toast.success("Attendance record updated.");
        onSaved();
      } else {
        toast.error("Could not update the record.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to update record.");
    } finally {
      setIsEditSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">Edit Attendance Record</h2>
            <p className="text-xs text-[#64748B] mt-0.5">{entry.childName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
              Entry Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEditType("in")}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                  editType === "in"
                    ? "bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]"
                    : "bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]"
                }`}
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setEditType("out")}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                  editType === "out"
                    ? "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]"
                    : "bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]"
                }`}
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
              Classroom / Room
            </label>
            <input
              type="text"
              value={editClassroom}
              onChange={(e) => setEditClassroom(e.target.value)}
              className="w-full text-sm px-3 py-2.5 rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-[#0284C7]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
              Signed In/Out By
            </label>
            <input
              type="text"
              value={editSignerName}
              onChange={(e) => setEditSignerName(e.target.value)}
              className="w-full text-sm px-3 py-2.5 rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-[#0284C7]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
              Date
            </label>
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#94A3B8]" />
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="text-sm px-3 py-2.5 rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
              Time (America/Chicago)
            </label>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#94A3B8]" />
              <input
                type="time"
                value={editTime24}
                onChange={(e) => setEditTime24(e.target.value)}
                className="text-sm px-3 py-2.5 rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
              Pickup/Drop-off Person
            </label>
            <input
              type="text"
              value={editPickup}
              onChange={(e) => setEditPickup(e.target.value)}
              className="w-full text-sm px-3 py-2.5 rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:border-[#0284C7]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#E2E8F0]">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-9 text-xs border-[#CBD5E1] bg-white text-[#334155]"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isEditSaving}
            className="h-9 text-xs bg-[#0284C7] hover:bg-[#0369A1] text-white"
          >
            {isEditSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Pencil className="w-3.5 h-3.5" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
