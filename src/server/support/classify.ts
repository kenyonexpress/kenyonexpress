export interface ClassificationResult {
  category:
    | 'order_status'
    | 'refund'
    | 'delivery'
    | 'product_quality'
    | 'technical'
    | 'billing'
    | 'other'
    | 'unknown'
  complexity_score: number // 0-100
  is_complex: boolean // true if complexity_score >= 70
  reason: string
}

/** Hebrew keyword patterns for classification */
const PATTERNS = {
  order_status: [
    /מצב.*הזמנה|הזמנה.*מצב|סטטוס.*הזמנה|מתי.*יגיע|איפה.*הזמנה|תפוצה|tracking/i,
    /order.*status|where.*order|tracking/i,
  ],
  refund: [
    /החזר.*כסף|החזרה|זיכוי|return|refund|חזור.*כסף|בחזרתי|מחזור|החזרת כסף/i,
    /refund|return money|charge back/i,
  ],
  delivery: [
    /משלוח|דיוור|שילוח|shipping|delivery|כתובת|address|לא.*הגיע|הגיע.*יום|זמן.*משלוח/i,
    /delivery|shipping|address|not arrived/i,
  ],
  product_quality: [
    /פגום|קלקול|בעיה.*מוצר|מוצר.*בעיה|איכות|quality|defect|broken|damaged|torn|worn/i,
    /defective|quality issue|broken|damaged|not working/i,
  ],
  refund_aliases: [/ביטול|ביטולים|ביטולים|שבתוך/i],
  technical: [
    /לא.*עובד|לא עלה|crash|error|bug|בעיה.*טכני|טכני.*בעיה|עמוד.*לא.*עלה|404|500/i,
    /not working|error|crash|bug|page down|technical issue/i,
  ],
  billing: [
    /חוי|תשלום|מחיר|דו"ח|חשבון|invoice|charge|bill|payment/i,
    /overcharged|wrong price|double charge|billing/i,
  ],
}

/** Complexity indicators: words/patterns that suggest human intervention needed */
const COMPLEXITY_INDICATORS = {
  urgent: [/דחוף|מיידי|בדחיפות|חירום|immediate|urgent|emergency|asap/i],
  angry: [/כעס|עצבנות|מתוסכל|מתוך אי-שביעות|צעקות|!!!|בוז|hate|angry|furious/i],
  legal: [/עורך דין|בית משפט|טענה משפטית|claim|attorney|lawsuit|legal|court|אחריות|liability/i],
  payment_dispute: [/dispute|claim|chargeback|מחלוקת|טענה|התנגדות/i],
  vague: [/לא.*בדיוק|מה|למה|אני.*לא.*יודע|תבלבל/i], // indicates unclear complaint
}

/**
 * Classify a support message based on keywords and complexity signals.
 * Uses heuristic pattern matching for simple, fast classification.
 * Identifies categories and complexity score for routing decisions.
 */
export function classifyMessage(
  messageBody: string,
  customerName?: string,
  subject?: string,
): ClassificationResult {
  const text = `${subject || ''} ${messageBody} ${customerName || ''}`.toLowerCase()
  const scores: Record<string, number> = {
    order_status: 0,
    refund: 0,
    delivery: 0,
    product_quality: 0,
    technical: 0,
    billing: 0,
    other: 0,
  }

  // Match keywords against each category
  for (const [category, patterns] of Object.entries(PATTERNS)) {
    if (category.endsWith('_aliases')) continue
    if (!(category in scores)) continue

    for (const pattern of patterns as RegExp[]) {
      if (pattern.test(text)) {
        const key = category as keyof typeof scores
        const current = scores[key]
        if (current !== undefined) {
          scores[key] = current + 30
        }
      }
    }
  }

  // Boost refund for aliases
  // biome-ignore lint/suspicious/noExplicitAny: accessing dynamic pattern property
  const refundAliases = (PATTERNS as any).refund_aliases
  if (refundAliases?.some((p: RegExp) => p.test(text))) {
    const refundScore = scores.refund
    if (refundScore !== undefined) {
      scores.refund = refundScore + 20
    }
  }

  // Find winning category
  let category: ClassificationResult['category'] = 'unknown'
  let maxScore = 0
  for (const [cat, score] of Object.entries(scores)) {
    const categoryScore = score as number
    if (categoryScore > maxScore) {
      maxScore = categoryScore
      category = cat as ClassificationResult['category']
    }
  }

  // If no clear match, default to 'other' if message has useful content
  if (maxScore === 0) {
    category = 'other'
  }

  // Calculate complexity score
  let complexityScore = 0

  // Base score from message length: longer = more complex
  const wordCount = text.split(/\s+/).filter(Boolean).length
  if (wordCount > 100) complexityScore += 20
  else if (wordCount > 50) complexityScore += 10

  // Urgency indicators
  for (const pattern of COMPLEXITY_INDICATORS.urgent) {
    if (pattern.test(text)) complexityScore += 25
  }

  // Anger/emotion indicators
  for (const pattern of COMPLEXITY_INDICATORS.angry) {
    if (pattern.test(text)) complexityScore += 20
  }

  // Legal/dispute complexity
  for (const pattern of COMPLEXITY_INDICATORS.legal) {
    if (pattern.test(text)) complexityScore += 30
  }

  for (const pattern of COMPLEXITY_INDICATORS.payment_dispute) {
    if (pattern.test(text)) complexityScore += 25
  }

  // Vague requests (harder to auto-respond to)
  for (const pattern of COMPLEXITY_INDICATORS.vague) {
    if (pattern.test(text)) complexityScore += 15
  }

  // Category-specific complexity
  // Technical issues are inherently complex
  if (category === 'technical') {
    complexityScore += 20
  }

  // Refunds are more complex than status checks
  if (category === 'refund') {
    complexityScore += 10
  }

  const _isBetween = (val: number, min: number, max: number) => val >= min && val <= max

  let reason = ''
  if (complexityScore > 70) {
    reason = '🔴 סימני מורכבות: זקוק לתשובה עמוקה'
    if (COMPLEXITY_INDICATORS.urgent.some((p) => p.test(text))) reason += ' (דחוף)'
    if (COMPLEXITY_INDICATORS.angry.some((p) => p.test(text))) reason += ' (כעס)'
    if (COMPLEXITY_INDICATORS.legal.some((p) => p.test(text))) reason += ' (משפטי)'
  } else if (complexityScore > 40) {
    reason = '🟡 בינוני: אפשר להתחיל עם auto-response'
  } else {
    reason = '🟢 פשוט: מועמד ל-auto-response'
  }

  return {
    category: maxScore > 0 ? category : 'unknown',
    complexity_score: Math.min(100, complexityScore),
    is_complex: complexityScore >= 70,
    reason,
  }
}

/**
 * Check if a message should get an auto-response.
 * Returns false if it's too complex or already handled.
 */
export function shouldAutoRespond(
  classification: ClassificationResult,
  _category: string,
): boolean {
  // Don't auto-respond to complex messages
  if (classification.is_complex) return false

  // Don't auto-respond to 'unknown' or 'technical' categories
  if (classification.category === 'unknown' || classification.category === 'technical') {
    return false
  }

  // 'other' is too vague for auto-response
  if (classification.category === 'other') return false

  return true
}
