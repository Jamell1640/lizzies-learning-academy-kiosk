import { useState } from "react";
import { X, Clock, Calendar, AlertCircle, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeacherTimecardEntry, Classroom } from "@/lib/kiosk.types";
import { crmTimeToMinutes } from "@/lib/kiosk-time";

interface Props {
  entry: TeacherTimecardEntry;
  classrooms: Classroom[];
  onClose: () => void;
  onSubmit: (params: {
    recordId: string;
    classroomName?: string;
    date?: string;
    clockInTime?: string;
    clockOutTime?: string;
  }) => Promise<void>;
}

/**
 * Format any raw time into 24-hour "HH:MM" for <input type="time">.
 */
function rawToTimeInput(raw: string | number | undefined | null): string {
  if (raw == null || raw === "") return "";
  const minutes = crmTimeToMinutes(raw);
  if (minutes == null) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function EditTimecardModal({ entry, classrooms, onClose, onSubmit }: Props) {
  const [classroomName, setClassroomName] = useState<string>(
    entry.classroomName || classrooms[0]?.name || "Infant Room",
  );
  const [date, setDate] = useState<string>(entry.date);
  const [clockInTime, setClockInTime] = useState<string>(rawToTimeInput(entry.clockInTime));
  const [clockOutTime, setClockOutTime] = useState<string>(rawToTimeInput(entry.clockOutTime));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        recordId: entry.id,
        classroomName: classroomName.trim() || undefined,
        date: date.trim() || undefined,
        clockInTime: clockInTime.trim() || undefined,
        clockOutTime: clockOutTime.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to update timecard record");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-[#E2E8F0]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">Edit Staff Timecard</h2>
            <p className="text-xs text-[#64748B] mt-0.5">{entry.teacherName}</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded-md hover:bg-[#F1F5F9] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#334155] uppercase tracking-wider mb-1.5">
              Room / Classroom
            </label>
            <div className="relative">
              <School className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <select
                value={classroomName}
                onChange={(e) => setClassroomName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#CBD5E1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0284C7]"
              >
                {classrooms.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#334155] uppercase tracking-wider mb-1.5">
              Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#0284C7]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#334155] uppercase tracking-wider mb-1.5">
                Clock-In Time
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="time"
                  value={clockInTime}
                  onChange={(e) => setClockInTime(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#0284C7]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#334155] uppercase tracking-wider mb-1.5">
                Clock-Out Time
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="time"
                  value={clockOutTime}
                  onChange={(e) => setClockOutTime(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#0284C7]"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="text-sm font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold px-4"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
