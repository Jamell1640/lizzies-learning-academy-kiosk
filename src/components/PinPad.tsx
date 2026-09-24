import { useState } from "react";
import { Delete, ArrowRight, ShieldCheck, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KOALA_MASCOT_URL } from "@/lib/brand";
import { BrandName } from "@/components/BrandName";

interface PinPadProps {
  onUnlock: (pin: string) => Promise<boolean>;
  isLoading: boolean;
  error?: string | null;
  /** Optional: opens the "My Open Rooms" view (teacher PIN gate, not admin). */
  onMyOpenRooms?: () => void;
}

export function PinPad({ onUnlock, isLoading, error, onMyOpenRooms }: PinPadProps) {
  const [pin, setPin] = useState("");

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        onUnlock(next).then((success) => {
          if (!success) setPin("");
        });
      }
    }
  };

  const handleDelete = () => setPin((prev) => prev.slice(0, -1));
  const handleClear = () => setPin("");

  const handleManualSubmit = () => {
    if (pin.length >= 4) {
      onUnlock(pin).then((success) => {
        if (!success) setPin("");
      });
    }
  };

  const digitBtn =
    "h-16 sm:h-18 rounded-lg bg-card border border-border text-2xl font-bold text-foreground hover:border-primary/50 hover:bg-primary/5 active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none disabled:opacity-50";

  return (
    <div className="flex flex-col items-center justify-center min-h-[82vh] w-full max-w-sm mx-auto p-6 sm:p-8">
      {/* Brand header */}
      <div className="text-center mb-5 flex flex-col items-center">
        <div className="relative mb-3">
          <div className="mascot-chip" style={{ width: "4rem", height: "4rem" }}>
            <img
              src={KOALA_MASCOT_URL}
              alt="Lizzie's Learning Academy"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-success text-success-foreground border-2 border-background flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-primary/8 text-sm font-extrabold tracking-tight mb-1.5">
          <BrandName />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-foreground">Teacher Sign-In</h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-xs">
          Enter your 4-digit staff PIN to unlock the classroom kiosk
        </p>
      </div>

      {/* PIN dots */}
      <div className="w-full flex justify-center items-center gap-3 mb-5 py-1">
        {[0, 1, 2, 3].map((index) => {
          const filled = index < pin.length;
          return (
            <div
              key={index}
              className={`w-4 h-4 rounded-full transition-all duration-150 border ${
                filled ? "bg-primary border-primary scale-110" : "bg-card border-border"
              }`}
            />
          );
        })}
      </div>

      {error && (
        <div className="mb-3 text-center py-2 px-3 rounded-lg bg-destructive/10 text-destructive text-sm font-semibold border border-destructive/20 w-full">
          {error}
        </div>
      )}

      {/* Touchpad */}
      <div className="grid grid-cols-3 gap-2.5 w-full">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handleDigit(num)}
            disabled={isLoading}
            className={digitBtn}
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          onClick={handleClear}
          disabled={isLoading || pin.length === 0}
          className="h-16 sm:h-18 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase hover:bg-secondary/70 active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => handleDigit("0")}
          disabled={isLoading}
          className={digitBtn}
        >
          0
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isLoading || pin.length === 0}
          aria-label="Delete last digit"
          className="h-16 sm:h-18 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/70 active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none disabled:opacity-40"
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>

      {pin.length >= 4 && (
        <Button
          onClick={handleManualSubmit}
          disabled={isLoading}
          className="w-full mt-4 h-12 text-base font-bold gap-2 cursor-pointer"
        >
          {isLoading ? "Verifying..." : "Unlock Kiosk"}
          <ArrowRight className="w-4 h-4" />
        </Button>
      )}

      <div className="mt-5 text-center text-xs text-muted-foreground bg-card p-2.5 rounded-lg w-full border border-border">
        Staff directory PIN required • Secured classroom attendance
      </div>

      {onMyOpenRooms && (
        <button
          type="button"
          onClick={onMyOpenRooms}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-info hover:text-info-foreground transition-colors px-4 py-2 rounded-lg hover:bg-info/10 cursor-pointer border border-info/20 bg-info/5"
        >
          <DoorOpen className="w-3.5 h-3.5" />
          My Open Rooms
        </button>
      )}
    </div>
  );
}
