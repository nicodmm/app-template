import { randomBytes } from "node:crypto";

/** 32-char URL-safe random token. ~192 bits of entropy. */
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}
