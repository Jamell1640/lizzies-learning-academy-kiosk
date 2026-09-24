/**
 * Pure helpers for the attendance sign-event flow.
 *
 * Extracted from kiosk.server.ts so that file stays focused on the server
 * functions themselves. These are deterministic and have no side effects.
 */

/**
 * Map a classroom to its tracker_type picklist value, which identifies the
 * physical entrance/room tracker device (NOT the sign-in/out direction —
 * that lives in check_type). Valid options confirmed in the CRM field
 * editor:
 *   main_entrance | infant_room_tracker | toddler_room_tracker |
 *   preschool_room_tracker | schoolage_room_tracker
 * Match by classroom name (case-insensitive substring) with a sensible
 * fallback to main_entrance when no room matches.
 */
export function resolveTrackerType(classroomName?: string, classroomId?: string): string {
  const name = (classroomName || "").toLowerCase();
  if (name.includes("infant")) return "infant_room_tracker";
  if (name.includes("toddler")) return "toddler_room_tracker";
  if (name.includes("pre") || name.includes("preschool")) return "preschool_room_tracker";
  if (name.includes("school") || name.includes("school-age") || name.includes("school age"))
    return "schoolage_room_tracker";
  // Default to main entrance for unclassified rooms (e.g. the kiosk is at
  // the front door / main entrance rather than a specific room tracker).
  return "main_entrance";
}

/**
 * Normalize a stored check-in/check-out time value to a 12h display string
 * ("h:MM AM/PM"). The CRM Time fields may come back as a 24h "HH:MM",
 * "HH:MM:SS", a 12h "h:MM AM/PM" string, or (rarely) an ISO datetime.
 *
 * NOTE: this does NOT shift timezones. The stored value is expected to be
 * the kiosk's LOCAL time (written by signEvent from the client-provided
 * localTime24), so we only reformat, never convert across zones.
 */
export function formatTimeForDisplay(raw: any): string | undefined {
  if (raw == null) return undefined;

  // A real number is minutes-since-midnight (attendance_records Time fields
  // are stored as JSON numbers, e.g. 899 = 14:59). Handle before stringifying
  // so we don't confuse it with a "HHMM" string.
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return undefined;
    const total = Math.floor(raw);
    if (total < 0 || total >= 1440) return undefined;
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    const ap = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${h12}:${String(minutes).padStart(2, "0")} ${ap}`;
  }

  const s = String(raw).trim();
  if (!s) return undefined;

  // Already 12h with AM/PM — normalize spacing/case.
  const ampm = s.match(/(\d{1,2}):(\d{2})\s*([APap][Mm])/);
  if (ampm) {
    return `${parseInt(ampm[1], 10)}:${ampm[2]} ${ampm[3].toUpperCase()}`;
  }

  // Full ISO datetime — parse and format (best-effort).
  if ((s.includes("T") || (s.includes("-") && s.length > 10)) && !/^\d{1,2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }

  // "HH:MM" or "HH:MM:SS" 24h.
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    let h = parseInt(m24[1], 10);
    const min = m24[2];
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${min} ${ap}`;
  }

  // Bare "HHMM" 3-4 digit string (classrooms Time field format).
  if (/^\d{3,4}$/.test(s)) {
    const padded = s.length === 3 ? "0" + s : s;
    const h = parseInt(padded.slice(0, 2), 10);
    const m = parseInt(padded.slice(2, 4), 10);
    if (h <= 23 && m <= 59) {
      const ap = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
    }
  }

  return s;
}
