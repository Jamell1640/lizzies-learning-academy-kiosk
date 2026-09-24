/**
 * Pickup-contacts lookup, extracted from kiosk.server.ts.
 *
 * Fetches Mother, Father, Guardian, Emergency Contact associations for a
 * child via the associations/relations endpoint, each tagged with its
 * relationship label for the pickup dropdown.
 *
 * The record ID goes in the URL PATH (not as a firstRecordId query param —
 * that shape returns HTTP 400 "Association already deleted or not found"
 * for every child). The four known association-type IDs are passed as
 * associationIds query params.
 *
 * Server-only.
 */
import type { PickupContact } from "./kiosk.types";
import { KioskApiError, getLocationId, callCrmApi } from "./crm-api";

// Association-type IDs (custom_objects.children → Contacts), confirmed
// against the live schema:
//   mother           = 689ea6ed256e0c96eaeabd4e
//   father           = 689ea715256e0c0d88eac436
//   guardian         = 689ea72e5ee7e9570204a130
//   emergency_contact= 689f2a16256e0c1e050308ae
const PICKUP_ASSOCIATIONS: { id: string; relationship: string }[] = [
  { id: "689ea6ed256e0c96eaeabd4e", relationship: "Mother" },
  { id: "689ea715256e0c0d88eac436", relationship: "Father" },
  { id: "689ea72e5ee7e9570204a130", relationship: "Guardian" },
  { id: "689f2a16256e0c1e050308ae", relationship: "Emergency Contact" },
];

export async function serverGetChildPickupContacts(childId: string): Promise<PickupContact[]> {
  const locationId = getLocationId();
  const contacts: PickupContact[] = [];

  const assocIds = PICKUP_ASSOCIATIONS.map((a) => a.id).join(",");
  const url = `/associations/relations/${childId}?locationId=${locationId}&associationIds=${assocIds}`;

  let rels: any[] = [];
  try {
    const relRes = await callCrmApi<{ relations?: any[]; data?: any[]; records?: any[] }>(url);
    rels = relRes?.relations || relRes?.data || relRes?.records || [];
    console.log(`[getChildPickupContacts] ${url} -> raw relations count: ${rels.length}`);
    if (rels.length > 0) {
      console.log(`[getChildPickupContacts] sample relation[0]:`, JSON.stringify(rels[0], null, 2));
    }
  } catch (e: any) {
    console.warn(
      `[getChildPickupContacts] relations lookup failed for ${childId}`,
      e?.message || e,
    );
    // Surface the error rather than silently returning an empty list.
    throw new KioskApiError(
      "Could not load pickup contacts from CRM. Please retry.",
      "API_FAILURE",
    );
  }

  const assocIdToLabel = new Map<string, string>(
    PICKUP_ASSOCIATIONS.map((a) => [a.id, a.relationship]),
  );

  for (const rel of rels) {
    // Each relation has two sides. The contact is whichever side has
    // objectKey === "contact". Relations to custom_objects.classrooms are
    // NOT pickup contacts — skip them.
    const firstIsContact = String(rel.firstObjectKey || "").toLowerCase() === "contact";
    const secondIsContact = String(rel.secondObjectKey || "").toLowerCase() === "contact";
    if (!firstIsContact && !secondIsContact) continue;

    const contactId = firstIsContact ? rel.firstRecordId : rel.secondRecordId;
    if (!contactId) continue;

    const assocTypeId =
      rel.associationId || rel.associationTypeId || rel.association_id || rel.typeId;
    const relLabel = String(
      rel.associationLabel || rel.associationName || rel.key || "",
    ).toLowerCase();
    const relationship =
      assocIdToLabel.get(String(assocTypeId)) ||
      (relLabel === "emergency_contact"
        ? "Emergency Contact"
        : relLabel
          ? relLabel.charAt(0).toUpperCase() + relLabel.slice(1)
          : "Guardian");

    // Fetch the contact record to get name/phone.
    try {
      const cRes = await callCrmApi<any>(`/contacts/${contactId}`);
      const cRec = cRes?.contact || cRes;
      const name =
        `${cRec?.firstName || ""} ${cRec?.lastName || ""}`.trim() ||
        cRec?.name ||
        cRec?.fullName ||
        "Contact";
      contacts.push({
        id: cRec?.id || contactId,
        name,
        relationship,
        phone: cRec?.phone || cRec?.phoneNumber,
      });
    } catch (e) {
      console.warn(`[getChildPickupContacts] contact fetch failed for ${contactId}`, e);
      contacts.push({ id: contactId, name: "Contact", relationship, phone: undefined });
    }
  }

  console.log(`[getChildPickupContacts] matched contacts: ${contacts.length}`);
  return contacts;
}
