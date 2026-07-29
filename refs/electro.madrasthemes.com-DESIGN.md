# Design System Inspired by Electro

## 1. Visual Theme & Atmosphere

This design system embodies a clean, modern, and approachable aesthetic centered on trust and clarity. The palette combines soft, cool tones with neutral foundations, creating a calming yet professional environment. The visual language emphasizes simplicity through geometric shapes, minimal ornamentation, and generous whitespace. The system is particularly suited for technology and e-commerce contexts where user confidence and ease of navigation are paramount. Decorative elements—such as subtle geometric shapes and cloud motifs—add personality without compromising functionality.

**Key Characteristics**
- Cool, serene color palette dominated by soft sky blues and pure neutrals
- Minimalist approach with geometric ornamentation
- High contrast between text and backgrounds for readability
- Soft, friendly visual tone balancing professionalism with approachability
- Cloud-based and geometric decorative patterns for visual interest
- Strong emphasis on whitespace and breathing room

## 2. Color Palette & Roles

### Primary
- **Sky Blue** (`#B0E0E9`): Primary accent for highlights, interactive states, and branded elements; used sparingly to draw focus and convey trust

### Neutral Scale
- **Black** (`#000000`): Primary text, headings, borders, and dominant UI element; provides maximum contrast and readability
- **White** (`#FFFFFF`): Default background, card surfaces, and primary container fill
- **Light Gray** (`#F5F5F5`): Secondary background, subtle section dividers, and disabled states
- **Medium Gray** (`#CCCCCC`): Tertiary text, helper text, and border strokes

### Surface & Borders
- **Cloud White** (`#FFFFFF`): Primary surface for cards, containers, and main content areas
- **Subtle Border** (`#E0E0E0`): Borders, dividers, and container outlines

### Interactive
- **Sky Blue Hover** (`#95D5E0`): Hover state for primary interactions, slightly darker than base
- **Sky Blue Active** (`#7AC5D0`): Active/pressed state for interactive elements

## 3. Typography Rules

### Font Family
**Primary:** Roboto (Fallback: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)
**Secondary:** Open Sans (Fallback: system-ui, sans-serif)

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display / H1 | Roboto | 36px | 700 | 46px | 0px | Primary page headings, hero titles |
| Heading / H2 | Roboto | 28px | 700 | 36px | 0px | Section headings, major content divisions |
| Heading / H3 | Roboto | 24px | 700 | 32px | 0px | Subsection headings, card titles |
| Heading / H4 | Open Sans | 20px | 700 | 28px | 0px | Minor headings, form labels |
| Body / Regular | Open Sans | 20px | 400 | 28px | 0px | Primary body text, paragraph content |
| Body / Small | Open Sans | 16px | 400 | 24px | 0px | Secondary text, descriptions |
| Button / Label | Open Sans | 16px | 700 | 24px | 0.5px | Call-to-action buttons, interactive labels |
| Caption / Meta | Open Sans | 14px | 400 | 20px | 0px | Timestamps, metadata, helper text |
| Code / Monospace | "Courier New" | 14px | 400 | 20px | 0px | Code blocks, technical content |

### Principles
- Use Roboto for all heading levels to establish clear hierarchy and brand presence
- Reserve Open Sans for body, buttons, and supporting text for optimal readability at smaller sizes
- Maintain a 1.4× line-height ratio across all text for comfortable reading flow
- Bold weights (700) reserved exclusively for headings and CTAs to signal importance
- Body text defaults to 20px to ensure comfortable reading on all screen sizes
- Use letter-spacing sparingly; default to 0px except for special display cases

## 4. Component Stylings

### Buttons

**Primary Button**
- Background: `#B0E0E9`
- Text Color: `#000000`
- Padding: `12px 24px`
- Border Radius: `4px`
- Border: `0px`
- Font: Open Sans, 16px, weight 700
- Hover Background: `#95D5E0`
- Active Background: `#7AC5D0`
- Transition: `background-color 200ms ease-in-out`

**Secondary Button**
- Background: `#F5F5F5`
- Text Color: `#000000`
- Padding: `12px 24px`
- Border Radius: `4px`
- Border: `1px solid #CCCCCC`
- Font: Open Sans, 16px, weight 700
- Hover Background: `#E8E8E8`
- Active Background: `#DCDCDC`
- Transition: `background-color 200ms ease-in-out`

**Ghost Button**
- Background: `transparent`
- Text Color: `#000000`
- Padding: `12px 24px`
- Border Radius: `4px`
- Border: `1px solid #000000`
- Font: Open Sans, 16px, weight 700
- Hover Background: `#F5F5F5`
- Active Background: `#ECECEC`
- Transition: `all 200ms ease-in-out`

### Cards & Containers

**Standard Card**
- Background: `#FFFFFF`
- Border: `1px solid #E0E0E0`
- Border Radius: `8px`
- Padding: `20px`
- Box Shadow: `0px 2px 8px rgba(0, 0, 0, 0.08)`
- Transition: `box-shadow 300ms ease-in-out`

**Card Hover State**
- Box Shadow: `0px 4px 16px rgba(0, 0, 0, 0.12)`

**Elevated Container**
- Background: `#FFFFFF`
- Border: `0px`
- Border Radius: `12px`
- Padding: `60px`
- Box Shadow: `0px 4px 16px rgba(0, 0, 0, 0.12)`

### Inputs & Forms

**Text Input (Default)**
- Background: `#FFFFFF`
- Border: `1px solid #CCCCCC`
- Border Radius: `4px`
- Padding: `12px 16px`
- Font: Open Sans, 16px, weight 400