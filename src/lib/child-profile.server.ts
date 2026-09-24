/**
 * Child Profile server helpers.
 *
 * Powers the /children and /children/$id admin pages:
 *   - listAllChildren(): every enrolled child (id, name, studentId, classroom)
 *   - getChildProfile(childId): one child's full profile (incl. DOB, classroom)
 *   - getChildContacts(childId): every Contact associated to this child via the
 *     Contact↔children associations, grouped by label (Mother, Father,
 *     Guardian, Emergency Contact, Authorized Pickup) with name/phone/email.
 *   - getChildSiblings(childId): OTHER children sharing a Mother/Father/Guardian
 *     labeled Contact with this child (derived, not stored).
 *   - searchContacts(query): search existing Contacts for the "Add Contact" picker.
 *   - addChildContact(childId, contactId, associationId): create an association.
 *   - removeChildContact(childId, relationId): delete an association relation.
 *
 * Reuses the same callCrmApi / getLocationId / propVal helpers as the rest of
 * the app. Server-only.
 */
import { getLocationId, callCrmApi, propVal, normKey } from "./crm-api";

// All five Contact↔children association-type IDs, confirmed live.
// (Authorized Pickup was created via the schema-management route.)
export const CHILD_CONTACT_ASSOCIATIONS: { id: string; label: string }[] = [
  { id: "689ea6ed256e0c96eaeabd4e", label: "Mother" },
  { id: "689ea715256e0c0c0d88eac436", label: "Father" },
  { id: "689ea72e5ee7e9570204a130", label: "Guardian" },
  { id: "689f2a16256e0c1e050308ae", label: "Emergency Contact" },
  // Authorized Pickup — key may vary; resolved dynamically in resolveAssocIds().
];

// Fallback / known authorized_pickup id (filled in once confirmed). The list
// endpoint resolves the real id at runtime so this is only a last resort.
const AUTHORIZED_PICKUP_FALLBACK_ID = "authorized_pickup";

export interface ChildSummary {
  id: string;
  name: string;
  studentId: string;
  classroom: string;
  /**
   * Raw CRM "child_date_of_birth" value. Used to compute age dynamically
   * (via formatAgeFromDob) on the admin children list — never the stale
   * stored "Age" field.
   */
  dob?: string;
}

export interface ChildContact {
  /** The association-relation id (used to remove the link). */
  relationId: string;
  /** The Contact record id. */
  contactId: string;
  name: string;
  phone?: string;
  email?: string;
  /** Label: Mother | Father | Guardian | Emergency Contact | Authorized Pickup */
  relationship: string;
}

export interface ChildProfile {
  id: string;
  name: string;
  studentId: string;
  classroom: string;
  classroomId?: string;
  status?: string;
  dob?: string;
  photoUrl?: string;
}

export interface ChildSibling {
  id: string;
  name: string;
  studentId: string;
  classroom: string;
  /** The shared contact that makes them siblings. */
  sharedContactName: string;
  sharedRelationship: string;
}

// ---------------------------------------------------------------------------
// Association-type resolution
// ---------------------------------------------------------------------------

interface ResolvedAssoc {
  id: string;
  label: string;
}

let _assocCache: ResolvedAssoc[] | null = null;

/**
 * Resolve the real association-type IDs for the Contact↔children pair by
 * listing all associations once. This guarantees we use the live IDs
 * (including Authorized Pickup) rather than hardcoding.
 */
async function resolveAssocIds(): Promise<ResolvedAssoc[]> {
  if (_assocCache) return _assocCache;
  const locationId = getLocationId();
  const all: any[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const base = `/associations/?locationId=${locationId}&limit=100`;
    const url = cursor ? `${base}&startAfter=${cursor}` : base;
    const res = await callCrmApi<any>(url);
    const items = res?.associations || res?.data || res?.records || [];
    all.push(...items);
    cursor = res?.nextPageToken || res?.cursor || res?.meta?.nextCursor || undefined;
    pages++;
    if (items.length === 0) break;
  } while (cursor && pages < 10);

  const pair = all.filter((a) => {
    const f = String(a.firstObjectKey || "").toLowerCase();
    const s = String(a.secondObjectKey || "").toLowerCase();
    return (
      (f === "contact" && s === "custom_objects.children") ||
      (f === "custom_objects.children" && s === "contact")
    );
  });

  const resolved: ResolvedAssoc[] = pair.map((a) => ({
    id: a.id,
    label: prettyLabel(String(a.firstObjectLabel || a.key || a.secondObjectLabel || "Contact")),
  }));

  // Merge with the hardcoded known IDs so we always have the four core labels
  // even if the list endpoint shape changes.
  const byId = new Map<string, ResolvedAssoc>();
  for (const r of resolved) byId.set(r.id, r);
  for (const k of CHILD_CONTACT_ASSOCIATIONS) {
    if (!byId.has(k.id)) byId.set(k.id, { id: k.id, label: k.label });
  }

  _assocCache = Array.from(byId.values());
  console.log(
    `[child-profile] resolved ${_assocCache.length} Contact↔children associations:`,
    _assocCache.map((a) => `${a.label}=${a.id}`).join(", "),
  );
  return _assocCache;
}

