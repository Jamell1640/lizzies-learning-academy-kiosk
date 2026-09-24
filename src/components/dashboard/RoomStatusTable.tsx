import { ShieldCheck, ShieldAlert, CircleAlert, RefreshCw, LogIn } from "lucide-react";
import type { DashboardClassroom } from "@/lib/kiosk.types";
import { getClassroomIcon } from "@/lib/classroom-icon";
import { formatCrmTime } from "@/lib/kiosk-time";

interface RoomStatusTableProps {
  rooms: DashboardClassroom[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  isLoading: boolean;
  activeRoomName: string;
}

export function RoomStatusTable({
  rooms,
  selectedRoomId,
  onSelectRoom,
  isLoading,
  activeRoomName,
}: RoomStatusTableProps) {
  return (
    <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              <th className="py-3 px-4 sm:px-6">Room Name</th>
              <th className="py-3 px-4 text-center">Capacity</th>
              <th className="py-3 px-4 text-center">Enrolled</th>
              <th className="py-3 px-4 text-center">Students</th>
              <th className="py-3 px-4 text-center">Staff</th>
              <th className="py-3 px-4 text-center">Current Ratio</th>
              <th className="py-3 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {isLoading && rooms.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-[#64748B]">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-[#0284C7]" />
                    <span>Loading live classroom metrics...</span>
                  </div>
                </td>
              </tr>
            ) : rooms.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-[#64748B]">
                  No classrooms found in CRM.
                </td>
              </tr>
            ) : (
              rooms.map((room) => {
                const isSelected = room.id === selectedRoomId;
                // Actual ratio = children present : staff present (children:staff,
                // matching the Max format so the two are directly comparable).
                const actual = `${room.currentChildrenSignedIn}:${room.staffCount}`;
                const maxPerStaff = room.maxChildrenPerStaff;
                const maxRatioStr = maxPerStaff ? `${maxPerStaff}:1` : "—";
                // Staff column derives ONLY from open teacher_attendance shifts
                // (clock_in set, clock_out blank) — the same source as the ratio
                // numerator. The static current_teacher CRM pointer is NOT used
                // here because it can hold a stale name after a shift is closed
                // outside the kiosk flow (e.g. via the Timecard admin tool),
                // which would show a name while the ratio correctly shows 0.
                const openStaff = room.currentTeachers ?? [];
                const hasStaff = openStaff.length > 0;
                const primaryTeacher = hasStaff ? openStaff[0].name : "";

                return (
                  <tr
                    key={room.id}
                    onClick={() => onSelectRoom(room.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "bg-[#F0F9FF] hover:bg-[#E0F2FE]" : "hover:bg-[#F8FAFC]"
                    }`}
                  >
                    <td className="py-3.5 px-4 sm:px-6 font-semibold text-[#0F172A]">
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        {(() => {
                          const Icon = getClassroomIcon(room.name);
                          return <Icon className="w-4 h-4 text-[#0284C7] shrink-0" />;
                        })()}
                        {room.name}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center text-[#475569] font-medium">
                      {room.capacity > 0 ? room.capacity : "—"}
                    </td>

                    <td className="py-3.5 px-4 text-center text-[#475569] font-medium">
                      {room.enrolledCount}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="font-semibold text-[#0284C7] underline underline-offset-2">
                        {room.currentChildrenSignedIn}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {hasStaff ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className="inline-flex items-center gap-1 font-semibold text-[#0F172A]"
                            title={
                              openStaff.length > 1
                                ? openStaff.map((t) => t.name).join(", ")
                                : primaryTeacher
                            }
                          >
                            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                            <span className="truncate max-w-[120px]">{primaryTeacher}</span>
                            {openStaff.length > 1 && (
                              <span className="text-[10px] font-bold text-[#0284C7]">
                                +{openStaff.length - 1}
                              </span>
                            )}
                          </span>
                          {(() => {
                            // Only show the clock-IN time of an OPEN shift —
                            // never a clocked-out teacher's completed times.
                            const inTime = formatCrmTime(openStaff[0].clockInTime);
                            if (!inTime) return null;
                            return (
                              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] mt-0.5">
                                <span
                                  className="inline-flex items-center gap-0.5"
                                  title="Clock-in time"
                                >
                                  <LogIn className="w-3 h-3 text-[#10B981]" />
                                  {inTime}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="font-medium text-[#94A3B8]">Unstaffed</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs font-semibold text-[#0F172A] whitespace-nowrap">
                          Actual: <span className="text-[#0284C7]">{actual}</span>
                        </span>
                        <span className="text-[11px] font-medium text-[#64748B] whitespace-nowrap">
                          Max: {maxRatioStr}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {room.ratioStatus === "in" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          In Ratio
                        </span>
                      ) : room.ratioStatus === "over" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Over Ratio
                        </span>
                      ) : room.ratioStatus === "empty" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
                          <CircleAlert className="w-3.5 h-3.5" />
                          No Children Present
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A] text-center">
                          <CircleAlert className="w-3.5 h-3.5" />
                          Ratio Not Configured
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[#F8FAFC] px-4 py-2 border-t border-[#E2E8F0] text-xs text-[#64748B] flex items-center justify-between">
        <span>Click any room row above to load its live student avatar roster below.</span>
        <span className="text-[11px] font-semibold text-[#0284C7]">Active: {activeRoomName}</span>
      </div>
    </div>
  );
}
