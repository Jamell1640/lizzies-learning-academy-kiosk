/**
 * Classroom session + dashboard server helpers.
 *
 * Owns the classroom-record mutations that wrap the existing attendance
 * sign-in/out flow (which lives in kiosk.server.ts):
 *   - begin/end a teacher's classroom session
 *   - keep current_children_signed_in in sync after each attendance event
 *   - read-only dashboard overview with ratio status
 *
 * TEACHER SHIFT TRACKING lives on a dedicated custom_objects.teacher_attendance
 * object (fields: teacher, classroom, date, clock_in_time, clock_out_time),
 * NOT on the classrooms object. The classrooms object's current_teacher is
 * just a live "who's here now" pointer; timein/timeout are no longer written
 * to or read from classrooms.
 *
 * Server-only. Imported by kiosk.server.ts (and re-exported for the
 * createServerFn wrappers in kiosk.functions.ts).
 */
import type { DashboardClassroom } from "./kiosk.types";
import { callCrmApi, getLocationId, normKey, propVal, propRaw } from "./crm-api";
import {
  findOpenShiftInClassroom,
  findAnyOpenTeacherShift,
  closeTeacherShift,
  getClassroomIdByName,
  patchTeacherAttendanceRecord,
  type BeginSessionResult,
} from "./teacher-shift.server";
import { getMaxChildrenPerStaff, computeRatioStatus } from "./classroom-ratio";

const TEACHER_ATTENDANCE_OBJECT = "custom_objects.teacher_attendance";

/**
 * Parse a classroom's Legal Max Ratio string (admin-editable, e.g. "1:4")
 * into the max number of children allowed per staff member.
 * Accepts "1:4", "1/4", "1-4", "1 to 4", or a bare number "4".
 * Returns undefined when blank/unparseable so the UI can show
 * "Ratio Not Configured" instead of guessing.
 *
 * NOTE: This is no longer used by the dashboard — the hardcoded
 * per-classroom map in src/lib/classroom-ratio.ts is now the source of
 * truth for the compliance comparison. Kept for callers that still need
 * to parse the CRM field.

/**
 * PUT a partial properties update to a classroom record.
 * locationId stays in the query string only (never inside properties — that
 * 422s; never top-level in the body either — that also 422s on update-by-id).
 * Body is { properties } only.
 */
