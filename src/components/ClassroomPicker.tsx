import { useState, useEffect } from "react";
import { Layers, RefreshCw, ArrowLeft } from "lucide-react";
import type { Teacher, Classroom } from "@/lib/kiosk.types";
import { getClassrooms } from "@/lib/kiosk.functions";
import { Button } from "@/components/ui/button";
import { KOALA_MASCOT_URL } from "@/lib/brand";
import { BrandName } from "@/components/BrandName";
import { getClassroomIcon } from "@/lib/classroom-icon";

interface ClassroomPickerProps {
  teacher: Teacher;
  onSelect: (classroom: Classroom) => void;
  onBack: () => void;
}

export function ClassroomPicker({ teacher, onSelect, onBack }: ClassroomPickerProps) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Debounce: once a classroom is tapped, lock all selection buttons so a
  // double-tap (or double form-submit) can't fire the clock-in write twice
  // and create two duplicate teacher_attendance records. The parent navigates
  // away on success, so this only needs to stay locked until then.
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const loadClassrooms = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getClassrooms();
      setClassrooms(data || []);
      if ((data || []).length === 0) {
        setError("No classrooms found in your center. Please add classrooms in the CRM first.");
      }
    } catch (err: any) {
      console.error("Failed loading classrooms", err);
      setClassrooms([]);
      setError(err?.message || "Could not load classrooms from CRM. Please retry.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClassrooms();
  }, []);

  const handleSelect = (room: Classroom) => {
    if (selectingId) {
      console.log("[ClassroomPicker] selection already in progress, ignoring duplicate tap");
      return;
    }
    setSelectingId(room.id);
    onSelect(room);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="app-header sticky top-0 z-30 px-4 py-3 tablet:px-4 tablet:py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="mascot-chip">
              <img
                src={KOALA_MASCOT_URL}
                alt="Lizzie's Learning Academy"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Select Classroom
                </h1>
                <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-md bg-primary/8 text-sm font-extrabold tracking-tight whitespace-nowrap">
                  <BrandName />
                </span>
              </div>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                Teacher: <span className="font-semibold text-foreground">{teacher.name}</span> —
                choose the room you're staffing now.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={loadClassrooms}
              disabled={isLoading}
              title="Refresh Classrooms"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" onClick={onBack} className="gap-2 font-semibold cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Change Teacher</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-4 sm:p-6 tablet:p-4 flex-1 flex flex-col">
        {isLoading && classrooms.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="mascot-chip mb-3" style={{ width: "3.5rem", height: "3.5rem" }}>
              <img
                src={KOALA_MASCOT_URL}
                alt="Loading"
                className="w-full h-full object-contain opacity-80"
              />
            </div>
            <h3 className="text-base font-bold text-foreground">Loading Classrooms</h3>
            <p className="text-muted-foreground text-sm mt-1">Fetching all center classrooms…</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 mb-3">
              <Layers className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="text-base font-bold text-foreground">Couldn't Load Classrooms</h3>
            <p className="text-destructive text-sm mt-1 max-w-md">{error}</p>
            <Button onClick={loadClassrooms} className="mt-5">
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 tablet-land:grid-cols-4 tablet-port:grid-cols-2 gap-3 tablet:gap-3 flex-1 items-start">
            {classrooms.map((room) => {
              const isBusy = selectingId === room.id;
              const anyBusy = !!selectingId;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => handleSelect(room)}
                  disabled={anyBusy}
                  className="card-surface group text-left w-full p-4 transition-all duration-150 cursor-pointer active:scale-98 hover:border-primary/50 hover:shadow-card-hover flex flex-col gap-3 min-h-[150px] justify-between disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:shadow-none"
                >
                  <div className="flex items-start justify-between w-full">
                    {(() => {
                      const Icon = getClassroomIcon(room.name);
                      return (
                        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/15 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <Icon className="w-5 h-5" />
                        </div>
                      );
                    })()}
                    {room.capacity > 0 && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border">
                        Cap {room.capacity}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors leading-tight">
                      {room.name}
                    </h3>
                    {room.ageGroup &&
                      room.ageGroup.replace(/[^a-z0-9]/gi, "").toLowerCase() !==
                        room.name.replace(/[^a-z0-9]/gi, "").toLowerCase() && (
                        <p className="text-xs text-muted-foreground mt-1">{room.ageGroup}</p>
                      )}
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between text-xs font-semibold text-primary">
                    <span>{isBusy ? "Opening…" : "Open Classroom Kiosk"}</span>
                    <span className="group-hover:translate-x-1 transition-transform">
                      {isBusy ? "…" : "→"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
