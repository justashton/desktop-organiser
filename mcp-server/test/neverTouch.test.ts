import { describe, expect, it } from 'vitest';
import { buildNeverTouchMatcher, isCloudPlaceholder } from '../src/neverTouch.js';

describe('buildNeverTouchMatcher', () => {
  const isNeverTouch = buildNeverTouchMatcher(['**/.secret/**']);

  it('excludes files inside a .git directory', () => {
    expect(isNeverTouch('/home/user/project/.git/HEAD')).toBe(true);
  });

  it('excludes node_modules', () => {
    expect(isNeverTouch('/home/user/project/node_modules/pkg/index.js')).toBe(true);
  });

  it('excludes hidden (dot) files', () => {
    expect(isNeverTouch('/home/user/Desktop/.env')).toBe(true);
  });

  it('excludes app bundles', () => {
    expect(isNeverTouch('/Applications/Slack.app/Contents/Info.plist')).toBe(true);
  });

  it('excludes extra patterns from the rules file', () => {
    expect(isNeverTouch('/home/user/Desktop/.secret/notes.txt')).toBe(true);
  });

  it('allows an ordinary file through', () => {
    expect(isNeverTouch('/home/user/Desktop/invoice.pdf')).toBe(false);
  });
});

describe('isCloudPlaceholder', () => {
  it('flags an iCloud placeholder extension', () => {
    expect(isCloudPlaceholder('/Users/me/Desktop/.report.pdf.icloud')).toBe(true);
  });

  it('does not flag a normal file', () => {
    expect(isCloudPlaceholder('/Users/me/Desktop/report.pdf')).toBe(false);
  });
});
