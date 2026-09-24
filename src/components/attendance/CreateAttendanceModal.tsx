import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Search,
  X,
  ArrowLeft,
  ChevronDown,
  RefreshCw,
  Clock,
  UserCheck,
  Building2,
  DoorOpen,
  Calendar as CalendarIcon,
} from "lucide-react";
import type { ChildSearchResult, Classroom } from "@/lib/kiosk.types";
import {
  searchChildren,
  createManualAttendance,
  getClassrooms,
  listTeachers,
} from "@/lib/kiosk.functions";
import { getLocalTime24 } from "@/lib/kiosk-time";
import { Button } from "@/components/ui/button";
import {
  getInitials,
  getAvatarColorClass,
  filterChildrenByCriteria,
} from "./attendance-modal-utils";

interface CreateAttendanceModalProps {
  open: boolean;
  onClose: () => void;
  selectedDate: string;
  onSaved: () => void;
}

export function CreateAttendanceModal({
  open,
  onClose,
  selectedDate,
  onSaved,
}: CreateAttendanceModalProps) {
  // 3-step flow:
  // Step 1: Action Choice (Sign-In vs Sign-Out Attendance buttons)
  // Step 2: Student roster selection with classroom filter & search
  // Step 3: Confirmation form (Room for in / view room for out, Time, Teacher)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [createType, setCreateType] = useState<"in" | "out">("in");

  // Roster & Selection State
  const [allChildren, setAllChildren] = useState<ChildSearchResult[]>([]);
  const [selectedChildIds, setSelectedChildIds] = useState<Set<string>>(new Set());
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);

  // Filters for Step 2
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<string>("All Rooms");
  const [selectedTag, setSelectedTag] = useState<string>("All");

  // Step 3 Form State
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [assignedRoom, setAssignedRoom] = useState<string>("");
  const [signerName, setSignerName] = useState<string>("");
  const [time24, setTime24] = useState<string>(getLocalTime24());
  const [entryDate, setEntryDate] = useState<string>(selectedDate);
  const [isSaving, setIsSaving] = useState(false);

  // Reset modal state on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setCreateType("in");
      setSelectedChildIds(new Set());
      setSearchQuery("");
      setSelectedRoom("All Rooms");
      setSelectedTag("All");
      setAssignedRoom("");
      setSignerName("");
      setTime24(getLocalTime24());
      setEntryDate(selectedDate);
      loadChildren();
      loadClassroomsAndTeachers();
    }
  }, [open]);

  const loadChildren = async () => {
    setIsLoadingChildren(true);
    try {
      const list = await searchChildren({ data: { query: "*" } });
      setAllChildren(list || []);
    } catch (err: any) {
      console.error("Failed to load children", err);
      toast.error(err?.message || "Could not load children list");
    } finally {
      setIsLoadingChildren(false);
    }
  };

  const loadClassroomsAndTeachers = async () => {
    try {
      const [roomsData, teachersData] = await Promise.all([getClassrooms(), listTeachers()]);
      setClassrooms(roomsData || []);
      setTeachers(teachersData || []);
    } catch (err) {
      console.error("Failed to load rooms/teachers", err);
    }
  };

  // Distinct rooms from child records for the filter dropdown
  const availableRooms = useMemo(() => {
    const rooms = new Set<string>();
    for (const c of allChildren) {
      if (c.classroomText?.trim()) rooms.add(c.classroomText.trim());
    }
    return Array.from(rooms).sort();
  }, [allChildren]);

  // Filtered children based on Search + Room filter
  // For SIGN-OUT, only show children who are currently signed in
  const filteredChildren = useMemo(() => {
    return filterChildrenByCriteria(allChildren, createType, selectedRoom, searchQuery);
  }, [allChildren, createType, selectedRoom, searchQuery]);

  // Selection helpers
  const toggleChild = (id: string) => {
    setSelectedChildIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllSelected =
    filteredChildren.length > 0 && filteredChildren.every((c) => selectedChildIds.has(c.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedChildIds((prev) => {
        const next = new Set(prev);
        for (const c of filteredChildren) next.delete(c.id);
        return next;
      });
    } else {
      setSelectedChildIds((prev) => {
        const next = new Set(prev);
        for (const c of filteredChildren) next.add(c.id);
        return next;
      });
    }
  };

  const selectedCount = selectedChildIds.size;
  const selectedChildrenList = useMemo(() => {
    return allChildren.filter((c) => selectedChildIds.has(c.id));
  }, [allChildren, selectedChildIds]);

  const handleSelectAction = (action: "in" | "out") => {
    setCreateType(action);
    if (action === "out") {
      setSelectedChildIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          const child = allChildren.find((c) => c.id === id);
          if (child?.signedIn) next.add(id);
        }
        return next;
      });
    }
    setStep(2);
  };

  // Move from Step 2 to Step 3
  const handleContinueToDetails = () => {
    if (selectedCount === 0) {
      toast.error("Please select at least one student.");
      return;
    }

    // Smart default for assigned room
    const firstSelected = allChildren.find((c) => selectedChildIds.has(c.id));
    if (firstSelected?.classroomText) {
      setAssignedRoom(firstSelected.classroomText);
    } else if (classrooms.length > 0) {
      setAssignedRoom(classrooms[0].name);
    }

    setTime24(getLocalTime24());
    setStep(3);
  };

  // Submit Step 3
  const handleSave = async () => {
    if (selectedCount === 0) {
      toast.error("No students selected.");
      return;
    }
    if (!signerName.trim()) {
      toast.error("Please select who signed them in/out.");
      return;
    }
    if (createType === "in" && !assignedRoom.trim()) {
      toast.error("Please select a classroom/room.");
      return;
    }
    if (!time24.trim()) {
      toast.error("Please enter a valid time.");
      return;
    }

    setIsSaving(true);
    let successCount = 0;
    let failCount = 0;

    for (const child of selectedChildrenList) {
      // For sign-out, fall back to the child's enrolled classroom if assignedRoom wasn't chosen
      const roomToSave = assignedRoom.trim() || child.classroomText || "Unassigned";
      try {
        const res = await createManualAttendance({
          data: {
            type: createType,
            childId: child.id,
            childName: child.name,
            classroom: roomToSave,
            signerName: signerName.trim(),
            time24,
            date: entryDate || selectedDate,
          },
        });
        if (res?.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error("Save error for child", child.name, err);
        failCount++;
      }
    }

    setIsSaving(false);

    if (failCount === 0) {
      toast.success(
        `Successfully logged ${createType === "in" ? "sign-in" : "sign-out"} for ${successCount} student${successCount === 1 ? "" : "s"}.`,
      );
      onSaved();
      onClose();
    } else if (successCount > 0) {
      toast.warning(
        `Logged ${successCount} student${successCount === 1 ? "" : "s"}, but ${failCount} failed.`,
      );
      onSaved();
      onClose();
    } else {
      toast.error("Failed to save attendance entries. Please check your connection.");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#CBD5E1] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header matching Procare style */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2)}
                className="p-1 rounded hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] transition-colors"
                title="Go back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-lg font-bold text-[#0F172A] tracking-tight">
              {step === 1
                ? "Attendance"
                : step === 2
                  ? createType === "in"
                    ? "Sign-in Attendance"
                    : "Sign-out Attendance"
                  : createType === "in"
                    ? "Sign-in Attendance"
                    : "Sign-out Attendance"}
            </h2>
            {step > 1 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E0F2FE] text-[#0284C7] uppercase tracking-wider">
                Step {step} / 3
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: Action Choice (Sign-In vs Sign-Out buttons) */}
        {step === 1 && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12">
            <div className="w-full max-w-md space-y-4">
              <button
                type="button"
                onClick={() => handleSelectAction("in")}
                className="w-full py-5 px-6 rounded-2xl bg-[#E0F2FE]/70 hover:bg-[#BAE6FD]/80 border-2 border-[#38BDF8] text-[#0C4A6E] font-bold text-sm tracking-wider uppercase shadow-[0_2px_8px_rgba(56,189,248,0.15)] hover:shadow-[0_4px_14px_rgba(56,189,248,0.25)] transition-all cursor-pointer active:scale-[0.99]"
              >
                SIGN-IN ATTENDANCE
              </button>

              <button
                type="button"
                onClick={() => handleSelectAction("out")}
                className="w-full py-5 px-6 rounded-2xl bg-[#E0F2FE]/70 hover:bg-[#BAE6FD]/80 border-2 border-[#38BDF8] text-[#0C4A6E] font-bold text-sm tracking-wider uppercase shadow-[0_2px_8px_rgba(56,189,248,0.15)] hover:shadow-[0_4px_14px_rgba(56,189,248,0.25)] transition-all cursor-pointer active:scale-[0.99]"
              >
                SIGN-OUT ATTENDANCE
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Full Roster Selection with Filters */}
        {step === 2 && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Filter Bar (Search | All Rooms | Select Tags) */}
            <div className="px-6 py-4 border-b border-[#E2E8F0] bg-white">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                {/* Search Input */}
                <div className="sm:col-span-6 relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    type="text"
                    placeholder="Search by student name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-md placeholder-[#94A3B8] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#38BDF8] focus:border-transparent transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* All Rooms Dropdown */}
                <div className="sm:col-span-3 relative">
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 text-sm bg-white border border-[#CBD5E1] rounded-md text-[#334155] focus:outline-none focus:ring-2 focus:ring-[#38BDF8] cursor-pointer"
                  >
                    <option value="All Rooms">All Rooms</option>
                    {availableRooms.map((room) => (
                      <option key={room} value={room}>
                        {room}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                </div>

                {/* Select Tags Dropdown */}
                <div className="sm:col-span-3 relative">
                  <select
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 text-sm bg-white border border-[#CBD5E1] rounded-md text-[#334155] focus:outline-none focus:ring-2 focus:ring-[#38BDF8] cursor-pointer"
                  >
                    <option value="All">Select Tags</option>
                    <option value="Active">Active</option>
                    <option value="Enrolled">Enrolled</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                </div>
              </div>

              {/* Select All Row + Student Selection Counter */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#F1F5F9]">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-[#334155] select-none">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-[#CBD5E1] text-[#0284C7] focus:ring-[#0284C7] cursor-pointer"
                    />
                    <span>Select all</span>
                  </label>

                  {createType === "out" && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                      {allChildren.filter((c) => c.signedIn).length} currently signed in
                    </span>
                  )}
                </div>

                <div className="text-xs font-semibold tracking-wider uppercase text-[#64748B]">
                  {selectedCount === 0
                    ? "NO STUDENT SELECTED"
                    : `${selectedCount} STUDENT${selectedCount === 1 ? "" : "S"} SELECTED`}
                </div>
              </div>
            </div>

            {/* Student Grid (3-column layout) */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {isLoadingChildren ? (
                <div className="py-20 flex flex-col items-center justify-center gap-2 text-sm text-[#64748B]">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#0284C7]" />
                  <span>Loading student roster...</span>
                </div>
              ) : filteredChildren.length === 0 ? (
                <div className="py-20 text-center text-sm text-[#64748B]">
                  {createType === "out" ? (
                    <>
                      <UserCheck className="w-8 h-8 text-[#94A3B8] mx-auto mb-2" />
                      <p className="font-semibold text-[#334155]">
                        No children currently signed in
                      </p>
                      <p className="text-xs text-[#94A3B8] mt-1">
                        All enrolled children are already signed out for {selectedDate}.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-[#334155]">No students found</p>
                      <p className="text-xs text-[#94A3B8] mt-1">
                        Try adjusting your search query or room filter.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  {filteredChildren.map((child) => {
                    const isChecked = selectedChildIds.has(child.id);
                    const initials = getInitials(child.name);
                    const avatarColor = getAvatarColorClass(child.name);

                    return (
                      <div
                        key={child.id}
                        onClick={() => toggleChild(child.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                          isChecked
                            ? "bg-[#F0F9FF] border-[#0284C7] shadow-xs"
                            : "bg-white border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-[#CBD5E1] text-[#0284C7] focus:ring-[#0284C7] cursor-pointer shrink-0"
                        />

                        {/* Circular Avatar with Initials */}
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${avatarColor}`}
                        >
                          {initials}
                        </div>

                        {/* Student Name & Primary Room */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-[#0F172A] truncate">
                              {child.name}
                            </span>
                            {child.signedIn && (
                              <span
                                className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-[#DCFCE7] text-[#15803D]"
                                title="Currently signed in"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                                In
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#64748B] truncate">
                            Primary Room:{" "}
                            <span className="font-medium text-[#475569]">
                              {child.classroomText || "Unassigned"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Actions Bar */}
            <div className="px-6 py-4 border-t border-[#E2E8F0] bg-white flex items-center justify-center">
              <Button
                type="button"
                onClick={handleContinueToDetails}
                disabled={selectedCount === 0}
                className="w-full max-w-xs h-10 text-sm font-bold tracking-wider uppercase rounded-md bg-[#7DD3FC] hover:bg-[#38BDF8] text-[#0369A1] hover:text-[#0C4A6E] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                CONTINUE
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Attendance Details Form */}
        {step === 3 && (
          <div className="flex-1 flex flex-col overflow-y-auto px-6 py-6 space-y-6">
            {/* Selected Children Summary Card */}
            <div className="p-4 bg-[#F0F9FF] border border-[#BAE6FD] rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-[#0369A1]">
                  Recording{" "}
                  <span className="font-bold text-[#0C4A6E]">
                    {createType === "in" ? "sign-in" : "sign-out"}
                  </span>{" "}
                  for{" "}
                  <span className="font-bold text-[#0C4A6E]">
                    {selectedCount} {selectedCount === 1 ? "student" : "students"}
                  </span>{" "}
                  on <span className="font-bold text-[#0C4A6E]">{selectedDate}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer"
                >
                  Edit Selection
                </button>
              </div>

              {/* Child chips showing name and classroom */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#BAE6FD]">
                {selectedChildrenList.map((c) => {
                  const roomName = c.classroomText || assignedRoom || "Unassigned";
                  return (
                    <div
                      key={c.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-[#BAE6FD] shadow-xs text-xs"
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${getAvatarColorClass(
                          c.name,
                        )}`}
                      >
                        {getInitials(c.name)}
                      </div>
                      <span className="font-semibold text-[#0F172A]">{c.name}</span>
                      <span className="text-[#94A3B8]">·</span>
                      <span className="inline-flex items-center gap-1 text-[#0284C7] font-medium">
                        <DoorOpen className="w-3.5 h-3.5 text-[#0284C7]" />
                        {createType === "out" ? "Signing out of:" : "Room:"}{" "}
                        <strong className="font-semibold text-[#0C4A6E]">{roomName}</strong>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Classroom / Room: Only shown for SIGN-IN (where assigning or moving a room is needed).
                For SIGN-OUT, the child already has a classroom shown in the banner above. */}
            {createType === "in" && (
              <div>
                <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-1.5">
                  Classroom / Room <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
                  <select
                    value={assignedRoom}
                    onChange={(e) => setAssignedRoom(e.target.value)}
                    className="w-full appearance-none pl-9 pr-8 py-2 text-sm bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#38BDF8] cursor-pointer"
                  >
                    <option value="">Select a room...</option>
                    {classrooms.map((room) => (
                      <option key={room.id} value={room.name}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
                </div>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Defaults to the selected student's room — change to reassign for this entry.
                </p>
              </div>
            )}

            {/* Date Field */}
            <div>
              <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-1.5">
                Date
              </label>
              <div className="relative">
                <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
                />
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                Defaults to the selected date — change to backdate a missed entry.
              </p>
            </div>

            {/* Time Field */}
            <div>
              <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-1.5">
                Time (HH:MM)
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="time"
                  value={time24}
                  onChange={(e) => setTime24(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
                />
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">Defaults to current local time.</p>
            </div>

            {/* Signed By Dropdown (all teachers) */}
            <div>
              <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wider mb-1.5">
                Signed By <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
                <select
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full appearance-none pl-9 pr-8 py-2 text-sm bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#38BDF8] cursor-pointer"
                >
                  <option value="">Select a teacher...</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                Teacher or staff member who completed the check-in / check-out.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E2E8F0] mt-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(2)}
                disabled={isSaving}
                className="h-10 px-4 text-sm font-semibold border-[#CBD5E1] bg-white text-[#334155]"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="h-10 px-6 text-sm font-bold bg-[#0284C7] hover:bg-[#0369A1] text-white shadow-xs"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    Saving Records...
                  </>
                ) : (
                  `Confirm ${createType === "in" ? "Sign-In" : "Sign-Out"}`
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
