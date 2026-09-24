/**
 * Weekly DCF attendance report types.
 *
 * Mirrors the Wisconsin DCF Daily Attendance Record (DCF-F-62/2438) layout:
 * one row per child with In/Out time pairs for each day of the week (Sun–Sat),
 * plus a staff/teacher schedule table for the same week.
 */

/** One In/Out time pair for a day (a child may have multiple cycles per day). */
export interface WeeklyChildPair {
  /** Raw CRM Time-field value for check-in (formatted via formatCrmTime). */
  checkInTime?: string | number;
  /** Raw CRM Time-field value for check-out (formatted via formatCrmTime). */
  checkOutTime?: string | number;
}

/** A single day's In/Out times for a child (one cell-pair in the weekly grid). */
export interface WeeklyChildDay {
  /** "YYYY-MM-DD" for this weekday. */
  date: string;
  /**
   * All In/Out cycles for this day, sorted chronologically by check-in time,
   * capped at 4. Each attendance_records row for this child+date contributes
   * one pair (same-day sign-out/sign-in creates separate rows).
   */
  pairs: WeeklyChildPair[];
  /** First pair's check-in (backward-compat convenience). */
  checkInTime?: string | number;
  /** First pair's check-out (backward-compat convenience). */
  checkOutTime?: string | number;
  /** True when the child was signed in at any point this day (has a check-in). */
  present: boolean;
}

/** One child's weekly attendance row. */
export interface WeeklyChildRow {
  id: string;
  name: string;
  studentId: string;
  /** Classroom name (used on center-wide / Main Book reports). */
  classroom?: string;
  /** "MM/DD/YYYY" formatted date of birth, or "" when not stored. */
  dob: string;
  /** 7 entries, index 0 = Sunday … 6 = Saturday. */
  days: WeeklyChildDay[];
  /** Count of days the child was present (had a check-in) this week. */
  totalDaysPresent: number;
}

/** One teacher's weekly schedule row. */
export interface WeeklyStaffRow {
  id: string;
  teacherName: string;
  /** 7 entries, index 0 = Sunday … 6 = Saturday. */
  days: {
    date: string;
    clockInTime?: string | number;
    clockOutTime?: string | number;
    present: boolean;
  }[];
  /** Count of days the teacher clocked in this week. */
  totalDaysWorked: number;
}

/**
 * Full weekly DCF report payload for a single classroom.
 */
export interface WeeklyDcfReport {
  /** Classroom record id. */
  classroomId: string;
  /** Classroom display name. */
  classroomName: string;
  /** "YYYY-MM-DD" — the Sunday starting the week. */
  weekStart: string;
  /** "YYYY-MM-DD" — the Saturday ending the week. */
  weekEnd: string;
  /** 7 weekday date labels "YYYY-MM-DD", index 0 = Sunday. */
  weekDates: string[];
  /** ISO timestamp of when the report was generated. */
  generatedAt: string;
  /** Enrolled children rows for this classroom. */
  children: WeeklyChildRow[];
  /** Teacher schedule rows for this classroom (from teacher_attendance). */
  staff: WeeklyStaffRow[];
  totals: {
    enrolled: number;
    /** Total child-days present across the week. */
    childDaysPresent: number;
    staffDaysWorked: number;
  };
}
