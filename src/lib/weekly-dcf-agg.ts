/**
 * Weekly DCF attendance aggregation helpers — server-only.
 *
 * Extracted from weekly-dcf.server.ts to keep that file focused. Aggregates
 * ALL attendance_records for a week into per-child, per-day lists of In/Out
 * pairs (one pair per record — the multi-cycle model creates separate rows
 * for same-day sign-out/sign-in), sorted chronologically and capped at 4.
 */
import type { WeeklyChildPair } from "./weekly-dcf.types";
import { normKey, propVal, propRaw } from "./crm-api";
import { crmTimeToMinutes } from "./kiosk-time";

/** Normalize an arbitrary date-ish value to "YYYY-MM-DD". Returns "" if unparseable. */
export function ymdFrom(raw: any): string {
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

/** Per-day aggregation: a list of In/Out pairs (one per attendance_records row). */
export interface DayAgg {
  pairs: WeeklyChildPair[];
  present: boolean;
}

/**
 * Aggregate ALL attendance_records for the week into per-child, per-day lists
 * of In/Out pairs. Each record contributes its own pair. Pairs are sorted
 * chronologically by check-in time and capped at 4 per day.
 *
 * @param opts.classroomName  When set, only records whose classroom field
 *   matches this classroom (by name or id) are counted — used by the Tracker
 *   report. Omit for the center-wide Main Book report.
 */
export function aggregateChildAttendance(
  attRecords: any[],
  weekDateSet: Set<string>,
  childIdByName: Map<string, string>,
  opts?: { classroomName?: string; classroomId?: string },
): Map<string, Map<string, DayAgg>> {
  const attByChild = new Map<string, Map<string, DayAgg>>();

  for (const rec of attRecords) {
    const dateVal = propVal(rec, "Date") || propVal(rec, "date");
    const ymd = ymdFrom(dateVal);
    if (!ymd || !weekDateSet.has(ymd)) continue;

    if (opts?.classroomName) {
      const recClassroom = String(
        propVal(rec, "classroom") ?? propVal(rec, "Classroom") ?? "",
      ).trim();
      const matchesRoom =
        !recClassroom ||
        normKey(recClassroom) === normKey(opts.classroomName) ||
        normKey(recClassroom) === normKey(opts.classroomId || "");
      if (!matchesRoom) continue;
    }

    let childId =
      rec.associations?.children?.[0]?.id ||
      rec.associations?.Children?.[0]?.id ||
      rec.properties?.childId ||
      "";
    if (!childId) {
      const childName = propVal(rec, "child_name") || propVal(rec, "Child Name") || "";
      childId = childIdByName.get(childName.toLowerCase().trim()) || "";
    }
    if (!childId) continue;

    const checkInRaw = propRaw(rec, "checkin_time");
    const checkOutRaw = propRaw(rec, "checkout_time");
    const hasIn =
      checkInRaw !== undefined && checkInRaw !== null && String(checkInRaw).trim() !== "";
    const hasOut =
      checkOutRaw !== undefined && checkOutRaw !== null && String(checkOutRaw).trim() !== "";

    const dayMap = attByChild.get(childId) || new Map<string, DayAgg>();
    const agg = dayMap.get(ymd) || { pairs: [], present: false };
    // Each record is its own cycle — push a new pair rather than overwriting.
    agg.pairs.push({
      checkInTime: hasIn ? checkInRaw : undefined,
      checkOutTime: hasOut ? checkOutRaw : undefined,
    });
    if (hasIn) agg.present = true;
    dayMap.set(ymd, agg);
    attByChild.set(childId, dayMap);
  }

  // Sort each day's pairs by check-in time, cap at 4.
  for (const dayMap of attByChild.values()) {
    for (const agg of dayMap.values()) {
      agg.pairs.sort((a, b) => {
        const am = a.checkInTime != null ? crmTimeToMinutes(a.checkInTime) : null;
        const bm = b.checkInTime != null ? crmTimeToMinutes(b.checkInTime) : null;
        if (am == null && bm == null) return 0;
        if (am == null) return 1;
        if (bm == null) return -1;
        return am - bm;
      });
      if (agg.pairs.length > 4) agg.pairs = agg.pairs.slice(0, 4);
    }
  }

  return attByChild;
}

/**
 * Build the per-child day arrays from an aggregation map, filling all 7
 * weekdays and computing total days present.
 */
export function buildChildDays(
  attByChild: Map<string, Map<string, DayAgg>>,
  weekDates: string[],
): {
  days: {
    date: string;
    pairs: WeeklyChildPair[];
    checkInTime?: any;
    checkOutTime?: any;
    present: boolean;
  }[];
  totalDaysPresent: number;
} {
  let totalDaysPresent = 0;
  const days = weekDates.map((date) => {
    const agg = attByChild.get(date);
    const present = Boolean(agg?.present);
    if (present) totalDaysPresent++;
    const pairs = agg?.pairs || [];
    return {
      date,
      pairs,
      checkInTime: pairs[0]?.checkInTime,
      checkOutTime: pairs[0]?.checkOutTime,
      present,
    };
  });
  return { days, totalDaysPresent };
}
