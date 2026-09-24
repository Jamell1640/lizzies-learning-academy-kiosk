import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  School,
  CreditCard,
  UserCheck,
  MessageSquare,
  GraduationCap,
  HeartHandshake,
  UserPlus,
  Calendar,
  FileText,
  ChevronRight,
  Users,
  BookOpen,
  Clock,
} from "lucide-react";

export function DashboardSidebar({
  lastUpdated,
  currentRoute = "dashboard",
}: {
  lastUpdated: Date | null;
  currentRoute?: "dashboard" | "main-book" | "report" | "timecard" | "children";
}) {
  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-white border-r border-[#E2E8F0] py-4">
      <nav className="flex-1 px-3 space-y-1">
        <Link
          to="/dashboard"
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
            currentRoute === "dashboard"
              ? "text-[#0284C7] bg-[#E0F2FE]"
              : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
          }`}
        >
          <LayoutDashboard
            className={`w-4 h-4 ${currentRoute === "dashboard" ? "text-[#0284C7]" : "text-[#64748B]"}`}
          />
          <span>Dashboard</span>
        </Link>

        <div className="pt-2 pb-1 px-3 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
          Management
        </div>

        <div className="space-y-0.5">
          <div className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold text-[#0F172A]">
            <span className="flex items-center gap-3">
              <UserCheck className="w-4 h-4 text-[#0284C7]" />
              <span>Student Sign-In</span>
            </span>
          </div>

          <div className="pl-4 space-y-1">
            <Link
              to="/main-book"
              className={`flex items-center justify-between px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                currentRoute === "main-book"
                  ? "text-[#0284C7] bg-[#E0F2FE]"
                  : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
              }`}
            >
              <span className="flex items-center gap-2">
                <BookOpen
                  className={`w-3.5 h-3.5 ${currentRoute === "main-book" ? "text-[#0284C7]" : "text-[#64748B]"}`}
                />
                Main Book
              </span>
            </Link>

            <Link
              to="/"
              className="flex items-center justify-between px-3 py-1.5 rounded-md text-sm font-medium text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors"
            >
              <span>Kiosk Tablet</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8]" />
            </Link>
          </div>
        </div>

        {/* Children directory */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold text-[#0F172A]">
            <span className="flex items-center gap-3">
              <Users className="w-4 h-4 text-[#0284C7]" />
              <span>Children</span>
            </span>
          </div>

          <div className="pl-4 space-y-1">
            <Link
              to="/children"
              className={`flex items-center justify-between px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                currentRoute === "children"
                  ? "text-[#0284C7] bg-[#E0F2FE]"
                  : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
              }`}
            >
              <span>Child Directory</span>
            </Link>
          </div>
        </div>

        {/* Staff Management section matching Procare screenshot */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold text-[#0F172A]">
            <span className="flex items-center gap-3">
              <Users className="w-4 h-4 text-[#0284C7]" />
              <span>Staff Management</span>
            </span>
          </div>

          <div className="pl-4 space-y-1">
            <Link
              to="/timecard"
              className={`flex items-center justify-between px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                currentRoute === "timecard"
                  ? "text-[#0284C7] bg-[#E0F2FE]"
                  : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
              }`}
            >
              <span>Timecard</span>
            </Link>
          </div>
        </div>

        <Link
          to="/report"
          className={`flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            currentRoute === "report"
              ? "text-[#0284C7] bg-[#E0F2FE]"
              : "text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
          }`}
        >
          <span className="flex items-center gap-3">
            <FileText
              className={`w-4 h-4 ${currentRoute === "report" ? "text-[#0284C7]" : "text-[#64748B]"}`}
            />
            <span>Daily Reports</span>
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8]" />
        </Link>

        <div className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-[#94A3B8] cursor-not-allowed">
          <span className="flex items-center gap-3">
            <School className="w-4 h-4 text-[#CBD5E1]" />
            <span>My School</span>
          </span>
          <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded">Pro</span>
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-[#94A3B8] cursor-not-allowed">
          <span className="flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-[#CBD5E1]" />
            <span>Billing</span>
          </span>
          <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded">Pro</span>
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-[#94A3B8] cursor-not-allowed">
          <span className="flex items-center gap-3">
            <MessageSquare className="w-4 h-4 text-[#CBD5E1]" />
            <span>Messaging</span>
          </span>
          <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded">Pro</span>
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-[#94A3B8] cursor-not-allowed">
          <span className="flex items-center gap-3">
            <GraduationCap className="w-4 h-4 text-[#CBD5E1]" />
            <span>Learning</span>
          </span>
          <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded">Pro</span>
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-[#94A3B8] cursor-not-allowed">
          <span className="flex items-center gap-3">
            <HeartHandshake className="w-4 h-4 text-[#CBD5E1]" />
            <span>Parent Connection</span>
          </span>
          <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded">Pro</span>
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-[#94A3B8] cursor-not-allowed">
          <span className="flex items-center gap-3">
            <UserPlus className="w-4 h-4 text-[#CBD5E1]" />
            <span>Enrollment</span>
          </span>
          <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded">Pro</span>
        </div>

        <div className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-[#94A3B8] cursor-not-allowed">
          <span className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-[#CBD5E1]" />
            <span>Calendar</span>
          </span>
          <span className="text-[10px] bg-[#F1F5F9] text-[#64748B] px-1.5 py-0.5 rounded">Pro</span>
        </div>
      </nav>

      <div className="px-4 pt-3 border-t border-[#E2E8F0] mt-auto">
        <div className="text-[11px] text-[#64748B]">
          <div className="flex items-center justify-between">
            <span>Sync status:</span>
            <span className="inline-flex items-center gap-1 text-[#10B981] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              Live (45s)
            </span>
          </div>
          <div className="mt-1 text-[10px] text-[#94A3B8]">
            {lastUpdated ? lastUpdated.toLocaleTimeString() : "Syncing..."}
          </div>
        </div>
      </div>
    </aside>
  );
}
