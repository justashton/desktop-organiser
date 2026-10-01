/**
 * Patterns for information that must never reach the model, even as a
 * "minimal hint". A match flags the file for a manual decision instead of
 * being classified automatically (per the Safety/Privacy requirements).
 */
const SENSITIVE_PATTERNS: { label: string; pattern: RegExp }[] = [
  // Payment card numbers (13-19 digits, optionally grouped).
  { label: 'card number', pattern: /\b(?:\d[ -]?){13,19}\b/ },
  // NZ IRD number: 8-9 digits, often dash-grouped as NNN-NNN-NNN.
  { label: 'IRD/tax number', pattern: /\b\d{2,3}-\d{3}-\d{3}\b/ },
  // US SSN.
  { label: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  // Passport-like alphanumeric codes (conservative: labelled context required).
  { label: 'passport number', pattern: /\bpassport\s*(?:no\.?|number)?\s*[:#]?\s*[A-Z0-9]{6,9}\b/i },
];

export interface RedactionResult {
  text: string;
  redacted: boolean;
}

export function redactSensitive(text: string): RedactionResult {
  let redacted = false;
  let out = text;
  for (const { pattern } of SENSITIVE_PATTERNS) {
    if (pattern.test(out)) {
      redacted = true;
      out = out.replace(new RegExp(pattern, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), '[redacted]');
    }
  }
  return { text: out, redacted };
}

export function containsSensitiveData(text: string): boolean {
  return SENSITIVE_PATTERNS.some(({ pattern }) => pattern.test(text));
}
