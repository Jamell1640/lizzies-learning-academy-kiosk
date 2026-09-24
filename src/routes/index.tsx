import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import type { Teacher, Classroom } from "@/lib/kiosk.types";
import { getLocalTime24, getLocalDate, formatCrmTime } from "@/lib/kiosk-time";
import { RefreshCw } from "lucide-react";
import {
  verifyTeacherPin,
  beginClassroomSession,
  endClassroomSession,
  getMyOpenRooms,
  getClassrooms,
} from "@/lib/kiosk.functions";
import { PinPad } from "@/components/PinPad";
import { RosterScreen } from "@/components/RosterScreen";
import { ClassroomPicker } from "@/components/ClassroomPicker";
import { MyOpenRoomsView } from "@/components/MyOpenRoomsView";
import { AdminGateModal } from "@/components/AdminGateModal";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lizzie's Learning Academy — Classroom Kiosk" },
      {
        name: "description",
        content:
          "Classroom attendance sign-in and sign-out kiosk for Lizzie's Learning Academy teachers.",
      },
      { property: "og:title", content: "Lizzie's Learning Academy — Classroom Kiosk" },
      {
        property: "og:description",
        content:
          "Classroom attendance sign-in and sign-out kiosk for Lizzie's Learning Academy teachers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:image",
        content:
          "https://vibe.filesafe.space/1789916937915976068/attachments/695daf23-a442-47f0-a5cd-ffab47c7d455.png",
      },
      {
        name: "twitter:image",
        content:
          "https://vibe.filesafe.space/1789916937915976068/attachments/695daf23-a442-47f0-a5cd-ffab47c7d455.png",
      },
    ],
  }),
  component: KioskIndex,
});

const AUTH_STORAGE_KEY = "childcare_kiosk_teacher_session";
const CLASSROOM_STORAGE_KEY = "childcare_kiosk_active_classroom";

// Kiosk stages. A PIN verifies identity only; the classroom is then chosen
// per-session from the picker. Selecting a classroom stamps the active
// teacher + check-in time on that classroom record; signing out stamps the
// check-out time, clears the teacher, and returns to PIN.
// "myrooms" = My Open Rooms view (teacher PIN, lists every open room).
// "myrooms-pin" = PIN entry that opens the My Open Rooms view.
type Stage = "pin" | "picker" | "roster" | "myrooms" | "myrooms-pin";

interface SavedSession {
  teacher: Teacher;
  classroom: Classroom | null;
}

