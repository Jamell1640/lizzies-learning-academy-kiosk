import { useState, useEffect, useCallback } from "react";
import {
  LogOut,
  RefreshCw,
  Clock,
  LogIn,
  DoorOpen,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import type { Teacher } from "@/lib/kiosk.types";
import { getMyOpenRooms, signOutRoom, endMyDay } from "@/lib/kiosk.functions";
import { formatCrmTime, getLocalTime24 } from "@/lib/kiosk-time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KOALA_MASCOT_URL } from "@/lib/brand";

interface MyOpenRoom {
  recordId: string;
  classroomName: string;
  classroomId?: string;
  date: string;
  clockInTime: string | number;
}

interface MyOpenRoomsViewProps {
  teacher: Teacher;
  onBack: () => void;
  onAllClosed: () => void;
}

export function MyOpenRoomsView({ teacher, onBack, onAllClosed }: MyOpenRoomsViewProps) {
  const [rooms, setRooms] = useState<MyOpenRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null);
  const [isEndingDay, setIsEndingDay] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getMyOpenRooms({ data: { teacherName: teacher.name } });
      setRooms(data || []);
    } catch (err: any) {
      console.error("Failed loading open rooms", err);
      toast.error(err?.message || "Could not load your open rooms.");
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  }, [teacher.name]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSignOutRoom = async (room: MyOpenRoom) => {
    setBusyRecordId(room.recordId);
    try {
      await signOutRoom({
        data: { recordId: room.recordId, clockOutTime: getLocalTime24() },
      });
      toast.success(`Signed out of ${room.classroomName}.`);
      const remaining = rooms.filter((r) => r.recordId !== room.recordId);
      setRooms(remaining);
      if (remaining.length === 0) {
        toast.info("All rooms closed. Have a great day!");
        onAllClosed();
      }
    } catch (err: any) {
      console.error("Sign out room failed", err);
      toast.error(`Could not sign out of ${room.classroomName}: ${err?.message || "error"}`);
    } finally {
      setBusyRecordId(null);
    }
  };

  const handleEndMyDay = async () => {
    if (rooms.length === 0) return;
    const confirmed = window.confirm(
      `Close ALL ${rooms.length} open room(s) at once? This signs you out of every room you're currently clocked into.`,
    );
    if (!confirmed) return;
    setIsEndingDay(true);
    try {
      const res = await endMyDay({
        data: { teacherName: teacher.name, clockOutTime: getLocalTime24() },
      });
      toast.success(`Day ended. Closed ${res?.closedCount ?? rooms.length} room(s).`);
      setRooms([]);
      onAllClosed();
    } catch (err: any) {
      console.error("End my day failed", err);
      toast.error(`Could not end your day: ${err?.message || "error"}`);
      load();
    } finally {
      setIsEndingDay(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="app-header sticky top-0 z-30 px-4 py-3 tablet:px-4 tablet:py-2.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="mascot-chip">
              <img
                src={KOALA_MASCOT_URL}
                alt="Lizzie's Learning Academy"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-foreground truncate">
                My Open Rooms
              </h1>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                {teacher.name} — close out any room you're clocked into
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={onBack}
            className="gap-2 font-semibold cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full p-4 sm:p-6 tablet:p-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-lg border border-border text-xs font-semibold">
            <DoorOpen className="w-4 h-4 text-primary" />
            <span className="text-foreground">
              {isLoading ? "Loading…" : `${rooms.length} open`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={load}
              disabled={isLoading}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            {rooms.length > 0 && (
              <Button
                variant="destructive"
                onClick={handleEndMyDay}
                disabled={isEndingDay}
                className="gap-2 font-semibold cursor-pointer"
              >
                {isEndingDay ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span className="whitespace-nowrap">End My Day</span>
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="mascot-chip mb-3" style={{ width: "3.5rem", height: "3.5rem" }}>
              <img
                src={KOALA_MASCOT_URL}
                alt="Loading"
                className="w-full h-full object-contain opacity-80"
              />
            </div>
            <h3 className="text-base font-bold text-foreground">Loading Your Rooms</h3>
            <p className="text-muted-foreground text-sm mt-1">Checking open shifts…</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center card-surface border-dashed">
            <div className="mascot-chip mb-3" style={{ width: "3.5rem", height: "3.5rem" }}>
              <img
                src={KOALA_MASCOT_URL}
                alt="No open rooms"
                className="w-full h-full object-contain opacity-70"
              />
            </div>
            <h3 className="text-base font-bold text-foreground">No Open Rooms</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-sm">
              You're not currently clocked into any classroom. Enter your PIN and select a classroom
              to start a shift.
            </p>
            <Button onClick={onBack} className="mt-5 gap-2 cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
              Back to Sign-In
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rooms.map((room) => {
              const inFmt = formatCrmTime(room.clockInTime);
              const isBusy = busyRecordId === room.recordId;
              return (
                <div
                  key={room.recordId}
                  className="card-surface p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-foreground truncate">
                        {room.classroomName}
                      </h3>
                      <Badge
                        variant="outline"
                        className="text-xs font-semibold px-2 py-0.5 rounded-md border-success/30 bg-success/10 text-success gap-1"
                      >
                        <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                        Clocked In
                      </Badge>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mt-1">
                      <LogIn className="w-3.5 h-3.5 text-success" />
                      Since {inFmt || "earlier"}
                      {room.date && (
                        <>
                          <Clock className="w-3.5 h-3.3 ml-1.5 text-muted-foreground" />
                          {room.date}
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => handleSignOutRoom(room)}
                    disabled={isBusy}
                    className="gap-2 shrink-0 cursor-pointer"
                  >
                    {isBusy ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                    <span className="whitespace-nowrap">Sign Out</span>
                  </Button>
                </div>
              );
            })}

            <div className="mt-2 p-3 rounded-lg bg-info/5 border border-info/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-info shrink-0 mt-0.5" />
              <p className="text-xs text-info-foreground">
                Signing out of one room does <strong>not</strong> affect your other open rooms. Use{" "}
                <strong>End My Day</strong> to close all of them at once when you leave.
              </p>
            </div>

            <div className="mt-1 p-3 rounded-lg bg-success/5 border border-success/20 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
              <p className="text-xs text-success-foreground">
                Closing a room only clears that room's "staffed by" pointer if no other teacher is
                still clocked in there.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
