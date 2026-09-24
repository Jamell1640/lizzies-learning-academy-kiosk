import { createFileRoute } from "@tanstack/react-router";
import { getLocationId, callCrmApi } from "@/lib/crm-api";

/**
 * Diagnostic: dump the full associations list (paginated) with all fields,
 * so we can see the exact shape (labels, object keys, ids).
 */
export const Route = createFileRoute("/api/assoc-list")({
  server: {
    handlers: {
      GET: async () => {
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

        // Compact summary for each association
        const summary = all.map((a) => ({
          id: a.id,
          key: a.key,
          type: a.associationType,
          firstObjectKey: a.firstObjectKey,
          firstObjectLabel: a.firstObjectLabel,
          secondObjectKey: a.secondObjectKey,
          secondObjectLabel: a.secondObjectLabel,
          associationLabels: a.associationLabels || a.labels || a.associationLabel || null,
          rawKeys: Object.keys(a),
        }));

        return Response.json({ count: all.length, summary, raw: all });
      },
    },
  },
});
