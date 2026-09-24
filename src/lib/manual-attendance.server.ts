/**
 * Manual attendance entry server helpers.
 *
 * Admin correction/backfill tool — separate from the kiosk flow. Reuses the
 * exact same attendance_records open-record pattern as the kiosk:
 *   - Sign-In creates a new record (or updates an existing open record for
 *     that child+date) and sets active_attendance_id on the child.
 *   - Sign-Out finds the child's open record (via active_attendance_id) and
 *     PATCHes checkout_time onto it; falls back to creating a checkout-only
 *     record if no open record exists.
 *   - Edit updates a specific attendance record by id (does not touch
 *     active_attendance_id — that is managed by create/sign-out only).
 *   - Delete removes an attendance record and clears active_attendance_id
 *     on the child if it points to the deleted record.
 *
 * Server-only. Imported by kiosk.server.ts (and re-exported for the
 * createServerFn wrappers in kiosk.functions.ts).
 */
import type { ManualAttendanceEntry, ChildSearchResult } from "./kiosk.types";
import { callCrmApi, getLocationId, propVal, propRaw, normKey } from "./crm-api";
import { FACILITY_ID } from "./facility";

/**
 * Search children by name (or student id) for the manual-entry autocomplete.
 * Fetch-all + filter in code (the search API doesn't reliably filter on
 * custom fields). Returns up to 30 results sorted alphabetically.
 */
export async function serverSearchChildren(query: string): Promise<ChildSearchResult[]> {
  const locationId = getLocationId();
  const q = (query || "").trim().toLowerCase();

  const listRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.children/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
    },
  );

  const all = listRes?.records || listRes?.data || [];
  const results: ChildSearchResult[] = [];

  for (const r of all) {
    const status = String(propVal(r, "Status") ?? "")
      .trim()
      .toLowerCase();
    if (status !== "" && status !== "enrolled" && status !== "active") continue;

    const name = propVal(r, "Child Name") || propVal(r, "name") || `Child ${r.id.slice(-4)}`;
    const studentId = propVal(r, "Student ID") || "";
    const classroomText = propVal(r, "Classroom") || propVal(r, "Classroom Name") || "";
    // A child is "signed in" iff they have an active_attendance_id pointing to
    // an open attendance record (same open-record logic used by the kiosk).
    const activeAttId = propVal(r, "active_attendance_id") || propVal(r, "activeAttendanceId");
    const signedIn = Boolean(activeAttId && String(activeAttId).trim() !== "");

    const matched =
      !q ||
      q === "*" ||
      name.toLowerCase().includes(q) ||
      String(studentId).toLowerCase().includes(q) ||
      classroomText.toLowerCase().includes(q);

    if (matched) {
      results.push({ id: r.id, name, studentId, classroomText, signedIn });
    }
  }

  // Sort alphabetically by name
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/**
 * Normalize an arbitrary date-ish value to a "YYYY-MM-DD" string for range
 * comparison. Handles YYYY-MM-DD, YYYY/M/D, MM/DD/YYYY, and ISO datetimes.
 * Returns "" when the value can't be parsed.
 */
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

/**
 * Format a Date-of-Birth value as "MM/DD/YYYY" for read-only display.
 * Accepts YYYY-MM-DD, MM/DD/YYYY, or ISO. Returns "" when missing/invalid.
 */
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

/** Pull the DOB value from a child record, trying common field keys. */
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
 * List attendance_records within a [startDate, endDate] range (inclusive),
 * optionally filtered to one or more classrooms, mapped to the
 * ManualAttendanceEntry shape.
 *
 * Fetch-all + filter in code (the search API doesn't reliably filter on
 * custom fields). Fetches attendance_records, classrooms (to resolve a
 * record's `classroom` field — which may hold an id OR a name — to the
 * classroom's display name), and children (to resolve each child's Date of
 * Birth by name match).
 *
 * This is the single source of truth for the Main Book table AND any future
 * Export button — both consume the same filtered result set.
 */
