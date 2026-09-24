import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Search, ExternalLink, RefreshCw } from "lucide-react";
import type { DashboardClassroom, Child } from "@/lib/kiosk.types";
import { getAvatarColor, getInitials, getFirstName } from "./dashboard-utils";
import { getClassroomIcon } from "@/lib/classroom-icon";
import { formatAgeFromDob } from "@/lib/kiosk-time";

interface StudentDrilldownProps {
  activeRoom: DashboardClassroom;
  rosterLoading: boolean;
  rawChildren: Child[];
}

export function StudentDrilldown({
  activeRoom,
  rosterLoading,
  rawChildren,
}: StudentDrilldownProps) {
  const [showIn, setShowIn] = useState(true);
  const [showOut, setShowOut] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");

  const inChildren = useMemo(() => rawChildren.filter((c) => c.status === "in"), [rawChildren]);
  const outChildren = useMemo(() => rawChildren.filter((c) => c.status === "out"), [rawChildren]);

  const displayedChildren = useMemo(() => {
    return rawChildren.filter((c) => {
      if (c.status === "in" && !showIn) return false;
      if (c.status === "out" && !showOut) return false;
      if (studentSearch.trim()) {
        const query = studentSearch.toLowerCase();
        return c.name.toLowerCase().includes(query) || c.studentId.toLowerCase().includes(query);
      }
      return true;
    });
  }, [rawChildren, showIn, showOut, studentSearch]);

  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-xs p-5 sm:p-6 space-y-5">
      {/* Header row of the active room */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = getClassroomIcon(activeRoom.name);
              return <Icon className="w-5 h-5 text-[#0284C7]" />;
            })()}
            <h2 className="text-lg sm:text-xl font-bold text-[#0F172A]">{activeRoom.name}</h2>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Classroom Capacity:{" "}
            <span className="font-semibold text-[#0F172A]">{activeRoom.capacity || "—"}</span> •
            Enrolled:{" "}
            <span className="font-semibold text-[#0F172A]">{activeRoom.enrolledCount}</span>
          </p>
          <p className="text-xs text-[#64748B] mt-1">
            Actual:{" "}
            <span className="font-semibold text-[#0284C7]">
              {activeRoom.currentChildrenSignedIn}:{activeRoom.staffCount}
            </span>
            {" · Max: "}
            <span className="font-semibold text-[#0F172A]">
              {activeRoom.maxChildrenPerStaff ? `${activeRoom.maxChildrenPerStaff}:1` : "—"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs text-[#475569]">
            <span className="font-bold text-[#64748B] uppercase tracking-wider text-[11px]">
              Teacher:{" "}
            </span>
            <span className="font-semibold text-[#0F172A]">
              {(() => {
                // Derive ONLY from open teacher_attendance shifts — same source
                // as the ratio numerator. The static current_teacher pointer is
                // not used because it can hold a stale name after a shift is
                // closed outside the kiosk flow.
                const openStaff = activeRoom.currentTeachers ?? [];
                if (openStaff.length === 0) return "Unstaffed";
                if (openStaff.length === 1) return openStaff[0].name;
                return `${openStaff[0].name} +${openStaff.length - 1}`;
              })()}
            </span>
          </div>

          <Link
            to="/"
            className="text-xs font-semibold text-[#0284C7] hover:text-[#0369A1] uppercase tracking-wider flex items-center gap-1"
          >
            <span>Open in Kiosk</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Subheader controls: Students IN(x) OUT(y) checkboxes + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs font-bold text-[#334155]">
          <span className="text-[#64748B] uppercase tracking-wider text-[11px]">STUDENTS</span>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showIn}
              onChange={(e) => setShowIn(e.target.checked)}
              className="w-4 h-4 rounded text-[#0284C7] focus:ring-[#0284C7] border-[#CBD5E1]"
            />
            <span className="text-[#0284C7] font-bold">IN ({inChildren.length})</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOut}
              onChange={(e) => setShowOut(e.target.checked)}
              className="w-4 h-4 rounded text-[#0284C7] focus:ring-[#0284C7] border-[#CBD5E1]"
            />
            <span className="text-[#64748B] font-bold">OUT ({outChildren.length})</span>
          </label>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter student by name or ID..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 rounded-md border border-[#CBD5E1] bg-white text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#0284C7] focus:border-[#0284C7]"
          />
        </div>
      </div>

      {/* Circular Student Avatars Grid (Exact replica of Procare reference) */}
      {rosterLoading ? (
        <div className="py-16 text-center text-sm text-[#64748B]">
          <div className="flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#0284C7]" />
            <span>Loading students in {activeRoom.name}...</span>
          </div>
        </div>
      ) : displayedChildren.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#64748B] bg-[#F8FAFC] rounded-lg border border-dashed border-[#CBD5E1]">
          <p className="font-medium text-[#475569]">No students match the current filter.</p>
          <p className="text-xs text-[#94A3B8] mt-1">
            Check IN/OUT filters or clear your search term.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-y-6 gap-x-4 pt-2">
          {displayedChildren.map((child) => {
            const isPresent = child.status === "in";
            const initials = getInitials(child.name);
            const firstName = getFirstName(child.name);
            const colorClass = getAvatarColor(child.name);

            return (
              <div
                key={child.id}
                className="flex flex-col items-center text-center group cursor-pointer"
                title={`${child.name} (${child.studentId}) — ${isPresent ? "Signed In" : "Signed Out"}`}
              >
                <div className="relative">
                  <div
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center font-bold text-base sm:text-lg shadow-xs transition-transform group-hover:scale-105 ${colorClass}`}
                  >
                    {initials}
                  </div>

                  <span
                    className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                      isPresent ? "bg-[#10B981]" : "bg-[#94A3B8]"
                    }`}
                    title={isPresent ? "Present (Signed In)" : "Signed Out"}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  </span>
                </div>

                <span className="mt-2 text-xs font-semibold text-[#0284C7] group-hover:text-[#0369A1] underline underline-offset-2 truncate max-w-[80px]">
                  {firstName}
                </span>

                {(() => {
                  const age = formatAgeFromDob(child.dob);
                  return age ? <span className="text-[10px] text-[#64748B]">{age}</span> : null;
                })()}

                {child.lastCheckTime && (
                  <span className="text-[10px] text-[#64748B] mt-0.5">{child.lastCheckTime}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