export async function updateClassroomRecord(
  classroomId: string,
  properties: Record<string, any>,
): Promise<void> {
  const locationId = getLocationId();
  const payload = { properties };
  console.log("[updateClassroomRecord] body:", JSON.stringify(payload));
  await callCrmApi(
    `/objects/custom_objects.classrooms/records/${classroomId}?locationId=${locationId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

/**
 * Resolve a classroom's human-readable name from its record id. Used to fill
 * the `classroom` text field on teacher_attendance records.
 */
async function getClassroomName(classroomId: string): Promise<string> {
  const locationId = getLocationId();
  try {
    const clsRes = await callCrmApi<any>(
      `/objects/custom_objects.classrooms/records/${classroomId}?locationId=${locationId}`,
    );
    const clsRec = clsRes?.record || clsRes;
    return (
      propVal(clsRec, "Classroom Name") ||
      propVal(clsRec, "classroom_name") ||
      propVal(clsRec, "name") ||
      clsRec?.name ||
      ""
    );
  } catch (e: any) {
    console.warn(`[getClassroomName] fetch failed for ${classroomId}: ${e?.message || e}`);
    return "";
  }
}

/**
 * Create a new teacher_attendance record (clock-IN). Leaves clock_out_time
 * empty so the open shift can be found + patched on sign-out.
 *
 * NO composite/primary field key is sent. We tried to read the object's
 * field schema (GET /objects/{key}/fields) to find the real primary key but
 * the token lacks the scope for that endpoint, and guessing the key
 * (`date__teacher`) 400s. GHL auto-generates the primary display value from
 * its own configured composite fields, so the client does not need to pass
 * it. Only the fields the center explicitly defined are written:
 * teacher, classroom, date, clock_in_time, clock_out_time.
 */
async function createTeacherAttendanceRecord(
  teacherName: string,
  classroomName: string,
  dateStr: string,
  clockInTime: string,
): Promise<string> {
  const locationId = getLocationId();
  const payload = {
    locationId,
    properties: {
      teacher: teacherName,
      classroom: classroomName,
      date: dateStr,
      clock_in_time: clockInTime,
      clock_out_time: "",
    },
  };
  console.log("[createTeacherAttendanceRecord] body:", JSON.stringify(payload));
  const res = await callCrmApi<any>(`/objects/${TEACHER_ATTENDANCE_OBJECT}/records`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const id = res?.record?.id || res?.id || res?.recordId;
  console.log(`[createTeacherAttendanceRecord] created teacher_attendance id=${id}`);
  return id;
}

/**
 * Normalize a CRM Date value to "YYYY-MM-DD". The CRM serializes Date fields
 * variously on read-back — "2026-09-24", "2026-09-24T00:00:00.000Z", or even
 * "09/24/2026" — so a strict `=== dateStr` match silently misses the open
 * record and the Sign Out path falls back to creating a NEW clock-out-only
 * record (leaving the original clock-in open forever). This normalizes both
 * sides to the bare calendar date before comparing.
 */
function normalizeCrmDate(raw: any): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  // Already "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // ISO datetime -> take the date part (use the calendar date, not UTC drift)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return s;
}

/**
 * Find today's OPEN teacher_attendance record for a given teacher + classroom:
 * one that has a clock_in_time and no clock_out_time yet. Fetch-all + filter
 * in code (the search API doesn't reliably filter on custom fields).
 *
 * Date matching is tolerant (normalizeCrmDate) so a record written with a
 * plain "YYYY-MM-DD" date is still found when the CRM returns it as a full
 * ISO datetime string on read-back — preventing the Sign Out fallback from
 * creating a redundant clock-out-only record.
 */
async function findOpenTeacherAttendanceRecord(
  teacherName: string,
  classroomName: string,
  dateStr: string,
): Promise<string | undefined> {
  const locationId = getLocationId();
  const res = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/search`,
    { method: "POST", body: JSON.stringify({ locationId, page: 1, pageLimit: 200 }) },
  );
  const all = res?.records || res?.data || [];
  const targetDate = normalizeCrmDate(dateStr);
  const open = all.filter((r: any) => {
    const teacher = String(propVal(r, "teacher") ?? "").trim();
    const classroom = String(propVal(r, "classroom") ?? "").trim();
    const date = normalizeCrmDate(propVal(r, "date"));
    const clockOut = String(propVal(r, "clock_out_time") ?? "").trim();
    const clockIn = String(propVal(r, "clock_in_time") ?? "").trim();
    return (
      teacher === teacherName &&
      (classroom === classroomName || normKey(classroom) === normKey(classroomName)) &&
      date === targetDate &&
      clockIn !== "" &&
      clockOut === ""
    );
  });
  console.log(
    `[findOpenTeacherAttendanceRecord] teacher="${teacherName}" classroom="${classroomName}" date="${dateStr}"(norm "${targetDate}") -> ${open.length} open record(s)`,
  );
  return open[0]?.id;
}

// patchTeacherAttendanceRecord, findAnyOpenTeacherShift, closeTeacherShift,
// getClassroomIdByName, and the OpenShiftInfo / BeginSessionResult /
// DuplicateOpenShift types now live in ./teacher-shift.server.ts (imported
// above) so the duplicate-open-shift guardrail is shared by both clock-in
// entry points.

/**
 * Keep current_children_signed_in in sync after an attendance event.
 * +1 for a check-in, -1 for a check-out, floored at 0. Best-effort: a
 * failure is logged but never blocks or reverts the attendance write.
 *
 * Both the read (GET record by id) and the write (PUT { properties }) use
 * the same ?locationId= query-string + { properties }-only-body pattern
 * confirmed working on the classroom-session endpoints.
 */
export async function updateClassroomSignedInCount(
  classroomId: string,
  delta: number,
): Promise<void> {
  const locationId = getLocationId();

  // 1. Read the current count (GET by record id, locationId in query string).
  let cur = 0;
  try {
    const res = await callCrmApi<any>(
      `/objects/custom_objects.classrooms/records/${classroomId}?locationId=${locationId}`,
    );
    const rec = res?.record || res;
    const raw = propVal(rec, "current_children_signed_in");
    console.log(
      `[updateClassroomSignedInCount] classroom=${classroomId} delta=${delta} raw current=${JSON.stringify(raw)} record props keys=${Object.keys(rec?.properties || rec || {}).join(",")}`,
    );
    cur = parseInt(String(raw ?? "0"), 10);
    if (Number.isNaN(cur)) cur = 0;
  } catch (e: any) {
    console.warn(
      `[updateClassroomSignedInCount] read failed for ${classroomId}; defaulting current to 0. ${e?.message || e}`,
    );
    cur = 0;
  }

  const next = Math.max(0, cur + delta);
  console.log(`[updateClassroomSignedInCount] ${cur} + ${delta} -> ${next}`);

  // 2. Write the new count (PUT, body is { properties } only — no locationId in body).
  await updateClassroomRecord(classroomId, { current_children_signed_in: next });
  console.log(
    `[updateClassroomSignedInCount] wrote current_children_signed_in=${next} to ${classroomId}`,
  );
}