function prettyLabel(s: string): string {
  const t = s.replace(/_/g, " ").trim();
  if (!t) return "Contact";
  return t
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function assocIdToLabel(id: string, resolved: ResolvedAssoc[]): string {
  const found = resolved.find((r) => r.id === id);
  if (found) return found.label;
  return prettyLabel(id);
}

// ---------------------------------------------------------------------------
// Children list + profile
// ---------------------------------------------------------------------------

/** Fetch every enrolled child for the admin list. */
export async function serverListAllChildren(): Promise<ChildSummary[]> {
  const locationId = getLocationId();
  const listRes = await callCrmApi<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.children/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 300 }),
    },
  );
  const all = listRes?.records || listRes?.data || [];
  const out: ChildSummary[] = [];
  for (const r of all) {
    const status = String(propVal(r, "Status") ?? "")
      .trim()
      .toLowerCase();
    if (status !== "" && status !== "enrolled" && status !== "active") continue;
    const name = propVal(r, "Child Name") || propVal(r, "name") || `Child ${r.id.slice(-4)}`;
    out.push({
      id: r.id,
      name,
      studentId: propVal(r, "Student ID") || "",
      classroom: propVal(r, "Classroom") || propVal(r, "Classroom Name") || "",
      dob:
        propVal(r, "child_date_of_birth") ||
        propVal(r, "Child Date of Birth") ||
        propVal(r, "Date of Birth") ||
        undefined,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Fetch a single child's profile by record id. */
export async function serverGetChildProfile(childId: string): Promise<ChildProfile | null> {
  try {
    const res = await callCrmApi<any>(`/objects/custom_objects.children/records/${childId}`);
    const rec = res?.record || res?.data || res;
    if (!rec) return null;
    const name = propVal(rec, "Child Name") || propVal(rec, "name") || `Child ${childId.slice(-4)}`;
    return {
      id: rec.id || childId,
      name,
      studentId: propVal(rec, "Student ID") || "",
      classroom: propVal(rec, "Classroom") || propVal(rec, "Classroom Name") || "",
      classroomId: propVal(rec, "Classroom ID") || undefined,
      status: propVal(rec, "Status") || undefined,
      dob: propVal(rec, "child_date_of_birth") || propVal(rec, "Date of Birth") || undefined,
      photoUrl: propVal(rec, "Photo") || propVal(rec, "photoUrl") || undefined,
    };
  } catch (e: any) {
    console.warn(`[getChildProfile] failed for ${childId}`, e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Contacts (grouped by label)
// ---------------------------------------------------------------------------

/**
 * Fetch every Contact associated to this child via the Contact↔children
 * associations, each tagged with its relationship label.
 */
export async function serverGetChildContacts(childId: string): Promise<ChildContact[]> {
  const locationId = getLocationId();
  const resolved = await resolveAssocIds();
  const assocIds = resolved.map((a) => a.id).join(",");

  let rels: any[] = [];
  try {
    const url = `/associations/relations/${childId}?locationId=${locationId}&associationIds=${assocIds}`;
    const relRes = await callCrmApi<{ relations?: any[]; data?: any[]; records?: any[] }>(url);
    rels = relRes?.relations || relRes?.data || relRes?.records || [];
    console.log(`[getChildContacts] ${childId} -> raw relations: ${rels.length}`);
  } catch (e: any) {
    console.warn(`[getChildContacts] relations lookup failed for ${childId}`, e?.message || e);
    return [];
  }

  const contacts: ChildContact[] = [];
  for (const rel of rels) {
    const firstIsContact = String(rel.firstObjectKey || "").toLowerCase() === "contact";
    const secondIsContact = String(rel.secondObjectKey || "").toLowerCase() === "contact";
    if (!firstIsContact && !secondIsContact) continue;

    const contactId = firstIsContact ? rel.firstRecordId : rel.secondRecordId;
    if (!contactId) continue;

    const assocTypeId =
      rel.associationId || rel.associationTypeId || rel.association_id || rel.typeId;
    const relationship = assocIdToLabel(String(assocTypeId), resolved);

    const relationId = rel.id || rel.relationId || rel.recordId || `${contactId}:${assocTypeId}`;

    // Fetch the contact record for name/phone/email.
    let name = "Contact";
    let phone: string | undefined;
    let email: string | undefined;
    try {
      const cRes = await callCrmApi<any>(`/contacts/${contactId}`);
      const cRec = cRes?.contact || cRes;
      name =
        `${cRec?.firstName || ""} ${cRec?.lastName || ""}`.trim() ||
        cRec?.name ||
        cRec?.fullName ||
        "Contact";
      phone = cRec?.phone || cRec?.phoneNumber || undefined;
      email = cRec?.email || cRec?.emailAddress || undefined;
    } catch (e) {
      console.warn(`[getChildContacts] contact fetch failed for ${contactId}`, e);
    }

    contacts.push({
      relationId,
      contactId,
      name,
      phone,
      email,
      relationship,
    });
  }

  return contacts;
}

// ---------------------------------------------------------------------------
// Siblings (derived)
// ---------------------------------------------------------------------------

/**
 * Derive siblings: other children who share a Mother/Father/Guardian-labeled
 * Contact with this child. Not stored — computed from the contact associations.
 */
export async function serverGetChildSiblings(childId: string): Promise<ChildSibling[]> {
  // 1. Get this child's Mother/Father/Guardian contacts.
  const contacts = await serverGetChildContacts(childId);
  const guardianLabels = new Set(["mother", "father", "guardian"]);
  const guardianContacts = contacts.filter((c) => guardianLabels.has(c.relationship.toLowerCase()));

  if (guardianContacts.length === 0) return [];

  // 2. For each shared contact, find OTHER children linked to that contact.
  const locationId = getLocationId();
  const siblings: ChildSibling[] = [];
  const seenSiblingIds = new Set<string>([childId]);

  for (const gc of guardianContacts) {
    try {
      // List relations FROM the contact side, across all child associations.
      const resolved = await resolveAssocIds();
      const guardianAssocIds = resolved
        .filter((a) => guardianLabels.has(a.label.toLowerCase()))
        .map((a) => a.id)
        .join(",");
      const url = `/associations/relations/${gc.contactId}?locationId=${locationId}&associationIds=${guardianAssocIds}`;
      const relRes = await callCrmApi<{ relations?: any[]; data?: any[]; records?: any[] }>(url);
      const rels = relRes?.relations || relRes?.data || relRes?.records || [];

      for (const rel of rels) {
        const firstIsChild =
          String(rel.firstObjectKey || "").toLowerCase() === "custom_objects.children";
        const secondIsChild =
          String(rel.secondObjectKey || "").toLowerCase() === "custom_objects.children";
        if (!firstIsChild && !secondIsChild) continue;

        const otherChildId = firstIsChild ? rel.firstRecordId : rel.secondRecordId;
        if (!otherChildId || seenSiblingIds.has(otherChildId)) continue;
        seenSiblingIds.add(otherChildId);

        // Fetch the sibling child's name/classroom.
        let name = `Child ${otherChildId.slice(-4)}`;
        let studentId = "";
        let classroom = "";
        try {
          const cRes = await callCrmApi<any>(
            `/objects/custom_objects.children/records/${otherChildId}`,
          );
          const rec = cRes?.record || cRes?.data || cRes;
          name = propVal(rec, "Child Name") || propVal(rec, "name") || name;
          studentId = propVal(rec, "Student ID") || "";
          classroom = propVal(rec, "Classroom") || propVal(rec, "Classroom Name") || "";
        } catch (e) {
          console.warn(`[getChildSiblings] child fetch failed for ${otherChildId}`, e);
        }

        siblings.push({
          id: otherChildId,
          name,
          studentId,
          classroom,
          sharedContactName: gc.name,
          sharedRelationship: gc.relationship,
        });
      }
    } catch (e: any) {
      console.warn(
        `[getChildSiblings] relations lookup failed for contact ${gc.contactId}`,
        e?.message || e,
      );
    }
  }

  siblings.sort((a, b) => a.name.localeCompare(b.name));
  return siblings;
}

// ---------------------------------------------------------------------------
// Contact search (for "Add Guardian/Contact")
// ---------------------------------------------------------------------------

export async function serverSearchContacts(
  query: string,
): Promise<{ id: string; name: string; phone?: string; email?: string }[]> {
  const locationId = getLocationId();
  const q = (query || "").trim().toLowerCase();

  const body: any = {
    locationId,
    pageLimit: 50,
    filters: [
      {
        key: "name",
        operator: "exists",
      },
    ],
  };
  if (q) {
    body.filters = [
      {
        key: "name",
        operator: "partial",
        value: q,
      },
    ];
  }

  let list: any[] = [];
  try {
    const res = await callCrmApi<{ contacts?: any[]; data?: any[]; records?: any[] }>(
      `/contacts/search`,
      { method: "POST", body: JSON.stringify(body) },
    );
    list = res?.contacts || res?.data || res?.records || [];
  } catch (e: any) {
    console.warn(`[searchContacts] search failed, trying list fallback`, e?.message || e);
    // Fallback: simple list (no filter) and filter in code.
    const res = await callCrmApi<{ contacts?: any[]; data?: any[] }>(
      `/contacts/?locationId=${locationId}&limit=100`,
    );
    list = res?.contacts || res?.data || [];
  }

  const out: { id: string; name: string; phone?: string; email?: string }[] = [];
  for (const c of list) {
    const name =
      `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || c.fullName || "Contact";
    if (q && !name.toLowerCase().includes(q)) continue;
    out.push({
      id: c.id,
      name,
      phone: c.phone || c.phoneNumber || undefined,
      email: c.email || c.emailAddress || undefined,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out.slice(0, 30);
}

// ---------------------------------------------------------------------------
// Add / remove contact association
// ---------------------------------------------------------------------------

/**
 * Create an association relation between a child and a contact.
 * GHL: POST /associations/relations/{firstRecordId} with the secondRecordId +
 * associationId in the body.
 */
export async function serverAddChildContact(
  childId: string,
  contactId: string,
  associationId: string,
): Promise<{ ok: boolean; relationId?: string; error?: string }> {
  const locationId = getLocationId();

  // If the client passed the "authorized_pickup" sentinel (its real id isn't
  // hardcoded client-side), resolve it from the live association list.
  let resolvedAssocId = associationId;
  if (associationId === "authorized_pickup" || associationId === AUTHORIZED_PICKUP_FALLBACK_ID) {
    const resolved = await resolveAssocIds();
    const found = resolved.find(
      (r) => r.label.toLowerCase().replace(/[^a-z]/g, "") === "authorizedpickup",
    );
    if (!found) {
      return {
        ok: false,
        error:
          'The "Authorized Pickup" association was not found in this location. Create it first via the association schema setup.',
      };
    }
    resolvedAssocId = found.id;
  }

  try {
    const res = await callCrmApi<any>(
      `/associations/relations/${childId}?locationId=${locationId}`,
      {
        method: "POST",
        body: JSON.stringify({
          secondRecordId: contactId,
          associationId: resolvedAssocId,
          locationId,
        }),
      },
    );
    const relationId =
      res?.id || res?.relationId || res?.recordId || res?.relation?.id || "created";
    return { ok: true, relationId };
  } catch (e: any) {
    console.warn(`[addChildContact] failed`, e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Remove an association relation by its relation id.
 * GHL: DELETE /associations/relations/{relationId}
 */
export async function serverRemoveChildContact(
  relationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const locationId = getLocationId();
  try {
    await callCrmApi(`/associations/relations/${relationId}?locationId=${locationId}`, {
      method: "DELETE",
    });
    return { ok: true };
  } catch (e: any) {
    console.warn(`[removeChildContact] failed for ${relationId}`, e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export { AUTHORIZED_PICKUP_FALLBACK_ID };
