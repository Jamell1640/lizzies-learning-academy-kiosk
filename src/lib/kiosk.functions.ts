import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  serverVerifyTeacherPin,
  serverListTeachers,
  serverGetClassrooms,
  serverGetClassroomRoster,
  serverGetChildPickupContacts,
  serverSignEvent,
  serverBeginClassroomSession,
  serverEndClassroomSession,
  serverGetDashboard,
  serverGetDailyAttendanceReport,
  serverSearchChildren,
  serverListAttendanceByDate,
  serverCreateManualAttendance,
  serverEditManualAttendance,
  serverDeleteManualAttendance,
  serverBulkDeleteManualAttendance,
  serverListTeacherTimecards,
  serverCreateTeacherTimecard,
  serverEditTeacherTimecard,
  serverDeleteTeacherTimecard,
  serverBulkDeleteTeacherTimecards,
  serverGetMainBook,
  serverGetWeeklyDcfReport,
  serverGetMainBookWeeklyDcfReport,
} from "./kiosk.server";
import { serverGetMyOpenRooms, serverSignOutRoom, serverEndMyDay } from "./teacher-shift.server";
import { serverVerifyAdminPin } from "./teacher-admin.server";
import {
  serverListAllChildren,
  serverGetChildProfile,
  serverGetChildContacts,
  serverGetChildSiblings,
  serverSearchContacts,
  serverAddChildContact,
  serverRemoveChildContact,
} from "./child-profile.server";

export const listTeachers = createServerFn({ method: "GET" }).handler(async () => {
  return serverListTeachers();
});

export const getClassrooms = createServerFn({ method: "GET" }).handler(async () => {
  return serverGetClassrooms();
});

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  return serverGetDashboard();
});

