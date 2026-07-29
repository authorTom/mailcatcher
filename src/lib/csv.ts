/**
 * RFC 4180 quoting.
 *
 * The leading apostrophe on formula-looking values is deliberate: a cell
 * starting =, +, - or @ is executed by Excel and Sheets when opened, so an
 * attacker could otherwise get a payload into your spreadsheet through a form
 * field. Neutralising it here is the standard defence against CSV injection.
 */
export function csvCell(value: unknown): string {
  if (value == null) return '';

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(',') + '\r\n';
}

/**
 * Stream rows out in batches so a large export never materialises the whole
 * file in memory.
 */
export function csvStream(headers: string[], rows: Iterable<unknown[]>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = rows[Symbol.iterator]();

  return new ReadableStream({
    start(controller) {
      // BOM so Excel opens UTF-8 accented names correctly.
      controller.enqueue(encoder.encode('﻿'));
      controller.enqueue(encoder.encode(csvRow(headers)));
    },
    pull(controller) {
      let chunk = '';
      for (let i = 0; i < 200; i++) {
        const next = iterator.next();
        if (next.done) {
          if (chunk) controller.enqueue(encoder.encode(chunk));
          controller.close();
          return;
        }
        chunk += csvRow(next.value);
      }
      controller.enqueue(encoder.encode(chunk));
    },
  });
}

export function exportFilename(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${prefix}-${stamp}.csv`;
}
