import { describe, expect, it } from 'vitest';
import { parseContactCsv, parseTagCell } from './parse-contact-csv';

describe('parseTagCell', () => {
  it('splits comma-separated tags and trims whitespace', () => {
    expect(parseTagCell(' VIP , Lead ,  ')).toEqual(['VIP', 'Lead']);
  });

  it('splits semicolon-separated tags', () => {
    expect(parseTagCell('VIP; Lead; Customer')).toEqual([
      'VIP',
      'Lead',
      'Customer',
    ]);
  });

  it('de-dupes case-insensitively', () => {
    expect(parseTagCell('vip, VIP, Lead')).toEqual(['vip', 'Lead']);
  });

  it('returns empty for blank values', () => {
    expect(parseTagCell('')).toEqual([]);
    expect(parseTagCell(undefined)).toEqual([]);
  });
});

describe('parseContactCsv', () => {
  it('parses optional tags column', () => {
    const csv = `phone,name,tags
+15551234567,Alice,"VIP, Lead"
+15559876543,Bob,Customer`;

    expect(parseContactCsv(csv)).toEqual({
      hasPhoneColumn: true,
      hasTagsColumn: true,
      hasCompanyColumn: false,
      hasLocationColumn: false,
      hasRequirementColumn: false,
      hasNoteColumn: false,
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          location: undefined,
          requirement: undefined,
          note: undefined,
          tagNames: ['VIP', 'Lead'],
        },
        {
          phone: '+15559876543',
          name: 'Bob',
          email: undefined,
          company: undefined,
          location: undefined,
          requirement: undefined,
          note: undefined,
          tagNames: ['Customer'],
        },
      ],
    });
  });

  it('keeps a row with an empty phone cell instead of dropping it silently', () => {
    const csv = `phone,name
+15551234567,Alice
,Bob`;

    const { rows } = parseContactCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      phone: '',
      name: 'Bob',
      email: undefined,
      company: undefined,
      location: undefined,
      requirement: undefined,
      note: undefined,
      tagNames: [],
    });
  });

  it('returns empty tagNames when tags column is absent', () => {
    const csv = `phone,name
+15551234567,Alice`;

    expect(parseContactCsv(csv)).toEqual({
      hasPhoneColumn: true,
      hasTagsColumn: false,
      hasCompanyColumn: false,
      hasLocationColumn: false,
      hasRequirementColumn: false,
      hasNoteColumn: false,
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          location: undefined,
          requirement: undefined,
          note: undefined,
          tagNames: [],
        },
      ],
    });
  });

  it('parses location, requirement, and note columns', () => {
    const csv = `phone,name,location,requirement,note
+15551234567,Alice,New York,"Needs CRM setup","Follow up on Friday"`;

    expect(parseContactCsv(csv)).toEqual({
      hasPhoneColumn: true,
      hasTagsColumn: false,
      hasCompanyColumn: false,
      hasLocationColumn: true,
      hasRequirementColumn: true,
      hasNoteColumn: true,
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          location: 'New York',
          requirement: 'Needs CRM setup',
          note: 'Follow up on Friday',
          tagNames: [],
        },
      ],
    });
  });

  it('normalizes Meta lead numbers starting with 91 without plus', () => {
    const csv = `phone,name
919876543210,Rahul
p:919876543211,Amit
+919876543212,Priya`;

    const { rows } = parseContactCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0].phone).toBe('+919876543210');
    expect(rows[1].phone).toBe('+919876543211');
    expect(rows[2].phone).toBe('+919876543212');
  });
});
