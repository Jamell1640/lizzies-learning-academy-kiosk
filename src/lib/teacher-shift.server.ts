/**
 * Teacher shift guardrail helpers (custom_objects.teacher_attendance).
 *
 * Centralizes the duplicate-open-shift check used by BOTH clock-in entry
 * points (kiosk begin-session and admin create-clock-in).
 *
 * POLICY: multi-classroom clock-in is ALLOWED — a teacher may be clocked
 * in to more than one classroom at once, and multiple teachers may be
 * clocked into the same classroom. The ONLY thing blocked is a teacher
 * being clocked into the SAME classroom twice (a duplicate open shift for
 * that teacher+classroom pair).
 *
 * Server-only module.
 */
import { callCrmApi, getLocationId, normKey, propVal, propRaw } from "./crm-api";

const TEACHER_ATTENDANCE_OBJECT = "custom_objects.teacher_attendance";

/**
 * Description of a teacher's existing OPEN shift (clock_in set, clock_out
 * blank) — used by the duplicate-open-shift guardrail.
 */
export interface OpenShiftInfo {
  id: string;
  teacherName: string;
  classroomName: string;
  date: string;
  /** Raw CRM Time-field value for clock_in_time. */
  clockInTime: string | number;
}

/**
 * A teacher's existing open shift, surfaced to the UI when a clock-in is
 * blocked because they're already clocked in elsewhere.
 */
export interface DuplicateOpenShift {
  teacherName: string;
  classroomName: string;
  /** Raw CRM Time-field value for the existing clock-in. */
  clockInTime: string | number;
  recordId: string;
}

/**
 * Result of a begin-classroom-session (clock-in) attempt.
 *  - ok + (no duplicate)            -> clock-in succeeded
 *  - ok + alreadyClockedInHere      -> idempotent: already clocked in to this room
 *  - !ok + duplicateOpenShift       -> BLOCKED: open shift exists elsewhere
 */
export interface BeginSessionResult {
  ok: boolean;
  alreadyClockedInHere?: boolean;
  duplicateOpenShift?: DuplicateOpenShift;
}

/**
 * GUARDRAIL — find a teacher's existing OPEN shift IN A SPECIFIC CLASSROOM.
 *
 * Multi-classroom clock-in is ALLOWED: a teacher covering multiple age
 * groups may be clocked in to more than one classroom at once, and multiple
 * teachers may be clocked into the same classroom. The ONLY thing blocked
 * is a teacher being clocked into the SAME classroom twice (a duplicate
 * open shift for that teacher+classroom pair).
 *
 * An "open shift" = clock_in_time set and clock_out_time blank. The date is
 * intentionally NOT filtered — an unclosed shift from a previous day is
 * still "open" and counts as a duplicate in that classroom.
 *
 * Fetch-all + filter in code (the search API doesn't reliably filter on
 * custom fields). Returns the matching open shift, or null when none exists
 * for that teacher+classroom pair (so the caller may proceed to clock in).
 *
 * Shared by both clock-in entry points so the guardrail can't be bypassed.
 */
export async function findOpenShiftInClassroom(
  teacherName: string,
  classroomName: string,
): Promise<OpenShiftInfo | null> {
  const locationId = getLocationId();
  const res = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/search`,
    { method: "POST", body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }) },
  );
  const all = res?.records || res?.data || [];
  const targetTeacher = teacherName.trim().toLowerCase();
  const targetClassroom = normKey(classroomName);
  for (const r of all) {
    const t = String(propVal(r, "teacher") ?? "")
      .trim()
      .toLowerCase();
    const cls = normKey(String(propVal(r, "classroom") ?? ""));
    const ci = String(propVal(r, "clock_in_time") ?? "").trim();
    const co = String(propVal(r, "clock_out_time") ?? "").trim();
    if (
      t === targetTeacher &&
      t !== "" &&
      cls === targetClassroom &&
      cls !== "" &&
      ci !== "" &&
      co === ""
    ) {
      return {
        id: r.id,
        teacherName: String(propVal(r, "teacher") ?? "").trim(),
        classroomName: String(propVal(r, "classroom") ?? "").trim(),
        date: String(propVal(r, "date") ?? "").trim(),
        clockInTime: propRaw(r, "clock_in_time"),
      };
    }
  }
  return null;
}

/**
 * @deprecated Kept only for backward compatibility with callers that still
 * import it. Multi-classroom clock-in is now allowed, so a cross-classroom
 * "any open shift" check is no longer the guardrail. Prefer
 * findOpenShiftInClassroom(). This now returns the first open shift in ANY
 * classroom (used only by the switch-room convenience action).
 */
export async function findAnyOpenTeacherShift(teacherName: string): Promise<OpenShiftInfo | null> {
  const all = await findAllOpenShiftsForTeacher(teacherName);
  return all[0] ?? null;
}

/**
 * Find ALL of a teacher's currently-OPEN shifts across every classroom.
 * An "open shift" = clock_in_time set and clock_out_time blank. The date is
 * intentionally NOT filtered — an unclosed shift from a previous day is still
 * "open" and must be closeable from "My Open Rooms" / "End My Day".
 *
 * Used by:
 *   - "My Open Rooms" view (lists every room the teacher is clocked into)
 *   - "End My Day" (closes every open shift at once)
 *   - "Also staffed in" indicator on a classroom kiosk (other open rooms)
 */
export async function findAllOpenShiftsForTeacher(teacherName: string): Promise<OpenShiftInfo[]> {
  const locationId = getLocationId();
  const res = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/search`,
    { method: "POST", body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }) },
  );
  const all = res?.records || res?.data || [];
  const target = teacherName.trim().toLowerCase();
  const out: OpenShiftInfo[] = [];
  for (const r of all) {
    const t = String(propVal(r, "teacher") ?? "")
      .trim()
      .toLowerCase();
    const ci = String(propVal(r, "clock_in_time") ?? "").trim();
    const co = String(propVal(r, "clock_out_time") ?? "").trim();
    if (t === target && t !== "" && ci !== "" && co === "") {
      out.push({
        id: r.id,
        teacherName: String(propVal(r, "teacher") ?? "").trim(),
        classroomName: String(propVal(r, "classroom") ?? "").trim(),
        date: String(propVal(r, "date") ?? "").trim(),
        clockInTime: propRaw(r, "clock_in_time"),
      });
    }
  }
  return out;
}

