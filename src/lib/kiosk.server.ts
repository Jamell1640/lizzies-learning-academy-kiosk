import type {
  Teacher,
  Child,
  AttendanceRecord,
  Classroom,
  DailyAttendanceReport,
} from "./kiosk.types";
import { getLocationId, callCrmApi, normKey, propVal, propRaw } from "./crm-api";
import {
  updateClassroomSignedInCount,
  serverBeginClassroomSession,
  serverEndClassroomSession,
  serverGetDashboard,
} from "./classroom-session.server";
import { serverGetDailyAttendanceReport } from "./report.server";
import { serverGetChildPickupContacts } from "./pickup-contacts.server";
import { resolveTrackerType, formatTimeForDisplay } from "./attendance-helpers";
import {
  serverSearchChildren,
  serverListAttendanceByDate,
  serverCreateManualAttendance,
  serverEditManualAttendance,
  serverDeleteManualAttendance,
  serverBulkDeleteManualAttendance,
} from "./manual-attendance.server";
import {
  serverListTeacherTimecards,
  serverCreateTeacherTimecard,
  serverEditTeacherTimecard,
  serverDeleteTeacherTimecard,
  serverBulkDeleteTeacherTimecards,
} from "./teacher-timecard.server";
import { serverGetMainBook } from "./main-book.server";
import { serverGetWeeklyDcfReport, serverGetMainBookWeeklyDcfReport } from "./weekly-dcf.server";

// Re-export so the createServerFn wrappers in kiosk.functions.ts can import
// all server helpers from a single module (./kiosk.server), matching the
// existing pattern.
export {
  serverBeginClassroomSession,
  serverEndClassroomSession,
  serverGetDashboard,
  serverGetDailyAttendanceReport,
  serverGetChildPickupContacts,
  serverSearchChildren,
  serverListAttendanceByDate,
  serverCreateManualAttendance,
  serverEditManualAttendance,
  serverDeleteManualAttendance,
  serverBulkDeleteManualAttendance,
  serverListTeacherTimecards,
  serverCreateTeacherTimecard,
  serverEditTeacherTimecard,
  serverDeleteTeacherTimecard,
  serverBulkDeleteTeacherTimecards,
  serverGetMainBook,
  serverGetWeeklyDcfReport,
  serverGetMainBookWeeklyDcfReport,
};

// In-memory cache for attendance records created during current session
const sessionAttendanceRecords: AttendanceRecord[] = [];

// Cache roster responses for 30-60 seconds as requested
interface CachedRoster {
  timestamp: number;
  data: Child[];
}
const rosterCache = new Map<string, CachedRoster>();

/**
 * 1. verifyTeacherPin(pin)
 * Fetch all teachers, filter in code by the PIN field. Identity-only: this
 * returns the teacher's id + name and NOTHING else — teachers rotate across
 * classrooms, so there is no fixed teacher-to-classroom assignment to look
 * up here. No demo PIN fallback.
 */
export async function serverVerifyTeacherPin(pin: string): Promise<Teacher | null> {
  const locationId = getLocationId();
  const normalizedPin = String(pin).trim();

  // Fetch all teachers for the location, filter in code.
  const listRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.teachers/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }),
    },
  );

  const allRecords = listRes?.records || listRes?.data || [];
  console.log(`[verifyTeacherPin] raw response status: ok, total teachers: ${allRecords.length}`);
  console.log(`[verifyTeacherPin] sample teacher properties:`, allRecords[0]?.properties);

  const matched = allRecords.filter((r: any) => {
    const p = r.properties || r;
    return (
      String(p.pin ?? p.PIN ?? p.Pin ?? "").trim() === normalizedPin ||
      String(propVal(r, "PIN") ?? propVal(r, "pin") ?? "").trim() === normalizedPin
    );
  });

  console.log(`[verifyTeacherPin] matched count: ${matched.length}`);

  if (matched.length === 0) {
    return null;
  }

  const rec = matched[0];
  const name =
    propVal(rec, "Teacher Name") || propVal(rec, "name") || `Teacher ${rec.id.slice(-4)}`;

  // Identity only — no classroom association lookup here. Teachers rotate,
  // so the classroom is chosen per-session from the picker screen.
  return {
    id: rec.id,
    name,
    pin: normalizedPin,
    classroomId: "",
    classroomName: "",
    isAdmin: resolveIsAdmin(rec),
  };
}

