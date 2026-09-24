export interface Teacher {
  id: string;
  name: string;
  pin: string;
  classroomId?: string;
  classroomName?: string;
  /** True when this teacher's record has is_admin set in the CRM. */
  isAdmin?: boolean;
}

export interface Classroom {
  id: string;
  name: string;
  ageGroup: string;
  assignedTeacher: string;
  capacity: number;
  /** Live "who's here now" pointer on custom_objects.classrooms. */
  currentTeacher?: string;
  currentChildrenSignedIn?: number;
  /** Display-only ratio limit (never written by this app). */
  classroomRatio?: number;
}

export interface PickupContact {
  id: string;
  name: string;
  relationship: string; // "Mother" | "Father" | "Guardian" | "Emergency Contact"
  phone?: string;
}

export interface Child {
  id: string;
  name: string;
  studentId: string;
  classroom: string;
  status: "in" | "out";
  lastCheckTime?: string;
  lastPickupPerson?: string;
  photoUrl?: string;
  classroomId: string;
  contacts?: PickupContact[];
  /**
   * Raw CRM "child_date_of_birth" value. Used to compute the child's age
   * dynamically (via formatAgeFromDob) instead of relying on the stale
   * stored "Age" field. May be undefined when no DOB is recorded.
   */
  dob?: string;
}

export interface AttendanceRecord {
  id?: string;
  date: string;
  studentId: string;
  teacherName: string;
  childName: string;
  classroom: string;
  attendanceStatus: "Present" | "Checked Out";
  checkInTime?: string;
  checkOutTime?: string;
  trackerType: "Sign In" | "Sign Out";
  childId: string;
  pickupContactId?: string;
  pickupContactName?: string;
}

/**
 * A single child's daily attendance summary for the printable report.
 * `status` is derived from the most recent attendance record of the day:
 *   - "signed_in"  : last event was a check-in (child is currently present)
 *   - "signed_out" : last event was a check-out (child has gone home)
 *   - "absent"     : no attendance records today
 */
export interface ReportChild {
  id: string;
  name: string;
  studentId: string;
  status: "signed_in" | "signed_out" | "absent";
  /** Raw CRM Time-field value (number = minutes-since-midnight, or string). */
  checkInTime?: string | number;
  checkOutTime?: string | number;
  /** Most recent pickup/drop-off person recorded today, if any. */
  lastPickupPerson?: string;
  /** Teacher who signed the most recent event, if any. */
  lastTeacher?: string;
}

/**
 * One classroom's daily attendance summary for the printable report.
 */
export interface ReportClassroom {
  id: string;
  name: string;
  ageGroup?: string;
  /** Enrolled children count for this classroom (from the roster). */
  enrolledCount: number;
  /** Children with at least one sign-in event today. */
  signedInCount: number;
  /** Children whose latest event today was a check-out. */
  signedOutCount: number;
  /** Children with no attendance events today. */
  absentCount: number;
  children: ReportChild[];
}

/**
 * Top-level daily attendance report payload.
 */
export interface DailyAttendanceReport {
  date: string;
  /** ISO timestamp of when the report was generated. */
  generatedAt: string;
  classrooms: ReportClassroom[];
  totals: {
    enrolled: number;
    signedIn: number;
    signedOut: number;
    absent: number;
  };
}

/**
 * Read-only classroom summary for the Main Dashboard
 * (custom_objects.classrooms, fresh fetch).
 */