/**
 * A room entry for the "My Open Rooms" view: the classroom's name + id (so the
 * UI can display it and so Sign Out from that room can resolve the classroom
 * record to clear its current_teacher pointer) plus the open shift metadata.
 */
export interface MyOpenRoom {
  recordId: string;
  classroomName: string;
  /** Resolved classroom record id (for clearing current_teacher on sign out). */
  classroomId?: string;
  date: string;
  clockInTime: string | number;
}

/**
 * Resolve every classroom's record id from its human-readable name. Returns a
 * map of normalized name -> id for a single batched lookup.
 */
async function getClassroomNameToIdMap(): Promise<Map<string, string>> {
  const locationId = getLocationId();
  const res = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.classrooms/records/search`,
    { method: "POST", body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }) },
  );
  const all = res?.records || res?.data || [];
  const map = new Map<string, string>();
  for (const r of all) {
    const n = propVal(r, "classroom_name") || propVal(r, "Classroom Name") || r.name || "";
    if (n) map.set(normKey(String(n)), r.id);
  }
  return map;
}

/**
 * "My Open Rooms" — list every room a teacher is currently clocked into, each
 * with its own Sign Out capability. Resolves classroom record ids so the UI's
 * per-room sign out can clear that room's current_teacher pointer.
 */
export async function serverGetMyOpenRooms(teacherName: string): Promise<MyOpenRoom[]> {
  const shifts = await findAllOpenShiftsForTeacher(teacherName);
  if (shifts.length === 0) return [];
  const nameToId = await getClassroomNameToIdMap();
  return shifts.map((s) => ({
    recordId: s.id,
    classroomName: s.classroomName,
    classroomId: nameToId.get(normKey(s.classroomName)),
    date: s.date,
    clockInTime: s.clockInTime,
  }));
}

/**
 * Sign out of ONE specific open room (by teacher_attendance record id). Patches
 * the record's clock_out_time and clears the matching classroom's
 * current_teacher pointer ONLY if no other teacher is still clocked into that
 * room. Returns the classroom id so the caller can navigate/refresh.
 */
export async function serverSignOutRoom(
  recordId: string,
  clockOutTime: string,
): Promise<{ ok: boolean; classroomId?: string }> {
  // 1. Patch the open shift's clock_out_time.
  await patchTeacherAttendanceRecord(recordId, { clock_out_time: clockOutTime });

  // 2. Read the record to get the classroom name, then clear that classroom's
  //    current_teacher pointer — but only if no OTHER open shift remains in
  //    that room (another teacher may still be staffed there).
  const locationId = getLocationId();
  let classroomName = "";
  try {
    const rec = await callCrmApi<any>(
      `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/${recordId}?locationId=${locationId}`,
    );
    const r = rec?.record || rec;
    classroomName = String(propVal(r, "classroom") ?? "").trim();
  } catch (e: any) {
    console.warn(`[serverSignOutRoom] read record failed: ${e?.message || e}`);
  }

  if (classroomName) {
    // Re-check: are there other open shifts in this classroom?
    const stillOpen = await findOpenShiftsInClassroom(classroomName);
    if (stillOpen.length === 0) {
      const cid = await getClassroomIdByName(classroomName);
      if (cid) {
        try {
          const { updateClassroomRecord } = await import("./classroom-session.server");
          await updateClassroomRecord(cid, { current_teacher: "" });
        } catch (e: any) {
          console.warn(`[serverSignOutRoom] clear pointer failed: ${e?.message || e}`);
        }
      }
      return { ok: true, classroomId: await getClassroomIdByName(classroomName) };
    }
  }
  return { ok: true };
}

/**
 * "End My Day" — close ALL of a teacher's currently-open shifts at once.
 * For each open shift: patch clock_out_time, then clear the classroom's
 * current_teacher pointer only if no other teacher is still clocked in there.
 * Returns the count of closed shifts.
 */
export async function serverEndMyDay(
  teacherName: string,
  clockOutTime: string,
): Promise<{ ok: boolean; closedCount: number }> {
  const shifts = await findAllOpenShiftsForTeacher(teacherName);
  const nameToId = await getClassroomNameToIdMap();
  let closed = 0;
  for (const s of shifts) {
    try {
      await patchTeacherAttendanceRecord(s.id, { clock_out_time: clockOutTime });
      closed += 1;
      // Clear that classroom's pointer only if no other teacher is still open there.
      const stillOpen = await findOpenShiftsInClassroom(s.classroomName);
      if (stillOpen.length === 0) {
        const cid = nameToId.get(normKey(s.classroomName));
        if (cid) {
          try {
            const { updateClassroomRecord } = await import("./classroom-session.server");
            await updateClassroomRecord(cid, { current_teacher: "" });
          } catch (e: any) {
            console.warn(
              `[serverEndMyDay] clear pointer for ${s.classroomName} failed: ${e?.message || e}`,
            );
          }
        }
      }
    } catch (e: any) {
      console.warn(`[serverEndMyDay] close shift ${s.id} failed: ${e?.message || e}`);
    }
  }
  return { ok: true, closedCount: closed };
}

/**
 * Find ALL open shifts in a given classroom (every teacher clocked in there
 * right now). Used by Sign Out / End My Day to decide whether to clear a
 * room's current_teacher pointer and by the dashboard to list every staffed
 * teacher.
 */
export async function findOpenShiftsInClassroom(classroomName: string): Promise<OpenShiftInfo[]> {
  const locationId = getLocationId();
  const res = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/search`,
    { method: "POST", body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }) },
  );
  const all = res?.records || res?.data || [];
  const targetClassroom = normKey(classroomName);
  const out: OpenShiftInfo[] = [];
  for (const r of all) {
    const cls = normKey(String(propVal(r, "classroom") ?? ""));
    const ci = String(propVal(r, "clock_in_time") ?? "").trim();
    const co = String(propVal(r, "clock_out_time") ?? "").trim();
    if (cls === targetClassroom && cls !== "" && ci !== "" && co === "") {
      out.push({
        id: r.id,
        teacherName: String(propVal(r, "teacher") ?? "").trim(),
        classroomName: String(propVal(r, "classroom") ?? "").trim(),
        date: String(propVal(r, "date") ?? "").trim(),
        clockInTime: propRaw(r, "clock_in_time"),
      });
    }
  }
  return out;
}

