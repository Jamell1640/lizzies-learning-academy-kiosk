import {
  Users,
  Clock,
  ShieldCheck,
  ShieldAlert,
  CircleSlash,
  Lock,
  LogIn,
  LogOut,
  Printer,
  Calendar as CalendarIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import type { Child, Teacher } from "@/lib/kiosk.types";
import type { WeeklyDcfReport } from "@/lib/weekly-dcf.types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { KOALA_MASCOT_URL } from "@/lib/brand";
import { formatCrmTime, getLocalDate } from "@/lib/kiosk-time";
import { getWeeklyDcfReport } from "@/lib/kiosk.functions";
import { openPrintWindow } from "@/lib/print-window";
import { buildWeeklyDcfHtml } from "@/lib/print-html";

export interface GlanceRatioInfo {
  status: "in" | "over" | "none" | "empty";
  signedIn: number;
  limit: number;
}

interface AtAGlanceViewProps {
  classroomId: string;
  classroomName: string;
  teacher: Teacher;
  teacherClockInTime?: string | number;
  teacherClockOutTime?: string | number;
  children: Child[];
  presentCount: number;
  totalCount: number;
  ratio: GlanceRatioInfo;
  isLoading: boolean;
  onManage: () => void;
  inactivitySeconds: number;
}

const RATIO_CONFIG: Record<
  "in" | "over" | "none" | "empty",
  { label: string; icon: typeof ShieldCheck; tone: string }
> = {
  in: {
    label: "In Ratio",
    icon: ShieldCheck,
    tone: "bg-success/12 text-success border-success/25",
  },
  over: {
    label: "Over Ratio",
    icon: ShieldAlert,
    tone: "bg-destructive/12 text-destructive border-destructive/25",
  },
  none: {
    label: "No Ratio Set",
    icon: CircleSlash,
    tone: "bg-warning/12 text-warning-foreground border-warning/25",
  },
  empty: {
    label: "No Children Present",
    icon: CircleSlash,
    tone: "bg-muted text-muted-foreground border-border",
  },
};

export function AtAGlanceView({
  classroomId,
  classroomName,
  teacher,
  teacherClockInTime,
  teacherClockOutTime,
  children,
  presentCount,
  totalCount,
  ratio,
  isLoading,
  onManage,
  inactivitySeconds,
}: AtAGlanceViewProps) {
  const presentChildren = children.filter((c) => c.status === "in");
  const cfg = RATIO_CONFIG[ratio.status];
  const RatioIcon = cfg.icon;

  const inTimeFormatted = formatCrmTime(teacherClockInTime);
  const outTimeFormatted = formatCrmTime(teacherClockOutTime);

  // Weekly DCF report — fetched on demand when the teacher taps
  // "Print / Print Preview". `weekAnchor` defaults to today (America/Chicago).
  const [weekAnchor, setWeekAnchor] = useState<string>(() => getLocalDate());
  const [isFetchingWeekly, setIsFetchingWeekly] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  const triggerPrint = useCallback(async () => {
    setIsFetchingWeekly(true);
    setWeeklyError(null);
    try {
      const report: WeeklyDcfReport = await getWeeklyDcfReport({
        data: { classroomId, anchorDate: weekAnchor },
      });
      // Build a fully self-contained HTML document and open it in an
      // isolated print window — window.print() fires only after that
      // document (and the koala logo image) fully loads.
      const html = buildWeeklyDcfHtml(report);
      openPrintWindow(html);
    } catch (err: any) {
      setWeeklyError(err?.message || "Could not load weekly DCF report from CRM.");
    } finally {
      setIsFetchingWeekly(false);
    }
  }, [classroomId, weekAnchor]);

  return (
    <div className="flex-1 flex flex-col gap-5">
      {/* ===== On-screen At-a-Glance ===== */}
      <div className="flex flex-col gap-5">
        {/* Room status summary card */}
        <div className="card-surface p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/15">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Children Present
              </p>
              <p className="text-2xl font-bold text-foreground leading-tight">
                {presentCount}
                <span className="text-sm font-medium text-muted-foreground ml-1">
                  of {totalCount} enrolled
                </span>
              </p>
            </div>
          </div>

          <div className="hidden sm:block w-px h-12 bg-border" />

          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-lg flex items-center justify-center border ${cfg.tone}`}
            >
              <RatioIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ratio Status
              </p>
              <p className="text-base font-bold text-foreground leading-tight">
                {cfg.label}
                {ratio.limit > 0 && (
                  <span className="text-sm font-medium text-muted-foreground ml-1">
                    ({ratio.signedIn}/{ratio.limit})
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="hidden sm:block w-px h-12 bg-border" />

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center border border-border">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Staffed By
              </p>
              <p className="text-base font-bold text-foreground leading-tight truncate max-w-[12rem]">
                {teacher.name || "Unassigned"}
              </p>
              {(inTimeFormatted || outTimeFormatted) && (
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mt-1">
                  {inTimeFormatted && (
                    <span
                      className="inline-flex items-center gap-1 text-success font-semibold"
                      title="Teacher Clock-In Time"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      In: {inTimeFormatted}
                    </span>
                  )}
                  {outTimeFormatted && (
                    <span
                      className="inline-flex items-center gap-1 text-muted-foreground"
                      title="Teacher Clock-Out Time"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Out: {outTimeFormatted}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Read-only list of children currently signed in */}
        <div className="card-surface flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Currently Signed In
            </h2>
            <span className="text-xs font-semibold text-muted-foreground">
              {presentChildren.length} present
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {isLoading && children.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mascot-chip mb-3" style={{ width: "3.5rem", height: "3.5rem" }}>
                  <img
                    src={KOALA_MASCOT_URL}
                    alt="Loading"
                    className="w-full h-full object-contain opacity-80"
                  />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Loading live roster…</p>
              </div>
            ) : presentChildren.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mascot-chip mb-3" style={{ width: "3.5rem", height: "3.5rem" }}>
                  <img
                    src={KOALA_MASCOT_URL}
                    alt="No children present"
                    className="w-full h-full object-contain opacity-70"
                  />
                </div>
                <h3 className="text-base font-bold text-foreground">No Children Present</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  No children are currently signed into {classroomName}.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 tablet-land:grid-cols-4 tablet-port:grid-cols-2 gap-3">
                {presentChildren.map((child) => (
                  <div
                    key={child.id}
                    className="card-surface p-3 flex items-center gap-3 border-success/30 bg-success/[0.03] select-none"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="w-11 h-11 rounded-lg border border-border">
                        {child.photoUrl ? (
                          <AvatarImage
                            src={child.photoUrl}
                            alt={child.name}
                            className="object-cover"
                          />
                        ) : null}
                        <AvatarFallback className="rounded-lg text-sm font-bold bg-primary/10 text-primary">
                          {child.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-card bg-success flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-success-foreground" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{child.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {child.lastCheckTime ? `In at ${child.lastCheckTime}` : "Signed in"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* The ONLY interactive elements on the glance view */}
        <div className="flex flex-col items-center gap-3 pb-2">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
            <Button
              size="lg"
              onClick={onManage}
              className="gap-2 h-14 px-8 text-base font-bold cursor-pointer"
            >
              <Lock className="w-5 h-5" />
              Manage This Room
            </Button>

            {/* Single consolidated print button — matches Main Book's label/placement.
                Opens an isolated print window with the weekly DCF record. */}
            <Button
              size="lg"
              variant="outline"
              onClick={triggerPrint}
              disabled={isFetchingWeekly}
              className="gap-2 h-14 px-6 text-base font-bold cursor-pointer border-info/40 text-info bg-info/5 hover:bg-info/10"
              title="Print the weekly DCF attendance record for this room"
            >
              <Printer className="w-5 h-5" />
              {isFetchingWeekly ? "Loading…" : "Print / Print Preview"}
            </Button>
          </div>

          {/* Week picker for the weekly DCF record */}
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
            <CalendarIcon className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase">Week of</span>
            <input
              type="date"
              value={weekAnchor}
              onChange={(e) => setWeekAnchor(e.target.value || getLocalDate())}
              className="text-sm font-medium text-foreground bg-transparent border-none focus:outline-none cursor-pointer"
              title="Pick any day in the week to print (defaults to this week)"
            />
          </div>

          {weeklyError && (
            <p className="text-xs font-medium text-destructive text-center max-w-md">
              {weeklyError}
            </p>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Tap to unlock sign-in / sign-out. Returns to this view automatically after{" "}
            {inactivitySeconds}s of inactivity.
          </p>
        </div>
      </div>
    </div>
  );
}
