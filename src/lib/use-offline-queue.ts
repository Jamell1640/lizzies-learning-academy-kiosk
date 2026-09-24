import { useState, useEffect, useCallback } from "react";
import { signEvent } from "./kiosk.functions";
import { toast } from "sonner";

export interface QueuedSignEvent {
  id: string;
  timestamp: number;
  childId: string;
  teacherId: string;
  classroomId: string;
  type: "in" | "out";
  pickupContactId: string;
  pickupContactName?: string;
  childName?: string;
  studentId?: string;
  teacherName?: string;
  classroomName?: string;
  /** Kiosk-local "HH:MM" (24h), captured at enqueue time (the real moment of the action). */
  localTime24?: string;
  /** Kiosk-local "YYYY-MM-DD", captured at enqueue time. */
  localDate?: string;
}

const STORAGE_KEY = "childcare_offline_queue_v1";

export function useOfflineSignQueue(onSyncSuccess?: () => void) {
  const [queue, setQueue] = useState<QueuedSignEvent[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Load saved queue
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          setQueue(JSON.parse(stored));
        } catch (e) {
          console.error("Failed to parse stored queue", e);
        }
      }
    }
  }, []);

  // Save to storage
  const persistQueue = (items: QueuedSignEvent[]) => {
    setQueue(items);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  };

  const enqueue = (eventData: Omit<QueuedSignEvent, "id" | "timestamp">) => {
    const item: QueuedSignEvent = {
      ...eventData,
      id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    const updated = [...queue, item];
    persistQueue(updated);
    return item;
  };

  const syncQueue = useCallback(async () => {
    if (queue.length === 0 || isSyncing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    setIsSyncing(true);
    let remaining = [...queue];
    let syncedCount = 0;

    for (const item of queue) {
      try {
        await signEvent({
          data: {
            childId: item.childId,
            teacherId: item.teacherId,
            classroomId: item.classroomId,
            type: item.type,
            pickupContactId: item.pickupContactId,
            pickupContactName: item.pickupContactName,
            childName: item.childName,
            studentId: item.studentId,
            teacherName: item.teacherName,
            classroomName: item.classroomName,
            // Preserve the local time captured when the action actually
            // happened, not the sync time.
            localTime24: item.localTime24,
            localDate: item.localDate,
          },
        });
        remaining = remaining.filter((q) => q.id !== item.id);
        syncedCount++;
      } catch (err) {
        console.error("Failed syncing queued sign event", item, err);
        // keep in queue
        break;
      }
    }

    persistQueue(remaining);
    setIsSyncing(false);

    if (syncedCount > 0) {
      toast.success(`Synced ${syncedCount} offline record${syncedCount > 1 ? "s" : ""} to CRM`);
      if (onSyncSuccess) onSyncSuccess();
    }
  }, [queue, isSyncing, onSyncSuccess]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.info("Connection restored. Syncing offline records...");
      syncQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Network connection lost. Offline mode active — check-ins will queue locally.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncQueue]);

  return {
    queue,
    isOnline,
    isSyncing,
    enqueue,
    syncQueue,
  };
}
