// Helpers for Stuffer's ID12 label codes.
//
// A label code looks like `1234ABC-0001`:
//   1234  - 4-digit "julian day number mod 10000" (day the label was suggested)
//   ABC   - the workspace ID12 Disambiguator (3 uppercase letters)
//   0001  - the incrementing item number (managed externally / by the user)

// Random codes deliberately skip I, O and V to avoid OCR/label-maker confusion.
export const ID12_ALPHABET = "ABCDEFGHJKLMNPQRSTUWXYZ";

const ID12_DISAMBIGUATOR_PATTERN = /^[A-Z]{3}$/;

/** Generate a random 3-letter ID12 Disambiguator (never contains I, O or V). */
export function generateID12Disambiguator(): string {
  let code = "";
  for (let i = 0; i < 3; i++) {
    code += ID12_ALPHABET[Math.floor(Math.random() * ID12_ALPHABET.length)];
  }
  return code;
}

/** A user-set disambiguator must be exactly three uppercase A-Z letters. */
export function isValidID12Disambiguator(value: string): boolean {
  return ID12_DISAMBIGUATOR_PATTERN.test(value);
}

/** Julian day number mod 10000, zero-padded to four digits. */
export function getJulianDayCode(date: Date = new Date()): string {
  const julianDayNumber = Math.floor(date.getTime() / 86400000) + 2440588;
  return String(((julianDayNumber % 10000) + 10000) % 10000).padStart(4, "0");
}

/** Suggested label start, e.g. `1234ABC-0001`, for display only. */
export function formatID12LabelStart(
  disambiguator: string,
  date: Date = new Date()
): string {
  return `${getJulianDayCode(date)}${disambiguator}-0001`;
}
