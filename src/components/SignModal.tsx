import { useState, useEffect } from "react";
import { LogIn, LogOut, Check, Phone, AlertCircle } from "lucide-react";
import type { Child, PickupContact } from "@/lib/kiosk.types";
import { getChildPickupContacts } from "@/lib/kiosk.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface SignModalProps {
  child: Child | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    child: Child;
    type: "in" | "out";
    pickupContact: PickupContact;
  }) => Promise<void>;
  isSubmitting: boolean;
}

export function SignModal({ child, isOpen, onClose, onConfirm, isSubmitting }: SignModalProps) {
  if (!child) return null;

  const isCurrentlyIn = child.status === "in";
  const [actionType, setActionType] = useState<"in" | "out">(isCurrentlyIn ? "out" : "in");
  const [contacts, setContacts] = useState<PickupContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<PickupContact | null>(null);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  useEffect(() => {
    if (child) {
      setActionType(child.status === "in" ? "out" : "in");
      setSelectedContact(null);
      loadContacts(child.id);
    }
  }, [child]);

  const loadContacts = async (childId: string) => {
    setIsLoadingContacts(true);
    setContactsError(null);
    try {
      const data = await getChildPickupContacts({ data: { childId } });
      setContacts(data || []);
      if (data && data.length > 0) setSelectedContact(data[0]);
    } catch (err: any) {
      console.error("Failed to load child contacts", err);
      setContacts([]);
      setContactsError(err?.message || "Could not load pickup contacts from CRM.");
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedContact) return;
    await onConfirm({ child, type: actionType, pickupContact: selectedContact });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-full p-5 rounded-lg border">
        <DialogHeader className="flex flex-row items-center gap-3 space-y-0 text-left border-b border-border pb-4">
          <Avatar className="w-12 h-12 rounded-lg border border-border">
            {child.photoUrl ? (
              <AvatarImage src={child.photoUrl} alt={child.name} className="object-cover" />
            ) : null}
            <AvatarFallback className="rounded-lg text-sm font-bold bg-muted text-muted-foreground">
              {child.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-bold tracking-tight text-foreground truncate">
              {child.name}
            </DialogTitle>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
              ID: {child.studentId} • Room: {child.classroom}
            </p>
          </div>
        </DialogHeader>

        {/* Action toggle */}
        <div className="mt-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
            Select Attendance Action
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setActionType("in")}
              className={`h-12 rounded-lg border font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                actionType === "in"
                  ? "bg-success text-success-foreground border-success"
                  : "bg-card border-border hover:bg-secondary text-foreground"
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span className="text-sm">Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => setActionType("out")}
              className={`h-12 rounded-lg border font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                actionType === "out"
                  ? "bg-warning text-warning-foreground border-warning"
                  : "bg-card border-border hover:bg-secondary text-foreground"
              }`}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Pickup person */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {actionType === "in"
                ? "Drop-off By (Authorized Person)"
                : "Pickup By (Authorized Person)"}
            </label>
            <span className="text-xs text-muted-foreground">Linked Contacts</span>
          </div>

          {isLoadingContacts ? (
            <div className="p-6 text-center text-sm text-muted-foreground bg-muted/40 rounded-lg border border-dashed animate-pulse">
              Loading authorized guardians and contacts…
            </div>
          ) : contactsError ? (
            <div className="p-3 text-center text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {contactsError}
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-3 text-center text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" />
              No authorized pickup contacts linked to this child record.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
              {contacts.map((contact) => {
                const isSelected = selectedContact?.id === contact.id;
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setSelectedContact(contact)}
                    className={`p-3 rounded-lg border text-left flex items-start justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/8"
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-foreground text-sm truncate">
                          {contact.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 font-medium rounded uppercase"
                        >
                          {contact.relationship}
                        </Badge>
                      </div>
                      {contact.phone && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {contact.phone}
                        </p>
                      )}
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Buttons */}
        <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-11 px-5 font-semibold cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || !selectedContact}
            className={`h-11 px-6 font-bold flex-1 cursor-pointer ${
              actionType === "in"
                ? "bg-success hover:bg-success/90 text-success-foreground"
                : "bg-warning hover:bg-warning/90 text-warning-foreground"
            }`}
          >
            {isSubmitting ? (
              "Recording..."
            ) : (
              <>
                Confirm {actionType === "in" ? "Sign In" : "Sign Out"}
                {selectedContact ? ` with ${selectedContact.name}` : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
