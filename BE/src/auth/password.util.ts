import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

export function generateTemporaryPassword() {
  return randomBytes(6).toString("base64url");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, encodedHash: string | null | undefined) {
  if (!encodedHash) return false;
  const [scheme, salt, storedHash] = encodedHash.split("$");
  if (scheme !== "scrypt" || !salt || !storedHash) return false;

  const incoming = Buffer.from(scryptSync(password, salt, KEY_LENGTH).toString("hex"), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (incoming.length !== stored.length) return false;

  return timingSafeEqual(incoming, stored);
}
