import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

/**
 * Renders the academy name as multi-colored letters — the Lizzie's Learning
 * Academy brand treatment. Each non-space character cycles through the brand
 * palette tokens defined in src/styles.css. Keeps the koala mascot as the
 * companion brand element (used separately in headers).
 *
 * Inherits font size/weight from parent so it scales for chips, headings, etc.
 * Uses inline-flex + inline-block letters with leading-none so every glyph
 * shares a single baseline — this keeps the text vertically centered inside
 * rounded-full brand chips/pills on every viewport (phone, tablet, desktop).
 */
const BRAND_COLOR_CLASSES = [
  "text-brand-red",
  "text-brand-orange",
  "text-brand-yellow",
  "text-brand-green",
  "text-brand-blue",
  "text-brand-purple",
];

export function BrandName({ className }: { className?: string }) {
  let colorIndex = 0;
  return (
    <span
      className={cn("inline-flex items-center font-black tracking-tight leading-none", className)}
      aria-label={APP_NAME}
      role="text"
    >
      {APP_NAME.split("").map((ch, i) => {
        if (ch === " ") {
          return <span key={i} className="inline-block w-[0.28em] leading-none" aria-hidden />;
        }
        const colorClass = BRAND_COLOR_CLASSES[colorIndex % BRAND_COLOR_CLASSES.length];
        colorIndex += 1;
        return (
          <span key={i} className={cn("inline-block leading-none", colorClass)}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}
