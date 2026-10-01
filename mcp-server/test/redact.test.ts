import { describe, expect, it } from 'vitest';
import { redactSensitive } from '../src/redact.js';

describe('redactSensitive', () => {
  it('redacts a payment card number', () => {
    const { text, redacted } = redactSensitive('Card on file: 4111 1111 1111 1111');
    expect(redacted).toBe(true);
    expect(text).not.toContain('4111');
    expect(text).toContain('[redacted]');
  });

  it('redacts an IRD-style tax number', () => {
    const { text, redacted } = redactSensitive('IRD: 123-456-789');
    expect(redacted).toBe(true);
    expect(text).not.toContain('123-456-789');
  });

  it('redacts a US SSN', () => {
    const { text, redacted } = redactSensitive('SSN 123-45-6789 on file');
    expect(redacted).toBe(true);
    expect(text).not.toContain('123-45-6789');
  });

  it('leaves ordinary text untouched', () => {
    const { text, redacted } = redactSensitive('Date,Amount,Payee');
    expect(redacted).toBe(false);
    expect(text).toBe('Date,Amount,Payee');
  });
});
