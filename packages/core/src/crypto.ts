import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function key(base64Key: string) {
  const k = Buffer.from(base64Key, "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return k;
}

/** AES-256-GCM. Output: "v1:" + base64(iv[12] | tag[16] | ciphertext). */
export function encryptSecret(plaintext: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

export function decryptSecret(payload: string, base64Key: string): string {
  const [version, body] = payload.split(":");
  if (version !== VERSION || !body) throw new Error("Unsupported encrypted payload");
  const raw = Buffer.from(body, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(base64Key), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