export interface DashboardClassroom {
  id: string;
  name: string;
  ageGroup?: string;
  /** Active teacher name (legacy single pointer), or "" when unassigned. */
  currentTeacher: string;
  /**
   * EVERY teacher currently clocked into this room (open teacher_attendance
   * shifts — clock_in set, clock_out blank), with their clock-in time. This
   * is the authoritative "who's staffed here now" list; `currentTeacher` is
   * kept as a legacy single-name pointer. Drives the multi-teacher display.
   */
  currentTeachers: { name: string; clockInTime?: string | number }[];
  /**
   * Number of staff currently checked into this classroom (open
   * teacher_attendance shifts). Drives the left side of the staff:children
   * ratio display.
   */
  staffCount: number;
  currentChildrenSignedIn: number;
  /**
   * Total children enrolled in this classroom (records in
   * custom_objects.children whose classroom field matches this room and
   * status === enrolled), regardless of today's attendance. Same source as
   * the kiosk roster header's "X Total" count.
   */
  enrolledCount: number;
  /** Display-only ratio limit (legacy field, kept for reference). */
  classroomRatio: number;
  capacity: number;
  /**
   * Per-classroom admin-editable legal max ratio string (e.g. "1:4"),
   * read from the classrooms object's `legal_max_ratio` field. Blank when
   * not yet configured. Drives the Status column's compliance comparison.
   */
  legalMaxRatio?: string;
  /**
   * Hardcoded legal max-children-per-staff for this classroom (INFANT=8,
   * TODDLER=7, PRE-SCHOOL=10, SCHOOL-AGE=14). Resolved by name at dashboard
   * read time from the hardcoded map in src/lib/classroom-ratio.ts. Undefined
   * when the room name doesn't match a known room. Drives the "Max: N:1"
   * display and the compliance status comparison.
   */
  maxChildrenPerStaff?: number;
  ratioStatus: "in" | "over" | "none" | "empty";
  /**
   * Today's teacher_attendance clock-in time for this classroom (raw CRM
   * Time-field value). Undefined when no shift record exists today.
   */
  teacherClockInTime?: string | number;
  /**
   * Today's teacher_attendance clock-out time for this classroom (raw CRM
   * Time-field value). Undefined/empty when the shift is still open.
   */
  teacherClockOutTime?: string | number;
}

/**
 * A single attendance_records entry for the manual entry admin tool.
 * Times are raw CRM Time-field values (may be "HH:MM" or "HHMM").
 */
export interface ManualAttendanceEntry {
  id: string;
  childName: string;
  classroom: string;
  checkType: string;
  /**
   * Raw CRM Time-field value (may be a number = minutes-since-midnight for
   * attendance_records, or a "HHMM" string). Formatted via formatCrmTime.
   */
  checkInTime: string | number;
  checkOutTime: string | number;
  /** Who performed the sign-in/out action (attendance_records.teacher_name). */
  signerName: string;
  date: string;
  pickupPerson: string;
  /**
   * The teacher currently assigned to that child's classroom for the day —
   * pulled from the classroom's `current_teacher` field (the same live
   * "who's here now" pointer the Live Room Status dashboard uses). Distinct
   * from `signerName` (who performed the action) — they may differ.
   */
  teacherName?: string;
  /**
   * The attendance date for THIS record (YYYY-MM-DD), read from the record's
   * own Date field — not just the filter date. Needed so exports stay clear
   * if multiple dates are ever shown together.
   */
  recordDate?: string;
  /**
   * DCF facility/license number — centralized in src/lib/facility.ts.
   */
  facilityId?: string;
  /**
   * Child's Date of Birth formatted "MM/DD/YYYY" (read-only), resolved by name
   * match from the children object. Empty when no DOB is stored.
   */
  dob?: string;
}

/**
 * A child record result for the manual-entry student search/autocomplete.
 */
export interface ChildSearchResult {
  id: string;
  name: string;
  studentId: string;
  classroomText: string;
  /** True when the child currently has an open attendance record
   *  (active_attendance_id is set) — i.e. they are signed in right now. */
  signedIn?: boolean;
}

/**
 * A teacher attendance entry for the Staff Timecard page.
 */
export interface TeacherTimecardEntry {
  id: string;
  teacherName: string;
  classroomName: string;
  date: string; // YYYY-MM-DD
  clockInTime: string | number;
  clockOutTime: string | number;
  isOpen: boolean;
  totalMinutes?: number;
  hoursFormatted?: string;
}

/**
 * A child row for the Main Book (front-desk daily sign-in/out overview).
 * `signedIn` is derived from the child's active_attendance_id (the same
 * open-record pointer used by the kiosk). `lastActionTime` is a formatted
 * 12h string for display.
 */
export interface MainBookChild {
  id: string;
  name: string;
  studentId: string;
  classroomText: string;
  signedIn: boolean;
  /** Formatted "h:MM AM/PM" of the most recent sign-in/out event today. */
  lastActionTime?: string;
  /** Direction of the most recent event today. */
  lastActionType?: "in" | "out";
}
