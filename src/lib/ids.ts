import { customAlphabet } from 'nanoid';

// No look-alike characters (0/O, 1/l/I) — form ids get copy-pasted by hand
// into landing page markup, so they need to survive being read aloud or retyped.
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';

const nano = customAlphabet(ALPHABET, 12);
const nanoShort = customAlphabet(ALPHABET, 10);

/** Public identifier for a form — appears in the ingest URL. */
export const newFormId = () => nano();
/** Internal record id. */
export const newId = () => nanoShort();

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // strip combining accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'form'
  );
}