function KioskIndex() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("pin");
  const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);
  const [activeClassroom, setActiveClassroom] = useState<Classroom | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  // Parent-level guard: a classroom selection is in flight. Prevents a
  // double-tap on a classroom card (or a rapid re-tap after the picker
  // re-renders) from firing beginClassroomSession twice and creating two
  // duplicate teacher_attendance clock-in records.
  const selectingRef = useRef(false);

  // While resolving the saved teacher's actual open room from the CRM.
  const [restoring, setRestoring] = useState(false);

  // Restore an in-progress session. Instead of trusting the (possibly stale)
  // classroom saved in localStorage, look up the teacher's ACTUAL open
  // teacher_attendance shifts and route to the room they're really clocked
  // into. This makes every entry point to "/" (sidebar "Kiosk Tablet" link,
  // dashboard "Open in Kiosk", header "Kiosk Roster") land in the correct
  // room. If no open shift exists, go to the classroom picker; if no saved
  // teacher, stay on the PIN keypad.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!saved) return;
    let cancelled = false;
    let identity: Teacher;
    let savedRoom: Classroom | null = null;
    try {
      const session: SavedSession = JSON.parse(saved);
      if (!session?.teacher) return;
      identity = { ...session.teacher, classroomId: "", classroomName: "" };
      savedRoom = session.classroom || null;
    } catch (e) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(CLASSROOM_STORAGE_KEY);
      return;
    }
    setCurrentTeacher(identity);
    setRestoring(true);
    (async () => {
      try {
        let openRooms: { classroomId?: string; classroomName: string }[] = [];
        try {
          openRooms = (await getMyOpenRooms({ data: { teacherName: identity.name } })) || [];
        } catch (e) {
          console.warn("[kiosk restore] getMyOpenRooms failed", e);
        }
        if (cancelled) return;
        if (openRooms.length > 0) {
          // Prefer the previously-saved classroom if it's still open; else
          // the first open room.
          const chosen =
            (savedRoom &&
              openRooms.find(
                (r) => r.classroomId === savedRoom.id || r.classroomName === savedRoom.name,
              )) ||
            openRooms[0];
          // Resolve the full Classroom record so RosterScreen has capacity etc.
          let classroomObj: Classroom | null = null;
          try {
            const allRooms = (await getClassrooms()) || [];
            if (cancelled) return;
            classroomObj =
              allRooms.find(
                (r) => r.id === chosen.classroomId || r.name === chosen.classroomName,
              ) || null;
          } catch (e) {
            console.warn("[kiosk restore] getClassrooms failed", e);
          }
          if (!classroomObj) {
            classroomObj = {
              id: chosen.classroomId || "",
              name: chosen.classroomName,
              ageGroup: "",
              assignedTeacher: identity.name,
              capacity: 0,
              classroomRatio: 0,
            };
          }
          const teacherWithRoom: Teacher = {
            ...identity,
            classroomId: classroomObj.id,
            classroomName: classroomObj.name,
          };
          if (cancelled) return;
          setCurrentTeacher(teacherWithRoom);
          setActiveClassroom(classroomObj);
          persistSession(teacherWithRoom, classroomObj);
          setStage("roster");
        } else {
          // No open shift — go to the classroom picker.
          persistSession(identity, null);
          setStage("picker");
        }
      } catch (e) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(CLASSROOM_STORAGE_KEY);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSession = (teacher: Teacher, classroom: Classroom | null) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ teacher, classroom } satisfies SavedSession),
    );
  };

  const clearSession = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(CLASSROOM_STORAGE_KEY);
    }
  };

  // FEATURE 1 — PIN gate: verify identity only, then go to classroom picker.
  const handleUnlock = async (pin: string): Promise<boolean> => {
    setIsVerifying(true);
    setPinError(null);
    try {
      const teacher = await verifyTeacherPin({ data: { pin } });
      if (teacher) {
        const identity: Teacher = { ...teacher, classroomId: "", classroomName: "" };
        setCurrentTeacher(identity);
        persistSession(identity, null);
        toast.success(`Welcome, ${identity.name}! Select your classroom.`);
        setStage("picker");
        return true;
      } else {
        setPinError("Invalid PIN. Please enter your 4-digit teacher code.");
        return false;
      }
    } catch (err: any) {
      console.error("PIN verification error", err);
      setPinError(err?.message || "Could not verify PIN. Please try again.");
      return false;
    } finally {
      setIsVerifying(false);
    }
  };

  // "My Open Rooms" entry from the keypad: verify the teacher's OWN PIN (not
  // an admin PIN), then show the My Open Rooms view. Reuses handleUnlock's
  // verification — a valid teacher PIN opens the view.
  const handleMyOpenRoomsPin = async (pin: string): Promise<boolean> => {
    setIsVerifying(true);
    setPinError(null);
    try {
      const teacher = await verifyTeacherPin({ data: { pin } });
      if (teacher) {
        const identity: Teacher = { ...teacher, classroomId: "", classroomName: "" };
        setCurrentTeacher(identity);
        setStage("myrooms");
        return true;
      } else {
        setPinError("Invalid PIN. Please enter your 4-digit teacher code.");
        return false;
      }
    } catch (err: any) {
      setPinError(err?.message || "Could not verify PIN. Please try again.");
      return false;
    } finally {
      setIsVerifying(false);
    }
  };

  // On classroom selection: create a teacher_attendance clock-in record and
  // set the classroom's current_teacher pointer (live "who's here now").
  // Shift times live on teacher_attendance, not on the classrooms object.
  //
  // GUARDRAIL: only a duplicate open shift in the SAME classroom is blocked
  // (idempotent — lets the teacher in without creating a second record).
  // Multi-classroom clock-in is allowed, so an open shift in a DIFFERENT
  // classroom does NOT block this clock-in.
  const handleSelectClassroom = async (classroom: Classroom) => {
    if (!currentTeacher) return;
    if (selectingRef.current) {
      console.log("[kiosk] classroom selection already in flight, ignoring duplicate");
      return;
    }
    selectingRef.current = true;
    const localTime24 = getLocalTime24();
    const localDate = getLocalDate();
    try {
      const result = await beginClassroomSession({
        data: {
          classroomId: classroom.id,
          teacherName: currentTeacher.name,
          localTime24,
          localDate,
        },
      });
      // alreadyClockedInHere is ok:true — teacher is let in (idempotent).
      // Only a hard !ok would block, which no longer happens for same-room.
      if (!result.ok) {
        toast.error("Could not start classroom session. Please try again.");
        return;
      }
      if (result.alreadyClockedInHere) {
        toast.info(`Already clocked in to ${classroom.name} — resuming your session.`);
      }
    } catch (err: any) {
      console.error("Failed to begin classroom session", err);
      toast.error(`Could not start classroom session: ${err?.message || "CRM error"}`);
      return;
    } finally {
      selectingRef.current = false;
    }
    const teacherWithRoom: Teacher = {
      ...currentTeacher,
      classroomId: classroom.id,
      classroomName: classroom.name,
    };
    setActiveClassroom(classroom);
    setCurrentTeacher(teacherWithRoom);
    persistSession(teacherWithRoom, classroom);
    setStage("roster");
    toast.success(`${classroom.name} roster opened.`);
  };

  // "Add Another Room": go back to the classroom picker WITHOUT signing out
  // of the current room. The teacher's open shift in the current room stays
  // open; selecting a new classroom creates a second open shift there.
  const handleAddRoom = () => {
    // Keep currentTeacher identity, but clear the active classroom so the
    // picker shows. The open shift in the previous room is untouched.
    setActiveClassroom(null);
    const identity: Teacher = {
      ...currentTeacher!,
      classroomId: "",
      classroomName: "",
    };
    setCurrentTeacher(identity);
    persistSession(identity, null);
    setStage("picker");
    toast.info("Select another room to clock into. Your current room stays open.");
  };

  // Switch directly into another room the teacher is ALREADY clocked into
  // (from the "Also staffed in" links). No new clock-in — they're already
  // staffed there. Resolves the full classroom record so RosterScreen has
  // capacity etc., then updates the saved session so a reload lands in the
  // right room.
  const handleSwitchToRoom = async (room: { classroomId?: string; classroomName: string }) => {
    if (!currentTeacher) return;
    let classroomObj: Classroom | null = null;
    try {
      const allRooms = (await getClassrooms()) || [];
      classroomObj =
        allRooms.find((r) => r.id === room.classroomId || r.name === room.classroomName) || null;
    } catch (e) {
      console.warn("[handleSwitchToRoom] getClassrooms failed", e);
    }
    if (!classroomObj) {
      classroomObj = {
        id: room.classroomId || "",
        name: room.classroomName,
        ageGroup: "",
        assignedTeacher: currentTeacher.name,
        capacity: 0,
        classroomRatio: 0,
      };
    }
    const teacherWithRoom: Teacher = {
      ...currentTeacher,
      classroomId: classroomObj.id,
      classroomName: classroomObj.name,
    };
    setCurrentTeacher(teacherWithRoom);
    setActiveClassroom(classroomObj);
    persistSession(teacherWithRoom, classroomObj);
    setStage("roster");
    toast.success(`${classroomObj.name} roster opened.`);
  };

  // Sign Out / Switch Room: closes ONLY the currently-viewed classroom's open
  // shift for this teacher (endClassroomSession is scoped to classroomId +
  // teacherName). Other open rooms are untouched. Then return to PIN.
  const handleSignOutSession = async () => {
    if (activeClassroom && currentTeacher) {
      try {
        await endClassroomSession({
          data: {
            classroomId: activeClassroom.id,
            teacherName: currentTeacher.name,
            localTime24: getLocalTime24(),
            localDate: getLocalDate(),
          },
        });
      } catch (err: any) {
        console.warn("Failed to end classroom session", err);
      }
    }
    setCurrentTeacher(null);
    setActiveClassroom(null);
    setStage("pin");
    clearSession();
    toast.info("Signed out of this room. Enter a PIN to continue.");
  };

  // From My Open Rooms: when all rooms are closed (or user goes back), return
  // to the PIN screen.
  const handleMyOpenRoomsBack = () => {
    setCurrentTeacher(null);
    setStage("pin");
  };

  // From the picker: go back to PIN (no classroom session is active here).
  const handleChangeTeacher = () => {
    setCurrentTeacher(null);
    setActiveClassroom(null);
    setStage("pin");
    clearSession();
  };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20">
      <Toaster position="bottom-center" richColors duration={3500} closeButton />
      <AdminGateModal
        open={adminGateOpen}
        onClose={() => setAdminGateOpen(false)}
        onAuthorized={() => {
          setAdminGateOpen(false);
          navigate({ to: "/dashboard" });
        }}
      />
      {restoring ? (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
          <RefreshCw className="w-7 h-7 animate-spin text-primary" />
          <p className="text-sm font-semibold">Resuming your session…</p>
        </div>
      ) : stage === "pin" || (!currentTeacher && stage !== "myrooms" && stage !== "myrooms-pin") ? (
        <div className="relative">
          <PinPad
            onUnlock={handleUnlock}
            isLoading={isVerifying}
            error={pinError}
            onMyOpenRooms={() => {
              setPinError(null);
              // Use a lightweight inline PIN flow: re-purpose handleMyOpenRoomsPin
              // by prompting. Simpler: just verify via the same pad with a flag.
              // We open a dedicated mini-flow by switching to a myrooms-pin stage.
              setStage("myrooms-pin");
            }}
          />
          <button
            type="button"
            onClick={() => setAdminGateOpen(true)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors px-4 py-2 rounded-lg hover:bg-accent/40 cursor-pointer"
          >
            View Center Dashboard →
          </button>
        </div>
      ) : stage === "myrooms-pin" ? (
        <div className="relative">
          <PinPad
            onUnlock={handleMyOpenRoomsPin}
            isLoading={isVerifying}
            error={pinError}
            onMyOpenRooms={undefined}
          />
          <button
            type="button"
            onClick={() => {
              setPinError(null);
              setStage("pin");
            }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors px-4 py-2 rounded-lg hover:bg-accent/40 cursor-pointer"
          >
            ← Back to Sign-In
          </button>
        </div>
      ) : stage === "myrooms" && currentTeacher ? (
        <MyOpenRoomsView
          teacher={currentTeacher}
          onBack={handleMyOpenRoomsBack}
          onAllClosed={handleMyOpenRoomsBack}
        />
      ) : stage === "picker" ? (
        <ClassroomPicker
          teacher={currentTeacher!}
          onSelect={handleSelectClassroom}
          onBack={handleChangeTeacher}
        />
      ) : (
        <RosterScreen
          teacher={currentTeacher!}
          classroom={activeClassroom}
          onSwitchClassroom={handleSignOutSession}
          onAddRoom={handleAddRoom}
          onSwitchToRoom={handleSwitchToRoom}
        />
      )}
    </div>
  );
}
