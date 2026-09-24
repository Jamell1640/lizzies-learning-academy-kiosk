import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  LogOut,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  Search,
  Lock,
  LogIn,
  Unlock,
  LayoutDashboard,
  Plus,
  Users,
} from "lucide-react";
import type { Teacher, Child, PickupContact, Classroom } from "@/lib/kiosk.types";
import { ChildCard } from "./ChildCard";
import { SignModal } from "./SignModal";
import { AtAGlanceView } from "./AtAGlanceView";
import { useInactivityTimer } from "./useInactivityTimer";
import { useClassroomLock } from "./useClassroomLock";
import { AdminUnlockModal } from "./AdminUnlockModal";
import { useRoomRatio } from "./useRoomRatio";
import { getClassroomRoster, signEvent } from "@/lib/kiosk.functions";
import { formatCrmTime } from "@/lib/kiosk-time";
import { useOfflineSignQueue } from "@/lib/use-offline-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KOALA_MASCOT_URL } from "@/lib/brand";

function getLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function getLocalTime24(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface RosterScreenProps {
  teacher: Teacher;
  classroom: Classroom | null;
  onSwitchClassroom: () => void;
  onAddRoom?: () => void;
  /** Switch directly into another room the teacher is already clocked into
   *  (no new clock-in — they're already staffed there). Each "Also staffed
   *  in" room name is a clickable link that calls this. */
  onSwitchToRoom?: (room: { classroomId?: string; classroomName: string }) => void;
}

export function RosterScreen({
  teacher,
  classroom,
  onSwitchClassroom,
  onAddRoom,
  onSwitchToRoom,
}: RosterScreenProps) {
  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "in" | "out">("all");
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  const [view, setView] = useState<"glance" | "manage">("glance");

  const classroomId = classroom?.id || teacher.classroomId || "";
  const classroomName = classroom?.name || teacher.classroomName || "Classroom";

  const { locked, unlock, relock } = useClassroomLock(classroomId);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const navigate = useNavigate();

  const {
    ratioStatus,
    ratioSignedIn,
    ratioLimit,
    teacherClockInTime,
    teacherClockOutTime,
    otherOpenRooms,
    loadRatioStatus,
  } = useRoomRatio(classroomId, classroomName, teacher.name, children);

  const { queue, isOnline, isSyncing, enqueue, syncQueue } = useOfflineSignQueue(() => {
    loadRoster();
  });

  const INACTIVITY_MS = 45_000;
  useInactivityTimer(
    view === "manage",
    () => {
      setView("glance");
      setIsSignModalOpen(false);
      setSelectedChild(null);
      toast.info("Returned to At-a-Glance view (inactivity).");
    },
    INACTIVITY_MS,
  );

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
          " • " +
          now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  const loadRoster = async () => {
    if (!classroomId) {
      toast.error("No classroom assigned to this teacher. Please re-enter your PIN.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await getClassroomRoster({
        data: { classroomId, todayLocal: getLocalDate() },
      });
      setChildren(data || []);
    } catch (err: any) {
      console.error("Failed loading classroom roster", err);
      setChildren([]);
      toast.error(err?.message || "Could not load classroom roster from CRM. Please retry.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
    loadRatioStatus();
    const poll = setInterval(loadRoster, 45000);
    const ratioPoll = setInterval(loadRatioStatus, 45000);
    return () => {
      clearInterval(poll);
      clearInterval(ratioPoll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId]);

  useEffect(() => {
    if (!locked) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "This classroom is locked. Ask an admin to unlock it before leaving the tracker.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [locked]);

  const handleSelectChild = (child: Child) => {
    setSelectedChild(child);
    setIsSignModalOpen(true);
  };

  const handleConfirmSign = async ({
    child,
    type,
    pickupContact,
  }: {
    child: Child;
    type: "in" | "out";
    pickupContact: PickupContact;
  }) => {
    setIsSubmitting(true);
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const localTime24 = getLocalTime24();
    const localDate = getLocalDate();
    const previousChildren = [...children];

    try {
      if (!navigator.onLine) {
        setChildren((prev) =>
          prev.map((c) =>
            c.id === child.id
              ? {
                  ...c,
                  status: type,
                  lastCheckTime: timeStr,
                  lastPickupPerson: `${pickupContact.name} (${pickupContact.relationship})`,
                }
              : c,
          ),
        );
        enqueue({
          childId: child.id,
          teacherId: teacher.id,
          classroomId,
          type,
          pickupContactId: pickupContact.id,
          pickupContactName: `${pickupContact.name} (${pickupContact.relationship})`,
          childName: child.name,
          studentId: child.studentId,
          teacherName: teacher.name,
          classroomName,
          localTime24,
          localDate,
        });
        toast.warning(
          `Offline: ${child.name} signed ${type === "in" ? "in" : "out"} (queued locally)`,
        );
      } else {
        const res = await signEvent({
          data: {
            childId: child.id,
            teacherId: teacher.id,
            classroomId,
            type,
            pickupContactId: pickupContact.id,
            pickupContactName: `${pickupContact.name} (${pickupContact.relationship})`,
            childName: child.name,
            studentId: child.studentId,
            teacherName: teacher.name,
            classroomName,
            localTime24,
            localDate,
          },
        });
        if (res?.synced) {
          setChildren((prev) =>
            prev.map((c) =>
              c.id === child.id
                ? {
                    ...c,
                    status: type,
                    lastCheckTime: timeStr,
                    lastPickupPerson: `${pickupContact.name} (${pickupContact.relationship})`,
                  }
                : c,
            ),
          );
          toast.success(
            `${child.name} successfully signed ${type === "in" ? "in" : "out"} with ${pickupContact.name}`,
          );
        } else {
          toast.error(`CRM write unconfirmed for ${child.name}. Please retry.`);
        }
      }
    } catch (err: any) {
      console.error("Sign event error", err);
      setChildren(previousChildren);
      const msg = err?.message || "";
      const isConfigOrApi =
        msg.includes("not configured") ||
        msg.includes("Missing Private Integration Token") ||
        msg.includes("CRM request failed") ||
        msg.includes("invalid response") ||
        msg.includes("property locationId");
      if (isConfigOrApi) {
        toast.error(`Could not record ${child.name}'s sign-${type}: ${msg}`);
      } else {
        enqueue({
          childId: child.id,
          teacherId: teacher.id,
          classroomId,
          type,
          pickupContactId: pickupContact.id,
          pickupContactName: `${pickupContact.name} (${pickupContact.relationship})`,
          childName: child.name,
          studentId: child.studentId,
          teacherName: teacher.name,
          classroomName,
          localTime24,
          localDate,
        });
        toast.warning(`Network hiccup: saved offline for ${child.name}. Will sync automatically.`);
      }
    } finally {
      setIsSubmitting(false);
      setIsSignModalOpen(false);
      setSelectedChild(null);
      setView("glance");
      loadRatioStatus();
    }
  };

  const totalCount = children.length;
  const presentCount = children.filter((c) => c.status === "in").length;
  const outCount = totalCount - presentCount;

  const filtered = children.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.studentId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filterStatus === "all"
        ? true
        : filterStatus === "in"
          ? c.status === "in"
          : c.status === "out";
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="app-header sticky top-0 z-30 px-4 py-3 tablet:px-4 tablet:py-2.5 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 tablet-port:flex-col">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="mascot-chip">
              <img
                src={KOALA_MASCOT_URL}
                alt="Lizzie's Learning Academy"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-foreground truncate">
                  {classroomName}
                </h1>
                <Badge
                  variant="outline"
                  className="text-xs font-semibold px-2 py-0.5 rounded-md border-primary/25 bg-primary/5 text-primary"
                >
                  Staff: {teacher.name}
                  {(() => {
                    const inFmt = formatCrmTime(teacherClockInTime);
                    if (!inFmt) return null;
                    return (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-success font-semibold">
                        <LogIn className="w-3 h-3" />
                        {inFmt}
                      </span>
                    );
                  })()}
                </Badge>
                {view === "manage" && (
                  <Badge
                    variant="outline"
                    className="text-xs font-semibold px-2 py-0.5 rounded-md border-warning/30 bg-warning/10 text-warning-foreground gap-1"
                  >
                    <Lock className="w-3 h-3" /> Unlocked
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold px-2 py-0.5 rounded-md gap-1 ${
                    locked
                      ? "border-warning/30 bg-warning/10 text-warning-foreground"
                      : "border-success/30 bg-success/10 text-success"
                  }`}
                  title={
                    locked
                      ? "Classroom locked — admin unlock required to leave tracker"
                      : "Classroom unlocked — teacher may leave tracker"
                  }
                >
                  {locked ? (
                    <>
                      <Lock className="w-3 h-3" /> Room Locked
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3" /> Room Unlocked
                    </>
                  )}
                </Badge>
              </div>
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                {currentTime || "Live Kiosk Mode"}
              </p>
              {otherOpenRooms.length > 0 && (
                <p className="text-xs font-medium text-info flex items-center gap-1 mt-0.5 flex-wrap">
                  <Users className="w-3.5 h-3.5" />
                  <span>Also staffed in:</span>
                  {otherOpenRooms.map((r, i) => (
                    <span key={r.classroomName} className="flex items-center gap-1">
                      {onSwitchToRoom ? (
                        <button
                          type="button"
                          onClick={() => onSwitchToRoom(r)}
                          className="font-semibold text-info underline underline-offset-2 hover:text-primary transition-colors cursor-pointer"
                          title={`Open ${r.classroomName} kiosk`}
                        >
                          {r.classroomName}
                        </button>
                      ) : (
                        <span className="font-semibold">{r.classroomName}</span>
                      )}
                      {i < otherOpenRooms.length - 1 && <span className="text-info/60">,</span>}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
            <div className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-lg border border-border text-xs font-semibold">
              <span className="flex items-center gap-1 text-success">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                {presentCount} Present
              </span>
              <span className="text-muted-foreground/60">•</span>
              <span className="text-muted-foreground">{outCount} Out</span>
              <span className="text-muted-foreground">({totalCount} Total)</span>
            </div>

            {!isOnline ? (
              <Badge
                variant="destructive"
                className="gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md"
              >
                <WifiOff className="w-3.5 h-3.5" />
                Offline ({queue.length} Queued)
              </Badge>
            ) : queue.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={syncQueue}
                disabled={isSyncing}
                className="gap-1.5 text-xs font-semibold rounded-md border-warning/40 text-warning-foreground bg-warning/10 hover:bg-warning/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                Sync {queue.length} Queued
              </Button>
            ) : (
              <Badge
                variant="secondary"
                className="hidden sm:inline-flex gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md text-info bg-info/10 border-info/25"
              >
                <Wifi className="w-3.5 h-3.5" />
                Live CRM Synced
              </Badge>
            )}

            <Button
              variant="outline"
              size="icon"
              onClick={loadRoster}
              disabled={isLoading}
              title="Refresh Roster"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>

            {onAddRoom && (
              <Button
                variant="outline"
                onClick={() => {
                  relock();
                  onAddRoom();
                }}
                className="gap-2 h-10 px-3 font-semibold cursor-pointer border-info/40 text-info bg-info/5 hover:bg-info/10"
                title="Clock into another room without signing out of this one"
              >
                <Plus className="w-4 h-4" />
                <span className="whitespace-nowrap">Add Room</span>
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => {
                if (locked) {
                  setIsUnlockModalOpen(true);
                  toast.message(
                    "Ask an admin to unlock this classroom before leaving the tracker.",
                  );
                  return;
                }
                relock();
                navigate({ to: "/dashboard" });
              }}
              className="gap-2 h-10 px-3 font-semibold cursor-pointer"
              title="View the Center Dashboard (admin unlock required while clocked in)"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="whitespace-nowrap">Dashboard</span>
            </Button>

            <Button
              variant="destructive"
              onClick={() => {
                relock();
                onSwitchClassroom();
              }}
              className="gap-2 h-10 px-4 font-semibold cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="whitespace-nowrap">Sign Out / Switch Room</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-4 sm:p-6 tablet:p-4 flex-1 flex flex-col print:hidden">
        {view === "glance" ? (
          <AtAGlanceView
            classroomId={classroomId}
            classroomName={classroomName}
            teacher={teacher}
            teacherClockInTime={teacherClockInTime}
            teacherClockOutTime={teacherClockOutTime}
            children={children}
            presentCount={presentCount}
            totalCount={totalCount}
            ratio={{
              status: ratioStatus,
              signedIn: ratioSignedIn,
              limit: ratioLimit,
            }}
            isLoading={isLoading}
            onManage={() => setView("manage")}
            inactivitySeconds={Math.round(INACTIVITY_MS / 1000)}
          />
        ) : (
          <>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search child by name or student ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 pl-10 pr-4 rounded-lg text-sm bg-card border border-border"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setView("glance");
                    setIsSignModalOpen(false);
                    setSelectedChild(null);
                  }}
                  className="gap-2 h-11 px-4 font-semibold cursor-pointer border-warning/40 text-warning-foreground bg-warning/10 hover:bg-warning/20"
                  title="Lock screen back to At-a-Glance view"
                >
                  <Lock className="w-4 h-4" />
                  <span className="hidden sm:inline">Lock Screen</span>
                </Button>

                <div className="flex items-center gap-1 bg-card p-1 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setFilterStatus("all")}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer ${
                      filterStatus === "all"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All ({totalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus("in")}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer ${
                      filterStatus === "in"
                        ? "bg-success text-success-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Signed In ({presentCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus("out")}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer ${
                      filterStatus === "out"
                        ? "bg-secondary text-secondary-foreground border border-border"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Signed Out ({outCount})
                  </button>
                </div>
              </div>
            </div>

            {isLoading && children.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="mascot-chip mb-3" style={{ width: "3.5rem", height: "3.5rem" }}>
                  <img
                    src={KOALA_MASCOT_URL}
                    alt="Loading"
                    className="w-full h-full object-contain opacity-80"
                  />
                </div>
                <h3 className="text-base font-bold text-foreground">Loading Classroom Roster</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Cross-referencing live attendance records…
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center card-surface border-dashed">
                <div className="mascot-chip mb-3" style={{ width: "3.5rem", height: "3.5rem" }}>
                  <img
                    src={KOALA_MASCOT_URL}
                    alt="Empty Roster"
                    className="w-full h-full object-contain opacity-70"
                  />
                </div>
                <h3 className="text-base font-bold text-foreground">No Children Found</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {searchQuery
                    ? "Try refining your search keyword"
                    : "No enrolled children in this classroom view"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 tablet-land:grid-cols-4 tablet-port:grid-cols-2 gap-3 tablet:gap-3 flex-1 items-start">
                {filtered.map((child) => (
                  <ChildCard key={child.id} child={child} onSelect={handleSelectChild} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <SignModal
        child={selectedChild}
        isOpen={isSignModalOpen}
        onClose={() => {
          setIsSignModalOpen(false);
          setSelectedChild(null);
        }}
        onConfirm={handleConfirmSign}
        isSubmitting={isSubmitting}
      />

      <AdminUnlockModal
        open={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        onUnlocked={() => {
          unlock();
          setIsUnlockModalOpen(false);
          toast.success(`${classroomName} unlocked. You may now leave the tracker.`);
        }}
        classroomName={classroomName}
      />
    </div>
  );
}
