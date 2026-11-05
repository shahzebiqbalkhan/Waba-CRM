import { describe, expect, it } from 'vitest';
import { formatContactId } from './format-contact-id';

describe('formatContactId', () => {
  it('formats positive integers with zero padding', () => {
    expect(formatContactId(1)).toBe('0001');
    expect(formatContactId(42)).toBe('0042');
    expect(formatContactId(999)).toBe('0999');
    expect(formatContactId(1000)).toBe('1000');
    expect(formatContactId(12345)).toBe('12345');
  });

  it('supports custom prefix and minDigits', () => {
    expect(formatContactId(1, { prefix: '#' })).toBe('#0001');
    expect(formatContactId(42, { prefix: 'CON-', minDigits: 5 })).toBe('CON-00042');
  });

  it('handles null, undefined, 0, or negative numbers gracefully', () => {
    expect(formatContactId(null)).toBe('');
    expect(formatContactId(undefined)).toBe('');
    expect(formatContactId(0)).toBe('');
    expect(formatContactId(-5)).toBe('');
    expect(formatContactId(NaN)).toBe('');
  });
});
