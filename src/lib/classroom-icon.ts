import {
  Baby,
  Footprints,
  PencilRuler,
  GraduationCap,
  Layers,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps a classroom name to the most age-appropriate icon.
 * Matching is case-insensitive and keyword-based so it works regardless of
 * how the room is stored in the CRM (INFANT, Toddler, PRE-SCHOOL, etc.).
 *
 *   Infant      → Baby          (cribs / infants)
 *   Toddler     → Footprints    (early walkers)
 *   Pre-School  → PencilRuler   (early learning / crafts)
 *   School-Age  → GraduationCap (before/after school)
 *   fallback    → Layers        (generic classroom)
 */
export function getClassroomIcon(name: string): LucideIcon {
  const key = (name || "").toLowerCase();
  if (key.includes("infant") || key.includes("baby") || key.includes("crib")) {
    return Baby;
  }
  if (key.includes("todd") || key.includes("walker") || key.includes("two")) {
    return Footprints;
  }
  if (key.includes("pre") || key.includes("preschool") || key.includes("kinder")) {
    return PencilRuler;
  }
  if (key.includes("school") || key.includes("grade") || key.includes("elem")) {
    return GraduationCap;
  }
  return Layers;
}
