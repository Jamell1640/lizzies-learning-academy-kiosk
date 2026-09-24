/**
 * Daily attendance report — server-only helpers.
 *
 * Builds a printable daily attendance summary for all classrooms by joining
 * today's attendance_records to children via the direct child association
 * (authoritative link — NOT the Child Name text field) and grouping by
 * classroom. Imported by kiosk.server.ts (and re-exported for the
 * createServerFn wrapper in kiosk.functions.ts).
 */
import type { DailyAttendanceReport, ReportClassroom, ReportChild } from "./kiosk.types";
import { callCrmApi, getLocationId, normKey, propVal, propRaw } from "./crm-api";

/**
 * getDailyAttendanceReport(todayLocal)
 *
 * `todayLocal` (kiosk local date "YYYY-MM-DD") is passed from the client
 * because the server runtime is UTC and cannot derive the center's local
 * date. Attendance records store the kiosk-local date (written by signEvent),
 * so the comparison is consistent.
 *
 * For each child, the current status is derived from the most recent event
 * of the day:
 *   - signed_in  : latest event was a check-in (currently present)
 *   - signed_out : latest event was a check-out (has gone home)
 *   - absent     : no attendance events today
 */
export async function serverGetDailyAttendanceReport(
  todayLocal: string,
): Promise<DailyAttendanceReport> {
  const locationId = getLocationId();

  // 1. Fetch all classrooms for the location.
  const classListRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.classrooms/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }),
    },
  );
  const classRecords = classListRes?.records || classListRes?.data || [];
  console.log(`[getDailyAttendanceReport] total classrooms: ${classRecords.length}`);

  const classroomById = new Map<string, { id: string; name: string; ageGroup: string }>();
  for (const r of classRecords) {
    classroomById.set(r.id, {
      id: r.id,
      name:
        propVal(r, "classroom_name") ||
        propVal(r, "Classroom Name") ||
        `Classroom ${r.id.slice(-4)}`,
      ageGroup: propVal(r, "age_group") || propVal(r, "Age Group") || "",
    });
  }
  const classroomNameById = new Map<string, string>();
  for (const [id, c] of classroomById) classroomNameById.set(id, c.name);

  // 2. Fetch all children for the location; filter by status === enrolled and
  //    group by their classroom field (matched by classroom id OR name, same
  //    logic as serverGetClassroomRoster).
  const childListRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.children/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
    },
  );
  const childRecords = childListRes?.records || childListRes?.data || [];
  console.log(`[getDailyAttendanceReport] total children: ${childRecords.length}`);

  interface ChildLite {
    id: string;
    name: string;
    studentId: string;
    classroomId: string;
  }
  const childrenByClassroomId = new Map<string, ChildLite[]>();

  for (const r of childRecords) {
    const status = String(propVal(r, "Status") ?? "")
      .trim()
      .toLowerCase();
    const isEnrolled = status === "" || status === "enrolled" || status === "active";
    if (!isEnrolled) continue;

    const childName = propVal(r, "Child Name") || propVal(r, "name") || `Child ${r.id.slice(-4)}`;
    const studentId = propVal(r, "Student ID") || `STU-${r.id.slice(-3)}`;
    const childClassroomRaw = String(
      propVal(r, "Classroom") ?? propVal(r, "Classroom Name") ?? "",
    ).trim();

    let matchedClassroomId = "";
    for (const cid of classroomNameById.keys()) {
      if (cid === childClassroomRaw) {
        matchedClassroomId = cid;
        break;
      }
      if (
        childClassroomRaw !== "" &&
        normKey(childClassroomRaw) === normKey(classroomNameById.get(cid) || "")
      ) {
        matchedClassroomId = cid;
        break;
      }
    }
    if (!matchedClassroomId) continue;

    const arr = childrenByClassroomId.get(matchedClassroomId) || [];
    arr.push({ id: r.id, name: childName, studentId, classroomId: matchedClassroomId });
    childrenByClassroomId.set(matchedClassroomId, arr);
  }

  // 3. Fetch all attendance_records for the location, filter to today in code
  //    (same pattern as getTodaysAttendance). Group by child id, keeping the
  //    most recent check-in and check-out times + the latest event type.
  const attListRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.attendance_records/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
    },
  );
  const attRecords = attListRes?.records || attListRes?.data || [];
  console.log(`[getDailyAttendanceReport] total attendance records: ${attRecords.length}`);

  interface ChildAttendanceAggregate {
    childId: string;
    checkInTime?: string | number;
    checkOutTime?: string | number;
    lastStatus: "signed_in" | "signed_out";
    lastPickupPerson?: string;
    lastTeacher?: string;
    eventCount: number;
  }

  const today = todayLocal || new Date().toISOString().split("T")[0];
  const sameDay = (raw: any): boolean => {
    if (raw == null) return false;
    const s = String(raw).trim();
    if (s === today) return true;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0] === today;
    return false;
  };

  const attendanceByChildId = new Map<string, ChildAttendanceAggregate>();

  for (const rec of attRecords) {
    const dateVal = propVal(rec, "Date");
    if (!sameDay(dateVal)) continue;

    const childId =
      rec.associations?.children?.[0]?.id ||
      rec.associations?.Children?.[0]?.id ||
      rec.properties?.childId;
    if (!childId) continue;

    const statusVal = String(
      propVal(rec, "check_type") ?? propVal(rec, "Attendance Status") ?? "",
    ).toLowerCase();
    const isCheckIn =
      statusVal.includes("check_in") ||
      statusVal.includes("checked in") ||
      statusVal.includes("present") ||
      statusVal === "in";
    const isCheckOut =
      statusVal.includes("check_out") || statusVal.includes("checked out") || statusVal === "out";

    const checkInRaw = propRaw(rec, "checkin_time");
    const checkOutRaw = propRaw(rec, "checkout_time");
    const teacherName = propVal(rec, "teacher_name") || propVal(rec, "Teacher Name") || "";
    const pickupPerson = propVal(rec, "Guardian/Parent") || propVal(rec, "pickupContactName");

    const existing = attendanceByChildId.get(childId);
    const hasIn = checkInRaw !== undefined && checkInRaw !== null && checkInRaw !== "";
    const hasOut = checkOutRaw !== undefined && checkOutRaw !== null && checkOutRaw !== "";
    if (!existing) {
      attendanceByChildId.set(childId, {
        childId,
        checkInTime: isCheckIn ? checkInRaw : undefined,
        checkOutTime: isCheckOut ? checkOutRaw : undefined,
        lastStatus: isCheckOut ? "signed_out" : "signed_in",
        lastPickupPerson: pickupPerson,
        lastTeacher: teacherName,
        eventCount: 1,
      });
    } else {
      if (isCheckIn && hasIn) existing.checkInTime = checkInRaw;
      if (isCheckOut && hasOut) existing.checkOutTime = checkOutRaw;
      existing.lastStatus = isCheckOut ? "signed_out" : "signed_in";
      existing.lastPickupPerson = pickupPerson || existing.lastPickupPerson;
      existing.lastTeacher = teacherName || existing.lastTeacher;
      existing.eventCount += 1;
    }
  }

  console.log(
    `[getDailyAttendanceReport] matched-today attendance entries: ${attendanceByChildId.size}`,
  );

  // 4. Assemble the report: one ReportClassroom per classroom, with each
  //    enrolled child's derived status.
  const classrooms: ReportClassroom[] = [];
  let totalEnrolled = 0;
  let totalSignedIn = 0;
  let totalSignedOut = 0;
  let totalAbsent = 0;

  const statusOrder: Record<ReportChild["status"], number> = {
    signed_in: 0,
    signed_out: 1,
    absent: 2,
  };

  for (const cls of classroomById.values()) {
    const enrolled = childrenByClassroomId.get(cls.id) || [];
    const reportChildren: ReportChild[] = enrolled.map((c) => {
      const att = attendanceByChildId.get(c.id);
      if (!att) {
        return {
          id: c.id,
          name: c.name,
          studentId: c.studentId,
          status: "absent" as const,
        };
      }
      return {
        id: c.id,
        name: c.name,
        studentId: c.studentId,
        status: att.lastStatus,
        checkInTime: att.checkInTime,
        checkOutTime: att.checkOutTime,
        lastPickupPerson: att.lastPickupPerson,
        lastTeacher: att.lastTeacher,
      };
    });

    reportChildren.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.name.localeCompare(b.name);
    });

    const signedInCount = reportChildren.filter((c) => c.status === "signed_in").length;
    const signedOutCount = reportChildren.filter((c) => c.status === "signed_out").length;
    const absentCount = reportChildren.filter((c) => c.status === "absent").length;

    totalEnrolled += reportChildren.length;
    totalSignedIn += signedInCount;
    totalSignedOut += signedOutCount;
    totalAbsent += absentCount;

    classrooms.push({
      id: cls.id,
      name: cls.name,
      ageGroup: cls.ageGroup,
      enrolledCount: reportChildren.length,
      signedInCount,
      signedOutCount,
      absentCount,
      children: reportChildren,
    });
  }

  classrooms.sort((a, b) => a.name.localeCompare(b.name));

  return {
    date: today,
    generatedAt: new Date().toISOString(),
    classrooms,
    totals: {
      enrolled: totalEnrolled,
      signedIn: totalSignedIn,
      signedOut: totalSignedOut,
      absent: totalAbsent,
    },
  };
}
