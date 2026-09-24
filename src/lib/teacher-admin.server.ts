/**
 * Admin-only teacher PIN verification.
 *
 * Server-only helpers for gating admin entry points (e.g. Dashboard access
 * from the keypad screen). Reads the is_admin flag from
 * custom_objects.teachers so only teachers marked admin in the CRM can pass
 * the admin gate. Regular teacher PINs still work for classroom sign-in and
 * classroom unlock via serverVerifyTeacherPin (in kiosk.server.ts).
 */
import type { Teacher } from "./kiosk.types";
import { getLocationId, callCrmApi, propVal, propRaw } from "./crm-api";

/**
 * Resolve the is_admin flag from a teacher record. The CRM stores booleans
 * variously as true/false, "true"/"false", "Yes"/"No", 1/0 — normalize all.
 */
function resolveIsAdmin(rec: any): boolean {
  const raw = propRaw(rec, "is_admin");
  if (raw == null) return false;
  if (typeof raw === "boolean") return raw;
  const s = String(raw).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

/**
 * Read a teacher record by PIN and return it with the isAdmin flag resolved.
 * Returns null when no teacher matches the PIN.
 */
export async function findTeacherByPin(pin: string): Promise<Teacher | null> {
  const locationId = getLocationId();
  const normalizedPin = String(pin).trim();

  const listRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.teachers/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }),
    },
  );

  const allRecords = listRes?.records || listRes?.data || [];
  const matched = allRecords.filter((r: any) => {
    const p = r.properties || r;
    return (
      String(p.pin ?? p.PIN ?? p.Pin ?? "").trim() === normalizedPin ||
      String(propVal(r, "PIN") ?? propVal(r, "pin") ?? "").trim() === normalizedPin
    );
  });

  if (matched.length === 0) return null;

  const rec = matched[0];
  const name =
    propVal(rec, "Teacher Name") || propVal(rec, "name") || `Teacher ${rec.id.slice(-4)}`;

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
 * Admin-only PIN gate. Verifies the PIN matches a teacher record AND that the
 * teacher's is_admin flag is true. Returns the teacher on success, or a
 * typed failure so the UI can distinguish "invalid PIN" from "not an admin".
 */
export async function serverVerifyAdminPin(
  pin: string,
): Promise<{ ok: true; teacher: Teacher } | { ok: false; reason: "invalid" | "not_admin" }> {
  const teacher = await findTeacherByPin(pin);
  if (!teacher) return { ok: false, reason: "invalid" };
  if (!teacher.isAdmin) return { ok: false, reason: "not_admin" };
  return { ok: true, teacher };
}
