/**
 * Low-level CRM (GoHighLevel Custom Objects API v2) client + shared helpers.
 * Server-only. Imported by kiosk.server.ts so the business-logic file stays
 * lean and editable.
 */
export class KioskApiError extends Error {
  constructor(
    message: string,
    public code: "MISSING_TOKEN" | "API_FAILURE" | "NOT_FOUND" | "NO_MATCH" = "API_FAILURE",
  ) {
    super(message);
    this.name = "KioskApiError";
  }
}

/**
 * Resolve the location ID to its bare ID form. Accepts either a bare ID
 * (e.g. "NzIi8VKU5LMeG43AVlHf") or a full URL containing that ID, and always
 * returns just the ID segment.
 */
export function getLocationId(): string {
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

/**
 * CRM API client. Throws KioskApiError on failure so callers can surface a
 * clear error in the UI instead of silently degrading to mock data.
 */
export async function callCrmApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = process.env.GHL_PRIVATE_TOKEN || process.env.GHL_TOKEN;

  if (!token) {
    console.error("[CRM API error] Missing Private Integration Token in process.env");
    throw new KioskApiError(
      "CRM is not configured. Missing Private Integration Token.",
      "MISSING_TOKEN",
    );
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://services.leadconnectorhq.com${endpoint}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-07-28",
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    console.error("[CRM API error] Network failure", err);
    throw new KioskApiError(
      "Could not reach CRM. Check your network connection and try again.",
      "API_FAILURE",
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn(`[CRM API] ${options.method || "GET"} ${url} returned ${res.status}: ${errText}`);
    throw new KioskApiError(
      `CRM request failed (${res.status}). ${errText || "Please retry."}`,
      res.status === 404 ? "NOT_FOUND" : "API_FAILURE",
    );
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    console.error("[CRM API error] Invalid JSON response", err);
    throw new KioskApiError("CRM returned an invalid response. Please retry.", "API_FAILURE");
  }
}

/**
 * Normalize a field key/label to lowercase with underscores collapsed to
 * spaces so label-derived names ("Teacher Name") compare equal to the
 * snake_case keys the CRM actually returns ("teacher_name").
 */
export function normKey(s: string): string {
  return s.toLowerCase().replace(/_/g, " ").trim();
}

/**
 * Pull a string-ish property value from a record regardless of casing/shape.
 */
export function propVal(rec: any, field: string): string | undefined {
  const props = rec?.properties || rec || {};
  if (props[field] != null) return String(props[field]);
  const target = normKey(field);
  for (const k of Object.keys(props)) {
    if (normKey(k) === target) return String(props[k]);
  }
  return undefined;
}

/**
 * Pull a RAW (unstringified) property value from a record. Use this for
 * Time-type fields whose stored format depends on the original JSON type:
 * attendance_records stores checkin_time/checkout_time as NUMBERS
 * (integer minutes-since-midnight, e.g. 899 = 14:59), while classrooms
 * stores timein/timeout as "HHMM" STRINGS (e.g. "1337"). Stringifying via
 * propVal erases that distinction, so formatters can't disambiguate.
 */
export function propRaw(rec: any, field: string): any {
  const props = rec?.properties || rec || {};
  if (props[field] != null) return props[field];
  const target = normKey(field);
  for (const k of Object.keys(props)) {
    if (normKey(k) === target) return props[k];
  }
  return undefined;
}
