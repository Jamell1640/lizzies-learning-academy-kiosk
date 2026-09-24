import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw,
  Users,
  ShieldAlert,
  ArrowLeft,
  ClipboardList,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { DashboardClassroom, Child } from "@/lib/kiosk.types";
import { getDashboard, getClassroomRoster } from "@/lib/kiosk.functions";
import { getLocalDate } from "@/lib/kiosk-time";
import { Button } from "@/components/ui/button";
import { KOALA_MASCOT_URL } from "@/lib/brand";
import { BrandName } from "@/components/BrandName";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { RoomStatusTable } from "@/components/dashboard/RoomStatusTable";
import { StudentDrilldown } from "@/components/dashboard/StudentDrilldown";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Live Room Status — Lizzie's Learning Academy" },
      {
        name: "description",
        content:
          "Live overview of classroom staffing, student attendance, capacity, and ratios across Lizzie's Learning Academy.",
      },
      { property: "og:title", content: "Live Room Status — Lizzie's Learning Academy" },
      {
        property: "og:description",
        content:
          "Live overview of classroom staffing, student attendance, capacity, and ratios across Lizzie's Learning Academy.",
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
  component: DashboardPage,
});

function DashboardPage() {
  const [rooms, setRooms] = useState<DashboardClassroom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isRoomTableCollapsed, setIsRoomTableCollapsed] = useState(false);

  // Cached rosters for rooms loaded on demand
  const [rosterMap, setRosterMap] = useState<
    Record<string, { loading: boolean; children: Child[] }>
  >({});

  const load = useCallback(async () => {
    // Show loading state (spinning refresh icon + disabled button) on EVERY
    // load — including manual Refresh taps and the 45s poll — so the user
    // gets feedback that the fetch is in flight. Without this, a manual tap
    // showed no spinner and looked like the button did nothing.
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDashboard();
      const loadedRooms = data || [];
      setRooms(loadedRooms);
      setLastUpdated(new Date());

      setSelectedRoomId((prev) => {
        if (prev && loadedRooms.some((r) => r.id === prev)) return prev;
        return loadedRooms[0]?.id || null;
      });
    } catch (err: any) {
      console.error("Dashboard load failed", err);
      setError(err?.message || "Could not load dashboard from CRM.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 45000);
    return () => clearInterval(poll);
  }, [load]);

  // Load roster whenever selected room changes
  // Refetch the active room's roster whenever the room changes OR on each
  // dashboard poll (lastUpdated changes every 45s). This keeps each child's
  // avatar status dot live — a sign-in/out on the kiosk invalidates the
  // server roster cache, so the next poll picks up the new presence state
  // without a manual page refresh. On refetch we keep the existing children
  // visible (no loading flicker) — loading only shows on the first load.
  useEffect(() => {
    if (!selectedRoomId) return;

    let isCancelled = false;
    const hasExisting = rosterMap[selectedRoomId]?.children?.length > 0;
    setRosterMap((prev) => ({
      ...prev,
      [selectedRoomId]: { loading: !hasExisting, children: prev[selectedRoomId]?.children || [] },
    }));

    getClassroomRoster({ data: { classroomId: selectedRoomId, todayLocal: getLocalDate() } })
      .then((kids) => {
        if (isCancelled) return;
        setRosterMap((prev) => ({
          ...prev,
          [selectedRoomId]: { loading: false, children: kids || [] },
        }));
      })
      .catch((err) => {
        console.error("Failed to load roster for room:", selectedRoomId, err);
        if (isCancelled) return;
        setRosterMap((prev) => ({
          ...prev,
          [selectedRoomId]: { loading: false, children: [] },
        }));
      });

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, lastUpdated]);

  const activeRoom = useMemo(() => {
    return rooms.find((r) => r.id === selectedRoomId) || rooms[0] || null;
  }, [rooms, selectedRoomId]);

  const activeRosterData = selectedRoomId ? rosterMap[selectedRoomId] : null;
  const rawChildren = activeRosterData?.children || [];

  const totalSignedIn = rooms.reduce((sum, r) => sum + r.currentChildrenSignedIn, 0);
  const totalCapacity = rooms.reduce((sum, r) => sum + (r.capacity || 0), 0);
  const staffedCount = rooms.filter((r) => r.currentTeacher !== "").length;

  return (
    <div className="flex flex-col min-h-screen bg-[#F6F8FA] text-[#1E293B]">
      {/* Top Procare-style Clean Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E2E8F0] px-4 py-2.5 sm:px-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white border border-[#E2E8F0] p-1 flex items-center justify-center shrink-0 shadow-xs">
                <img
                  src={KOALA_MASCOT_URL}
                  alt="Lizzie's Learning Academy"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-base sm:text-lg font-bold tracking-tight text-[#0F172A]">
                  <BrandName />
                </span>
                <span className="text-[11px] font-semibold text-[#0284C7] uppercase tracking-wider">
                  Live Center Operations
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-2 bg-[#F1F5F9] px-3 py-1.5 rounded-md border border-[#E2E8F0] text-xs font-semibold text-[#334155]">
              <span className="flex items-center gap-1.5 text-[#0284C7]">
                <Users className="w-3.5 h-3.5" />
                <span>{totalSignedIn} Students Present</span>
              </span>
              <span className="text-[#CBD5E1]">|</span>
              <span className="text-[#64748B]">{staffedCount} Staffed Rooms</span>
              <span className="text-[#CBD5E1]">|</span>
              <span className="text-[#64748B]">{totalCapacity} Total Capacity</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={isLoading}
              className="h-8 gap-1.5 text-xs font-medium border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]"
              title="Refresh Dashboard"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 gap-1.5 text-xs font-medium border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]"
            >
              <Link to="/report">
                <ClipboardList className="w-3.5 h-3.5 text-[#0284C7]" />
                <span className="hidden sm:inline">Daily Report</span>
              </Link>
            </Button>

            <Button
              size="sm"
              asChild
              className="h-8 gap-1.5 text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white shadow-xs"
            >
              <Link to="/">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kiosk Roster</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Body: Procare Layout */}
      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar lastUpdated={lastUpdated} currentRoute="dashboard" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
                  Live Room Status
                </h1>
                <span className="text-xs font-medium text-[#64748B] bg-white border border-[#CBD5E1] px-2.5 py-1 rounded-full">
                  {rooms.length} Rooms Active
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsRoomTableCollapsed((prev) => !prev)}
                className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-md hover:bg-[#E2E8F0] transition-colors"
                title={isRoomTableCollapsed ? "Expand Rooms Table" : "Collapse Rooms Table"}
              >
                {isRoomTableCollapsed ? (
                  <ChevronDown className="w-5 h-5 text-[#0284C7]" />
                ) : (
                  <ChevronUp className="w-5 h-5 text-[#0284C7]" />
                )}
              </button>
            </div>

            {error && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span>{error}</span>
                </div>
                <Button size="sm" variant="outline" onClick={load} className="h-7 text-xs bg-white">
                  Retry
                </Button>
              </div>
            )}

            {!isRoomTableCollapsed && (
              <RoomStatusTable
                rooms={rooms}
                selectedRoomId={selectedRoomId}
                onSelectRoom={(id) => setSelectedRoomId(id)}
                isLoading={isLoading}
                activeRoomName={activeRoom?.name || "None"}
              />
            )}

            {activeRoom && (
              <StudentDrilldown
                activeRoom={activeRoom}
                rosterLoading={Boolean(activeRosterData?.loading)}
                rawChildren={rawChildren}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
