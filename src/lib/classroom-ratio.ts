/**
 * Hardcoded legal max-children-per-staff per classroom name.
 *
 * These are the regulatory maximums for the center's rooms and are
 * intentionally hardcoded (not read from the CRM) so the ratio status is
 * always correct for these four known classrooms. `classroom_ratio` on the
 * Classrooms object is display-only and may be stale/missing; this is the
 * source of truth for the compliance comparison.
 *
 *   INFANT      → 8 children per staff
 *   TODDLER     → 7 children per staff
 *   PRE-SCHOOL  → 10 children per staff
 *   SCHOOL-AGE  → 14 children per staff
 *
 * Pure + client-safe (no timezone / server dependency).
 */

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const MAX_CHILDREN_PER_STAFF: Record<string, number> = {
  infant: 8,
  toddler: 7,
  preschool: 10,
  schoolage: 14,
};

/**
 * Resolve the hardcoded max-children-per-staff for a classroom by name.
 * Returns undefined when the classroom name doesn't match a known room.
 */
export function getMaxChildrenPerStaff(classroomName: string): number | undefined {
  if (!classroomName) return undefined;
  return MAX_CHILDREN_PER_STAFF[normName(classroomName)];
}

/**
 * Compute the live ratio status for a classroom.
 *
 * Actual ratio = (children currently signed in) : (teachers currently clocked in).
 * Status rules:
 *   - zero children present            → "empty"   (No Children Present)
 *   - children present, zero staff     → "over"    (Over Ratio — always)
 *   - children present, staff present  → "over" when children/staff > max, else "in"
 *   - max not configured for this room → "none"    (Ratio Not Configured)
 */
export function computeRatioStatus(
  childrenPresent: number,
  staffPresent: number,
  maxChildrenPerStaff: number | undefined,
): "in" | "over" | "none" | "empty" {
  if (childrenPresent === 0) return "empty";
  if (staffPresent === 0) return "over";
  if (!maxChildrenPerStaff) return "none";
  return childrenPresent / staffPresent > maxChildrenPerStaff ? "over" : "in";
}
