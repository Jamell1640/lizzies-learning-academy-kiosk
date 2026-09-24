import { createFileRoute } from "@tanstack/react-router";
import { getLocationId, callCrmApi } from "@/lib/crm-api";

/**
 * Admin association-schema management route.
 *
 * GHL model: each "label" (Mother, Father, Guardian, Emergency Contact) is
 * its OWN association record (id + key + firstObjectLabel/secondObjectLabel),
 * NOT one association carrying multiple labels. So:
 *  - "Authorized Pickup" = CREATE a new Contact↔children association.
 *  - "Teacher↔Classrooms" / "Guardian/Parent↔Attendance Records" = DELETE
 *    those association records by id.
 *
 * GET  /api/assoc-manage            -> list all associations (read-only)
 * POST /api/assoc-manage?action=apply -> apply the full schema change + re-list
 */
export const Route = createFileRoute("/api/assoc-manage")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const associations = await listAllAssociations();
          return Response.json({ ok: true, count: associations.length, associations });
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "apply";
        if (action !== "apply") {
          return Response.json({ ok: false, error: "Use ?action=apply" }, { status: 400 });
        }

        const log: string[] = [];
        try {
          const before = await listAllAssociations();
          log.push(`BEFORE: ${before.length} associations.`);
          for (const a of before) {
            log.push(
              `  - id=${a.id} key=${a.key} [${a.firstObjectKey}|${a.firstObjectLabel}] ↔ [${a.secondObjectKey}|${a.secondObjectLabel}]`,
            );
          }

          // 1. Create "Authorized Pickup" Contact↔children if missing.
          const contactChildren = before.filter((a) =>
            isPair(a, "contact", "custom_objects.children"),
          );
          log.push(`Contact↔children associations found: ${contactChildren.length}`);
          const existingAuthPickup = contactChildren.find(
            (a) =>
              String(a.firstObjectLabel || "")
                .toLowerCase()
                .includes("authorized pickup") ||
              String(a.secondObjectLabel || "")
                .toLowerCase()
                .includes("authorized pickup") ||
              String(a.key || "")
                .toLowerCase()
                .includes("authorized"),
          );
          let authorizedPickupId: string | null = null;
          if (existingAuthPickup) {
            authorizedPickupId = existingAuthPickup.id;
            log.push(`"Authorized Pickup" already exists (id=${authorizedPickupId}).`);
          } else {
            try {
              const created = await createAssociation({
                firstObjectKey: "contact",
                firstObjectLabel: "Authorized Pickup",
                secondObjectKey: "custom_objects.children",
                secondObjectLabel: "Child",
                key: "authorized_pickup",
              });
              authorizedPickupId = created?.id || null;
              log.push(
                `CREATED "Authorized Pickup" (id=${authorizedPickupId}). raw=${JSON.stringify(created).slice(0, 200)}`,
              );
            } catch (e: any) {
              log.push(`FAILED to create Authorized Pickup: ${e?.message || e}`);
            }
          }

          // 2. Delete Teacher↔Classrooms association(s).
          const teacherClassrooms = before.filter((a) =>
            isPair(a, "custom_objects.teachers", "custom_objects.classrooms"),
          );
          for (const a of teacherClassrooms) {
            try {
              await deleteAssociation(a.id);
              log.push(`DELETED Teacher↔Classrooms (id=${a.id}, key=${a.key}).`);
            } catch (e: any) {
              log.push(`FAILED to delete Teacher↔Classrooms (id=${a.id}): ${e?.message || e}`);
            }
          }
          if (teacherClassrooms.length === 0)
            log.push("Teacher↔Classrooms not found (already absent).");

          // 3. Delete Guardian/Parent↔Attendance Records association(s).
          const guardianAttendance = before.filter(
            (a) =>
              isPair(a, "contact", "custom_objects.attendance_records") &&
              (String(a.firstObjectLabel || "")
                .toLowerCase()
                .includes("guardian") ||
                String(a.firstObjectLabel || "")
                  .toLowerCase()
                  .includes("parent") ||
                String(a.secondObjectLabel || "")
                  .toLowerCase()
                  .includes("guardian") ||
                String(a.secondObjectLabel || "")
                  .toLowerCase()
                  .includes("parent") ||
                String(a.key || "")
                  .toLowerCase()
                  .includes("guardian") ||
                String(a.key || "")
                  .toLowerCase()
                  .includes("parent")),
          );
          for (const a of guardianAttendance) {
            try {
              await deleteAssociation(a.id);
              log.push(`DELETED Guardian/Parent↔Attendance Records (id=${a.id}, key=${a.key}).`);
            } catch (e: any) {
              log.push(
                `FAILED to delete Guardian/Parent↔Attendance Records (id=${a.id}): ${e?.message || e}`,
              );
            }
          }
          if (guardianAttendance.length === 0)
            log.push("Guardian/Parent↔Attendance Records not found (already absent).");

          // 4. Re-list final state.
          const after = await listAllAssociations();
          const finalContactChildren = after
            .filter((a) => isPair(a, "contact", "custom_objects.children"))
            .map((a) => ({
              id: a.id,
              key: a.key,
              firstObjectLabel: a.firstObjectLabel,
              secondObjectLabel: a.secondObjectLabel,
            }));
          log.push(`AFTER: ${after.length} associations.`);
          log.push(`Final Contact↔children labels: ${finalContactChildren.length}`);

          return Response.json({
            ok: true,
            log,
            authorizedPickupId,
            finalContactChildrenAssociations: finalContactChildren,
            totalAssociationsAfter: after.length,
          });
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message || String(e), log }, { status: 500 });
        }
      },
    },
  },
});

// ---- helpers ----

async function listAllAssociations(): Promise<any[]> {
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
  return all;
}

async function createAssociation(body: {
  firstObjectKey: string;
  firstObjectLabel: string;
  secondObjectKey: string;
  secondObjectLabel: string;
  key: string;
}): Promise<any> {
  const locationId = getLocationId();
  return callCrmApi<any>(`/associations/`, {
    method: "POST",
    body: JSON.stringify({
      ...body,
      locationId,
    }),
  });
}

async function deleteAssociation(associationId: string): Promise<void> {
  const locationId = getLocationId();
  await callCrmApi(`/associations/${associationId}?locationId=${locationId}`, {
    method: "DELETE",
  });
}

function isPair(a: any, keyA: string, keyB: string): boolean {
  const f = String(a.firstObjectKey || "").toLowerCase();
  const s = String(a.secondObjectKey || "").toLowerCase();
  const ka = keyA.toLowerCase();
  const kb = keyB.toLowerCase();
  return (f === ka && s === kb) || (f === kb && s === ka);
}
