/**
 * Server-only diagnostic helpers. Kept separate from diagnose.functions.ts
 * so the tss-serverfn-split transform doesn't strip these siblings out of
 * the handler's module (which would cause a ReferenceError at runtime).
 *
 * TEMPORARY — remove with the /diagnose route once the investigation ends.
 */

function getLocationId(): string {
  const raw = process.env.GHL_LOCATION_ID || "NzIi8VKU5LMeG43AVlHf";
  if (!raw) return "NzIi8VKU5LMeG43AVlHf";
  if (raw.startsWith("http")) {
    try {
      const u = new URL(raw);
      const seg = u.pathname.split("/").filter(Boolean).pop();
      return seg || "NzIi8VKU5LMeG43AVlHf";
    } catch {
      return raw;
    }
  }
  return raw;
}

async function callGhl<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = process.env.GHL_PRIVATE_TOKEN || process.env.GHL_TOKEN;
  if (!token) return { error: "MISSING_TOKEN" } as any;
  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://services.leadconnectorhq.com${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  if (!res.ok) return { error: "HTTP_" + res.status, statusText: res.statusText, body } as any;
  return body as T;
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/_/g, " ").trim();
}

function propVal(rec: any, field: string): string | undefined {
  const props = rec?.properties || rec || {};
  if (props[field] != null) return String(props[field]);
  const target = normKey(field);
  for (const k of Object.keys(props)) {
    if (normKey(k) === target) return String(props[k]);
  }
  return undefined;
}