/**
 * Resolve the is_admin flag from a teacher record. The CRM stores booleans
 * variously as true/false, "true"/"false", "Yes"/"No", 1/0 — normalize all.
 */
function resolveIsAdmin(rec: any): boolean {
  const props = rec?.properties || rec || {};
  const raw = props.is_admin ?? props.isAdmin ?? props.Is_Admin;
  if (raw == null) return false;
  if (typeof raw === "boolean") return raw;
  const s = String(raw).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

/**
 * listTeachers()
 * Fetch ALL custom_objects.teachers records and return {id, name}[] for the
 * "Signed In By" dropdown on the manual attendance entry form.
 */
export async function serverListTeachers(): Promise<{ id: string; name: string }[]> {
  const locationId = getLocationId();
  const listRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.teachers/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }),
    },
  );
  const allRecords = listRes?.records || listRes?.data || [];
  return allRecords
    .map((r: any) => ({
      id: r.id,
      name: propVal(r, "Teacher Name") || propVal(r, "name") || `Teacher ${r.id.slice(-4)}`,
    }))
    .filter((t) => t.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * listClassrooms()
 * Fetch ALL custom_objects.classrooms records (fetch-all pattern, pageLimit
 * 150) and return them as a normalized list for the per-session classroom
 * picker. Cached server-side for 60s.
 */
interface CachedClassrooms {
  timestamp: number;
  data: Classroom[];
}
const classroomCache: CachedClassrooms = { timestamp: 0, data: [] };

export async function serverGetClassrooms(): Promise<Classroom[]> {
  const now = Date.now();
  if (classroomCache.data.length > 0 && now - classroomCache.timestamp < 60000) {
    return classroomCache.data;
  }

  const locationId = getLocationId();

  const listRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.classrooms/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }),
    },
  );

  const allRecords = listRes?.records || listRes?.data || [];
  console.log(`[getClassrooms] raw response status: ok, total classrooms: ${allRecords.length}`);
  if (allRecords.length > 0) {
    console.log(`[getClassrooms] sample classroom properties:`, allRecords[0].properties);
  }

  const classrooms: Classroom[] = allRecords
    .map((r: any) => {
      const capStr = String(propVal(r, "Capacity") ?? "");
      const cap = parseInt(capStr, 10);
      const ratioStr = String(propVal(r, "classroom_ratio") ?? "");
      const ratio = parseInt(ratioStr, 10);
      const signedInStr = String(propVal(r, "current_children_signed_in") ?? "");
      const signedIn = parseInt(signedInStr, 10);
      return {
        id: r.id,
        name:
          propVal(r, "Classroom Name") ||
          propVal(r, "name") ||
          r.name ||
          `Classroom ${r.id.slice(-4)}`,
        ageGroup: propVal(r, "Age Group") || propVal(r, "ageGroup") || "",
        assignedTeacher: propVal(r, "Assigned Teacher") || "",
        capacity: isNaN(cap) ? 0 : cap,
        // Live "who's here now" pointer (written by begin/end classroom
        // session). Shift times now live on teacher_attendance, not here.
        currentTeacher: String(propVal(r, "current_teacher") ?? "").trim(),
        currentChildrenSignedIn: isNaN(signedIn) ? 0 : signedIn,
        // Display-only ratio limit — never written by this app.
        classroomRatio: isNaN(ratio) ? 0 : ratio,
      };
    })
    .sort((a: Classroom, b: Classroom) => a.name.localeCompare(b.name));

  console.log(`[getClassrooms] matched classrooms count: ${classrooms.length}`);

  classroomCache.data = classrooms;
  classroomCache.timestamp = now;
  return classrooms;
}

/**
 * 2a. getTodaysAttendance(locationId, todayLocal)
 * Fetch all attendance_records (pageLimit 300), filter in code by today's
 * date. Returns a Map keyed by the attendance record's OWN id → its
 * check-in time + pickup person, so callers that hold a child's
 * active_attendance_id (the authoritative open-record pointer) can look up
 * the display metadata for that specific record.
 *
 * NOTE: presence itself is derived from each child's active_attendance_id
 * (set on check-in, cleared on check-out) — NOT from this map. This map only
 * supplies the check-in time + pickup person for display. We no longer rely
 * on the attendance search response including a child association block,
 * which it does NOT reliably return (that previously caused every child to
 * show as "out").
 *
 * `todayLocal` is the kiosk's local date ("YYYY-MM-DD"), passed from the
 * client because the server runtime is UTC and cannot derive the center's
 * local date. Stored attendance records use the same local date (written by
 * signEvent from the client), so the comparison is consistent.
 */
