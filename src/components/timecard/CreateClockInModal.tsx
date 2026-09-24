import { useState, useMemo } from "react";
import { X, Search, Clock, Calendar, Check, AlertCircle, School, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLocalDate, getLocalTime24 } from "@/lib/kiosk-time";
import type { Teacher, Classroom } from "@/lib/kiosk.types";

interface Props {
  teachers: Teacher[];
  classrooms: Classroom[];
  initialDate?: string;
  onClose: () => void;
  onSubmit: (params: {
    teacherName: string;
    classroomName: string;
    date: string;
    clockInTime?: string;
    clockOutTime?: string;
  }) => Promise<void>;
}

export function CreateClockInModal({
  teachers,
  classrooms,
  initialDate,
  onClose,
  onSubmit,
}: Props) {
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedClassroom, setSelectedClassroom] = useState<string>(
    classrooms[0]?.name || "Infant Room",
  );
  const [date, setDate] = useState<string>(initialDate || getLocalDate());
  const [clockInTime, setClockInTime] = useState<string>(getLocalTime24());
  const [clockOutTime, setClockOutTime] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) => t.name.toLowerCase().includes(q));
  }, [teachers, searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacher) {
      setError("Please select a staff member");
      return;
    }
    if (!date) {
      setError("Please provide a date");
      return;
    }
    if (!clockInTime && !clockOutTime) {
      setError("Please provide at least a Clock-In or Clock-Out time");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        teacherName: selectedTeacher.name,
        classroomName: selectedClassroom,
        date,
        clockInTime: clockInTime.trim() || undefined,
        clockOutTime: clockOutTime.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to create clock-in record");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-[#E2E8F0]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">Create Clock-In Entry</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Record a teacher shift or manually close out an open shift
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-[#64748B] hover:text-[#0F172A] rounded-md hover:bg-[#F1F5F9] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Teacher Selection */}
          <div>
            <label className="block text-xs font-bold text-[#334155] uppercase tracking-wider mb-1.5">
              Staff Member <span className="text-red-500">*</span>
            </label>
            {selectedTeacher ? (
              <div className="flex items-center justify-between p-3 rounded-lg border border-[#0284C7] bg-[#E0F2FE]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#0284C7] text-white flex items-center justify-center font-bold text-xs">
                    {selectedTeacher.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#0F172A]">{selectedTeacher.name}</div>
                    <div className="text-[11px] text-[#0284C7]">Selected staff</div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTeacher(null)}
                  className="text-xs text-[#0284C7] hover:bg-[#BAE6FD]"
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search staff by name..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#0284C7]"
                  />
                </div>
                <div className="max-h-36 overflow-y-auto border border-[#E2E8F0] rounded-lg divide-y divide-[#F1F5F9]">
                  {filteredTeachers.length === 0 ? (
                    <div className="p-3 text-xs text-[#94A3B8] text-center">No staff found</div>
                  ) : (
                    filteredTeachers.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTeacher(t)}
                        className="w-full flex items-center justify-between p-2.5 hover:bg-[#F8FAFC] text-left transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-[#64748B]" />
                          <span className="text-sm font-medium text-[#0F172A]">{t.name}</span>
                        </div>
                        <span className="text-xs text-[#0284C7] font-semibold">Select</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Classroom Dropdown */}
          <div>
            <label className="block text-xs font-bold text-[#334155] uppercase tracking-wider mb-1.5">
              Clock-In Room <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <School className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <select
                value={selectedClassroom}
                onChange={(e) => setSelectedClassroom(e.target.value)}
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

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold text-[#334155] uppercase tracking-wider mb-1.5">
              Date <span className="text-red-500">*</span>
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

          {/* Time fields */}
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
              <p className="text-[10px] text-[#64748B] mt-1">
                Leave empty if closing an open shift
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-[#334155] uppercase tracking-wider">
                  Clock-Out Time
                </label>
                {clockOutTime && (
                  <button
                    type="button"
                    onClick={() => setClockOutTime("")}
                    className="text-[10px] font-semibold text-[#0284C7] hover:text-[#0369A1] uppercase tracking-wider"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="relative">
                <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="time"
                  value={clockOutTime}
                  onChange={(e) => setClockOutTime(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#CBD5E1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0284C7]"
                />
              </div>
              <p className="text-[10px] text-[#64748B] mt-1">
                {clockOutTime
                  ? "Tap Clear to leave open / in-progress"
                  : "Left blank = open / in-progress shift"}
              </p>
            </div>
          </div>

          {/* Submit buttons */}
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
              {submitting ? "Saving..." : "Save Clock-In"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