export async function runDiagnose(targetStudentId: string): Promise<any> {
  const locationId = getLocationId();

  // 0. Fetch the attendance_records object schema so we can see the exact
  // primary-field key + all field keys GHL expects. Try several endpoint
  // variants since the schema path isn't documented consistently.
  const schemaAttempts: Array<{ label: string; url: string }> = [
    {
      label: "GET object root",
      url: `/objects/custom_objects.attendance_records?locationId=${locationId}`,
    },
    {
      label: "GET /fields",
      url: `/objects/custom_objects.attendance_records/fields?locationId=${locationId}`,
    },
    {
      label: "GET /schema",
      url: `/objects/custom_objects.attendance_records/schema?locationId=${locationId}`,
    },
  ];
  const attendanceSchemaResponses: any[] = [];
  let attendanceFields: any[] = [];
  let primaryField: any = null;
  for (const a of schemaAttempts) {
    const r = await callGhl<any>(a.url);
    attendanceSchemaResponses.push({ label: a.label, url: a.url, response: r });
    const flds = r?.fields || r?.schema?.fields || r?.object?.fields || [];
    if (flds.length > 0) {
      attendanceFields = flds;
      primaryField = flds.find((f: any) => f?.isPrimary || f?.primary) || null;
      break;
    }
  }
  console.log(
    `[diagnose] attendance_records fields:`,
    JSON.stringify(
      attendanceFields.map((f: any) => ({
        key: f.key || f.fieldKey || f.id,
        label: f.label,
        type: f.type,
        isPrimary: f.isPrimary || f.primary,
      })),
      null,
      2,
    ),
  );

  // 1. Classrooms
  const clsRes = await callGhl<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.classrooms/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }),
    },
  );
  const classrooms = (clsRes?.records || clsRes?.data || []).map((r: any) => ({
    id: r.id,
    name: propVal(r, "Classroom Name") || propVal(r, "name") || r.name || "",
  }));
  const classroomIds = classrooms.map((c: any) => c.id);
  const classroomNames = classrooms.map((c: any) => normKey(c.name));

  // 2. All children unfiltered
  const childRes = await callGhl<{ records?: any[]; data?: any[] }>(
    `/objects/custom_objects.children/records/search`,
    {
      method: "POST",
      body: JSON.stringify({ locationId, page: 1, pageLimit: 150 }),
    },
  );
  const allChildren = childRes?.records || childRes?.data || [];

  const matched: any[] = [];
  const unmatched: any[] = [];

  // Derive a Student ID: use the real "Student ID" field when present,
  // otherwise fall back to the roster's STU-### derivation (id slice) so a
  // record with no resolvable Student ID still matches the way the roster
  // displays it. Declared BEFORE the loop that uses it — a const referenced
  // earlier in the same scope throws a temporal-dead-zone ReferenceError.
  const deriveStudentId = (r: any): string => {
    const real = propVal(r, "Student ID");
    if (real) return real;
    return `STU-${r.id.slice(-3)}`;
  };
  for (const r of allChildren) {
    const childClassroomRaw = String(
      propVal(r, "Classroom") ?? propVal(r, "Classroom Name") ?? "",
    ).trim();
    const normChild = normKey(childClassroomRaw);
    const matches =
      childClassroomRaw !== "" &&
      (classroomNames.includes(normChild) ||
        classroomIds.some((id: string) => normKey(id) === normChild));

    const status = String(propVal(r, "Status") ?? "")
      .trim()
      .toLowerCase();
    const isEnrolled = status === "" || status === "enrolled" || status === "active";

    const summary = {
      id: r.id,
      name: propVal(r, "Child Name") || propVal(r, "name") || "(no name)",
      studentIdReal: propVal(r, "Student ID") || "(empty)",
      studentIdDerived: deriveStudentId(r),
      status: propVal(r, "Status") || "(empty)",
      classroomField: childClassroomRaw,
      matchesKnownClassroom: matches,
      isEnrolled,
    };

    if (matches && isEnrolled) matched.push(summary);
    else unmatched.push({ ...summary, rawProperties: r.properties });
  }

  // 3. Target child associations — match by real Student ID, bare record id,
  // or last-3 hex segment (the roster's STU-### derivation).
  let targetChild = allChildren.find((r: any) => deriveStudentId(r) === targetStudentId);
  // Also accept a bare id or last-3 hex segment as the lookup key.
  if (!targetChild) {
    targetChild = allChildren.find(
      (r: any) => r.id === targetStudentId || r.id.slice(-3) === targetStudentId,
    );
  }
  // Association-type IDs (custom_objects.children → Contacts), confirmed
  // against the live schema. These are passed as associationIds query params
  // to the relations endpoint, with the child record ID in the URL PATH.
  const PICKUP_ASSOC_IDS = [
    "689ea6ed256e0c96eaeabd4e", // mother
    "689ea715256e0c0d88eac436", // father
    "689ea72e5ee7e9570204a130", // guardian
    "689f2a16256e0c1e050308ae", // emergency_contact
  ].join(",");
  // Use the corrected endpoint: record id in the PATH + associationIds query.
  const relUrl = (id: string) =>
    `/associations/relations/${id}?locationId=${locationId}&associationIds=${PICKUP_ASSOC_IDS}`;

  // Sample relations for the first 3 MATCHED (roster) children using the
  // corrected endpoint, to confirm contacts resolve for real children.
  const matchedRelationsSample: any[] = [];
  for (const m of matched.slice(0, 3)) {
    const r = await callGhl<any>(relUrl(m.id));
    const list = r?.relations || r?.data || r?.records || [];
    matchedRelationsSample.push({
      childId: m.id,
      childName: m.name,
      studentId: m.studentIdReal,
      url: relUrl(m.id),
      response:
        r && !r.error
          ? { ok: true, relationsCount: list.length, raw: r }
          : { ok: false, error: r?.error, statusText: r?.statusText, body: r?.body },
    });
  }

  let targetAssociations: any = null;
  let targetRelationsRaw: any = null;
  let targetChildFetchRaw: any = null;
  // Use the corrected endpoint for the target child (record id in the path,
  // associationIds as query params). Also keep a raw-record fetch so we can
  // see the child's properties + any associations block returned by search.
  let targetAssocEndpoints: any[] = [];
  const resolvedContacts: any[] = [];
  if (targetChild) {
    targetAssociations = targetChild.associations ?? null;
    const id = targetChild.id;
    const attempts: Array<{ label: string; url: string }> = [
      {
        label: "relations/{id}?associationIds (corrected)",
        url: relUrl(id),
      },
      {
        label: "object/records/:id/associations",
        url: `/objects/custom_objects.children/records/${id}/associations?locationId=${locationId}`,
      },
    ];
    for (const a of attempts) {
      const r = await callGhl<any>(a.url);
      targetAssocEndpoints.push({ label: a.label, url: a.url, response: r });
    }
    // Keep the original field populated from the corrected attempt for parity.
    targetRelationsRaw = targetAssocEndpoints[0]?.response ?? null;
    targetChildFetchRaw = await callGhl<any>(
      `/objects/custom_objects.children/records/${id}?locationId=${locationId}`,
    );

    // Resolve the pickup contacts through the SAME extraction logic the live
    // app uses (mirrors serverGetChildPickupContacts in kiosk.server.ts) so we
    // can confirm the dropdown would show real names/phones, not just raw rows.
    const PICKUP_ASSOCIATIONS = [
      { id: "689ea6ed256e0c96eaeabd4e", relationship: "Mother" },
      { id: "689ea715256e0c0d88eac436", relationship: "Father" },
      { id: "689ea72e5ee7e9570204a130", relationship: "Guardian" },
      { id: "689f2a16256e0c1e050308ae", relationship: "Emergency Contact" },
    ];
    const assocIdToLabel = new Map(PICKUP_ASSOCIATIONS.map((a) => [a.id, a.relationship]));
    const relRows = targetRelationsRaw?.relations || [];
    for (const rel of relRows) {
      const firstIsContact = String(rel.firstObjectKey || "").toLowerCase() === "contact";
      const secondIsContact = String(rel.secondObjectKey || "").toLowerCase() === "contact";
      if (!firstIsContact && !secondIsContact) continue;
      const contactId = firstIsContact ? rel.firstRecordId : rel.secondRecordId;
      if (!contactId) continue;
      const assocTypeId = rel.associationId;
      const relationship = assocIdToLabel.get(String(assocTypeId)) || "Guardian";
      try {
        const cRes = await callGhl<any>(`/contacts/${contactId}`);
        const cRec = cRes?.contact || cRes;
        resolvedContacts.push({
          contactId,
          associationId: assocTypeId,
          relationship,
          name:
            `${cRec?.firstName || ""} ${cRec?.lastName || ""}`.trim() ||
            cRec?.name ||
            cRec?.fullName ||
            "(no name)",
          phone: cRec?.phone || cRec?.phoneNumber || null,
        });
      } catch (e: any) {
        resolvedContacts.push({
          contactId,
          associationId: assocTypeId,
          relationship,
          error: e?.message || String(e),
        });
      }
    }
  }

  return {
    totalChildren: allChildren.length,
    knownClassrooms: classrooms,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    attendanceSchema: {
      schemaAttempts: attendanceSchemaResponses,
      fields: attendanceFields.map((f: any) => ({
        key: f.key || f.fieldKey || f.id,
        label: f.label,
        type: f.type,
        isPrimary: f.isPrimary || f.primary,
      })),
      primaryField,
    },
    unmatchedChildren: unmatched,
    targetStudentId,
    targetChildFound: !!targetChild,
    targetChildId: targetChild?.id ?? null,
    targetChildAssociationsFromSearch: targetAssociations,
    targetAssocEndpoints,
    matchedRelationsSample,
    targetRelationsRaw,
    targetChildFetchRaw,
    targetResolvedContacts: resolvedContacts,
  };
}