export async function serverListAttendanceByDate(params: {
  startDate: string; // YYYY-MM-DD, inclusive
  endDate: string; // YYYY-MM-DD, inclusive
  classrooms?: string[]; // display names; [] or ["All"] = no filter
}): Promise<ManualAttendanceEntry[]> {
  const locationId = getLocationId();
  const startDate = (params.startDate || "").trim();
  const endDate = (params.endDate || "").trim();

  const [listRes, classListRes, childRes] = await Promise.all([
    callCrmApi<{ records?: any[]; data?: any[] }>(
      `/objects/custom_objects.attendance_records/records/search`,
      {
        method: "POST",
        body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
      },
    ),
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
  ]);

  // classroom record id → display name (a record's `classroom` field may hold
  // either the id or the name; we resolve to the name for display + filter).
  const classNameById = new Map<string, string>();
  const classRecords = classListRes?.records || classListRes?.data || [];
  for (const cls of classRecords) {
    const clsName =
      propVal(cls, "classroom_name") ||
      propVal(cls, "Classroom Name") ||
      propVal(cls, "name") ||
      "";
    if (cls.id && clsName) classNameById.set(cls.id, clsName);
  }

  // child name (lowercased) → formatted DOB, for the read-only DOB column.
  const dobByChildName = new Map<string, string>();
  const childRecords = childRes?.records || childRes?.data || [];
  for (const r of childRecords) {
    const name = propVal(r, "Child Name") || propVal(r, "name") || "";
    if (name) dobByChildName.set(name.toLowerCase().trim(), formatDob(childDobRaw(r)));
  }

  // Classroom filter — normalized names; "All"/empty means no filter.
  const filterSet = new Set(
    (params.classrooms || [])
      .map((c) => c.trim())
      .filter((c) => c && c.toLowerCase() !== "all")
      .map(normKey),
  );

  const all = listRes?.records || listRes?.data || [];

  const inRange = (raw: any): boolean => {
    const y = ymdFrom(raw);
    return y !== "" && y >= startDate && y <= endDate;
  };

  const facilityId = FACILITY_ID;

  const entries: ManualAttendanceEntry[] = [];
  for (const rec of all) {
    const dateVal = propVal(rec, "Date") || propVal(rec, "date");
    if (!inRange(dateVal)) continue;

    const classroomText = propVal(rec, "classroom") || propVal(rec, "Classroom") || "";
    const classroomDisplay = classNameById.get(classroomText) || classroomText;

    // Apply classroom filter against both the resolved display name and the
    // raw stored value (id or name).
    if (filterSet.size > 0) {
      const matches =
        filterSet.has(normKey(classroomDisplay)) || filterSet.has(normKey(classroomText));
      if (!matches) continue;
    }

    const childName = propVal(rec, "child_name") || propVal(rec, "Child Name") || "Unknown";
    const dob = dobByChildName.get(childName.toLowerCase().trim()) || "";

    const checkInRaw = propRaw(rec, "checkin_time");
    const checkOutRaw = propRaw(rec, "checkout_time");

    entries.push({
      id: rec.id,
      childName,
      classroom: classroomDisplay,
      checkType: propVal(rec, "check_type") || "",
      checkInTime: checkInRaw,
      checkOutTime: checkOutRaw,
      signerName: propVal(rec, "teacher_name") || propVal(rec, "Teacher Name") || "",
      date: startDate,
      pickupPerson: propVal(rec, "Guardian/Parent") || propVal(rec, "pickupContactName") || "",
      recordDate: ymdFrom(dateVal) || startDate,
      facilityId,
      dob,
    });
  }

  // Sort by date (ascending), then check-in time, then child name.
  const sortKey = (v: string | number | undefined): string =>
    v == null || v === "" ? "zzzz" : String(v);
  entries.sort((a, b) => {
    if (a.recordDate !== b.recordDate) return a.recordDate.localeCompare(b.recordDate);
    const aT = sortKey(a.checkInTime);
    const bT = sortKey(b.checkInTime);
    if (aT !== bT) return aT.localeCompare(bT);
    return a.childName.localeCompare(b.childName);
  });

  console.log(
    `[listAttendanceByDate] range=${startDate}..${endDate} classrooms=[${Array.from(filterSet).join(",")}] matched ${entries.length} records`,
  );
  return entries;
}

/**
 * Resolve a classroom's human-readable name from its record id (used to
 * default the classroom field on a manual entry from the child's assigned room).
 */
async function resolveClassroomName(classroomText: string): Promise<string> {
  // classroomText may already be the classroom name, OR may be the id.
  const locationId = getLocationId();

  // First, check if it's an ID by fetching the classroom record directly.
  if (classroomText && classroomText.length > 10) {
    try {
      const clsRes = await callCrmApi<any>(
        `/objects/custom_objects.classrooms/records/${classroomText}?locationId=${locationId}`,
      );
      const clsRec = clsRes?.record || clsRes;
      const name =
        propVal(clsRec, "Classroom Name") ||
        propVal(clsRec, "classroom_name") ||
        propVal(clsRec, "name") ||
        "";
      if (name) return name;
    } catch {
      // Not an ID — fall through to return the text as-is.
    }
  }
  return classroomText;
}

