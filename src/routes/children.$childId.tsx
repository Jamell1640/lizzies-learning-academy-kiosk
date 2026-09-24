import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Phone,
  Mail,
  Trash2,
  Plus,
  Search,
  ShieldAlert,
  Users,
  Heart,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { ChildProfile, ChildContact, ChildSibling } from "@/lib/child-profile.server";
import {
  getChildProfile,
  getChildContacts,
  getChildSiblings,
  searchContacts,
  addChildContact,
  removeChildContact,
} from "@/lib/kiosk.functions";
import { Button } from "@/components/ui/button";
import { KOALA_MASCOT_URL } from "@/lib/brand";
import { BrandName } from "@/components/BrandName";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { getClassroomIcon } from "@/lib/classroom-icon";
import { formatAgeFromDob } from "@/lib/kiosk-time";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/children/$childId")({
  head: () => ({
    meta: [
      { title: "Child Profile — Lizzie's Learning Academy" },
      {
        name: "description",
        content:
          "Child profile with guardians, contacts, and siblings for Lizzie's Learning Academy.",
      },
      { property: "og:title", content: "Child Profile — Lizzie's Learning Academy" },
      {
        property: "og:description",
        content:
          "Child profile with guardians, contacts, and siblings for Lizzie's Learning Academy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChildProfilePage,
});

// Relationship labels offered in the "Add Contact" picker.
const RELATIONSHIP_OPTIONS = [
  "Mother",
  "Father",
  "Guardian",
  "Emergency Contact",
  "Authorized Pickup",
];

function ChildProfilePage() {
  const { childId } = Route.useParams();

  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [contacts, setContacts] = useState<ChildContact[]>([]);
  const [siblings, setSiblings] = useState<ChildSibling[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-contact modal state
  const [showAdd, setShowAdd] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<
    { id: string; name: string; phone?: string; email?: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<{ id: string; name: string } | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState("Mother");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, c, s] = await Promise.all([
        getChildProfile({ data: { childId } }),
        getChildContacts({ data: { childId } }),
        getChildSiblings({ data: { childId } }),
      ]);
      setProfile(p);
      setContacts(c || []);
      setSiblings(s || []);
    } catch (err: any) {
      console.error("Child profile load failed", err);
      setError(err?.message || "Could not load child profile from CRM.");
    } finally {
      setIsLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced contact search
  useEffect(() => {
    if (!showAdd) return;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchContacts({ data: { query: contactQuery } });
        if (!cancelled) setContactResults(results || []);
      } catch (e: any) {
        console.warn("contact search failed", e);
        if (!cancelled) setContactResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [contactQuery, showAdd]);

  const removeFn = useServerFn(removeChildContact);
  const addFn = useServerFn(addChildContact);

  const handleRemove = async (relationId: string, name: string) => {
    if (!confirm(`Remove ${name} from this child's contacts?`)) return;
    const res = await removeFn({ data: { relationId } });
    if (res.ok) {
      toast.success(`${name} removed.`);
      setContacts((prev) => prev.filter((c) => c.relationId !== relationId));
    } else {
      toast.error(res.error || "Could not remove contact.");
    }
  };

  const handleAdd = async () => {
    if (!selectedContact) {
      toast.error("Select a contact first.");
      return;
    }
    setSaving(true);
    // Map label → association id. We resolve from the live contacts list:
    // the contacts already loaded carry their association id implicitly via
    // the relationship label. We look it up from a fresh contacts fetch is
    // not needed — instead we pass the label and let the server resolve.
    // However addChildContact needs an associationId. We resolve via a small
    // lookup against the known association ids by label.
    const assocId = labelToAssocId(selectedRelationship);
    if (!assocId) {
      toast.error("Could not resolve association for that relationship.");
      setSaving(false);
      return;
    }
    const res = await addFn({
      data: {
        childId,
        contactId: selectedContact.id,
        associationId: assocId,
      },
    });
    setSaving(false);
    if (res.ok) {
      toast.success(`${selectedContact.name} added as ${selectedRelationship}.`);
      setShowAdd(false);
      setSelectedContact(null);
      setContactQuery("");
      load();
    } else {
      toast.error(res.error || "Could not add contact.");
    }
  };

  // Group contacts by relationship label.
  const grouped = contacts.reduce<Record<string, ChildContact[]>>((acc, c) => {
    const key = c.relationship || "Contact";
    (acc[key] ||= []).push(c);
    return acc;
  }, {});

  const Icon = getClassroomIcon(profile?.classroom || "");

  return (
    <div className="flex flex-col min-h-screen bg-[#F6F8FA] text-[#1E293B]">
      <header className="sticky top-0 z-30 bg-white border-b border-[#E2E8F0] px-4 py-2.5 sm:px-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-white border border-[#E2E8F0] p-1 flex items-center justify-center shrink-0 shadow-xs">
              <img
                src={KOALA_MASCOT_URL}
                alt="Lizzie's Learning Academy"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-bold tracking-tight text-[#0F172A]">
                <BrandName />
              </span>
              <span className="text-[11px] font-semibold text-[#0284C7] uppercase tracking-wider">
                Child Profile
              </span>
            </div>
          </div>
          <Button
            size="sm"
            asChild
            variant="outline"
            className="h-8 gap-1.5 text-xs font-medium border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]"
          >
            <Link to="/children">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Children</span>
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar lastUpdated={null} currentRoute="children" />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {error && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                <span>{error}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={load}
                  className="h-7 text-xs bg-white ml-auto"
                >
                  Retry
                </Button>
              </div>
            )}

            {isLoading ? (
              <div className="text-sm text-[#64748B] py-12 text-center">Loading profile…</div>
            ) : !profile ? (
              <div className="text-sm text-[#64748B] py-12 text-center">Child not found.</div>
            ) : (
              <>
                {/* Profile header card */}
                <div className="flex items-center gap-4 p-5 rounded-xl border border-[#E2E8F0] bg-white">
                  <div className="w-16 h-16 rounded-full bg-[#E0F2FE] flex items-center justify-center shrink-0">
                    <Icon className="w-8 h-8 text-[#0284C7]" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold tracking-tight text-[#0F172A] truncate">
                      {profile.name}
                    </h1>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#64748B]">
                      {profile.classroom && (
                        <span>
                          Classroom: <strong className="text-[#334155]">{profile.classroom}</strong>
                        </span>
                      )}
                      {profile.studentId && (
                        <span>
                          Student ID:{" "}
                          <strong className="text-[#334155]">{profile.studentId}</strong>
                        </span>
                      )}
                      {profile.dob && (
                        <span>
                          DOB: <strong className="text-[#334155]">{profile.dob}</strong>
                        </span>
                      )}
                      {(() => {
                        const age = formatAgeFromDob(profile.dob);
                        return age ? (
                          <span>
                            Age: <strong className="text-[#334155]">{age}</strong>
                          </span>
                        ) : null;
                      })()}
                      {profile.status && (
                        <span>
                          Status: <strong className="text-[#334155]">{profile.status}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Guardians & Contacts */}
                <section className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-[#E2E8F0]">
                    <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wide">
                      Guardians & Contacts
                    </h2>
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowAdd(true);
                        setSelectedContact(null);
                        setContactQuery("");
                      }}
                      className="h-8 gap-1.5 text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Contact
                    </Button>
                  </div>

                  {contacts.length === 0 ? (
                    <div className="px-5 py-10 text-center text-sm text-[#64748B]">
                      <Users className="w-8 h-8 mx-auto mb-2 text-[#CBD5E1]" />
                      No contacts linked yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#F1F5F9]">
                      {RELATIONSHIP_OPTIONS.map((label) => {
                        const group = grouped[label];
                        if (!group || group.length === 0) return null;
                        return (
                          <div key={label} className="px-5 py-3">
                            <div className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-2">
                              {label}
                            </div>
                            <div className="space-y-2">
                              {group.map((c) => (
                                <div
                                  key={c.relationId}
                                  className="flex items-center gap-3 p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]"
                                >
                                  <div className="w-9 h-9 rounded-full bg-[#E0F2FE] flex items-center justify-center shrink-0 text-xs font-bold text-[#0284C7]">
                                    {initials(c.name)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-[#0F172A] truncate">
                                      {c.name}
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#64748B]">
                                      {c.phone && (
                                        <span className="inline-flex items-center gap-1">
                                          <Phone className="w-3 h-3" />
                                          {c.phone}
                                        </span>
                                      )}
                                      {c.email && (
                                        <span className="inline-flex items-center gap-1 truncate">
                                          <Mail className="w-3 h-3" />
                                          {c.email}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleRemove(c.relationId, c.name)}
                                    className="p-1.5 rounded-md text-[#94A3B8] hover:text-red-600 hover:bg-red-50 transition-colors"
                                    title={`Remove ${c.name}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Siblings (derived) */}
                <section className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#E2E8F0]">
                    <h2 className="text-sm font-bold text-[#0F172A] uppercase tracking-wide flex items-center gap-2">
                      <Heart className="w-4 h-4 text-[#0284C7]" />
                      Siblings
                    </h2>
                    <p className="text-xs text-[#94A3B8] mt-0.5">
                      Derived from shared Mother/Father/Guardian contacts.
                    </p>
                  </div>
                  {siblings.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-[#64748B]">
                      No siblings found.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#F1F5F9]">
                      {siblings.map((s) => (
                        <Link
                          key={s.id}
                          to="/children/$childId"
                          params={{ childId: s.id }}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-[#F8FAFC] transition-colors"
                        >
                          <div className="w-9 h-9 rounded-full bg-[#FEF3C7] flex items-center justify-center shrink-0 text-xs font-bold text-[#B45309]">
                            {initials(s.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-[#0F172A] truncate">
                              {s.name}
                            </div>
                            <div className="text-xs text-[#64748B] truncate">
                              {s.classroom || "Unassigned"}
                              {s.studentId ? ` · ${s.studentId}` : ""}
                            </div>
                          </div>
                          <div className="text-[11px] text-[#94A3B8] text-right shrink-0">
                            via {s.sharedRelationship}
                            <div className="text-[#CBD5E1]">{s.sharedContactName}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Add Contact modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[#E2E8F0] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#E2E8F0]">
              <h3 className="text-sm font-bold text-[#0F172A]">Add Guardian / Contact</h3>
              <button
                onClick={() => setShowAdd(false)}
                className="p-1 rounded-md text-[#94A3B8] hover:text-[#0F172A] hover:bg-[#F1F5F9]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Relationship selector */}
              <div>
                <label className="text-xs font-semibold text-[#475569] mb-1.5 block">
                  Relationship
                </label>
                <select
                  value={selectedRelationship}
                  onChange={(e) => setSelectedRelationship(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0284C7]/30 focus:border-[#0284C7]"
                >
                  {RELATIONSHIP_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Contact search */}
              <div>
                <label className="text-xs font-semibold text-[#475569] mb-1.5 block">
                  Search existing contacts
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                  <input
                    type="text"
                    value={contactQuery}
                    onChange={(e) => setContactQuery(e.target.value)}
                    placeholder="Name, phone, or email…"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0284C7]/30 focus:border-[#0284C7]"
                  />
                </div>

                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[#E2E8F0] divide-y divide-[#F1F5F9]">
                  {searching ? (
                    <div className="px-3 py-4 text-center text-xs text-[#94A3B8]">Searching…</div>
                  ) : contactResults.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-[#94A3B8]">
                      No contacts found. Try a different search.
                    </div>
                  ) : (
                    contactResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedContact({ id: c.id, name: c.name })}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#F8FAFC] transition-colors ${
                          selectedContact?.id === c.id ? "bg-[#E0F2FE]" : ""
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-[#E0F2FE] flex items-center justify-center shrink-0 text-[10px] font-bold text-[#0284C7]">
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[#0F172A] truncate">
                            {c.name}
                          </div>
                          <div className="text-xs text-[#64748B] truncate">
                            {c.phone || c.email || ""}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selectedContact && (
                <div className="text-xs text-[#475569] bg-[#F8FAFC] rounded-lg px-3 py-2 border border-[#E2E8F0]">
                  Selected: <strong className="text-[#0F172A]">{selectedContact.name}</strong> as{" "}
                  <strong className="text-[#0284C7]">{selectedRelationship}</strong>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC]">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAdd(false)}
                className="h-8 text-xs border-[#CBD5E1] bg-white text-[#334155]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!selectedContact || saving}
                className="h-8 text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white"
              >
                {saving ? "Saving…" : "Add Contact"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Known association-type IDs by label (Contact↔children), confirmed live.
const LABEL_TO_ASSOC_ID: Record<string, string> = {
  Mother: "689ea6ed256e0c96eaeabd4e",
  Father: "689ea715256e0c0c0d88eac436",
  Guardian: "689ea72e5ee7e9570204a130",
  "Emergency Contact": "689f2a16256e0c1e050308ae",
  // Authorized Pickup id is resolved at runtime by the server; the client
  // passes the label-derived sentinel and the server maps it. For the four
  // core labels we pass the real id directly.
  "Authorized Pickup": "authorized_pickup",
};

function labelToAssocId(label: string): string | undefined {
  return LABEL_TO_ASSOC_ID[label];
}
