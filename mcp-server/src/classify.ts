import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ClassificationHint } from './types.js';
import { redactSensitive } from './redact.js';

const MAX_EXCERPT_CHARS = 200;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic']);

const SCREENSHOT_NAME_PATTERN = /^(screenshot|screen shot|cleanshot|screen recording)/i;

async function readFirstLine(filePath: string, maxBytes = 4096): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf8', start: 0, end: maxBytes });
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline !== -1) {
        stream.destroy();
        resolve(buffer.slice(0, newline));
      }
    });
    stream.on('close', () => resolve(buffer));
    stream.on('error', reject);
  });
}

function parseCsvHeaders(line: string): string[] {
  return line
    .split(',')
    .map((h) => h.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

async function classifyCsv(filePath: string): Promise<ClassificationHint> {
  const firstLine = await readFirstLine(filePath);
  const headers = parseCsvHeaders(firstLine);
  const { text, redacted } = redactSensitive(headers.join(','));
  return {
    path: filePath,
    kind: 'csv',
    csvHeaders: text.split(','),
    redacted,
  };
}

async function classifyPdf(filePath: string): Promise<ClassificationHint> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = await readFile(filePath);
    const data = await pdfParse(buffer, { max: 1 }); // first page only
    const { text, redacted } = redactSensitive(data.text.slice(0, MAX_EXCERPT_CHARS));
    return { path: filePath, kind: 'pdf-text', excerpt: text, redacted };
  } catch {
    return { path: filePath, kind: 'unknown', redacted: false };
  }
}

async function classifyImage(filePath: string): Promise<ClassificationHint> {
  const name = path.basename(filePath);
  if (SCREENSHOT_NAME_PATTERN.test(name)) {
    return { path: filePath, kind: 'screenshot', redacted: false };
  }

  try {
    const exifr = await import('exifr');
    const exif = await exifr.parse(filePath, { gps: false }); // never surface GPS coordinates
    if (!exif) {
      return { path: filePath, kind: 'image', redacted: false };
    }
    const summary = [exif.Make, exif.Model, exif.DateTimeOriginal].filter(Boolean).join(' ');
    const { text, redacted } = redactSensitive(summary.slice(0, MAX_EXCERPT_CHARS));
    return { path: filePath, kind: 'image', excerpt: text || undefined, redacted };
  } catch {
    return { path: filePath, kind: 'image', redacted: false };
  }
}

/**
 * Returns a minimal content hint — never full file contents — so the amount
 * of private data that reaches the model is bounded regardless of file size.
 */
export async function classify(filePath: string): Promise<ClassificationHint> {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.csv') {
    return classifyCsv(filePath);
  }
  if (extension === '.pdf') {
    return classifyPdf(filePath);
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return classifyImage(filePath);
  }

  return { path: filePath, kind: 'unknown', redacted: false };
}