async function getTodaysAttendance(
  locationId: string,
  todayLocal?: string,
): Promise<Map<string, { checkinTime?: string | number; pickup?: string }>> {
  const listRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.attendance_records/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
    },
  );

  const allRecords = listRes?.records || listRes?.data || [];
  console.log(`[getTodaysAttendance] raw response status: ok, total records: ${allRecords.length}`);

  if (allRecords.length > 0) {
    console.log(
      `[getTodaysAttendance] raw record[0] properties:`,
      JSON.stringify(allRecords[0].properties, null, 2),
    );
  }

  // Use the kiosk's local date when available; fall back to UTC date only
  // if the caller didn't pass one (keeps the function usable standalone).
  const today = todayLocal || new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const sameDay = (raw: any): boolean => {
    if (raw == null) return false;
    const s = String(raw).trim();
    if (s === today) return true;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0] === today;
    }
    return false;
  };

  // Keyed by the attendance record's own id. The stored checkin_time is the
  // kiosk's LOCAL 24h time (written from the client); kept raw here so the
  // caller can format it consistently via formatTimeForDisplay.
  const map = new Map<string, { checkinTime?: string | number; pickup?: string }>();
  for (const rec of allRecords) {
    const dateVal = propVal(rec, "Date");
    if (!sameDay(dateVal)) continue;

    const recId = rec.id;
    if (!recId) continue;

    map.set(recId, {
      checkinTime: propRaw(rec, "checkin_time") ?? propVal(rec, "Check-in Time"),
      pickup: propVal(rec, "Guardian/Parent") || propVal(rec, "pickupContactName"),
    });
  }

  console.log(`[getTodaysAttendance] matched-today count: ${map.size}`);
  return map;
}

/**
 * 2. getClassroomRoster(classroomId, todayLocal)
 * Fetch all children (pageLimit 150), filter in code by the classroom text
 * field + status === "enrolled". Cross-references today's attendance via
 * the child association. Cached server-side for 45s. No demo fallback.
 *
 * `todayLocal` (kiosk local date) is forwarded to getTodaysAttendance so
 * the "today" filter matches the local date stored on attendance records.
 */
