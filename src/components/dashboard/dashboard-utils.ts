import type { Child } from "@/lib/kiosk.types";

export const AVATAR_BG_COLORS = [
  "bg-[#A7A6DD] text-white", // periwinkle
  "bg-[#D9D6D2] text-[#4A4744]", // warm gray
  "bg-[#BACEE8] text-[#1E3A5F]", // soft blue
  "bg-[#F2BAC0] text-[#6B2830]", // soft pink
  "bg-[#A79D9D] text-white", // muted taupe
  "bg-[#C8C694] text-[#3E3C18]", // olive pastel
  "bg-[#95B097] text-[#1B3B1D]", // sage green
  "bg-[#98B2C4] text-[#12364E]", // slate pastel
  "bg-[#DBBBC0] text-[#55272F]", // dusty rose
  "bg-[#BED79E] text-[#2C4A11]", // lime pastel
  "bg-[#B6DAAF] text-[#1D4A15]", // soft mint
  "bg-[#B5E7ED] text-[#134950]", // sky pastel
  "bg-[#F6A3C7] text-[#5B1634]", // blush
  "bg-[#F2AE9B] text-[#5A2517]", // peach
  "bg-[#95D3CE] text-[#12423F]", // seafoam
  "bg-[#CBC9EA] text-[#2F2C5C]", // lavender
  "bg-[#F3B39B] text-[#5C2313]", // terracotta soft
  "bg-[#CBD5E1] text-[#334155]", // cool gray
  "bg-[#7D91B6] text-white", // dusk blue
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_BG_COLORS.length;
  return AVATAR_BG_COLORS[index];
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts[0] || fullName;
}
