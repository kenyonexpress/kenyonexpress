import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import RichTextEditor, { applyTool } from './RichTextEditor'

describe('applyTool', () => {
  it('wraps a selection and uses the placeholder when nothing is selected', () => {
    const wrap = { kind: 'wrap', before: '**', after: '**', placeholder: 'טקסט מודגש' } as const
    expect(applyTool('מחיר מיוחד', 5, 10, wrap)).toEqual({ value: 'מחיר **מיוחד**', cursor: 14 })
    expect(applyTool('', 0, 0, wrap).value).toBe('**טקסט מודגש**')
  })

  it('prefixes the current line, and numbers each line of a multi-line selection', () => {
    const bullet = { kind: 'prefix', prefix: '- ', placeholder: 'פריט' } as const
    expect(applyTool('ראשון\nשני', 7, 7, bullet).value).toBe('ראשון\n- שני')
    const numbered = { kind: 'prefix', prefix: '1. ', placeholder: 'פריט' } as const
    expect(applyTool('א\nב\nג', 0, 5, numbered).value).toBe('1. א\n2. ב\n3. ג')
    const heading = { kind: 'prefix', prefix: '### ', placeholder: 'כותרת' } as const
    expect(applyTool('', 0, 0, heading).value).toBe('### כותרת')
  })
})

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return <RichTextEditor id="d" name="description_he" value={value} onChange={setValue} />
}

describe('RichTextEditor', () => {
  it('posts under the given name, types markers from the toolbar and previews them', () => {
    render(<Harness initial="" />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.name).toBe('description_he')

    fireEvent.click(screen.getByRole('button', { name: 'מודגש' }))
    expect(textarea.value).toBe('**טקסט מודגש**')

    fireEvent.click(screen.getByRole('button', { name: 'תצוגה מקדימה' }))
    const preview = screen.getByTestId('rich-text-preview')
    expect(preview.querySelector('strong')?.textContent).toBe('טקסט מודגש')
  })
})