/**
 * Begin a classroom session:
 *   1. Create a new teacher_attendance record (teacher, classroom, today's
 *      date, clock_in_time = now, clock_out_time empty).
 *   2. Set the classroom's current_teacher to the active teacher (live
 *      "who's here now" pointer for the dashboard/kiosk header).
 *
 * Shift times are NO LONGER written to the classrooms object — they live
 * entirely in teacher_attendance. `localTime24`/`localDate` are the kiosk's
 * LOCAL time/date (the server runs UTC, so the client is the source of
 * truth — same pattern as attendance_records.checkin_time).
 *
 * All writes are awaited (not fire-and-forget) so they land before the
 * handler returns on the edge runtime.
 */
export async function serverBeginClassroomSession(
  classroomId: string,
  teacherName: string,
  localTime24: string,
  localDate: string,
  /**
   * When true, the caller explicitly asked to switch rooms: the teacher's
   * existing open shift in the PREVIOUS classroom is closed (clock_out = now)
   * and a new one is created in the requested classroom. When false/omitted,
   * an existing open shift in the SAME classroom blocks the clock-in
   * (duplicate); an open shift in a DIFFERENT classroom is allowed through
   * (multi-classroom coverage is expected).
   */
  switchRooms?: boolean,
): Promise<BeginSessionResult> {
  const classroomName = await getClassroomName(classroomId);

  // ---- GUARDRAIL: duplicate open-shift check (SAME classroom only) ----
  // Multi-classroom clock-in is allowed, so we only check when the teacher
  // already has an open shift in THIS classroom. When they do, this is
  // IDEMPOTENT — we do NOT create a second open shift (that's the only thing
  // the guard prevents), but we DO let the teacher INTO the tracker so they
  // can reach the Sign Out button. Blocking navigation here would trap them
  // out of the only screen that can close their shift.
  const existingHere = await findOpenShiftInClassroom(teacherName, classroomName);
  if (existingHere && !switchRooms) {
    console.log(
      `[beginClassroomSession] already clocked in to "${classroomName}" since ${existingHere.clockInTime}; letting teacher in (no new record created)`,
    );
    await updateClassroomRecord(classroomId, { current_teacher: teacherName });
    return { ok: true, alreadyClockedInHere: true };
  }

  // ---- Switch rooms: close the previous open shift first ----
  if (switchRooms) {
    const existingAny = await findAnyOpenTeacherShift(teacherName);
    if (existingAny) {
      await closeTeacherShift(existingAny.id, localTime24);
      // Clear the PREVIOUS classroom's current_teacher pointer so only the new
      // room shows as staffed.
      const prevClassroomId = await getClassroomIdByName(existingAny.classroomName);
      if (prevClassroomId && prevClassroomId !== classroomId) {
        try {
          await updateClassroomRecord(prevClassroomId, { current_teacher: "" });
        } catch (e: any) {
          console.warn(
            `[beginClassroomSession] failed to clear previous classroom pointer (non-fatal): ${e?.message || e}`,
          );
        }
      }
      console.log(
        `[beginClassroomSession] switched rooms: closed shift ${existingAny.id} in "${existingAny.classroomName}"`,
      );
    }
  }

  // 1. Create the teacher_attendance (clock-in) record.
  //
  // IDEMPOTENCY RE-CHECK: the guardrail above already returns early when an
  // open shift exists, but a double-tap can fire two concurrent calls that
  // BOTH see "no open shift" before either commits (a TOCTOU race), creating
  // two duplicate records. Re-check immediately before the insert so the
  // second concurrent call finds the first one's record and skips the write.
  const recheck = await findOpenShiftInClassroom(teacherName, classroomName);
  if (recheck) {
    console.log(
      `[beginClassroomSession] idempotency re-check found open shift ${recheck.id} created concurrently; skipping duplicate insert`,
    );
    await updateClassroomRecord(classroomId, { current_teacher: teacherName });
    return { ok: true, alreadyClockedInHere: true };
  }
  await createTeacherAttendanceRecord(teacherName, classroomName, localDate, localTime24);

  // 2. Update the classroom's live current_teacher pointer only.
  await updateClassroomRecord(classroomId, { current_teacher: teacherName });

  return { ok: true };
}

