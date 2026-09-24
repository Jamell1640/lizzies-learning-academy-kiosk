import { useState } from "react";
import { LayoutDashboard, ShieldCheck, Loader2 } from "lucide-react";
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
import { verifyAdminPin } from "@/lib/kiosk.functions";
import { toast } from "sonner";

interface AdminGateModalProps {
  open: boolean;
  onClose: () => void;
  onAuthorized: () => void;
}

/**
 * Standalone admin PIN gate for Dashboard access from the keypad screen.
 *
 * Unlike the classroom AdminUnlockModal (which accepts any valid teacher
 * PIN), this gate requires a teacher whose is_admin flag is true in the CRM.
 * Regular teacher PINs are rejected with a clear "not an admin" message so
 * only actual admins can reach the Dashboard from the sign-in screen.
 */
export function AdminGateModal({ open, onClose, onAuthorized }: AdminGateModalProps) {
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

  const handleAuthorize = async () => {
    if (!pin.trim()) {
      setError("Enter an admin PIN to continue.");
      return;
    }
    setIsVerifying(true);
    setError(null);
    try {
      const result = await verifyAdminPin({ data: { pin } });
      if (result.ok) {
        toast.success(`Admin verified: ${result.teacher.name}. Opening Dashboard.`);
        reset();
        onAuthorized();
      } else if (result.reason === "not_admin") {
        setError("That PIN is not an admin account. Ask an admin to open the Dashboard.");
      } else {
        setError("Invalid PIN. Try again.");
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
            <LayoutDashboard className="w-5 h-5 text-primary" />
            Admin Access Required
          </DialogTitle>
          <DialogDescription>
            Opening the Center Dashboard requires an admin PIN. Enter a valid admin staff PIN to
            continue.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label className="text-sm font-semibold text-foreground mb-1.5 block">Admin PIN</label>
          <Input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="Enter admin PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAuthorize();
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
          <Button onClick={handleAuthorize} disabled={isVerifying} className="gap-2">
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" /> Open Dashboard
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
