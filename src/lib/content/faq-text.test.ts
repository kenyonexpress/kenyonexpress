import { faqEntries } from '@/content/legal/faq'
import { formatFaqText, parseFaqText } from '@/lib/content/faq-text'
import { describe, expect, it } from 'vitest'

describe('parseFaqText', () => {
  it('reads a question and the lines beneath it', () => {
    expect(parseFaqText('## שאלה\nתשובה')).toEqual([{ question: 'שאלה', answer: 'תשובה' }])
  })

  it('joins a wrapped answer into one paragraph', () => {
    expect(parseFaqText('## שאלה\nחלק ראשון\nחלק שני')).toEqual([
      { question: 'שאלה', answer: 'חלק ראשון חלק שני' },
    ])
  })

  it('separates entries on the next question, blank line or not', () => {
    expect(parseFaqText('## א\n1\n\n## ב\n2')).toHaveLength(2)
    expect(parseFaqText('## א\n1\n## ב\n2')).toHaveLength(2)
  })

  it('drops a question with no answer rather than publishing a blank one', () => {
    expect(parseFaqText('## שאלה בלי תשובה\n\n## שאלה\nתשובה')).toEqual([
      { question: 'שאלה', answer: 'תשובה' },
    ])
  })

  it('discards text before the first question, which has nothing to attach to', () => {
    expect(parseFaqText('מבוא שנשכח\n\n## שאלה\nתשובה')).toEqual([
      { question: 'שאלה', answer: 'תשובה' },
    ])
  })

  it('returns nothing for an empty box', () => {
    expect(parseFaqText('')).toEqual([])
    expect(parseFaqText('   \n\n ')).toEqual([])
  })
})

describe('the round trip', () => {
  it('returns the live FAQ unchanged through format and parse', () => {
    // The one that matters: the twelve entries actually on the site survive
    // being loaded into the editor and saved without being touched.
    expect(parseFaqText(formatFaqText(faqEntries))).toEqual([...faqEntries])
  })

  it('normalises spacing without changing content', () => {
    const messy = '##   שאלה  \n\n  תשובה  \n'
    expect(formatFaqText(parseFaqText(messy))).toBe('## שאלה\nתשובה')
  })
})