export const getDailyAttendanceReport = createServerFn({ method: "GET" })
  .validator((data: { todayLocal?: string }) => {
    return z.object({ todayLocal: z.string().optional() }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverGetDailyAttendanceReport(data.todayLocal || "");
  });

export const verifyTeacherPin = createServerFn({ method: "POST" })
  .validator((data: { pin: string }) => {
    return z.object({ pin: z.string().min(1) }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverVerifyTeacherPin(data.pin);
  });

export const verifyAdminPin = createServerFn({ method: "POST" })
  .validator((data: { pin: string }) => {
    return z.object({ pin: z.string().min(1) }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverVerifyAdminPin(data.pin);
  });

export const beginClassroomSession = createServerFn({ method: "POST" })
  .validator(
    (data: {
      classroomId: string;
      teacherName: string;
      localTime24: string;
      localDate: string;
      switchRooms?: boolean;
    }) => {
      return z
        .object({
          classroomId: z.string().min(1),
          teacherName: z.string().min(1),
          localTime24: z.string().min(1),
          localDate: z.string().min(1),
          switchRooms: z.boolean().optional(),
        })
        .parse(data);
    },
  )
  .handler(async ({ data }) => {
    return serverBeginClassroomSession(
      data.classroomId,
      data.teacherName,
      data.localTime24,
      data.localDate,
      data.switchRooms,
    );
  });

export const endClassroomSession = createServerFn({ method: "POST" })
  .validator(
    (data: {
      classroomId: string;
      teacherName: string;
      localTime24: string;
      localDate: string;
    }) => {
      return z
        .object({
          classroomId: z.string().min(1),
          teacherName: z.string().min(1),
          localTime24: z.string().min(1),
          localDate: z.string().min(1),
        })
        .parse(data);
    },
  )
  .handler(async ({ data }) => {
    return serverEndClassroomSession(
      data.classroomId,
      data.teacherName,
      data.localTime24,
      data.localDate,
    );
  });

// ---------------------------------------------------------------------------
// Multi-room teacher shifts — "My Open Rooms", per-room sign out, "End My Day"
// ---------------------------------------------------------------------------

export const getMyOpenRooms = createServerFn({ method: "POST" })
  .validator((data: { teacherName: string }) => {
    return z.object({ teacherName: z.string().min(1) }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverGetMyOpenRooms(data.teacherName);
  });

export const signOutRoom = createServerFn({ method: "POST" })
  .validator((data: { recordId: string; clockOutTime: string }) => {
    return z.object({ recordId: z.string().min(1), clockOutTime: z.string().min(1) }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverSignOutRoom(data.recordId, data.clockOutTime);
  });

export const endMyDay = createServerFn({ method: "POST" })
  .validator((data: { teacherName: string; clockOutTime: string }) => {
    return z
      .object({ teacherName: z.string().min(1), clockOutTime: z.string().min(1) })
      .parse(data);
  })
  .handler(async ({ data }) => {
    return serverEndMyDay(data.teacherName, data.clockOutTime);
  });

export const getClassroomRoster = createServerFn({ method: "GET" })
  .validator((data: { classroomId: string; todayLocal?: string }) => {
    return z
      .object({
        classroomId: z.string().min(1),
        todayLocal: z.string().optional(),
      })
      .parse(data);
  })
  .handler(async ({ data }) => {
    return serverGetClassroomRoster(data.classroomId, data.todayLocal);
  });

export const getChildPickupContacts = createServerFn({ method: "GET" })
  .validator((data: { childId: string }) => {
    return z.object({ childId: z.string().min(1) }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverGetChildPickupContacts(data.childId);
  });

export const signEvent = createServerFn({ method: "POST" })
  .validator(
    (data: {
      childId: string;
      teacherId: string;
      classroomId: string;
      type: "in" | "out";
      pickupContactId: string;
      pickupContactName?: string;
      childName?: string;
      studentId?: string;
      teacherName?: string;
      classroomName?: string;
      localTime24?: string;
      localDate?: string;
    }) => {
      return z
        .object({
          childId: z.string(),
          teacherId: z.string(),
          classroomId: z.string(),
          type: z.enum(["in", "out"]),
          pickupContactId: z.string(),
          pickupContactName: z.string().optional(),
          childName: z.string().optional(),
          studentId: z.string().optional(),
          teacherName: z.string().optional(),
          classroomName: z.string().optional(),
          localTime24: z.string().optional(),
          localDate: z.string().optional(),
        })
        .parse(data);
    },
  )
  .handler(async ({ data }) => {
    return serverSignEvent(data);
  });

// ---------------------------------------------------------------------------
// Manual attendance entry (admin correction/backfill tool)
// ---------------------------------------------------------------------------

export const searchChildren = createServerFn({ method: "GET" })
  .validator((data: { query?: string }) => {
    return z.object({ query: z.string().optional() }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverSearchChildren(data.query || "");
  });

export const listAttendanceByDate = createServerFn({ method: "GET" })
  .validator((data: { startDate: string; endDate: string; classrooms?: string[] }) => {
    return z
      .object({
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        classrooms: z.array(z.string()).optional(),
      })
      .parse(data);
  })
  .handler(async ({ data }) => {
    return serverListAttendanceByDate({
      startDate: data.startDate,
      endDate: data.endDate,
      classrooms: data.classrooms || [],
    });
  });

export const createManualAttendance = createServerFn({ method: "POST" })
  .validator(
    (data: {
      type: "in" | "out";
      childId: string;
      childName: string;
      classroom: string;
      signerName: string;
      time24: string;
      date: string;
      pickupPerson?: string;
    }) => {
      return z
        .object({
          type: z.enum(["in", "out"]),
          childId: z.string().min(1),
          childName: z.string().min(1),
          classroom: z.string(),
          signerName: z.string(),
          time24: z.string().min(1),
          date: z.string().min(1),
          pickupPerson: z.string().optional(),
        })
        .parse(data);
    },
  )
  .handler(async ({ data }) => {
    return serverCreateManualAttendance(data);
  });

export const editManualAttendance = createServerFn({ method: "POST" })
  .validator(
    (data: {
      recordId: string;
      classroom?: string;
      signerName?: string;
      time24?: string;
      type?: "in" | "out";
      pickupPerson?: string;
      date?: string;
    }) => {
      return z
        .object({
          recordId: z.string().min(1),
          classroom: z.string().optional(),
          signerName: z.string().optional(),
          time24: z.string().optional(),
          type: z.enum(["in", "out"]).optional(),
          pickupPerson: z.string().optional(),
          date: z.string().optional(),
        })
        .parse(data);
    },
  )
  .handler(async ({ data }) => {
    return serverEditManualAttendance(data);
  });

export const deleteManualAttendance = createServerFn({ method: "POST" })
  .validator((data: { recordId: string; childId?: string }) => {
    return z
      .object({
        recordId: z.string().min(1),
        childId: z.string().optional(),
      })
      .parse(data);
  })
  .handler(async ({ data }) => {
    return serverDeleteManualAttendance(data);
  });

export const listTeacherTimecards = createServerFn({ method: "GET" })
  .validator((data?: { date?: string }) => {
    return z
      .object({
        date: z.string().optional(),
      })
      .optional()
      .parse(data);
  })
  .handler(async ({ data }) => {
    const d = data?.date || new Date().toISOString().split("T")[0];
    return serverListTeacherTimecards(d);
  });

export const createTeacherTimecard = createServerFn({ method: "POST" })
  .validator(
    (data: {
      teacherName: string;
      classroomName: string;
      date: string;
      clockInTime?: string;
      clockOutTime?: string;
    }) => {
      return z
        .object({
          teacherName: z.string().min(1),
          classroomName: z.string(),
          date: z.string().min(1),
          clockInTime: z.string().optional(),
          clockOutTime: z.string().optional(),
        })
        .parse(data);
    },
  )
  .handler(async ({ data }) => {
    return serverCreateTeacherTimecard(data);
  });

export const editTeacherTimecard = createServerFn({ method: "POST" })
  .validator(
    (data: {
      recordId: string;
      classroomName?: string;
      date?: string;
      clockInTime?: string;
      clockOutTime?: string;
    }) => {
      return z
        .object({
          recordId: z.string().min(1),
          classroomName: z.string().optional(),
          date: z.string().optional(),
          clockInTime: z.string().optional(),
          clockOutTime: z.string().optional(),
        })
        .parse(data);
    },
  )
  .handler(async ({ data }) => {
    return serverEditTeacherTimecard(data);
  });

export const deleteTeacherTimecard = createServerFn({ method: "POST" })
  .validator((data: { recordId: string }) => {
    return z
      .object({
        recordId: z.string().min(1),
      })
      .parse(data);
  })
  .handler(async ({ data }) => {
    return serverDeleteTeacherTimecard(data.recordId);
  });

export const bulkDeleteTeacherTimecards = createServerFn({ method: "POST" })
  .validator((data: { recordIds: string[] }) => {
    return z
      .object({
        recordIds: z.array(z.string().min(1)).min(1),
      })
      .parse(data);
  })
  .handler(async ({ data }) => {
    return serverBulkDeleteTeacherTimecards(data.recordIds);
  });

export const bulkDeleteManualAttendance = createServerFn({ method: "POST" })
  .validator((data: { entries: { recordId: string; childId?: string }[] }) => {
    return z
      .object({
        entries: z
          .array(
            z.object({
              recordId: z.string().min(1),
              childId: z.string().optional(),
            }),
          )
          .min(1),
      })
      .parse(data);
  })
  .handler(async ({ data }) => {
    return serverBulkDeleteManualAttendance(data.entries);
  });

export const getMainBook = createServerFn({ method: "GET" })
  .validator((data: { todayLocal?: string }) => {
    return z.object({ todayLocal: z.string().optional() }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverGetMainBook(data.todayLocal || "");
  });

export const getWeeklyDcfReport = createServerFn({ method: "GET" })
  .validator((data: { classroomId: string; anchorDate?: string }) => {
    return z
      .object({
        classroomId: z.string().min(1),
        anchorDate: z.string().optional(),
      })
      .parse(data);
  })
  .handler(async ({ data }) => {
    return serverGetWeeklyDcfReport(data.classroomId, data.anchorDate);
  });

export const getMainBookWeeklyDcfReport = createServerFn({ method: "GET" })
  .validator((data: { anchorDate?: string; classrooms?: string[] }) => {
    return z
      .object({
        anchorDate: z.string().optional(),
        classrooms: z.array(z.string()).optional(),
      })
      .parse(data);
  })
  .handler(async ({ data }) => {
    return serverGetMainBookWeeklyDcfReport({
      anchorDate: data.anchorDate,
      classrooms: data.classrooms,
    });
  });

// ---------------------------------------------------------------------------
// Child Profile (admin) — /children and /children/$id
// ---------------------------------------------------------------------------

export const listAllChildren = createServerFn({ method: "GET" }).handler(async () => {
  return serverListAllChildren();
});

export const getChildProfile = createServerFn({ method: "GET" })
  .validator((data: { childId: string }) => {
    return z.object({ childId: z.string().min(1) }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverGetChildProfile(data.childId);
  });

export const getChildContacts = createServerFn({ method: "GET" })
  .validator((data: { childId: string }) => {
    return z.object({ childId: z.string().min(1) }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverGetChildContacts(data.childId);
  });

export const getChildSiblings = createServerFn({ method: "GET" })
  .validator((data: { childId: string }) => {
    return z.object({ childId: z.string().min(1) }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverGetChildSiblings(data.childId);
  });

export const searchContacts = createServerFn({ method: "GET" })
  .validator((data: { query?: string }) => {
    return z.object({ query: z.string().optional() }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverSearchContacts(data.query || "");
  });

export const addChildContact = createServerFn({ method: "POST" })
  .validator((data: { childId: string; contactId: string; associationId: string }) => {
    return z
      .object({
        childId: z.string().min(1),
        contactId: z.string().min(1),
        associationId: z.string().min(1),
      })
      .parse(data);
  })
  .handler(async ({ data }) => {
    return serverAddChildContact(data.childId, data.contactId, data.associationId);
  });

export const removeChildContact = createServerFn({ method: "POST" })
  .validator((data: { relationId: string }) => {
    return z.object({ relationId: z.string().min(1) }).parse(data);
  })
  .handler(async ({ data }) => {
    return serverRemoveChildContact(data.relationId);
  });
