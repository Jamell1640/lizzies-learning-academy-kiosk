/**
 * Center-local date/time helpers.
 *
 * The center is in America/Chicago. The kiosk tablet is wall-mounted there,
 * but the admin Attendance tool may be used from a browser in any timezone —
 * so we pin to America/Chicago explicitly via Intl rather than relying on the
 * browser's local zone. These values are passed to the server (which runs in
 * UTC) so CRM Time/Date fields store the center's local time.
 *
 * Pure functions, client-safe (Intl is available in browser, Node, and
 * Cloudflare Workers V8).
 */

/** Today's date at the center, as "YYYY-MM-DD" (America/Chicago). */
export function getLocalDate(): string {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${day}`;
}

/** Current time at the center, as "HH:MM" 24h (America/Chicago). */
export function getLocalTime24(): string {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // Some environments emit "24:xx" for midnight; normalize to "00:xx".
  let s = fmt.format(d);
  if (s.startsWith("24")) s = "00" + s.slice(2);
  return s;
}

/**
 * Format a CRM "Time" field value for display as "h:MM AM/PM".
 *
 * The CRM stores Time fields in DIFFERENT shapes depending on the object:
 *   - attendance_records.checkin_time / checkout_time: stored as a JSON
 *     NUMBER = integer minutes-since-midnight (e.g. 899 → 14:59 → 2:59 PM,
 *     1413 → 23:33 → 11:33 PM). This is the authoritative type.
 *   - classrooms.timein / timeout: stored as a "HHMM" STRING (e.g. "1337").
 *   - Some CRM views also return "HH:MM", "HH:MM:SS", "h:MM AM/PM", or a
 *     full ISO datetime string.
 *
 * Because the minutes-since-midnight number (899) and the HHMM string
 * ("1337") both stringify to all-digit strings, we disambiguate by the
 * ORIGINAL value's JS type: a real number is always minutes-since-midnight;
 * a string is HHMM (or one of the other string formats). Callers should
 * pass the RAW (unstringified) value via propRaw() so the type is
 * preserved. When a stringified number is passed (type lost), we fall back
 * to HHMM parsing for 3-4 digit strings and minutes for other lengths.
 *
 * Empty/missing/garbage values return "" so callers can omit the badge
 * instead of showing "Invalid Date".
 *
 * NOTE: this does NOT shift timezones for ISO values. The CRM stores the
 * center's local time; when it round-trips as an ISO string the time
 * component is already the center-local wall time, so we extract the
 * hours/minutes directly rather than converting across zones.
 *
 * Pure function, client-safe.
 */
export function formatCrmTime(raw: string | number | undefined | null): string {
  if (raw == null) return "";
  // Preserve the original type: a real number is minutes-since-midnight
  // (attendance_records); a string is HHMM or another string format.
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return "";
    const total = Math.floor(raw);
    if (total < 0 || total >= 1440) return "";
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
  }

  const s = String(raw).trim();
  if (!s) return "";

  // Full ISO datetime — extract the time component directly (the stored
  // value is center-local wall time, so we do NOT convert zones).
  if (s.includes("T") || (s.includes("-") && s.length > 10 && !/^\d{1,2}:\d{2}/.test(s))) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const timePart = s.split("T")[1] || "";
      const tm = timePart.match(/(\d{1,2}):(\d{2})/);
      if (tm) {
        const hours = parseInt(tm[1], 10);
        const minutes = tm[2];
        if (hours <= 23 && parseInt(minutes, 10) <= 59) {
          const period = hours >= 12 ? "PM" : "AM";
          const displayHours = hours % 12 === 0 ? 12 : hours % 12;
          return `${displayHours}:${minutes} ${period}`;
        }
      }
      return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
  }

  // 12-hour "h:MM AM/PM" — normalize spacing/case.
  const ampm = s.match(/(\d{1,2}):(\d{2})\s*([APap][Mm])/);
  if (ampm) {
    return `${parseInt(ampm[1], 10)}:${ampm[2]} ${ampm[3].toUpperCase()}`;
  }

  // "HH:MM" or "HH:MM:SS" with colon (24h).
  const mColon = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (mColon) {
    const hours = parseInt(mColon[1], 10);
    const minutes = mColon[2];
    if (hours > 23 || parseInt(minutes, 10) > 59) return "";
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    return `${displayHours}:${minutes} ${period}`;
  }

  // Bare "HHMM" 3-4 digits (classrooms Time field string format).
  if (!/^\d{3,4}$/.test(s)) return "";
  const padded = s.length === 3 ? "0" + s : s;
  const hours = parseInt(padded.slice(0, 2), 10);
  const minutes = parseInt(padded.slice(2, 4), 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) return "";
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * Convert any CRM time value (number minutes, HHMM, HH:MM, ISO) into minutes since midnight.
 * Returns null if invalid or missing.
 */
export function crmTimeToMinutes(raw: string | number | undefined | null): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    const total = Math.floor(raw);
    if (total < 0 || total >= 1440) return null;
    return total;
  }
  const s = String(raw).trim();
  if (!s) return null;

  // Full ISO datetime
  if (s.includes("T") || (s.includes("-") && s.length > 10 && !/^\d{1,2}:\d{2}/.test(s))) {
    const timePart = s.split("T")[1] || "";
    const tm = timePart.match(/(\d{1,2}):(\d{2})/);
    if (tm) {
      const h = parseInt(tm[1], 10);
      const m = parseInt(tm[2], 10);
      if (h <= 23 && m <= 59) return h * 60 + m;
    }
  }

  // 12-hour "h:MM AM/PM"
  const ampm = s.match(/(\d{1,2}):(\d{2})\s*([APap][Mm])/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    const ap = ampm[3].toUpperCase();
    if (h === 12) h = ap === "AM" ? 0 : 12;
    else if (ap === "PM") h += 12;
    return h * 60 + m;
  }

  // "HH:MM" 24h
  const mColon = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (mColon) {
    const h = parseInt(mColon[1], 10);
    const m = parseInt(mColon[2], 10);
    if (h <= 23 && m <= 59) return h * 60 + m;
  }

  // Bare "HHMM"
  if (/^\d{3,4}$/.test(s)) {
    const padded = s.length === 3 ? "0" + s : s;
    const h = parseInt(padded.slice(0, 2), 10);
    const m = parseInt(padded.slice(2, 4), 10);
    if (h <= 23 && m <= 59) return h * 60 + m;
  }

  return null;
}

/**
 * Format elapsed minutes into standard Procare-like string:
 * "7 Hrs 53 Mins", "8 Hrs", "25 Mins", etc.
 */
export function formatElapsedHours(minutes: number): string {
  if (minutes < 0) return "0 Mins";
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);

  if (h === 0) return `${m} Mins`;
  if (m === 0) return `${h} ${h === 1 ? "Hr" : "Hrs"}`;
  return `${h} ${h === 1 ? "Hr" : "Hrs"} ${m} Mins`;
}

/**
 * Parse a CRM "Child Date of Birth" value into a JS Date.
 *
 * The CRM Date field may round-trip as:
 *   - a full ISO datetime string ("2021-05-13T00:00:00.000Z")
 *   - a "YYYY-MM-DD" date string
 *   - a "MM/DD/YYYY" string
 *   - a "YYYY/MM/DD" string
 *
 * Returns null when the value is missing/blank/unparseable. Pure function,
 * client-safe.
 */
export function parseDob(raw: string | undefined | null): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO datetime or YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // MM/DD/YYYY or M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const d = new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (ymd) {
    const d = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Compute a child's age from their Date of Birth, formatted as
 * "X yr Y mo" / "X yrs Y mo" (always showing months, even when 0).
 *
 * Calculated as of today's date so it updates automatically as children
 * have birthdays. Returns "" when DOB is missing/invalid or the DOB is
 * in the future.
 *
 * Pure function, client-safe (uses plain Date math, no timezone dependency
 * — age is a calendar-day difference, not a wall-clock one).
 *
 * @param dobRaw  raw CRM "child_date_of_birth" value
 * @param asOf    optional reference date (defaults to now); useful for tests
 */
export function formatAgeFromDob(
  dobRaw: string | undefined | null,
  asOf: Date = new Date(),
): string {
  const dob = parseDob(dobRaw);
  if (!dob) return "";

  // Guard against future DOBs (bad data).
  if (dob.getTime() > asOf.getTime()) return "";

  let years = asOf.getFullYear() - dob.getFullYear();
  let months = asOf.getMonth() - dob.getMonth();

  if (months < 0) {
    years -= 1;
    months += 12;
  }
  // If the day-of-month hasn't been reached yet this month, subtract a month.
  if (asOf.getDate() < dob.getDate()) {
    months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
  }

  if (years < 0) return "";

  const yrLabel = years === 1 ? "yr" : "yrs";
  return `${years} ${yrLabel} ${months} mo`;
}
