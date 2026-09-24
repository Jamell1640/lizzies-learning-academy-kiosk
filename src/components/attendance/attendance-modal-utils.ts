import type { ChildSearchResult } from "@/lib/kiosk.types";

export const AVATAR_COLORS = [
  "bg-[#F43F5E] text-white", // deep rose
  "bg-[#E11D48] text-white", // rose-600
  "bg-[#F97316] text-white", // orange
  "bg-[#D97706] text-white", // amber
  "bg-[#CA8A04] text-white", // yellow-600
  "bg-[#0284C7] text-white", // sky
  "bg-[#6366F1] text-white", // indigo
  "bg-[#8B5CF6] text-white", // purple
];

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export function filterChildrenByCriteria(
  allChildren: ChildSearchResult[],
  createType: "in" | "out",
  selectedRoom: string,
  searchQuery: string,
): ChildSearchResult[] {
  let list = allChildren;

  if (createType === "out") {
    list = list.filter((c) => c.signedIn);
  }

  if (selectedRoom !== "All Rooms") {
    const qRoom = selectedRoom.trim().toLowerCase();
    list = list.filter((c) => (c.classroomText || "").trim().toLowerCase() === qRoom);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.studentId.toLowerCase().includes(q) ||
        c.classroomText.toLowerCase().includes(q),
    );
  }

  return list;
}