export async function serverGetClassroomRoster(
  classroomId: string,
  todayLocal?: string,
): Promise<Child[]> {
  const cached = rosterCache.get(classroomId);
  const now = Date.now();
  if (cached && now - cached.timestamp < 45000) {
    return mergeSessionRecords(cached.data);
  }

  const locationId = getLocationId();

  // Fetch all children for the location, filter in code.
  const listRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.children/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }),
    },
  );

  const allRecords = listRes?.records || listRes?.data || [];
  console.log(`[getClassroomRoster] raw response status: ok, total children: ${allRecords.length}`);
  if (allRecords.length > 0) {
    console.log(
      `[getClassroomRoster] sample child[0] properties:`,
      JSON.stringify(allRecords[0].properties, null, 2),
    );
    console.log(
      `[getClassroomRoster] sample child[0] associations:`,
      JSON.stringify(allRecords[0].associations, null, 2),
    );
  }

  // Resolve the classroom's human-readable name to match the child's
  // Classroom text field.
  let classroomLabel = "";
  try {
    const clsRes = await callCrmApi<any>(
      `/objects/custom_objects.classrooms/records/${classroomId}?locationId=${locationId}`,
    );
    const clsRec = clsRes?.record || clsRes;
    classroomLabel =
      propVal(clsRec, "Classroom Name") || propVal(clsRec, "name") || clsRec?.name || "";
  } catch (e) {
    console.warn("[getClassroomRoster] classroom record fetch failed", e);
  }
  console.log(`[getClassroomRoster] classroom label resolved: "${classroomLabel}"`);
  console.log(
    `[getClassroomRoster] matching children by classroom field against label OR id: "${classroomLabel}" / "${classroomId}"`,
  );

  const enrolledChildren = allRecords.filter((r: any) => {
    const childClassroomRaw = String(
      propVal(r, "Classroom") ?? propVal(r, "Classroom Name") ?? "",
    ).trim();
    const normChild = normKey(childClassroomRaw);
    const matchesClassroom =
      childClassroomRaw !== "" &&
      (normChild === normKey(classroomLabel) || normChild === normKey(classroomId));

    const status = String(propVal(r, "Status") ?? "")
      .trim()
      .toLowerCase();
    const isEnrolled = status === "" || status === "enrolled" || status === "active";

    return matchesClassroom && isEnrolled;
  });

  console.log(`[getClassroomRoster] matched/enrolled count: ${enrolledChildren.length}`);

  // Cross-reference presence via each child's active_attendance_id field —
  // the authoritative "open record" pointer that signEvent sets on check-in
  // and clears on check-out (the same open-record logic used everywhere
  // else). A child is "in" iff active_attendance_id is set. This avoids
  // relying on the attendance search response including a child association
  // block (which it does NOT reliably return), which previously caused
  // every child to show as "out" / gray. The attendance map (keyed by
  // record id) supplies the check-in time + pickup person for display.
  const attByRecordId = await getTodaysAttendance(locationId, todayLocal);

  const childrenList: Child[] = enrolledChildren.map((r: any) => {
    const activeAttId = propVal(r, "active_attendance_id") || propVal(r, "activeAttendanceId");
    let status: "in" | "out" = "out";
    let lastCheckTime: string | undefined;
    let lastPickupPerson: string | undefined;
    if (activeAttId) {
      const att = attByRecordId.get(activeAttId);
      status = "in";
      if (att?.checkinTime) lastCheckTime = formatTimeForDisplay(att.checkinTime);
      lastPickupPerson = att?.pickup;
    }
    return {
      id: r.id,
      name: propVal(r, "Child Name") || propVal(r, "name") || `Child ${r.id.slice(-4)}`,
      studentId: propVal(r, "Student ID") || `STU-${r.id.slice(-3)}`,
      classroom:
        classroomLabel || propVal(r, "Classroom") || propVal(r, "Classroom Name") || classroomId,
      classroomId,
      status,
      lastCheckTime,
      lastPickupPerson,
      photoUrl: propVal(r, "photoUrl") || propVal(r, "Photo") || undefined,
      dob:
        propVal(r, "child_date_of_birth") ||
        propVal(r, "Child Date of Birth") ||
        propVal(r, "Date of Birth") ||
        undefined,
    };
  });

  const merged = mergeSessionRecords(childrenList);
  rosterCache.set(classroomId, { timestamp: now, data: merged });
  return merged;
}

function mergeSessionRecords(list: Child[]): Child[] {
  return list.map((child) => {
    const childRecords = sessionAttendanceRecords.filter((r) => r.childId === child.id);
    if (childRecords.length > 0) {
      const latest = childRecords[childRecords.length - 1];
      return {
        ...child,
        status: latest.attendanceStatus === "check_in" ? "in" : "out",
        lastCheckTime: latest.checkInTime || latest.checkOutTime || child.lastCheckTime,
        lastPickupPerson: latest.pickupContactName || child.lastPickupPerson,
      };
    }
    return child;
  });
}

// serverGetChildPickupContacts moved to ./pickup-contacts.server.ts and
// re-exported below for the createServerFn wrappers in kiosk.functions.ts.

/**
 * 4. signEvent(childId, teacherId, classroomId, type, pickupContactId)
 * Creates a record in custom_objects.attendance_records, linked to the
 * child via the direct association.
 *
 * TIMEZONE: the server runtime (Cloudflare Worker) is UTC, so we cannot
 * derive the center's local time server-side. The kiosk tablet is mounted
 * at the center, so its browser local time IS the center's time. The
 * client passes `localTime24` (HH:MM 24h) and `localDate` (YYYY-MM-DD),
 * which are stored directly on checkin_time / checkout_time / date. This
 * keeps the stored value identical to what the success toast shows, so a
 * page reload displays the same time.
 *
 * Existence check: reads the child's active_attendance_id field directly
 * by record ID (not a search-based check) to detect an open attendance
 * record, so we don't create duplicates.
 */