/**
 * Create a manual attendance entry.
 *
 * Sign-In: creates a new record (or updates an existing open record for that
 *   child+date via active_attendance_id). Sets active_attendance_id on the
 *   child if a new record is created.
 * Sign-Out: finds the child's open record (via active_attendance_id) and
 *   PATCHes checkout_time + check_type. If no open record exists, creates a
 *   checkout-only fallback record.
 *
 * `time24` is "HH:MM" 24h local time. `date` is "YYYY-MM-DD".
 */
export async function serverCreateManualAttendance(params: {
  type: "in" | "out";
  childId: string;
  childName: string;
  classroom: string;
  signerName: string;
  time24: string;
  date: string;
  pickupPerson?: string;
}): Promise<{ ok: boolean; recordId: string }> {
  const locationId = getLocationId();
  const isPresent = params.type === "in";
  const classroomName = await resolveClassroomName(params.classroom);

  // Read the child's active_attendance_id (existence check — same pattern
  // as the kiosk signEvent).
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
  } catch (e: any) {
    console.warn("[manualCreate] child record fetch for existence check failed", e?.message || e);
  }

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

  let recordId = "";

  if (!isPresent && existingRecordId) {
    // ---- Sign-OUT with an open record: UPDATE the existing record ----
    await putRecord("custom_objects.attendance_records", existingRecordId, {
      checkout_time: params.time24,
      check_type: "check_out",
      teacher_name: params.signerName,
    });
    recordId = existingRecordId;

    // Clear the child's active_attendance_id (close the open record).
    try {
      await putRecord("custom_objects.children", params.childId, {
        active_attendance_id: "",
      });
    } catch (e: any) {
      console.warn(
        "[manualCreate] failed to clear active_attendance_id (non-fatal)",
        e?.message || e,
      );
    }
  } else {
    // ---- Sign-IN, OR Sign-OUT fallback (no open record) ----
    if (!isPresent && !existingRecordId) {
      console.warn(
        "[manualCreate] sign-out fallback: no open record found for child, creating checkout-only record",
      );
    }

    const payload = {
      locationId,
      properties: {
        date__child_name: `${params.date} ${params.childName}`,
        date: params.date,
        teacher_name: params.signerName,
        child_name: params.childName,
        classroom: classroomName,
        check_type: isPresent ? "check_in" : "check_out",
        checkin_time: isPresent ? params.time24 : "",
        checkout_time: !isPresent ? params.time24 : "",
      },
    };
    console.log("[manualCreate] POST body:", JSON.stringify(payload));

    const res = await callCrmApi<any>(`/objects/custom_objects.attendance_records/records`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    recordId = res?.record?.id || res?.id || res?.recordId || "";
    console.log(`[manualCreate] created attendance record id=${recordId}`);

    // On sign-IN, save the new record ID onto the child's active_attendance_id.
    if (isPresent && recordId) {
      try {
        await putRecord("custom_objects.children", params.childId, {
          active_attendance_id: recordId,
        });
        console.log(
          `[manualCreate] saved active_attendance_id=${recordId} on child ${params.childId}`,
        );
      } catch (e: any) {
        console.warn(
          "[manualCreate] failed to save active_attendance_id (non-fatal)",
          e?.message || e,
        );
      }
    }
  }

  return { ok: true, recordId };
}

/**
 * Edit an existing attendance record by id. Updates the provided fields only.
 * Does NOT touch active_attendance_id (that is managed by create/sign-out).
 */
export async function serverEditManualAttendance(params: {
  recordId: string;
  classroom?: string;
  signerName?: string;
  time24?: string;
  type?: "in" | "out";
  pickupPerson?: string;
  date?: string;
}): Promise<{ ok: boolean }> {
  const locationId = getLocationId();
  const properties: Record<string, any> = {};

  if (params.classroom !== undefined) properties.classroom = params.classroom;
  if (params.signerName !== undefined) properties.teacher_name = params.signerName;
  if (params.date !== undefined && params.date.trim()) {
    properties.date = params.date.trim();
    // Update the composite primary field to match the new date. The child
    // name is read from the existing record so we don't need it passed in.
    try {
      const recRes = await callCrmApi<any>(
        `/objects/custom_objects.attendance_records/records/${params.recordId}?locationId=${locationId}`,
      );
      const rec = recRes?.record || recRes;
      const childName = propVal(rec, "child_name") || propVal(rec, "Child Name") || "";
      if (childName) {
        properties.date__child_name = `${params.date.trim()} ${childName}`;
      }
    } catch (e: any) {
      console.warn(
        "[manualEdit] could not read record for date__child_name update",
        e?.message || e,
      );
    }
  }
  if (params.pickupPerson !== undefined) {
    // The pickup-contact field key on attendance_records — stored as
    // "Guardian/Parent" in the CRM. We write the text label.
    properties["Guardian/Parent"] = params.pickupPerson;
  }
  if (params.time24 !== undefined && params.type !== undefined) {
    if (params.type === "in") {
      properties.checkin_time = params.time24;
      properties.check_type = "check_in";
    } else {
      properties.checkout_time = params.time24;
      properties.check_type = "check_out";
    }
  } else if (params.time24 !== undefined) {
    // If only time is changed (not type), update whichever time applies.
    // We can't know which without reading the record, so update both — the
    // empty one stays empty (CRM treats "" as unset).
    properties.checkin_time = params.time24;
  }

  console.log(`[manualEdit] PUT record ${params.recordId} body:`, JSON.stringify({ properties }));

  await callCrmApi(
    `/objects/custom_objects.attendance_records/records/${params.recordId}?locationId=${locationId}`,
    {
      method: "PUT",
      body: JSON.stringify({ properties }),
    },
  );

  return { ok: true };
}

