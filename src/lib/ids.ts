const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Non-sensitive identifier for the patient QR code. It is random-looking and
 * carries no name, date of birth or clinical detail. Lookup happens in the app.
 */
export function makeQrToken(seed?: string) {
  let h = 2166136261;
  const source = seed ?? `${Date.now()}-${Math.random()}`;
  for (let i = 0; i < source.length; i++) h = Math.imul(h ^ source.charCodeAt(i), 16777619);
  let out = "";
  for (let i = 0; i < 8; i++) {
    h = Math.imul(h ^ (h >>> 13), 2654435761);
    out += ALPHABET[(h >>> 0) % ALPHABET.length];
  }
  return `MCQR-${out.slice(0, 4)}-${out.slice(4)}`;
}

export const QR_PREFIX = "MCQR-";
