import { useCallback, useEffect, useState } from "react";

/**
 * Per-classroom Admin Lock/Unlock state for the kiosk tracker screen.
 *
 * Purpose: a teacher who is clocked in to a classroom cannot leave the
 * tracker screen (e.g. to the dashboard) without an admin unlocking it
 * first. When unlocked, the teacher may navigate away WITHOUT that being
 * treated as a clock-out — their teacher_attendance shift stays open and
 * they remain counted as present staff in that classroom's ratio. After the
 * teacher leaves, the classroom returns to Locked so this stays a controlled,
 * admin-gated action.
 *
 * Storage: localStorage, keyed per classroomId. The kiosk tablet is
 * wall-mounted at the center, so client-side state is appropriate (there is
 * no server-side session/auth backend in this app). Default state: Locked.
 *
 * Unlocking requires an admin PIN (verified via verifyTeacherPin), so a
 * teacher cannot unlock the room on their own.
 */

const STORAGE_PREFIX = "childcare_kiosk_classroom_lock_";

function readLock(classroomId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + classroomId);
    if (raw === null) return true; // default locked
    const parsed = JSON.parse(raw);
    return parsed?.locked !== false; // locked unless explicitly false
  } catch {
    return true;
  }
}

function writeLock(classroomId: string, locked: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + classroomId, JSON.stringify({ locked }));
  } catch {
    // ignore
  }
}

/**
 * Hook managing the lock state for one classroom.
 * Returns the current locked state, a setter that persists, and a helper
 * to re-lock (used after the teacher navigates away).
 */
export function useClassroomLock(classroomId: string) {
  const [locked, setLocked] = useState<boolean>(() => readLock(classroomId));

  // Re-read when classroomId changes.
  useEffect(() => {
    setLocked(readLock(classroomId));
  }, [classroomId]);

  const setLockedPersist = useCallback(
    (next: boolean) => {
      writeLock(classroomId, next);
      setLocked(next);
    },
    [classroomId],
  );

  const unlock = useCallback(() => setLockedPersist(false), [setLockedPersist]);
  const relock = useCallback(() => setLockedPersist(true), [setLockedPersist]);

  return { locked, unlock, relock, setLocked: setLockedPersist };
}
