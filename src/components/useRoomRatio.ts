import { useState, useCallback, useMemo } from "react";
import { getDashboard, getMyOpenRooms } from "@/lib/kiosk.functions";
import { computeRatioStatus, getMaxChildrenPerStaff } from "@/lib/classroom-ratio";
import type { Child } from "@/lib/kiosk.types";

/**
 * Live ratio + staffing state for a classroom kiosk screen.
 *
 * The ratio box is computed SYNCHRONOUSLY from the LOCAL children state +
 * the known staff count via useMemo — so it updates in the SAME render pass
 * as the optimistic `setChildren` that follows a sign-in/sign-out. This
 * matches how `presentCount` is derived inline in RosterScreen, so the
 * "Children Present" count and the "Ratio Status" box can never disagree or
 * lag. Uses the SAME `computeRatioStatus` + `getMaxChildrenPerStaff` logic
 * the Dashboard uses.
 *
 * `staffCount`, teacher clock times, and the "also staffed in" rooms are
 * refreshed from the Dashboard fetch (live CRM data) on the poll interval.
 */
export function useRoomRatio(
  classroomId: string,
  classroomName: string,
  teacherName: string,
  children: Child[],
) {
  const [staffCount, setStaffCount] = useState(0);
  const [teacherClockInTime, setTeacherClockInTime] = useState<string | number | undefined>(
    undefined,
  );
  const [teacherClockOutTime, setTeacherClockOutTime] = useState<string | number | undefined>(
    undefined,
  );
  const [otherOpenRooms, setOtherOpenRooms] = useState<
    { classroomId?: string; classroomName: string }[]
  >([]);

  // Refresh staff count, teacher shift times, and other open rooms from the
  // live Dashboard fetch (CRM data). Called on mount, on the poll interval,
  // and after every sign-in/out action.
  const loadRatioStatus = useCallback(async () => {
    if (!classroomId) return;
    try {
      const [rooms, myRooms] = await Promise.all([
        getDashboard(),
        getMyOpenRooms({ data: { teacherName } }),
      ]);
      const room = (rooms || []).find((r) => r.id === classroomId);
      if (room) {
        setStaffCount(room.staffCount);
        setTeacherClockInTime(room.teacherClockInTime);
        setTeacherClockOutTime(room.teacherClockOutTime);
      }
      const others = (myRooms || [])
        .filter(
          (r) => r.classroomName && r.classroomName.toLowerCase() !== classroomName.toLowerCase(),
        )
        .map((r) => ({
          classroomId: r.classroomId,
          classroomName: r.classroomName,
        }));
      setOtherOpenRooms(others);
    } catch (e) {
      // ignore — ratio & shift time are display-only context
    }
  }, [classroomId, classroomName, teacherName]);

  // Compute the ratio SYNCHRONOUSLY during render from the local children
  // state + staff count. useMemo recomputes whenever `children` or
  // `staffCount` changes — which happens in the same render pass as the
  // optimistic setChildren after a sign-in/out. No useEffect, no extra
  // render cycle, no lag behind `presentCount`.
  const ratio = useMemo(() => {
    const present = children.filter((c) => c.status === "in").length;
    const max = getMaxChildrenPerStaff(classroomName);
    return {
      status: computeRatioStatus(present, staffCount, max),
      signedIn: present,
      limit: max || 0,
    };
  }, [children, staffCount, classroomName]);

  return {
    ratioStatus: ratio.status,
    ratioSignedIn: ratio.signedIn,
    ratioLimit: ratio.limit,
    staffCount,
    teacherClockInTime,
    teacherClockOutTime,
    otherOpenRooms,
    loadRatioStatus,
  };
}
