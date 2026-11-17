/**
 * Ids for `data-ground`: elements Aura-kun can stand on. An id must be unique within a page (the first match
 * wins), so cards and panels derive theirs from their title or serial code, and lists add the item's own id.
 */
export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const groundId = (prefix: string, key: string): string => `${prefix}-${slug(key)}`;
