/**
 * Weekly DCF attendance report — server-only helpers.
 *
 * Builds a Wisconsin DCF Daily Attendance Record (DCF-F-62/2438)-style weekly
 * report for a single classroom: one row per enrolled child with In/Out time
 * pairs for each day of the week (Sun–Sat), plus a staff/teacher schedule
 * table for the same week.
 *
 * Data sources (all fetched server-side, fetch-all + filter in code):
 *   - custom_objects.children          → enrolled roster for the classroom +
 *                                        each child's DOB (child_date_of_birth)
 *   - custom_objects.attendance_records → check-in/out times per child per day
 *                                        (matched by the child association /
 *                                        child_name, filtered to the week range)
 *   - custom_objects.teacher_attendance → clock-in/out times per teacher per day
 *                                        for that classroom
 *
 * "Total Days Present" counts a day as present ONLY when the child has a
 * check-in for that day — a child still signed in today (open record, no
 * check-out yet) counts as present for today, not partial.
 */
import type { WeeklyDcfReport, WeeklyChildRow, WeeklyStaffRow } from "./weekly-dcf.types";
import { callCrmApi, getLocationId, normKey, propVal, propRaw } from "./crm-api";
import { ymdFrom, aggregateChildAttendance, buildChildDays } from "./weekly-dcf-agg";

/** Normalize an arbitrary date-ish value to "YYYY-MM-DD". Returns "" if unparseable. */
function ymdFrom(raw: any): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