/**
 * Delete an attendance record by id. Also clears the child's
 * active_attendance_id if it points to the deleted record.
 *
 * `childId` is optional but recommended — if provided and the child's
 * active_attendance_id matches this record, it will be cleared so the child
 * shows as "out" on the dashboard/kiosk.
 */
export async function serverDeleteManualAttendance(params: {
  recordId: string;
  childId?: string;
}): Promise<{ ok: boolean }> {
  const locationId = getLocationId();

  await callCrmApi(`/objects/custom_objects.attendance_records/records/${params.recordId}`, {
    method: "DELETE",
  });
  console.log(`[manualDelete] deleted attendance record ${params.recordId}`);

  // If a childId was provided, check if the child's active_attendance_id
  // points to this record. If so, clear it so the child doesn't show as "in"
  // for a record that no longer exists.
  if (params.childId) {
    try {
      const childRes = await callCrmApi<any>(
        `/objects/custom_objects.children/records/${params.childId}?locationId=${locationId}`,
      );
      const childRec = childRes?.record || childRes;
      const activeId =
        propVal(childRec, "active_attendance_id") || propVal(childRec, "activeAttendanceId") || "";
      if (activeId === params.recordId) {
        await callCrmApi(
          `/objects/custom_objects.children/records/${params.childId}?locationId=${locationId}`,
          {
            method: "PUT",
            body: JSON.stringify({ properties: { active_attendance_id: "" } }),
          },
        );
        console.log(`[manualDelete] cleared active_attendance_id on child ${params.childId}`);
      }
    } catch (e: any) {
      console.warn(
        "[manualDelete] failed to clear active_attendance_id (non-fatal)",
        e?.message || e,
      );
    }
  }

  return { ok: true };
}

/**
 * Bulk delete attendance records by ID. For each record, also clears the
 * child's active_attendance_id if it points to the deleted record (same
 * logic as the single delete). Returns a per-record result summary.
 *
 * `entries` is an array of { recordId, childId? } so we can clear the
 * open-record pointer on the matching child when needed.
 */
export async function serverBulkDeleteManualAttendance(
  entries: {
    recordId: string;
    childId?: string;
  }[],
): Promise<{ ok: boolean; deleted: number; failed: number; errors: string[] }> {
  const locationId = getLocationId();
  const errors: string[] = [];
  let deleted = 0;
  let failed = 0;

  for (const item of entries) {
    try {
      await callCrmApi(`/objects/custom_objects.attendance_records/records/${item.recordId}`, {
        method: "DELETE",
      });
      deleted++;

      // Clear the child's active_attendance_id if it pointed to this record.
      if (item.childId) {
        try {
          const childRes = await callCrmApi<any>(
            `/objects/custom_objects.children/records/${item.childId}?locationId=${locationId}`,
          );
          const childRec = childRes?.record || childRes;
          const activeId =
            propVal(childRec, "active_attendance_id") ||
            propVal(childRec, "activeAttendanceId") ||
            "";
          if (activeId === item.recordId) {
            await callCrmApi(
              `/objects/custom_objects.children/records/${item.childId}?locationId=${locationId}`,
              {
                method: "PUT",
                body: JSON.stringify({ properties: { active_attendance_id: "" } }),
              },
            );
          }
        } catch (e: any) {
          console.warn(
            `[bulkDeleteManual] failed to clear active_attendance_id for ${item.childId} (non-fatal)`,
            e?.message || e,
          );
        }
      }
    } catch (e: any) {
      failed++;
      errors.push(`${item.recordId}: ${e?.message || "failed"}`);
      console.warn(`[bulkDeleteManual] failed to delete ${item.recordId}`, e?.message || e);
    }
  }

  return { ok: failed === 0, deleted, failed, errors };
}
