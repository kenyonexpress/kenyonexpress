---
name: rtl-hebrew-ui
description: Use whenever creating or editing UI components, pages, or layouts in src/app/ or src/components/.
---

## Direction

- Root `<html>` element must carry `dir="rtl"` and `lang="he"`.
- Every page and component is RTL by default. Never add `dir="ltr"` unless the specific content is a code block, URL, or Latin-only string.

## Language

- All visible UI strings: Hebrew.
- Code, variable names, comments, console logs: English.
- No English visible to end users unless it is a proper noun or technical term with no Hebrew equivalent.

## Tailwind logical properties

Use logical properties that flip automatically in RTL. Never use physical left/right:

| Physical (forbidden) | Logical (required) |
|----------------------|--------------------|
| `pl-4` / `pr-4`      | `ps-4` / `pe-4`    |
| `ml-2` / `mr-2`      | `ms-2` / `me-2`    |
| `left-0` / `right-0` | `start-0` / `end-0`|
| `text-left`          | `text-start`       |
| `text-right`         | `text-end`         |
| `border-l`           | `border-s`         |
| `rounded-l`          | `rounded-s`        |

## Directional icons

Icons that imply direction (arrows, chevrons, back/forward) must mirror in RTL:

```tsx
// Chevron pointing "forward"
<ChevronRight className="rtl:scale-x-[-1]" />

// Or use rotate
<ArrowLeft className="rtl:rotate-180" />
```

Use `rtl:` Tailwind variant, not JavaScript conditionals.

## Component defaults

- `flex` containers: use `flex-row` with logical children (start/end), not `justify-start`/`justify-end`.
- `gap-*` is direction-neutral, safe to use as-is.
- Inputs: `text-start` not `text-left`.
- Modals/drawers that slide in: enter from `end` side, not `right`.
- Number formatting: Hebrew locale `he-IL` for prices (e.g. `toLocaleString('he-IL')`).

## Currency

Display ILS amounts as: `₪1,234.50` (shekel sign on the left even in Hebrew, standard convention).
