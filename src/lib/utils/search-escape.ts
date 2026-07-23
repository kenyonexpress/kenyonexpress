// Helpers for putting user-supplied search terms into Postgres/PostgREST
// queries without letting them act as pattern or filter syntax.

// Postgres LIKE/ILIKE treats % and _ as wildcards, and PostgREST additionally
// maps * onto %. Escaping the first two and dropping * keeps the term a literal
// substring match. Use with .ilike(column, pattern), where the pattern travels
// as a value rather than as expression syntax.
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`).replace(/\*/g, '')
}

// Ready-made "contains" pattern for .ilike(column, ...).
export function likeContains(input: string): string {
  return `%${escapeLikePattern(input)}%`
}

// PostgREST .or() takes an expression string in which , ( ) " and \ are
// structural, so a raw term could append conditions of its own. Strip those
// along with the pattern metacharacters, collapse whitespace, and cap length.
export function sanitizeOrTerm(input: string, maxLength = 80): string {
  return input
    .replace(/[,()"\\%_*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}
