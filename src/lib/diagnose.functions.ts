import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runDiagnose } from "./diagnose.server";

/**
 * TEMPORARY diagnostic server function — thin wrapper only (no sibling
 * runtime helpers, per the tss-serverfn-split rule). Remove with the
 * /diagnose route once the investigation ends.
 */
export const diagnoseChildren = createServerFn({ method: "GET" })
  .validator((data: { studentId?: string } | undefined) => {
    return z
      .object({ studentId: z.string().optional() })
      .optional()
      .parse(data ?? {});
  })
  .handler(async ({ data }) => {
    return runDiagnose(data?.studentId || "STU-421");
  });
