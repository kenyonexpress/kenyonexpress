import type { FaqEntry } from '@/content/legal/faq'

/**
 * Question/answer pairs as one editable text block, and back.
 *
 * WHY NOT A REPEATER OF PAIRED INPUTS. Because the FAQ is twelve entries long
 * and growing, and a repeater means twelve pairs of fields, add and remove
 * buttons, reordering, and a client component holding array state - all so an
 * operator can do what they would rather do by pasting. A textarea reorders by
 * cutting a block and moving it, which is the operation people actually
 * perform on a list of questions.
 *
 * THE FORMAT IS THE ONE THE BODY EDITOR ALREADY USES. `## ` starts a question,
 * because that is what `## ` means in the prose editor next to it, and the
 * lines beneath it are the answer. An operator who has written one page has
 * learned this one.
 *
 * ROUND TRIP IS EXACT for anything this can produce: `format(parse(x))`
 * normalises spacing and `parse(format(entries))` returns the entries. The one
 * input it cannot represent is an ANSWER whose own line begins with `## `,
 * which would be read as the next question. That is stated here rather than
 * defended against, because the alternative - an escape character - is a rule
 * the operator has to know for a case that does not occur in a Hebrew FAQ.
 */

/**
 * Text to entries. Anything before the first `## ` is discarded, because it is
 * an answer with no question and there is nothing sensible to attach it to.
 */
export function parseFaqText(source: string): FaqEntry[] {
  const entries: FaqEntry[] = []
  let question: string | null = null
  let answer: string[] = []

  const flush = () => {
    const text = answer.join(' ').trim()
    // Cleared even when there is no question, or a preamble typed above the
    // first `## ` would be prepended to the first answer instead of discarded.
    answer = []
    if (question === null) return
    // A question with no answer is dropped rather than published blank: the
    // CHECK in 205 would accept it, and a rich result with an empty answer is
    // worse than one entry fewer.
    if (text.length > 0) entries.push({ question, answer: text })
    question = null
  }

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (line.startsWith('## ')) {
      flush()
      question = line.slice(3).trim()
      continue
    }
    if (line.length > 0) answer.push(line)
  }
  flush()

  return entries
}

/** Entries to text, in the shape `parseFaqText` reads. */
export function formatFaqText(entries: readonly FaqEntry[]): string {
  return entries.map((entry) => `## ${entry.question}\n${entry.answer}`).join('\n\n')
}
