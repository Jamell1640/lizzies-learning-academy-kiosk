import { toast } from "sonner";
import { X, Trash2, RefreshCw } from "lucide-react";
import type { ManualAttendanceEntry } from "@/lib/kiosk.types";
import { deleteManualAttendance } from "@/lib/kiosk.functions";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface DeleteAttendanceModalProps {
  entry: ManualAttendanceEntry | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteAttendanceModal({ entry, onClose, onDeleted }: DeleteAttendanceModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!entry) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteManualAttendance({
        data: { recordId: entry.id },
      });
      if (result?.ok) {
        toast.success("Attendance record deleted.");
        onDeleted();
      } else {
        toast.error("Could not delete the record.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete record.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-bold text-[#0F172A]">Delete Record?</h2>
        </div>
        <div className="px-5 py-4 space-y-2">
          <p className="text-sm text-[#475569]">
            This will permanently delete the attendance record for{" "}
            <span className="font-semibold text-[#0F172A]">{entry.childName}</span> on{" "}
            <span className="font-semibold text-[#0F172A]">{entry.date}</span>.
          </p>
          <p className="text-xs text-[#94A3B8]">
            If this is the child's currently open record, they will be marked as signed out.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#E2E8F0]">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-9 text-xs border-[#CBD5E1] bg-white text-[#334155]"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="h-9 text-xs bg-[#B91C1C] hover:bg-[#991B1B] text-white"
          >
            {isDeleting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
