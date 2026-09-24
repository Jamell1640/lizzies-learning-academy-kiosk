import { useState } from "react";
import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ManualAttendanceEntry } from "@/lib/kiosk.types";

interface Props {
  entries: ManualAttendanceEntry[];
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function BulkDeleteAttendanceModal({ entries, onClose, onConfirm }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to delete some records");
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="text-lg font-bold text-[#0F172A]">
              Delete {entries.length} {entries.length === 1 ? "Record" : "Records"}?
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={deleting}
            className="p-1 text-[#64748B] hover:text-[#0F172A] rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-[#475569]">
            You are about to permanently delete{" "}
            <span className="font-semibold text-[#0F172A]">{entries.length}</span> attendance{" "}
            {entries.length === 1 ? "record" : "records"}. This action cannot be undone.
          </p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] divide-y divide-[#F1F5F9]">
            {entries.map((e) => (
              <div key={e.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                <span className="font-semibold text-[#0F172A] truncate">{e.childName}</span>
                <span className="text-[#64748B] shrink-0">{e.classroom || "—"}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#94A3B8]">
            Any child whose open record is deleted will be marked as signed out.
          </p>
        </div>
        {error && (
          <div className="mx-5 mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#E2E8F0]">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={deleting}
            className="h-9 text-xs border-[#CBD5E1] bg-white text-[#334155]"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={deleting}
            className="h-9 text-xs bg-[#B91C1C] hover:bg-[#991B1B] text-white"
          >
            {deleting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              `Delete ${entries.length} ${entries.length === 1 ? "Record" : "Records"}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
