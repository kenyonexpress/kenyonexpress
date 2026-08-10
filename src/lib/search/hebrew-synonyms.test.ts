import { describe, expect, it } from 'vitest'
import {
  HEBREW_PREFIXES,
  SYNONYM_GROUPS,
  buildSynonyms,
  withHebrewPrefixes,
} from './hebrew-synonyms'

/** Indexing by a variable keeps biome's literal-key rule happy on Hebrew keys. */
function at(map: Record<string, string[]>, key: string): string[] {
  return map[key] ?? []
}

describe('withHebrewPrefixes', () => {
  it('generates every attached-letter spelling of a word', () => {
    const forms = withHebrewPrefixes('מסעדה')
    expect(forms).toContain('מסעדה')
    expect(forms).toContain('המסעדה')
    expect(forms).toContain('למסעדה')
    expect(forms).toContain('במסעדה')
    expect(forms).toHaveLength(1 + HEBREW_PREFIXES.length)
  })

  it('attaches to the first word only, because that is where Hebrew attaches', () => {
    // "בבית קפה", never "בית בקפה".
    const forms = withHebrewPrefixes('בית קפה')
    expect(forms).toContain('בבית קפה')
    expect(forms).not.toContain('בית בקפה')
  })

  it('leaves a very short word alone', () => {
    // ב + ר is בר, which is a real term in this very file. Prefixing two-letter
    // words manufactures collisions rather than spellings.
    expect(withHebrewPrefixes('בר')).toEqual(['בר'])
  })

  it('returns nothing for an empty term rather than a list of bare prefixes', () => {
    expect(withHebrewPrefixes('')).toEqual([])
    expect(withHebrewPrefixes('   ')).toEqual([])
  })
})

describe('buildSynonyms', () => {
  const synonyms = buildSynonyms()

  it('is symmetric, because Meilisearch synonyms are one-way', () => {
    // The mistake this whole module exists to prevent: declaring
    // {"מסעדה": ["מסעדות"]} makes מסעדה find מסעדות and NOT the reverse.
    expect(at(synonyms, 'מסעדה')).toContain('מסעדות')
    expect(at(synonyms, 'מסעדות')).toContain('מסעדה')
    expect(at(synonyms, 'אוכל')).toContain('מסעדה')
    expect(at(synonyms, 'מסעדה')).toContain('אוכל')
  })

  it('resolves the prefixed spelling a shopper actually types', () => {
    expect(at(synonyms, 'המסעדה')).toContain('מסעדות')
    expect(at(synonyms, 'לספא')).toContain('עיסוי')
  })

  it('never lists a key as its own synonym', () => {
    for (const [key, values] of Object.entries(synonyms)) {
      expect(values, key).not.toContain(key)
    }
  })

  it('covers every group in both directions', () => {
    for (const group of SYNONYM_GROUPS) {
      for (const term of group) {
        for (const other of group) {
          if (term === other) continue
          expect(synonyms[term], `${term} -> ${other}`).toContain(other)
        }
      }
    }
  })

  it('is sorted, so a settings diff shows real changes only', () => {
    for (const values of Object.values(synonyms)) {
      expect(values).toEqual([...values].sort())
    }
  })

  it('does not narrow one term into a subset of itself', () => {
    // "restaurant = pizza" would give a shopper who asked for one thing the
    // results of another, and they cannot tell whether the catalogue lacks it.
    // Every group must be interchangeable in BOTH directions, which is exactly
    // what the symmetry test above enforces - this asserts the intent stays.
    const flattened = SYNONYM_GROUPS.flat()
    expect(flattened).not.toContain('פיצה')
    expect(flattened).not.toContain('סושי')
  })

  it('builds nothing from no groups', () => {
    expect(buildSynonyms([])).toEqual({})
  })

  it('handles a single-term group without inventing a synonym for it', () => {
    const single = buildSynonyms([['ייחודי']])
    for (const values of Object.values(single)) {
      // Its own prefixed spellings are not synonyms of each other's group
      // partners, because it has none.
      expect(values).toEqual([])
    }
  })
})
