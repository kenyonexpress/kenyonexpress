import { describe, expect, it } from 'vitest'
import { classifyMessage, shouldAutoRespond } from './classify'

describe('Support Message Classification', () => {
  describe('classifyMessage', () => {
    it('identifies order status inquiries', () => {
      const result = classifyMessage('מה מצב ההזמנה שלי?')
      expect(result.category).toBe('order_status')
      expect(result.is_complex).toBe(false)
    })

    it('identifies refund requests', () => {
      const result = classifyMessage('אני רוצה החזר כסף לפי זכות')
      expect(result.category).toBe('refund')
    })

    it('identifies delivery issues', () => {
      const result = classifyMessage('עדיין לא קיבלתי את המשלוח שלי')
      expect(result.category).toBe('delivery')
    })

    it('identifies product quality complaints', () => {
      const result = classifyMessage('המוצר שקיבלתי פגום וקרוע')
      expect(result.category).toBe('product_quality')
    })

    it('identifies technical issues', () => {
      const result = classifyMessage('העמוד לא עלה על ה-browser שלי')
      expect(result.category).toBe('technical')
    })

    it('identifies billing questions', () => {
      const result = classifyMessage('למה חויבתי פעמיים על אותה הזמנה?')
      expect(result.category).toBe('billing')
    })

    it('classifies short vague messages as other or unknown', () => {
      const result = classifyMessage('משהו לא בסדר')
      expect(result.category).toMatch(/other|unknown/)
    })

    it('marks urgent messages as complex', () => {
      const result = classifyMessage('זה דחוף מאוד!!!! עליתי לא קיבלתי את המוצר! זה משפטי!!!')
      expect(result.complexity_score).toBeGreaterThanOrEqual(40)
    })

    it('marks angry messages as complex', () => {
      const result = classifyMessage('אני מתוסכל מאוד!!! זה בדיוק מה שהתרחש!!! זה בוז!!!')
      expect(result.complexity_score).toBeGreaterThanOrEqual(30)
    })

    it('marks legal/dispute messages as complex', () => {
      const result = classifyMessage('תפנו לעורך דין שלי, זו טענה משפטית ונקדים לבית משפט')
      expect(result.complexity_score).toBeGreaterThan(50)
    })

    it('marks chargeback disputes as complex', () => {
      const result = classifyMessage('אני מגישה chargeback claim דחוף')
      expect(result.complexity_score).toBeGreaterThan(40)
    })

    it('scores complexity based on message length', () => {
      const short = classifyMessage('סטטוס הזמנה')
      const long = classifyMessage(
        'אני רוצה לדעת מה מצב ההזמנה שלי כי התחלתי מ-3 ימים והמוצר עדיין לא הגיע לדלת הבית שלי וזה ממש מהריח מדי',
      )
      expect(long.complexity_score).toBeGreaterThan(short.complexity_score)
    })

    it('identifies refund aliases (ביטול)', () => {
      const result = classifyMessage('אני רוצה לבטל את ההזמנה שלי עכשיו')
      expect(result.category).toMatch(/refund|other|unknown/)
    })

    it('handles English keywords', () => {
      const result = classifyMessage('where is my delivery tracking number')
      expect(result.category).toMatch(/delivery|order_status/)
    })

    it('assigns max score of 100', () => {
      const result = classifyMessage('זה דחוף!!! אני כעס מאוד!!! זה טענה משפטית!!! '.repeat(20))
      expect(result.complexity_score).toBeLessThanOrEqual(100)
    })

    it('includes reason text', () => {
      const simple = classifyMessage('מה סטטוס?')
      expect(simple.reason).toContain('🟢')

      const complex = classifyMessage('זה דחוף מאוד!!!! אני כעס מאוד!!! זה משפטי!!!')
      expect(complex.reason).toMatch(/🔴|🟡/)

      const medium = classifyMessage('אני לא בטוח מה הבעיה בדיוק')
      expect(medium.reason).toMatch(/🟡|🟢/)
    })

    it('defaults to unknown for no matches', () => {
      const result = classifyMessage('xyzabc gghjjk qwerty')
      expect(result.category).toBe('unknown')
      expect(result.is_complex).toBe(false)
    })

    it('technical issues get complexity boost', () => {
      const technical = classifyMessage('error 404 bug')
      expect(technical.complexity_score).toBeGreaterThanOrEqual(20)
    })

    it('refund issues get complexity boost', () => {
      const refund = classifyMessage('refund request')
      expect(refund.complexity_score).toBeGreaterThanOrEqual(10)
    })
  })

  describe('shouldAutoRespond', () => {
    it('returns true for simple order_status', () => {
      const classification = classifyMessage('מה מצב ההזמנה?')
      expect(shouldAutoRespond(classification, 'order_status')).toBe(true)
    })

    it('returns false for complex messages', () => {
      const classification = classifyMessage('זה דחוף מאוד!!!')
      expect(shouldAutoRespond(classification, 'refund')).toBe(false)
    })

    it('returns false for unknown category', () => {
      const classification = { ...classifyMessage('xyzabc'), category: 'unknown' as const }
      expect(shouldAutoRespond(classification, 'unknown')).toBe(false)
    })

    it('returns false for technical issues', () => {
      const classification = classifyMessage('error 500')
      expect(shouldAutoRespond(classification, 'technical')).toBe(false)
    })

    it('returns false for other category', () => {
      const classification = classifyMessage('משהו')
      expect(shouldAutoRespond(classification, 'other')).toBe(false)
    })

    it('returns true for simple delivery issues', () => {
      const classification = classifyMessage('מתי יגיע משלוח?')
      expect(shouldAutoRespond(classification, 'delivery')).toBe(true)
    })

    it('returns true for simple product_quality issues', () => {
      const classification = classifyMessage('המוצר פגום, איך להחזיר?')
      expect(shouldAutoRespond(classification, classification.category)).toBe(true)
    })

    it('returns true for simple billing questions', () => {
      const classification = classifyMessage('מה המחיר?')
      expect(shouldAutoRespond(classification, 'billing')).toBe(true)
    })
  })
})
