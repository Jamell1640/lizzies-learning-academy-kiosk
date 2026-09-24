import { useState } from "react";
import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeacherTimecardEntry } from "@/lib/kiosk.types";

interface Props {
  entries: TeacherTimecardEntry[];
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function BulkDeleteTimecardModal({ entries, onClose, onConfirm }: Props) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-[#E2E8F0]">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-base font-bold text-[#0F172A]">
              Delete {entries.length} Timecard {entries.length === 1 ? "Entry" : "Entries"}?
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={deleting}
            className="p-1 text-[#64748B] hover:text-[#0F172A] rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-3 text-xs text-[#475569]">
          <p>
            You are about to permanently delete{" "}
            <span className="font-bold text-[#0F172A]">{entries.length}</span> timecard{" "}
            {entries.length === 1 ? "entry" : "entries"}. This action cannot be undone.
          </p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] divide-y divide-[#F1F5F9]">
            {entries.map((e) => (
              <div key={e.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                <span className="font-semibold text-[#0F172A] truncate">{e.teacherName}</span>
                <span className="text-[#64748B] shrink-0">{e.classroomName || "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-2 mb-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={deleting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={deleting}
            className="text-xs bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            {deleting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              `Delete ${entries.length} ${entries.length === 1 ? "Entry" : "Entries"}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
