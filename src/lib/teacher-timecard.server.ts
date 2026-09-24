/**
 * Staff Timecard server-side operations (custom_objects.teacher_attendance).
 *
 * Reuses the EXACT same teacher_attendance logic & schema:
 *   - fields: teacher, classroom, date, clock_in_time, clock_out_time
 *   - create: POST with { locationId, properties: { teacher, classroom, date, clock_in_time, clock_out_time } }
 *   - update/patch: PUT to /objects/.../records/{id}?locationId=... with { properties }
 *   - delete: DELETE to /objects/.../records/{id}?locationId=...
 *
 * When adding a clock-out to an already open shift, we lookup the teacher's
 * open record for that date (has clock_in_time, no clock_out_time) and PATCH it.
 *
 * Server-only module.
 */
import type { TeacherTimecardEntry } from "./kiosk.types";
import { callCrmApi, getLocationId, propVal, propRaw, normKey } from "./crm-api";
import { crmTimeToMinutes, formatElapsedHours, getLocalTime24, getLocalDate } from "./kiosk-time";
import {
  findOpenShiftInClassroom,
  closeTeacherShift,
  type DuplicateOpenShift,
} from "./teacher-shift.server";

const TEACHER_ATTENDANCE_OBJECT = "custom_objects.teacher_attendance";

/**
 * List teacher attendance records for a specific date (YYYY-MM-DD).
 * Fetches all teacher_attendance records and filters in code by date.
 */
export async function serverListTeacherTimecards(date: string): Promise<TeacherTimecardEntry[]> {
  const locationId = getLocationId();
  const target = String(date).trim();

  const res = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
    },
  );

  const all = res?.records || res?.data || [];
  const entries: TeacherTimecardEntry[] = [];

  const sameDay = (raw: any): boolean => {
    if (raw == null) return false;
    const s = String(raw).trim();
    if (s === target) return true;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0] === target;
    return false;
  };

  const isToday = target === getLocalDate();
  const currentMinutesNow = isToday ? (crmTimeToMinutes(getLocalTime24()) ?? 0) : null;

  for (const rec of all) {
    const recDate = propVal(rec, "date") || propVal(rec, "Date");
    if (!sameDay(recDate)) continue;

    const teacherName =
      propVal(rec, "teacher") ||
      propVal(rec, "Teacher") ||
      propVal(rec, "teacher_name") ||
      "Staff Member";
    const classroomName =
      propVal(rec, "classroom") ||
      propVal(rec, "Classroom") ||
      propVal(rec, "classroom_name") ||
      "";

    const inRaw = propRaw(rec, "clock_in_time") ?? propVal(rec, "clock_in_time") ?? "";
    const outRaw = propRaw(rec, "clock_out_time") ?? propVal(rec, "clock_out_time") ?? "";

    const inMinutes = crmTimeToMinutes(inRaw);
    const outMinutes = crmTimeToMinutes(outRaw);

    const hasIn = inRaw !== "" && inRaw !== null && inRaw !== undefined;
    const hasOut =
      outRaw !== "" && outRaw !== null && outRaw !== undefined && String(outRaw).trim() !== "";
    const isOpen = hasIn && !hasOut;

    let totalMinutes: number | undefined;
    let hoursFormatted: string | undefined;

    if (inMinutes !== null) {
      if (hasOut && outMinutes !== null) {
        let diff = outMinutes - inMinutes;
        if (diff < 0) diff += 1440; // overnight boundary defense
        totalMinutes = diff;
        hoursFormatted = formatElapsedHours(diff);
      } else if (isOpen && currentMinutesNow !== null) {
        let diff = currentMinutesNow - inMinutes;
        if (diff < 0) diff = 0;
        totalMinutes = diff;
        hoursFormatted = `${formatElapsedHours(diff)} (live)`;
      }
    }

    entries.push({
      id: rec.id,
      teacherName,
      classroomName,
      date: target,
      clockInTime: inRaw,
      clockOutTime: outRaw,
      isOpen,
      totalMinutes,
      hoursFormatted: hoursFormatted || "—",
    });
  }

  // Sort by teacher name ascending, then by clock-in time
  entries.sort((a, b) => {
    const nameCmp = a.teacherName.localeCompare(b.teacherName);
    if (nameCmp !== 0) return nameCmp;
    const aIn = crmTimeToMinutes(a.clockInTime) ?? 9999;
    const bIn = crmTimeToMinutes(b.clockInTime) ?? 9999;
    return aIn - bIn;
  });

  return entries;
}