export async function serverSignEvent(params: {
  childId: string;
  teacherId: string;
  classroomId: string;
  type: "in" | "out";
  pickupContactId: string;
  pickupContactName?: string;
  childName?: string;
  studentId?: string;
  teacherName?: string;
  classroomName?: string;
  /** Kiosk local time "HH:MM" (24h). Source of truth for checkin/checkout_time. */
  localTime24?: string;
  /** Kiosk local date "YYYY-MM-DD". Source of truth for the date fields. */
  localDate?: string;
}): Promise<{ ok: boolean; recordId: string; synced: boolean; timestamp: string }> {
  const locationId = getLocationId();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");

  // Prefer the kiosk's local time/date (passed from the client). Fall back
  // to server UTC only if the caller didn't provide them.
  const timeStr24 = params.localTime24 || `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dateStr = params.localDate || now.toISOString().split("T")[0];
  const timeStr =
    formatTimeForDisplay(timeStr24) ||
    now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const isPresent = params.type === "in";

  // Existence check: read the child record directly and inspect its
  // active_attendance_id field (NOT a search of attendance_records).
  let existingRecordId: string | undefined;
  try {
    const childRes = await callCrmApi<any>(
      `/objects/custom_objects.children/records/${params.childId}?locationId=${locationId}`,
    );
    const childRec = childRes?.record || childRes;
    existingRecordId =
      propVal(childRec, "active_attendance_id") ||
      propVal(childRec, "activeAttendanceId") ||
      undefined;
  } catch (e) {
    console.warn("[signEvent] child record fetch for existence check failed", e);
  }

  // Track in local session memory immediately for instant UI reflect + resilience
  const newRecord: AttendanceRecord = {
    id: `rec_${Date.now()}`,
    date: dateStr,
    studentId: params.studentId || "STU",
    teacherName: params.teacherName || "Teacher",
    childName: params.childName || "Child",
    classroom: params.classroomName || "Classroom",
    attendanceStatus: isPresent ? "check_in" : "check_out",
    checkInTime: isPresent ? timeStr : undefined,
    checkOutTime: !isPresent ? timeStr : undefined,
    trackerType: isPresent ? "Sign In" : "Sign Out",
    childId: params.childId,
    pickupContactId: params.pickupContactId,
    pickupContactName: params.pickupContactName,
  };

  // The field labeled "Attendance Status" has internal key `check_type`
  // (confirmed in the CRM field editor). Valid dropdown values:
  //   Present→present, Late→late, Absent→absent, Check-In→check_in,
  //   Check-Out→check_out. Use check_in / check_out for kiosk sign events.
  // "Check-in Time"/"Check-out Time" are Time-type fields with keys
  // checkin_time / checkout_time (confirmed in the CRM field editor).
  // Stored as the kiosk's LOCAL 24h "HH:MM" (see TIMEZONE note above).
  //
  // IMPORTANT: single-select dropdown fields expect PLAIN STRINGS on
  // write (confirmed live — arrays are rejected for both check_type and
  // tracker_type). check_type carries the sign-in/out direction.
  // tracker_type identifies which physical entrance/room tracker logged
  // the event (NOT the direction) and is mapped dynamically per classroom:
  //   main_entrance | infant_room_tracker | toddler_room_tracker |
  //   preschool_room_tracker | schoolage_room_tracker
  const CHECK_TYPE_IN = "check_in";
  const CHECK_TYPE_OUT = "check_out";
  const trackerType = resolveTrackerType(params.classroomName, params.classroomId);

  const ghlPayload: any = {
    locationId,
    properties: {
      // Primary composite field — required on every attendance record.
      // Key is snake_case "date__child_name" (double underscore); value is
      // "<YYYY-MM-DD> <Child Name>" to match the human-readable label.
      date__child_name: `${dateStr} ${params.childName || "Child"}`,
      date: dateStr,
      // NOTE: student_id is intentionally omitted — on the attendance_records
      // object that field is configured as a PHONE type, so a Student ID
      // string like "STU-421" is rejected. It is not required.
      teacher_name: params.teacherName || "Teacher",
      child_name: params.childName || "Child",
      classroom: params.classroomName || "Classroom",
      // Picklist — carries sign-in/out direction. Plain string (an array
      // ["check_in"] is rejected live: "isn't a valid value").
      check_type: isPresent ? CHECK_TYPE_IN : CHECK_TYPE_OUT,
      // Time-type fields; kiosk-local 24h HH:MM strings.
      checkin_time: isPresent ? timeStr24 : "",
      checkout_time: !isPresent ? timeStr24 : "",
      // Single-select "Tracker Type" — plain string, not an array (this
      // CRM rejects arrays for single-select dropdowns on write; confirmed
      // live for both check_type and tracker_type). Maps to the room tracker
      // device that logged the event, per classroom.
      tracker_type: trackerType,
    },
  };

  let createdId = newRecord.id;
  let synced = false;

  // PUT a partial properties update to a record. Same pattern as
  // updateClassroomRecord in classroom-session.server.ts: locationId stays
  // in the query string only, body is { properties } only (locationId in
  // the body 422s on these update-by-id endpoints).
  const putRecord = async (
    objectKey: string,
    recordId: string,
    properties: Record<string, any>,
  ): Promise<void> => {
    await callCrmApi(`/objects/${objectKey}/records/${recordId}?locationId=${locationId}`, {
      method: "PUT",
      body: JSON.stringify({ properties }),
    });
  };

  try {
    if (!isPresent && existingRecordId) {
      // ---- Check-OUT with an open record: UPDATE the existing record ----
      // Do NOT POST a new record. Only write checkout_time + check_type so
      // date__child_name and every other field on the existing record stay
      // untouched. This keeps a child's full day as a single row.
      await putRecord("custom_objects.attendance_records", existingRecordId, {
        checkout_time: timeStr24,
        check_type: CHECK_TYPE_OUT,
      });
      createdId = existingRecordId;
      synced = true;
      newRecord.id = createdId;
      sessionAttendanceRecords.push(newRecord);
      rosterCache.delete(params.classroomId);

      // Close the open record on the child so a subsequent check-in starts
      // a fresh row.
      try {
        await putRecord("custom_objects.children", params.childId, {
          active_attendance_id: "",
        });
        console.log(`[signEvent] cleared active_attendance_id on child ${params.childId}`);
      } catch (e: any) {
        console.warn(
          "[signEvent] failed to clear active_attendance_id (non-fatal):",
          e?.message || e,
        );
      }

      try {
        await updateClassroomSignedInCount(params.classroomId, -1);
        console.log(
          `[signEvent] classroom count updated for ${params.classroomId} (type=out, update)`,
        );
      } catch (e: any) {
        console.warn("[signEvent] classroom count update failed (non-fatal):", e?.message || e);
      }
    } else {
      // ---- Check-IN, OR check-OUT fallback (no open record found) ----
      if (!isPresent && !existingRecordId) {
        console.warn(
          "[signEvent] check-out fallback: no open record found for child, creating new record",
        );
      }

      const ghlRes = await callCrmApi<any>(`/objects/custom_objects.attendance_records/records`, {
        method: "POST",
        body: JSON.stringify(ghlPayload),
      });

      createdId = ghlRes?.record?.id || ghlRes?.id || ghlRes?.recordId || newRecord.id;
      synced = true;
      newRecord.id = createdId;
      sessionAttendanceRecords.push(newRecord);
      rosterCache.delete(params.classroomId);

      // On check-IN, save the new record ID onto the child's
      // active_attendance_id so a later check-out can find this open record.
      // Runs AFTER the POST succeeds, so createdId is the real CRM id.
      if (isPresent) {
        try {
          await putRecord("custom_objects.children", params.childId, {
            active_attendance_id: createdId,
          });
          console.log(
            `[signEvent] saved active_attendance_id=${createdId} on child ${params.childId}`,
          );
        } catch (e: any) {
          console.warn(
            "[signEvent] failed to save active_attendance_id (non-fatal):",
            e?.message || e,
          );
        }
      }

      // Keep the classroom's current_children_signed_in in sync (+1 check-in,
      // -1 check-out fallback, floor at 0). Best-effort: a failure here must
      // NOT undo the successful attendance write. MUST be awaited (not
      // fire-and-forget) — the edge runtime terminates unawaited background
      // promises once the handler returns, so the write would never land.
      try {
        await updateClassroomSignedInCount(params.classroomId, isPresent ? 1 : -1);
        console.log(
          `[signEvent] classroom count updated for ${params.classroomId} (type=${params.type})`,
        );
      } catch (e: any) {
        console.warn("[signEvent] classroom count update failed (non-fatal):", e?.message || e);
      }
    }
  } catch (err: any) {
    console.error(`[signEvent] GHL record write failed:`, err?.message || err);
    throw err;
  }

  return {
    ok: true,
    recordId: createdId,
    synced,
    timestamp: timeStr,
  };
}
