import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Printer,
  ClipboardList,
  LogIn,
  LogOut,
  MinusCircle,
  ArrowLeft,
  Clock,
  Users,
} from "lucide-react";
import type { DailyAttendanceReport, ReportClassroom, ReportChild } from "@/lib/kiosk.types";
import { getLocalDate, formatCrmTime } from "@/lib/kiosk-time";
import { getDailyAttendanceReport } from "@/lib/kiosk.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KOALA_MASCOT_URL } from "@/lib/brand";
import { BrandName } from "@/components/BrandName";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Daily Attendance Report — Lizzie's Learning Academy" },
      {
        name: "description",
        content:
          "Printable daily attendance summary for every Lizzie's Learning Academy classroom: signed-in, signed-out, and absent children.",
      },
      { property: "og:title", content: "Daily Attendance Report — Lizzie's Learning Academy" },
      {
        property: "og:description",
        content:
          "Printable daily attendance summary for every Lizzie's Learning Academy classroom: signed-in, signed-out, and absent children.",
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
  component: ReportPage,
});

function ReportPage() {
  const [report, setReport] = useState<DailyAttendanceReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const data = await getDailyAttendanceReport({ data: { todayLocal: getLocalDate() } });
      setReport(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error("Report load failed", err);
      setError(err?.message || "Could not load the attendance report from the CRM.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const todayLabel = report
    ? new Date(report.date + "T00:00:00").toLocaleDateString([], {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* On-screen header (hidden when printing) */}
      <header className="app-header sticky top-0 z-30 px-4 py-3 print:hidden">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="mascot-chip">
              <img
                src={KOALA_MASCOT_URL}
                alt="Lizzie's Learning Academy"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Daily Attendance Report
                </h1>
                <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-md bg-primary/8 text-sm font-extrabold tracking-tight whitespace-nowrap">
                  <BrandName />
                </span>
              </div>
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                {lastUpdated
                  ? `Generated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Loading today's attendance…"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={load}
              disabled={isLoading}
              title="Refresh report"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={handlePrint} className="gap-2 font-semibold">
              <Printer className="w-4 h-4" />
              <span>Print / Export PDF</span>
            </Button>
            <Button variant="ghost" asChild className="gap-2 font-semibold cursor-pointer">
              <Link to="/dashboard">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full p-4 sm:p-6 flex-1 flex flex-col print:max-w-none print:p-0">
        {isLoading && !report ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="mascot-chip mb-3" style={{ width: "3.5rem", height: "3.5rem" }}>
              <img
                src={KOALA_MASCOT_URL}
                alt="Loading"
                className="w-full h-full object-contain opacity-80"
              />
            </div>
            <h3 className="text-base font-bold text-foreground">Building Report</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Gathering today's attendance across all classrooms…
            </p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 mb-3">
              <ClipboardList className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="text-base font-bold text-foreground">Couldn't Load Report</h3>
            <p className="text-destructive text-sm mt-1 max-w-md">{error}</p>
            <Button onClick={load} className="mt-5">
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : report ? (
          <div className="flex flex-col gap-5 print:gap-4">
            {/* Print-only report header */}
            <div className="hidden print:block mb-2">
              <h1 className="text-xl font-bold">Daily Attendance Report</h1>
              <p className="text-sm text-muted-foreground">{todayLabel}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Generated {new Date(report.generatedAt).toLocaleString()}
              </p>
              <hr className="my-4 border-border" />
            </div>

            {/* On-screen date + totals summary */}
            <section className="card-surface p-4 print:border-0 print:shadow-none print:p-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
                <div>
                  <h2 className="text-base font-bold text-foreground">{todayLabel}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Per-classroom summary of today's sign-in / sign-out activity.
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <SummaryStat label="Enrolled" value={report.totals.enrolled} />
                  <SummaryStat label="Signed In" value={report.totals.signedIn} tone="success" />
                  <SummaryStat label="Signed Out" value={report.totals.signedOut} tone="muted" />
                  <SummaryStat label="Absent" value={report.totals.absent} tone="warning" />
                </div>
              </div>
            </section>

            {report.classrooms.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center card-surface border-dashed">
                <div className="mascot-chip mb-3" style={{ width: "3.5rem", height: "3.5rem" }}>
                  <img
                    src={KOALA_MASCOT_URL}
                    alt="No Classrooms"
                    className="w-full h-full object-contain opacity-70"
                  />
                </div>
                <h3 className="text-base font-bold text-foreground">No Classrooms Found</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Add classrooms in the CRM to see them here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 print:gap-3">
                {report.classrooms.map((room) => (
                  <ClassroomReportSection key={room.id} room={room} />
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground/70 mt-3 text-center print:hidden">
              This report reflects attendance records created today. Status is derived from each
              child's most recent sign-in/out event.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "muted" | "warning";
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-secondary/70 text-foreground border-border",
    success: "bg-success/12 text-success border-success/25",
    muted: "bg-muted text-muted-foreground border-border",
    warning: "bg-warning/15 text-warning-foreground border-warning/25",
  };
  return (
    <div className={`rounded-lg border p-2.5 text-center ${toneClasses[tone]}`}>
      <div className="stat-num leading-none">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReportChild["status"] }) {
  if (status === "signed_in") {
    return (
      <Badge className="gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-success/12 text-success border-success/25">
        <LogIn className="w-3 h-3" />
        Signed In
      </Badge>
    );
  }
  if (status === "signed_out") {
    return (
      <Badge className="gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-muted text-muted-foreground border-border">
        <LogOut className="w-3 h-3" />
        Signed Out
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-warning/15 text-warning-foreground border-warning/25">
      <MinusCircle className="w-3 h-3" />
      Absent
    </Badge>
  );
}

function ClassroomReportSection({ room }: { room: ReportClassroom }) {
  return (
    <section className="card-surface overflow-hidden print:break-inside-avoid print:shadow-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-border bg-secondary/40 print:bg-secondary/20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-foreground leading-tight truncate">
              {room.name}
            </h3>
            {room.ageGroup &&
              room.ageGroup.replace(/[^a-z0-9]/gi, "").toLowerCase() !==
                room.name.replace(/[^a-z0-9]/gi, "").toLowerCase() && (
                <p className="text-xs text-muted-foreground mt-0.5">{room.ageGroup}</p>
              )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge className="gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-success/12 text-success border-success/25">
            <LogIn className="w-3 h-3" />
            {room.signedInCount} In
          </Badge>
          <Badge className="gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-muted text-muted-foreground border-border">
            <LogOut className="w-3 h-3" />
            {room.signedOutCount} Out
          </Badge>
          <Badge className="gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-warning/15 text-warning-foreground border-warning/25">
            <MinusCircle className="w-3 h-3" />
            {room.absentCount} Absent
          </Badge>
          <span className="text-xs font-semibold text-muted-foreground ml-1">
            {room.enrolledCount} enrolled
          </span>
        </div>
      </div>

      {room.children.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground text-center">
          No enrolled children for this classroom.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sr-only print:not-sr-only">
              <tr className="text-left text-xs font-bold text-muted-foreground">
                <th className="px-5 py-2">Child</th>
                <th className="px-3 py-2">Student ID</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Check-in</th>
                <th className="px-3 py-2">Check-out</th>
                <th className="px-3 py-2">Pickup Person</th>
                <th className="px-5 py-2">Teacher</th>
              </tr>
            </thead>
            <tbody>
              {room.children.map((child) => (
                <tr
                  key={child.id}
                  className="border-t border-border/60 first:border-t-0 hover:bg-secondary/30 print:hover:bg-transparent"
                >
                  {/* On-screen: card-like row. Print: table cells. */}
                  <td className="px-5 py-3 align-top">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-foreground truncate">{child.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {child.studentId}
                        </div>
                      </div>
                      <div className="print:hidden">
                        <StatusBadge status={child.status} />
                      </div>
                    </div>
                    {/* On-screen detail row */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground print:hidden">
                      <span className="flex items-center gap-1">
                        <LogIn className="w-3 h-3" />
                        In: {child.checkInTime ? formatCrmTime(child.checkInTime) : "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <LogOut className="w-3 h-3" />
                        Out: {child.checkOutTime ? formatCrmTime(child.checkOutTime) : "—"}
                      </span>
                      {child.lastPickupPerson && <span>Pickup: {child.lastPickupPerson}</span>}
                      {child.lastTeacher && <span>Teacher: {child.lastTeacher}</span>}
                    </div>
                    {/* Print-only inline cells (hidden on screen) */}
                    <span className="hidden print:contents">
                      <td className="px-3 py-3 align-top text-xs">{child.studentId}</td>
                      <td className="px-3 py-3 align-top text-xs font-semibold capitalize">
                        {child.status.replace("_", " ")}
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        {child.checkInTime ? formatCrmTime(child.checkInTime) : "—"}
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        {child.checkOutTime ? formatCrmTime(child.checkOutTime) : "—"}
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        {child.lastPickupPerson || "—"}
                      </td>
                      <td className="px-5 py-3 align-top text-xs">{child.lastTeacher || "—"}</td>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
