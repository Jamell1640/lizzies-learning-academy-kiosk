import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Search, ShieldAlert, Users } from "lucide-react";
import type { ChildSummary } from "@/lib/child-profile.server";
import { listAllChildren } from "@/lib/kiosk.functions";
import { Button } from "@/components/ui/button";
import { KOALA_MASCOT_URL } from "@/lib/brand";
import { BrandName } from "@/components/BrandName";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { getClassroomIcon } from "@/lib/classroom-icon";
import { formatAgeFromDob } from "@/lib/kiosk-time";

export const Route = createFileRoute("/children/")({
  head: () => ({
    meta: [
      { title: "Children — Lizzie's Learning Academy" },
      {
        name: "description",
        content:
          "Admin directory of enrolled children at Lizzie's Learning Academy. Open a child's profile to manage guardians, contacts, and siblings.",
      },
      { property: "og:title", content: "Children — Lizzie's Learning Academy" },
      {
        property: "og:description",
        content: "Admin directory of enrolled children at Lizzie's Learning Academy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChildrenListPage,
});

function ChildrenListPage() {
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = async () => {
    setError(null);
    try {
      const data = await listAllChildren();
      setChildren(data || []);
    } catch (err: any) {
      console.error("Children list failed", err);
      setError(err?.message || "Could not load children from CRM.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return children;
    return children.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.studentId.toLowerCase().includes(q) ||
        c.classroom.toLowerCase().includes(q),
    );
  }, [children, query]);

  return (
    <div className="flex flex-col min-h-screen bg-[#F6F8FA] text-[#1E293B]">
      <header className="sticky top-0 z-30 bg-white border-b border-[#E2E8F0] px-4 py-2.5 sm:px-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between gap-4">
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
                Child Directory
              </span>
            </div>
          </div>
          <Button
            size="sm"
            asChild
            className="h-8 gap-1.5 text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white shadow-xs"
          >
            <Link to="/dashboard">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar lastUpdated={null} currentRoute="children" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
                  Children
                </h1>
                <span className="text-xs font-medium text-[#64748B] bg-white border border-[#CBD5E1] px-2.5 py-1 rounded-full">
                  {children.length} Enrolled
                </span>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, student ID, or classroom…"
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0284C7]/30 focus:border-[#0284C7]"
              />
            </div>

            {error && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                <span>{error}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={load}
                  className="h-7 text-xs bg-white ml-auto"
                >
                  Retry
                </Button>
              </div>
            )}

            {isLoading ? (
              <div className="text-sm text-[#64748B] py-12 text-center">Loading children…</div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-[#64748B] py-12 text-center">
                <Users className="w-8 h-8 mx-auto mb-2 text-[#CBD5E1]" />
                No children found.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((child) => {
                  const Icon = getClassroomIcon(child.classroom);
                  return (
                    <Link
                      key={child.id}
                      to="/children/$childId"
                      params={{ childId: child.id }}
                      className="group flex items-center gap-3 p-3 rounded-lg border border-[#E2E8F0] bg-white hover:border-[#0284C7] hover:shadow-sm transition-all"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#E0F2FE] flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-[#0284C7]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[#0F172A] truncate group-hover:text-[#0284C7]">
                          {child.name}
                        </div>
                        <div className="text-xs text-[#64748B] truncate">
                          {child.classroom || "Unassigned"}
                          {child.studentId ? ` · ${child.studentId}` : ""}
                          {(() => {
                            const age = formatAgeFromDob(child.dob);
                            return age ? ` · ${age}` : "";
                          })()}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
