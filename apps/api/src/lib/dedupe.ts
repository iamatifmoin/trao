import { createHash } from "node:crypto";

/** Same user + same JD + same company URL → same kit, so resubmitting doesn't spawn a second generation (Section 10). */
export function computeDedupeKey(userId: string, jd: string, companyUrl: string): string {
  return createHash("sha256").update(`${userId}|${jd.trim()}|${companyUrl.trim().toLowerCase()}`).digest("hex");
}