/**
 * End a classroom session:
 *   1. Find the OPEN teacher_attendance record for this teacher + classroom
 *      (clock_in_time set, clock_out_time blank) and PATCH its clock_out_time
 *      to now — do NOT create a new record.
 *      If no open record is found (edge case), fall back to creating a
 *      clock-out-only record (same fallback pattern as the kids' attendance
 *      fix) and log that the fallback path was hit.
 *   2. Clear the classroom's current_teacher so the room shows "Unassigned".
 *
 * Shift times are NO LONGER written to the classrooms object.
 *
 * LOOKUP: uses findOpenShiftInClassroom — the SAME date-agnostic helper the
 * clock-in guard uses — so the open record is always found regardless of how
 * the CRM serialized the date field on read-back. The previous
 * findOpenTeacherAttendanceRecord helper filtered on date === targetDate,
 * but the CRM returns Date fields inconsistently (plain YYYY-MM-DD vs full
 * ISO datetime vs MM/DD/YYYY), so the match silently missed and the fallback
 * created a STRAY clock-out-only record — leaving the original clock-in open
 * forever (the exact "no Clock In, only Clock Out" bad-data row reported).
 */
export async function serverEndClassroomSession(
  classroomId: string,
  teacherName: string,
  localTime24: string,
  localDate: string,
): Promise<{ ok: boolean }> {
  const classroomName = await getClassroomName(classroomId);

  // 1. Patch the open teacher_attendance record's clock_out_time.
  //    findOpenShiftInClassroom is date-agnostic (matches teacher + classroom
  //    + clock_in set + clock_out blank) — the proven helper already used by
  //    the clock-in guard. This guarantees we find and close the REAL open
  //    shift instead of falling back to a stray clock-out-only record.
  const openShift = await findOpenShiftInClassroom(teacherName, classroomName);
  if (openShift) {
    await patchTeacherAttendanceRecord(openShift.id, { clock_out_time: localTime24 });
    console.log(
      `[endClassroomSession] patched clock_out_time on teacher_attendance ${openShift.id} (clocked in since ${openShift.clockInTime})`,
    );
  } else {
    // Fallback: no open record found — create a clock-out-only record.
    // Same as createTeacherAttendanceRecord: omit any composite/primary key
    // (GHL auto-generates it); send only the explicitly-defined fields.
    console.warn(
      "[endClassroomSession] fallback: no open teacher_attendance record found, creating clock-out-only record",
    );
    const locationId = getLocationId();
    const payload = {
      locationId,
      properties: {
        teacher: teacherName,
        classroom: classroomName,
        date: localDate,
        clock_in_time: "",
        clock_out_time: localTime24,
      },
    };
    console.log("[endClassroomSession] fallback body:", JSON.stringify(payload));
    await callCrmApi(`/objects/${TEACHER_ATTENDANCE_OBJECT}/records`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // 2. Clear the classroom's live current_teacher pointer.
  await updateClassroomRecord(classroomId, { current_teacher: "" });

  return { ok: true };
}

/**
 * Dashboard overview: fetch all classrooms (fresh, uncached) and return
 * each with its live staffing + signed-in count + ratio status.
 *
 * ratio status:
 *   - "in"   : current_children_signed_in <= classroom_ratio (green)
 *   - "over" : current_children_signed_in >  classroom_ratio (red)
 *   - "none" : classroom_ratio is missing/0 (amber — no ratio configured)
 *
 * classroom_ratio is DISPLAY ONLY — never written by this app.
 * timein/timeout are no longer read from classrooms (shift history lives in
 * teacher_attendance).
 */
export async function serverGetDashboard(): Promise<DashboardClassroom[]> {
  const locationId = getLocationId();

  // Today's date at the center (America/Chicago) for matching teacher_attendance
  // records. The server runs UTC, so we compute the center-local date here.
  const todayStr = (() => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    return `${y}-${m}-${d}`;
  })();

  // Fetch classrooms, children, and today's teacher_attendance in parallel.
  // Children are needed to count enrolled children per classroom — same
  // source as the kiosk roster header ("X Total"). teacher_attendance
  // provides the staff clock-in/out times shown in the Staff column.
  const [classListRes, childListRes, teacherAttRes] = await Promise.all([
    callCrmApi<{ records?: any[]; data?: any[] }>(
      `/objects/custom_objects.classrooms/records/search`,
      {
        method: "POST",
        body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }),
      },
    ),
    callCrmApi<{ records?: any[]; data?: any[] }>(
      `/objects/custom_objects.children/records/search`,
      {
        method: "POST",
        body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
      },
    ),
    callCrmApi<{ records?: any[]; data?: any[] }>(
      `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/search`,
      {
        method: "POST",
        body: JSON.stringify({ locationId, page: 1, pageLimit: 200 }),
      },
    ),
  ]);

  const allRecords = classListRes?.records || classListRes?.data || [];
  console.log(`[getDashboard] total classrooms: ${allRecords.length}`);

  // Build the classroom list first, with id + normalized name (same matching
  // logic as serverGetClassroomRoster: a child's classroom field can hold the
  // classroom's id OR its name).
  const classrooms = allRecords
    .map((r: any) => {
      const ratio = parseInt(String(propVal(r, "classroom_ratio") ?? "0"), 10) || 0;
      const cap = parseInt(String(propVal(r, "capacity") ?? "0"), 10) || 0;
      const teacher = String(propVal(r, "current_teacher") ?? "").trim();
      const legalMaxRatio = String(
        propVal(r, "legal_max_ratio") ?? propVal(r, "Legal Max Ratio") ?? "",
      ).trim();
      const name =
        propVal(r, "classroom_name") ||
        propVal(r, "Classroom Name") ||
        `Classroom ${r.id.slice(-4)}`;
      return {
        id: r.id,
        name,
        nameKey: normKey(name),
        ageGroup: propVal(r, "age_group") || propVal(r, "Age Group") || "",
        currentTeacher: teacher,
        // EVERY teacher currently clocked in here — populated below from
        // open teacher_attendance shifts (authoritative multi-teacher list).
        currentTeachers: [] as { name: string; clockInTime?: string | number }[],
        // staffCount is computed below from OPEN teacher_attendance shifts
        // (clock_in set, no clock_out) — the staff physically present right
        // now. Initialized to 0; set in the teacher_attendance loop.
        staffCount: 0,
        // Computed below from each child's active_attendance_id (the true
        // live signed-in count), NOT the stored current_children_signed_in
        // counter which drifts from reality after failed/missed updates.
        // Initialized to 0 here; incremented in the children loop.
        currentChildrenSignedIn: 0,
        enrolledCount: 0,
        classroomRatio: ratio,
        capacity: cap,
        legalMaxRatio,
        // Placeholder — recomputed after the children + staff loops.
        ratioStatus: "in" as "in" | "over" | "none" | "empty",
        // Teacher shift times — populated from teacher_attendance below.
        teacherClockInTime: undefined as string | number | undefined,
        teacherClockOutTime: undefined as string | number | undefined,
      } as DashboardClassroom & { nameKey: string };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Count enrolled + currently-signed-in children per classroom from the
  // SAME children fetch (so Enrolled and Students can never drift apart —
  // both derive from one fresh read of custom_objects.children).
  //
  // A child matches a classroom when its `Classroom` field equals the
  // classroom id OR its normalized name (mirrors serverGetClassroomRoster).
  // Status must be enrolled/active/blank.
  //
  // A child is currently signed in iff their active_attendance_id field is
  // set (open record) — the same open-record logic signEvent uses: check-in
  // writes it, check-out clears it. This is authoritative and never drifts.
  const childRecords = childListRes?.records || childListRes?.data || [];
  for (const r of childRecords) {
    const status = String(propVal(r, "Status") ?? "")
      .trim()
      .toLowerCase();
    if (status !== "" && status !== "enrolled" && status !== "active") continue;

    const childClassroomRaw = String(
      propVal(r, "Classroom") ?? propVal(r, "Classroom Name") ?? "",
    ).trim();
    if (childClassroomRaw === "") continue;
    const childKey = normKey(childClassroomRaw);

    for (const cls of classrooms) {
      if (childClassroomRaw === cls.id || childKey === cls.nameKey) {
        cls.enrolledCount += 1;
        const activeAttId = propVal(r, "active_attendance_id") || propVal(r, "activeAttendanceId");
        if (activeAttId) cls.currentChildrenSignedIn += 1;
        break;
      }
    }
  }

  // Match today's teacher_attendance records to classrooms to surface the
  // staff clock-in/out times. A teacher_attendance record's `classroom`
  // field holds the classroom's NAME (text), so we match on normalized name.
  // We prefer the OPEN shift (no clock_out_time) for the live "clocked in"
  // display; if none is open, fall back to the most recent completed shift
  // of the day so a clocked-out teacher's last shift times still show.
  const teacherAttRecords = teacherAttRes?.records || teacherAttRes?.data || [];
  for (const cls of classrooms) {
    const matching = teacherAttRecords.filter((r: any) => {
      const recClassroom = String(propVal(r, "classroom") ?? "").trim();
      const recDate = String(propVal(r, "date") ?? "").trim();
      return (
        (recClassroom === cls.name || normKey(recClassroom) === cls.nameKey) && recDate === todayStr
      );
    });
    if (matching.length === 0) continue;

    // Open shifts = clock_in set, no clock_out yet. Each open shift is a
    // staff member physically present right now — this drives the ratio
    // numerator (staff present : children present) AND the multi-teacher
    // "Staffed By" list.
    const openShifts = matching.filter((r: any) => {
      const ci = String(propVal(r, "clock_in_time") ?? "").trim();
      const co = String(propVal(r, "clock_out_time") ?? "").trim();
      return ci !== "" && co === "";
    });
    cls.staffCount = openShifts.length;
    cls.currentTeachers = openShifts.map((r: any) => ({
      name: String(propVal(r, "teacher") ?? "").trim(),
      clockInTime: propRaw(r, "clock_in_time"),
    }));

    if (openShifts.length > 0) {
      // Show the first open shift's clock-in time in the Staff column.
      cls.teacherClockInTime = propRaw(openShifts[0], "clock_in_time");
      cls.teacherClockOutTime = propRaw(openShifts[0], "clock_out_time");
      continue;
    }

    // No open shift — fall back to the most recent completed shift so a
    // clocked-out teacher's last shift times still show in the Staff column.
    let best: any = null;
    for (const r of matching) {
      const co = String(propVal(r, "clock_out_time") ?? "").trim();
      if (co === "") continue;
      if (!best) {
        best = r;
        continue;
      }
      const a = propRaw(r, "clock_out_time");
      const b = propRaw(best, "clock_out_time");
      if (typeof a === "number" && typeof b === "number" && a > b) best = r;
    }
    if (best) {
      cls.teacherClockInTime = propRaw(best, "clock_in_time");
      cls.teacherClockOutTime = propRaw(best, "clock_out_time");
    }
  }

  // Real-time compliance ratio = staff present : children present.
  //
  // The legal max-children-per-staff is HARDCODED per classroom name
  // (INFANT=8, TODDLER=7, PRE-SCHOOL=10, SCHOOL-AGE=14) from
  // src/lib/classroom-ratio.ts — NOT read from the CRM (which was stale/missing
  // and caused every room to show "Ratio Not Configured"). The hardcoded map is
  // the source of truth for the compliance comparison.
  //
  // Status rules (per the center's spec):
  //   - zero children present            → "empty" (No Children Present)
  //   - children present, zero staff     → "over"  (always Over Ratio)
  //   - children present, staff present  → "over" when children/staff > max,
  //                                          else "in" (Within Ratio)
  //   - max not configured for this room → "none"  (Ratio Not Configured)
  for (const cls of classrooms) {
    const max = getMaxChildrenPerStaff(cls.name);
    cls.maxChildrenPerStaff = max;
    cls.ratioStatus = computeRatioStatus(cls.currentChildrenSignedIn, cls.staffCount, max);
  }

  console.log(
    `[getDashboard] staff:children / legal-max: ${classrooms
      .map(
        (c) =>
          `${c.name}=${c.staffCount}:${c.currentChildrenSignedIn}/max=${c.legalMaxRatio || "-"}(${c.ratioStatus})`,
      )
      .join(", ")}`,
  );

  // Strip the internal nameKey before returning.
  return classrooms.map(({ nameKey: _nameKey, ...rest }) => rest);
}