/**
 * Find today's open record for teacher on date.
 */
async function findOpenRecordForTeacher(
  teacherName: string,
  dateStr: string,
  classroomName?: string,
): Promise<{ id: string; properties: any } | null> {
  const locationId = getLocationId();
  const res = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
    },
  );
  const all = res?.records || res?.data || [];
  const targetDate = dateStr.trim();

  for (const r of all) {
    const t = String(propVal(r, "teacher") ?? "").trim();
    const d = String(propVal(r, "date") ?? "").trim();
    const clockOut = String(propVal(r, "clock_out_time") ?? "").trim();
    const clockIn = String(propVal(r, "clock_in_time") ?? "").trim();
    const cls = String(propVal(r, "classroom") ?? "").trim();

    const matchesTeacher = t.toLowerCase() === teacherName.trim().toLowerCase();
    const matchesDate = d === targetDate;
    const isOpen = clockIn !== "" && clockOut === "";

    if (matchesTeacher && matchesDate && isOpen) {
      if (!classroomName || cls === classroomName || normKey(cls) === normKey(classroomName)) {
        return { id: r.id, properties: r.properties || r };
      }
    }
  }
  return null;
}

/**
 * Create or update a teacher clock-in/out entry.
 * Follows the exact same open-record pattern as kiosk shift management:
 * 1. If only clock-in provided:
 *    - checks if there's an existing open record for that teacher+date.
 *    - if found, updates that record's room and clock_in_time.
 *    - if not found, creates a new record.
 * 2. If clock-in AND clock-out provided:
 *    - writes complete record (or updates existing open record if one existed).
 * 3. If ONLY clock-out provided (e.g. closing an open shift):
 *    - finds open record and PATCHes clock_out_time onto it.
 *    - fallback: creates clock-out only record.
 */
