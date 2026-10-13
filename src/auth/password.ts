import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_BYTES, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: 64 * 1024 * 1024,
    }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

export function validatePassword(password: string): boolean {
  return password.length >= 12 && password.length <= 128;
}

export async function hashPassword(password: string): Promise<string> {
  if (!validatePassword(password)) {
    throw new Error("Password must be between 12 and 128 characters.");
  }

  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scrypt(password, salt);
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [algorithm, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  if (algorithm !== "scrypt" || nRaw !== String(SCRYPT_N) ||
      rRaw !== String(SCRYPT_R) || pRaw !== String(SCRYPT_P) ||
      !saltHex || !/^[a-f0-9]{32}$/i.test(saltHex) ||
      !hashHex || !/^[a-f0-9]{128}$/i.test(hashHex)) {
    return false;
  }

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
