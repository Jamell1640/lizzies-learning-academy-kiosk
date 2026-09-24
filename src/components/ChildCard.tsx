import { LogIn, LogOut, Clock } from "lucide-react";
import type { Child } from "@/lib/kiosk.types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatAgeFromDob } from "@/lib/kiosk-time";

interface ChildCardProps {
  child: Child;
  onSelect: (child: Child) => void;
}

export function ChildCard({ child, onSelect }: ChildCardProps) {
  const isPresent = child.status === "in";

  return (
    <button
      type="button"
      onClick={() => onSelect(child)}
      className={`card-surface group text-left w-full p-4 transition-all duration-150 cursor-pointer active:scale-98 flex flex-col justify-between overflow-hidden ${
        isPresent
          ? "border-success/40 bg-success/[0.04] hover:border-success/60 hover:shadow-card-hover"
          : "hover:border-primary/50 hover:shadow-card-hover"
      }`}
      style={{ minHeight: "180px" }}
    >
      {/* Top row: Avatar + Status Badge */}
      <div className="flex items-start justify-between w-full gap-2.5">
        <div className="relative">
          <Avatar className="w-14 h-14 rounded-lg border border-border">
            {child.photoUrl ? (
              <AvatarImage src={child.photoUrl} alt={child.name} className="object-cover" />
            ) : null}
            <AvatarFallback className="rounded-lg text-base font-bold bg-primary/10 text-primary">
              {child.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <span
            className={`absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center ${
              isPresent
                ? "bg-success text-success-foreground"
                : "bg-muted-foreground/40 text-background"
            }`}
          >
            {isPresent ? <LogIn className="w-2.5 h-2.5" /> : <LogOut className="w-2.5 h-2.5" />}
          </span>
        </div>

        <Badge
          variant="outline"
          className={`px-2 py-0.5 text-xs font-semibold rounded-md uppercase tracking-wide ${
            isPresent
              ? "bg-success/12 text-success border-success/25"
              : "bg-secondary text-muted-foreground border-border"
          }`}
        >
          {isPresent ? "Signed In" : "Signed Out"}
        </Badge>
      </div>

      {/* Child info */}
      <div className="mt-3">
        <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors leading-tight truncate">
          {child.name}
        </h3>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground font-mono font-medium truncate">
            ID: {child.studentId}
          </p>
          {(() => {
            const age = formatAgeFromDob(child.dob);
            return age ? (
              <span className="text-xs text-muted-foreground/80 truncate">· {age}</span>
            ) : null;
          })()}
        </div>

        {child.lastCheckTime && (
          <div className="mt-2 text-xs flex items-center gap-1.5 text-muted-foreground bg-secondary/70 px-2 py-1 rounded-md border border-border">
            <Clock className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate">
              {isPresent ? "In at" : "Out at"}{" "}
              <span className="font-semibold text-foreground">{child.lastCheckTime}</span>
              {child.lastPickupPerson ? ` • ${child.lastPickupPerson}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Action prompt */}
      <div
        className={`mt-3 pt-2 border-t border-border flex items-center justify-between text-xs font-semibold ${
          isPresent ? "text-warning-foreground" : "text-primary"
        }`}
      >
        <span>{isPresent ? "Tap to Sign Out" : "Tap to Sign In"}</span>
        <span className="group-hover:translate-x-1 transition-transform">→</span>
      </div>
    </button>
  );
}
