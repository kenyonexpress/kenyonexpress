---
name: no-em-dash
description: Use whenever writing any text, comment, commit message, or markdown that will be shown to Ofir.
---

## Never use em dash

The em dash character (--) is forbidden in all output.

This applies to:
- Code comments
- Markdown files (README, STATE.md, SKILL.md, etc.)
- Commit messages
- Error messages written by Claude
- UI text and labels
- Any other written output

## What to use instead

| Situation | Instead of em dash | Use |
|-----------|-------------------|-----|
| Aside or clarification | "fix the bug -- it was wrong" | "fix the bug (it was wrong)" |
| Range or connection | "Phase 1 -- complete" | "Phase 1: complete" |
| Pause in sentence | "we tried -- and failed" | "we tried, and failed" |
| List item description | "STATE.md -- source of truth" | "STATE.md: source of truth" |
| Breaking thought | "the issue -- a missing cast -- broke it" | "the issue (a missing cast) broke it" |

Use commas, periods, colons, parentheses, or line breaks. Never the em dash character.