/**
 * PATCH a teacher_attendance record: write only the given properties.
 * Same update-by-id pattern as classroom records — locationId in query
 * string only, body is { properties } only.
 */
export async function patchTeacherAttendanceRecord(
  recordId: string,
  properties: Record<string, any>,
): Promise<void> {
  const locationId = getLocationId();
  const payload = { properties };
  console.log("[patchTeacherAttendanceRecord] body:", JSON.stringify(payload));
  await callCrmApi(
    `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/${recordId}?locationId=${locationId}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

/**
 * Close an open teacher shift: PATCH its clock_out_time. Reuses
 * patchTeacherAttendanceRecord (locationId in query string, { properties }
 * body only). Used by the switch-room action and the admin close-shift path.
 */
export async function closeTeacherShift(recordId: string, clockOutTime: string): Promise<void> {
  await patchTeacherAttendanceRecord(recordId, { clock_out_time: clockOutTime });
}

/**
 * Resolve a classroom's record id from its human-readable name by fetching
 * all classrooms and matching (normalized) name. Used by the switch-room
 * action to clear the PREVIOUS classroom's current_teacher pointer.
 */
export async function getClassroomIdByName(name: string): Promise<string | undefined> {
  const locationId = getLocationId();
  try {
    const res = await callCrmApi<{ records?: any[]; data?: any[] }>(
      `/objects/custom_objects.classrooms/records/search`,
      { method: "POST", body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }) },
    );
    const all = res?.records || res?.data || [];
    const key = normKey(name);
    const match = all.find((r: any) => {
      const n = propVal(r, "classroom_name") || propVal(r, "Classroom Name") || r.name || "";
      return normKey(n) === key;
    });
    return match?.id;
  } catch (e: any) {
    console.warn(`[getClassroomIdByName] failed for "${name}": ${e?.message || e}`);
    return undefined;
  }
}
