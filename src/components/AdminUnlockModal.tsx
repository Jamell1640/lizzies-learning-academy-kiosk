import { useState } from "react";
import { Lock, ShieldCheck, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { verifyTeacherPin } from "@/lib/kiosk.functions";
import { toast } from "sonner";

interface AdminUnlockModalProps {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
  classroomName: string;
}

/**
 * Admin-gated unlock for a classroom tracker screen.
 *
 * Requires a valid teacher PIN (verified via verifyTeacherPin against
 * custom_objects.teachers) before the classroom is unlocked. A teacher
 * cannot unlock the room on their own — only someone with a valid PIN
 * (admin/authorized staff) can.
 */
export function AdminUnlockModal({
  open,
  onClose,
  onUnlocked,
  classroomName,
}: AdminUnlockModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const reset = () => {
    setPin("");
    setError(null);
    setIsVerifying(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleUnlock = async () => {
    if (!pin.trim()) {
      setError("Enter a PIN to unlock.");
      return;
    }
    setIsVerifying(true);
    setError(null);
    try {
      const teacher = await verifyTeacherPin({ data: { pin } });
      if (teacher) {
        toast.success(`Unlocked by ${teacher.name}. You may now leave the tracker.`);
        reset();
        onUnlocked();
      } else {
        setError("Invalid PIN. Ask an admin to unlock this classroom.");
      }
    } catch (err: any) {
      setError(err?.message || "Could not verify PIN. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-warning-foreground" />
            Unlock {classroomName}
          </DialogTitle>
          <DialogDescription>
            This classroom is locked. An admin or authorized staff member must enter a valid PIN to
            unlock it so the teacher can leave the tracker without being clocked out.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label className="text-sm font-semibold text-foreground mb-1.5 block">
            Admin / Staff PIN
          </label>
          <Input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="Enter PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUnlock();
            }}
            className="text-lg tracking-widest"
            disabled={isVerifying}
          />
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isVerifying}>
            Cancel
          </Button>
          <Button onClick={handleUnlock} disabled={isVerifying} className="gap-2">
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" /> Unlock Classroom
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
