import { faqEntries } from '@/content/legal/faq'
import { describe, expect, it } from 'vitest'
import {
  HELP_TOPICS,
  groupFaqByTopic,
  helpTopicAnchor,
  helpTopicLabel,
  isHelpTopicId,
} from './topics'

describe('help topics', () => {
  it('every FAQ entry sits on a known shelf', () => {
    for (const entry of faqEntries) {
      expect(isHelpTopicId(entry.topic), entry.question).toBe(true)
    }
  })

  it('groups the whole FAQ, in shelf order, keeping each shelf in FAQ order', () => {
    const shelves = groupFaqByTopic(faqEntries)
    const grouped = shelves.flatMap((s) => s.entries)
    expect(grouped).toHaveLength(faqEntries.length)
    expect(new Set(grouped.map((e) => e.question)).size).toBe(faqEntries.length)

    const order = HELP_TOPICS.map((t) => t.id)
    const seen = shelves.map((s) => order.indexOf(s.topic.id))
    expect(seen).toEqual([...seen].sort((a, b) => a - b))

    for (const shelf of shelves) {
      const inFaq = faqEntries.filter((e) => e.topic === shelf.topic.id)
      expect(shelf.entries).toEqual(inFaq)
      expect(shelf.entries.length).toBeGreaterThan(0)
    }
  })

  it('drops an empty shelf rather than rendering a heading over nothing', () => {
    const onlyCoupons = faqEntries.filter((e) => e.topic === 'coupons')
    const shelves = groupFaqByTopic(onlyCoupons)
    expect(shelves.map((s) => s.topic.id)).toEqual(['coupons'])
  })

  it('has a Hebrew label and a stable anchor for every topic, and rejects anything else', () => {
    for (const topic of HELP_TOPICS) {
      expect(helpTopicLabel(topic.id)).toMatch(/[א-ת]/)
      expect(helpTopicAnchor(topic.id)).toBe(`topic-${topic.id}`)
    }
    expect(isHelpTopicId('billing')).toBe(false)
    expect(isHelpTopicId(null)).toBe(false)
    expect(isHelpTopicId(undefined)).toBe(false)
  })
})