export async function serverCreateTeacherTimecard(params: {
  teacherName: string;
  classroomName: string;
  date: string;
  clockInTime?: string;
  clockOutTime?: string;
}): Promise<{ ok: boolean; recordId: string; duplicateOpenShift?: DuplicateOpenShift }> {
  const locationId = getLocationId();
  const dateStr = params.date.trim();
  const teacher = params.teacherName.trim();
  const classroom = params.classroomName.trim();
  const clockIn = params.clockInTime?.trim() || "";
  const clockOut = params.clockOutTime?.trim() || "";

  // ---- GUARDRAIL: duplicate open-shift check (SAME classroom only) ----
  // Multi-classroom clock-in is allowed, so we only block when the teacher
  // already has an open shift in THIS classroom. A complete record
  // (clockIn + clockOut both set) is a historical backfill and allowed through.
  if (clockIn && !clockOut) {
    const existing = await findOpenShiftInClassroom(teacher, classroom);
    if (existing) {
      console.warn(
        `[createTeacherTimecard] blocked duplicate open shift: ${teacher} already clocked in to "${classroom}"`,
      );
      return {
        ok: false,
        recordId: "",
        duplicateOpenShift: {
          teacherName: existing.teacherName,
          classroomName: existing.classroomName,
          clockInTime: existing.clockInTime,
          recordId: existing.id,
        },
      };
    }
  }

  // Check if there is an existing open record for this teacher and date
  const openRec = await findOpenRecordForTeacher(teacher, dateStr);

  if (!clockIn && clockOut) {
    // Only clock-out provided -> close open shift
    if (openRec) {
      await callCrmApi(
        `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/${openRec.id}?locationId=${locationId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            properties: {
              clock_out_time: clockOut,
            },
          }),
        },
      );
      return { ok: true, recordId: openRec.id };
    } else {
      // Fallback: create clock-out-only record
      const payload = {
        locationId,
        properties: {
          teacher,
          classroom,
          date: dateStr,
          clock_in_time: "",
          clock_out_time: clockOut,
        },
      };
      const res = await callCrmApi<any>(`/objects/${TEACHER_ATTENDANCE_OBJECT}/records`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return { ok: true, recordId: res?.record?.id || res?.id || "" };
    }
  }

  // If we have an open record and we are submitting a clock-in + clock-out (or updating clock-in)
  if (openRec && !openRec.properties?.clock_out_time) {
    const updateProps: Record<string, any> = {
      classroom,
      date: dateStr,
    };
    if (clockIn) updateProps.clock_in_time = clockIn;
    if (clockOut) updateProps.clock_out_time = clockOut;

    await callCrmApi(
      `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/${openRec.id}?locationId=${locationId}`,
      {
        method: "PUT",
        body: JSON.stringify({ properties: updateProps }),
      },
    );
    return { ok: true, recordId: openRec.id };
  }

  // Otherwise create fresh record
  const payload = {
    locationId,
    properties: {
      teacher,
      classroom,
      date: dateStr,
      clock_in_time: clockIn,
      clock_out_time: clockOut,
    },
  };

  const res = await callCrmApi<any>(`/objects/${TEACHER_ATTENDANCE_OBJECT}/records`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const recordId = res?.record?.id || res?.id || res?.recordId || "";
  return { ok: true, recordId };
}

/**
 * Edit an existing teacher attendance record by ID.
 * Updates room, date, clock_in_time, or clock_out_time.
 */
export async function serverEditTeacherTimecard(params: {
  recordId: string;
  classroomName?: string;
  date?: string;
  clockInTime?: string;
  clockOutTime?: string;
}): Promise<{ ok: boolean }> {
  const locationId = getLocationId();
  const properties: Record<string, any> = {};

  if (params.classroomName !== undefined) properties.classroom = params.classroomName.trim();
  if (params.date !== undefined && params.date.trim()) properties.date = params.date.trim();
  if (params.clockInTime !== undefined) properties.clock_in_time = params.clockInTime.trim();
  if (params.clockOutTime !== undefined) properties.clock_out_time = params.clockOutTime.trim();

  await callCrmApi(
    `/objects/${TEACHER_ATTENDANCE_OBJECT}/records/${params.recordId}?locationId=${locationId}`,
    {
      method: "PUT",
      body: JSON.stringify({ properties }),
    },
  );

  return { ok: true };
}

/**
 * Delete a teacher attendance record by ID.
 */
export async function serverDeleteTeacherTimecard(recordId: string): Promise<{ ok: boolean }> {
  await callCrmApi(`/objects/${TEACHER_ATTENDANCE_OBJECT}/records/${recordId}`, {
    method: "DELETE",
  });
  return { ok: true };
}

/**
 * Bulk delete teacher attendance records by ID.
 * Loops through each recordId and deletes it individually (the CRM delete
 * endpoint is single-record). Returns a per-record result summary.
 */
export async function serverBulkDeleteTeacherTimecards(
  recordIds: string[],
): Promise<{ ok: boolean; deleted: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let deleted = 0;
  let failed = 0;

  for (const id of recordIds) {
    try {
      await callCrmApi(`/objects/${TEACHER_ATTENDANCE_OBJECT}/records/${id}`, {
        method: "DELETE",
      });
      deleted++;
    } catch (e: any) {
      failed++;
      errors.push(`${id}: ${e?.message || "failed"}`);
      console.warn(`[bulkDeleteTeacher] failed to delete ${id}`, e?.message || e);
    }
  }

  return { ok: failed === 0, deleted, failed, errors };
}
