/**
 * Main Book server helper.
 *
 * Front-desk daily sign-in/out overview. Returns ALL enrolled children with
 * their current sign-in status (derived from each child's active_attendance_id
 * — the same authoritative open-record pointer used by the kiosk and manual
 * attendance tool) plus the last action time for display.
 *
 * Read-only. Writes go through the existing createManualAttendance path
 * (reused by the CreateAttendanceModal), which shares the exact same
 * attendance_records field keys and open-record logic as the kiosk signEvent.
 *
 * Server-only. Imported by kiosk.server.ts and re-exported for the
 * createServerFn wrappers in kiosk.functions.ts.
 */
import type { MainBookChild } from "./kiosk.types";
import { callCrmApi, getLocationId, propVal, propRaw } from "./crm-api";
import { formatTimeForDisplay } from "./attendance-helpers";

/**
 * Fetch all enrolled children with today's sign-in status + last action time.
 *
 * `todayLocal` is the center's local date ("YYYY-MM-DD"), passed from the
 * client because the server runtime is UTC. Stored attendance records use
 * the same local date, so the comparison is consistent.
 */
export async function serverGetMainBook(todayLocal?: string): Promise<MainBookChild[]> {
  const locationId = getLocationId();

  // Fetch all children (fetch-all pattern — the search API doesn't reliably
  // filter on custom fields).
  const childrenRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.children/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
    },
  );
  const allChildren = childrenRes?.records || childrenRes?.data || [];

  // Fetch today's attendance records so we can show the last action time.
  // Keyed by record id (for active_attendance_id lookup) AND by lowercased
  // child name (best-effort fallback for signed-out kids whose open record
  // pointer has been cleared).
  const attRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.attendance_records/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
    },
  );
  const allAtt = attRes?.records || attRes?.data || [];

  const today = todayLocal || new Date().toISOString().split("T")[0];
  const sameDay = (raw: any): boolean => {
    if (raw == null) return false;
    const s = String(raw).trim();
    if (s === today) return true;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0] === today;
    return false;
  };

  // recordId → { checkinTime, checkoutTime, childName }
  const attByRecordId = new Map<
    string,
    { checkinTime?: string | number; checkoutTime?: string | number; childName: string }
  >();
  // lowercased childName → latest record (for signed-out fallback lookup)
  const attByChildName = new Map<
    string,
    { checkinTime?: string | number; checkoutTime?: string | number }
  >();

  for (const rec of allAtt) {
    const dateVal = propVal(rec, "Date") || propVal(rec, "date");
    if (!sameDay(dateVal)) continue;

    const recId = rec.id;
    const childName = propVal(rec, "child_name") || propVal(rec, "Child Name") || "";
    const checkinTime = propRaw(rec, "checkin_time") ?? propVal(rec, "Check-in Time");
    const checkoutTime = propRaw(rec, "checkout_time") ?? propVal(rec, "Check-out Time");

    if (recId) {
      attByRecordId.set(recId, { checkinTime, checkoutTime, childName });
    }
    if (childName) {
      const key = childName.toLowerCase().trim();
      // Keep the record that has a checkout (most recent / completed) if multiple.
      const existing = attByChildName.get(key);
      if (!existing || (checkoutTime && !existing.checkoutTime)) {
        attByChildName.set(key, { checkinTime, checkoutTime });
      }
    }
  }

  const result: MainBookChild[] = [];
  for (const r of allChildren) {
    const status = String(propVal(r, "Status") ?? "")
      .trim()
      .toLowerCase();
    if (status !== "" && status !== "enrolled" && status !== "active") continue;

    const name = propVal(r, "Child Name") || propVal(r, "name") || `Child ${r.id.slice(-4)}`;
    const studentId = propVal(r, "Student ID") || "";
    const classroomText = propVal(r, "Classroom") || propVal(r, "Classroom Name") || "";
    const activeAttId = propVal(r, "active_attendance_id") || propVal(r, "activeAttendanceId");
    const signedIn = Boolean(activeAttId && String(activeAttId).trim() !== "");

    let lastActionTime: string | undefined;
    let lastActionType: "in" | "out" | undefined;

    if (signedIn && activeAttId) {
      const att = attByRecordId.get(String(activeAttId).trim());
      if (att?.checkinTime) {
        lastActionTime = formatTimeForDisplay(att.checkinTime);
        lastActionType = "in";
      }
    } else {
      // Signed out (or never signed in) — best-effort name match to today's records.
      const att = attByChildName.get(name.toLowerCase().trim());
      if (att) {
        if (att.checkoutTime) {
          lastActionTime = formatTimeForDisplay(att.checkoutTime);
          lastActionType = "out";
        } else if (att.checkinTime) {
          lastActionTime = formatTimeForDisplay(att.checkinTime);
          lastActionType = "in";
        }
      }
    }

    result.push({
      id: r.id,
      name,
      studentId,
      classroomText,
      signedIn,
      lastActionTime,
      lastActionType,
    });
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  console.log(
    `[getMainBook] today=${today} enrolled children: ${result.length}, signed in: ${result.filter((c) => c.signedIn).length}`,
  );
  return result;
}