/** Format a DOB value as "MM/DD/YYYY". Returns "" when missing/invalid. */
function formatDob(raw: any): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}/${m[1]}`;
  m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
  return s;
}

/** Pull the DOB value from a child record. */
function childDobRaw(rec: any): string {
  return (
    propVal(rec, "child_date_of_birth") ||
    propVal(rec, "Child Date of Birth") ||
    propVal(rec, "Date of Birth") ||
    propVal(rec, "DOB") ||
    propVal(rec, "Birthday") ||
    propVal(rec, "Birth Date") ||
    propVal(rec, "date_of_birth") ||
    propVal(rec, "birth_date") ||
    ""
  );
}

/**
 * Compute the Sunday–Saturday week (as "YYYY-MM-DD" dates) containing the
 * given anchor date. Returns { weekStart, weekEnd, weekDates[7] } where
 * weekDates[0] = Sunday … weekDates[6] = Saturday. Week starts on SUNDAY
 * (US calendar week, matching the app's en-US Intl usage elsewhere).
 */
export function computeWeek(anchor: string): {
  weekStart: string;
  weekEnd: string;
  weekDates: string[];
} {
  const [y, m, d] = anchor.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const day = base.getUTCDay(); // 0 = Sunday
  const start = new Date(base);
  start.setUTCDate(base.getUTCDate() - day);
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const wd = new Date(start);
    wd.setUTCDate(start.getUTCDate() + i);
    weekDates.push(wd.toISOString().slice(0, 10));
  }
  return {
    weekStart: weekDates[0],
    weekEnd: weekDates[6],
    weekDates,
  };
}

/**
 * Build the weekly DCF report for a classroom.
 *
 * @param classroomId  The classroom record id.
 * @param anchorDate   "YYYY-MM-DD" — any date within the desired week. Defaults
 *                     to today (America/Chicago) when omitted.
 */
export async function serverGetWeeklyDcfReport(
  classroomId: string,
  anchorDate?: string,
): Promise<WeeklyDcfReport> {
  const locationId = getLocationId();

  // Resolve the anchor date (America/Chicago today when not provided).
  let anchor = (anchorDate || "").trim();
  if (!anchor) {
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
    anchor = `${y}-${m}-${d}`;
  }

  const { weekStart, weekEnd, weekDates } = computeWeek(anchor);
  const weekDateSet = new Set(weekDates);

  // Parallel fetch: classroom record, children, attendance_records, teacher_attendance.
  const [clsRes, childRes, attRes, staffRes] = await Promise.all([
    callCrmApi<any>(
      `/objects/custom_objects.classrooms/records/${classroomId}?locationId=${locationId}`,
    ).catch(() => null),
    callCrmApi<{ records?: any[]; data?: any[] }>(
      `/objects/custom_objects.children/records/search`,
      {
        method: "POST",
        body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
      },
    ),
    callCrmApi<{ records?: any[]; data?: any[] }>(
      `/objects/custom_objects.attendance_records/records/search`,
      {
        method: "POST",
        body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
      },
    ),
    callCrmApi<{ records?: any[]; data?: any[] }>(
      `/objects/custom_objects.teacher_attendance/records/search`,
      {
        method: "POST",
        body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
      },
    ),
  ]);

  // Resolve classroom display name.
  const clsRec = clsRes?.record || clsRes;
  const classroomName =
    propVal(clsRec, "classroom_name") ||
    propVal(clsRec, "Classroom Name") ||
    propVal(clsRec, "name") ||
    clsRec?.name ||
    "Classroom";

  // ---- Enrolled children for this classroom (same matching as roster) ----
  const childRecords = childRes?.records || childRes?.data || [];
  const enrolledChildren: {
    id: string;
    name: string;
    studentId: string;
    classroom: string;
    dob: string;
  }[] = [];

  for (const r of childRecords) {
    const status = String(propVal(r, "Status") ?? "")
      .trim()
      .toLowerCase();
    const isEnrolled = status === "" || status === "enrolled" || status === "active";
    if (!isEnrolled) continue;

    const childClassroomRaw = String(
      propVal(r, "Classroom") ?? propVal(r, "Classroom Name") ?? "",
    ).trim();
    const matchesClassroom =
      childClassroomRaw !== "" &&
      (normKey(childClassroomRaw) === normKey(classroomName) ||
        normKey(childClassroomRaw) === normKey(classroomId));

    if (!matchesClassroom) continue;

    enrolledChildren.push({
      id: r.id,
      name: propVal(r, "Child Name") || propVal(r, "name") || `Child ${r.id.slice(-4)}`,
      studentId: propVal(r, "Student ID") || "",
      classroom: classroomName,
      dob: formatDob(childDobRaw(r)),
    });
  }

  enrolledChildren.sort((a, b) => a.name.localeCompare(b.name));

  // ---- Attendance records for the week, grouped by child id ----
  // Each attendance_records row contributes its own In/Out pair (the
  // multi-cycle model creates separate rows for same-day sign-out/sign-in),
  // sorted chronologically and capped at 4 pairs per day.
  const attRecords = attRes?.records || attRes?.data || [];
  const childIdByName = new Map<string, string>();
  for (const c of enrolledChildren) childIdByName.set(c.name.toLowerCase().trim(), c.id);

  const attByChild = aggregateChildAttendance(attRecords, weekDateSet, childIdByName, {
    classroomName,
    classroomId,
  });

  // ---- Build child rows ----
  const children: WeeklyChildRow[] = enrolledChildren.map((c) => {
    const { days, totalDaysPresent } = buildChildDays(attByChild.get(c.id) || new Map(), weekDates);
    return {
      id: c.id,
      name: c.name,
      studentId: c.studentId,
      classroom: c.classroom,
      dob: c.dob,
      days,
      totalDaysPresent,
    };
  });

  // ---- Teacher attendance for this classroom for the week ----
  const staffRecords = staffRes?.records || staffRes?.data || [];
  // teacherName(lower) -> date -> {in, out}
  const staffByName = new Map<
    string,
    Map<string, { clockInTime?: any; clockOutTime?: any; present: boolean }>
  >();

  for (const rec of staffRecords) {
    const recDate = propVal(rec, "date") || propVal(rec, "Date");
    const ymd = ymdFrom(recDate);
    if (!ymd || !weekDateSet.has(ymd)) continue;

    const recClassroom = String(
      propVal(rec, "classroom") ?? propVal(rec, "Classroom") ?? "",
    ).trim();
    const matchesRoom =
      !recClassroom ||
      normKey(recClassroom) === normKey(classroomName) ||
      normKey(recClassroom) === normKey(classroomId);
    if (!matchesRoom) continue;

    const teacherName =
      propVal(rec, "teacher") || propVal(rec, "Teacher") || propVal(rec, "teacher_name") || "";
    if (!teacherName) continue;

    const inRaw = propRaw(rec, "clock_in_time");
    const outRaw = propRaw(rec, "clock_out_time");
    const hasIn = inRaw !== undefined && inRaw !== null && String(inRaw).trim() !== "";

    const dayMap = staffByName.get(teacherName.toLowerCase().trim()) || new Map();
    const existing = dayMap.get(ymd);
    dayMap.set(ymd, {
      clockInTime: hasIn ? inRaw : existing?.clockInTime,
      clockOutTime:
        outRaw !== undefined && outRaw !== null && String(outRaw).trim() !== ""
          ? outRaw
          : existing?.clockOutTime,
      present: hasIn || existing?.present || false,
    });
    staffByName.set(teacherName.toLowerCase().trim(), dayMap);
  }

  const staff: WeeklyStaffRow[] = [];
  for (const [nameKey, dayMap] of staffByName) {
    // Recover the original-cased name from the first matching record.
    const originalName =
      staffRecords.find(
        (r) =>
          (propVal(r, "teacher") || propVal(r, "Teacher") || propVal(r, "teacher_name") || "")
            .toLowerCase()
            .trim() === nameKey,
      )?.properties?.teacher || nameKey;

    let totalDaysWorked = 0;
    const days = weekDates.map((date) => {
      const day = dayMap.get(date);
      const present = Boolean(day?.present);
      if (present) totalDaysWorked++;
      return {
        date,
        clockInTime: day?.clockInTime,
        clockOutTime: day?.clockOutTime,
        present,
      };
    });
    staff.push({
      id: nameKey,
      teacherName: originalName || nameKey,
      days,
      totalDaysWorked,
    });
  }
  staff.sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  const childDaysPresent = children.reduce((sum, c) => sum + c.totalDaysPresent, 0);
  const staffDaysWorked = staff.reduce((sum, s) => sum + s.totalDaysWorked, 0);

  return {
    classroomId,
    classroomName,
    weekStart,
    weekEnd,
    weekDates,
    generatedAt: new Date().toISOString(),
    children,
    staff,
    totals: {
      enrolled: children.length,
      childDaysPresent,
      staffDaysWorked,
    },
  };
}

/**
 * Build the center-wide weekly DCF report for Main Book across all classrooms
 * (or optionally filtered to specific classrooms).
 */
export async function serverGetMainBookWeeklyDcfReport(opts?: {
  anchorDate?: string;
  classrooms?: string[];
}): Promise<WeeklyDcfReport> {
  const locationId = getLocationId();

  let anchor = (opts?.anchorDate || "").trim();
  if (!anchor) {
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
    anchor = `${y}-${m}-${d}`;
  }

  const { weekStart, weekEnd, weekDates } = computeWeek(anchor);
  const weekDateSet = new Set(weekDates);

  const [classListRes, childRes, attRes, staffRes] = await Promise.all([
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
      `/objects/custom_objects.attendance_records/records/search`,
      {
        method: "POST",
        body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
      },
    ),
    callCrmApi<{ records?: any[]; data?: any[] }>(
      `/objects/custom_objects.teacher_attendance/records/search`,
      {
        method: "POST",
        body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
      },
    ),
  ]);

  // Map classroom id -> display name
  const classNameById = new Map<string, string>();
  const classRecords = classListRes?.records || classListRes?.data || [];
  for (const cls of classRecords) {
    const name =
      propVal(cls, "classroom_name") ||
      propVal(cls, "Classroom Name") ||
      propVal(cls, "name") ||
      "";
    if (cls.id && name) classNameById.set(cls.id, name);
  }

  const filterSet = new Set(
    (opts?.classrooms || [])
      .map((c) => c.trim())
      .filter((c) => c && c.toLowerCase() !== "all")
      .map(normKey),
  );

  const childRecords = childRes?.records || childRes?.data || [];
  const enrolledChildren: {
    id: string;
    name: string;
    studentId: string;
    classroom: string;
    dob: string;
  }[] = [];

  for (const r of childRecords) {
    const status = String(propVal(r, "Status") ?? "")
      .trim()
      .toLowerCase();
    const isEnrolled = status === "" || status === "enrolled" || status === "active";
    if (!isEnrolled) continue;

    const rawRoom = String(propVal(r, "Classroom") ?? propVal(r, "Classroom Name") ?? "").trim();
    const resolvedRoom = classNameById.get(rawRoom) || rawRoom;

    if (filterSet.size > 0) {
      const match = filterSet.has(normKey(resolvedRoom)) || filterSet.has(normKey(rawRoom));
      if (!match) continue;
    }

    enrolledChildren.push({
      id: r.id,
      name: propVal(r, "Child Name") || propVal(r, "name") || `Child ${r.id.slice(-4)}`,
      studentId: propVal(r, "Student ID") || "",
      classroom: resolvedRoom,
      dob: formatDob(childDobRaw(r)),
    });
  }

  enrolledChildren.sort((a, b) => a.name.localeCompare(b.name));

  // Center-wide: no classroom filter — every child's records across all rooms.
  const attRecords = attRes?.records || attRes?.data || [];
  const childIdByName = new Map<string, string>();
  for (const c of enrolledChildren) childIdByName.set(c.name.toLowerCase().trim(), c.id);

  const attByChild = aggregateChildAttendance(attRecords, weekDateSet, childIdByName);

  const children: WeeklyChildRow[] = enrolledChildren.map((c) => {
    const { days, totalDaysPresent } = buildChildDays(attByChild.get(c.id) || new Map(), weekDates);
    return {
      id: c.id,
      name: c.name,
      studentId: c.studentId,
      classroom: c.classroom,
      dob: c.dob,
      days,
      totalDaysPresent,
    };
  });

  const staffRecords = staffRes?.records || staffRes?.data || [];
  const staffByName = new Map<
    string,
    Map<string, { clockInTime?: any; clockOutTime?: any; present: boolean }>
  >();

  for (const rec of staffRecords) {
    const recDate = propVal(rec, "date") || propVal(rec, "Date");
    const ymd = ymdFrom(recDate);
    if (!ymd || !weekDateSet.has(ymd)) continue;

    const teacherName =
      propVal(rec, "teacher") || propVal(rec, "Teacher") || propVal(rec, "teacher_name") || "";
    if (!teacherName) continue;

    const inRaw = propRaw(rec, "clock_in_time");
    const outRaw = propRaw(rec, "clock_out_time");
    const hasIn = inRaw !== undefined && inRaw !== null && String(inRaw).trim() !== "";

    const dayMap = staffByName.get(teacherName.toLowerCase().trim()) || new Map();
    const existing = dayMap.get(ymd);
    dayMap.set(ymd, {
      clockInTime: hasIn ? inRaw : existing?.clockInTime,
      clockOutTime:
        outRaw !== undefined && outRaw !== null && String(outRaw).trim() !== ""
          ? outRaw
          : existing?.clockOutTime,
      present: hasIn || existing?.present || false,
    });
    staffByName.set(teacherName.toLowerCase().trim(), dayMap);
  }

  const staff: WeeklyStaffRow[] = [];
  for (const [nameKey, dayMap] of staffByName) {
    const originalName =
      staffRecords.find(
        (r) =>
          (propVal(r, "teacher") || propVal(r, "Teacher") || propVal(r, "teacher_name") || "")
            .toLowerCase()
            .trim() === nameKey,
      )?.properties?.teacher || nameKey;

    let totalDaysWorked = 0;
    const days = weekDates.map((date) => {
      const day = dayMap.get(date);
      const present = Boolean(day?.present);
      if (present) totalDaysWorked++;
      return {
        date,
        clockInTime: day?.clockInTime,
        clockOutTime: day?.clockOutTime,
        present,
      };
    });
    staff.push({
      id: nameKey,
      teacherName: originalName || nameKey,
      days,
      totalDaysWorked,
    });
  }
  staff.sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  const childDaysPresent = children.reduce((sum, c) => sum + c.totalDaysPresent, 0);
  const staffDaysWorked = staff.reduce((sum, s) => sum + s.totalDaysWorked, 0);

  const classroomName =
    opts?.classrooms && opts.classrooms.length > 0 && !opts.classrooms.includes("All")
      ? opts.classrooms.join(", ")
      : "All Classrooms";

  return {
    classroomId: "all",
    classroomName,
    weekStart,
    weekEnd,
    weekDates,
    generatedAt: new Date().toISOString(),
    children,
    staff,
    totals: {
      enrolled: children.length,
      childDaysPresent,
      staffDaysWorked,
    },
  };
}
