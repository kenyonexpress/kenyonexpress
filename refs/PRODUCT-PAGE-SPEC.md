# Product Page Spec (Electro home-v7, measured @1440px)

Source of truth: `refs/measure-live.md`, a Playwright run against
<https://kenyonexpress.co.il/product/מוצר-לדוגמא> at viewport 1440x900,
captured 2026-07-23T00:51:57Z via `getComputedStyle` + `getBoundingClientRect`.
Every value below is a measured number from that run, not a design intent.

Fractional values are what the browser reported. `25.004px` is a `1.5625rem`
computed against a 16px root, `23.996px` is `1.5em` on 16px. Round only when
implementing, never when recording.

## Typography

TITLE: Inter/Heebo, 25px, weight 500, line-height 32px, color #333E48
PRICE current: #DC3545, 35px, weight 400
PRICE strike: not specified

> The `PRICE strike` line arrived truncated and was never completed. It is left
> blank on purpose rather than guessed. The repo currently ships
> `--color-price-strike: #9ca3af` (`src/app/globals.css:24`) as the crossed-out
> price ink, which is the candidate to confirm or overwrite, not a measurement.
>
> Note also that `PRICE current: #DC3545` does not appear anywhere in the
> measured run or in `refs/electro.madrasthemes.com-DESIGN.md`. The live
> `priceBlock` measured `rgb(51, 62, 72)`, the same ink as the title. Treat
> #DC3545 as a deliberate deviation from live, or correct it.

## Measured elements

All numbers are the **live** column. The **local** column of `measure-live.md`
records where the current build diverges; those gaps are tracked there, not here.

### breadcrumb
| property | value |
|---|---|
| width | 1170px |
| height | 84.38px |
| color | rgb(51, 62, 72) |
| font-family | "Open Sans" |
| font-size | 14px |
| font-weight | 400 |
| line-height | 23.996px |
| padding-top | 25.004px |
| padding-bottom | 22.4px |
| background-color | transparent |

### productTitle
| property | value |
|---|---|
| width | 670px |
| height | 32px |
| color | rgb(51, 62, 72) = #333E48 |
| font-family | "Open Sans" |
| font-size | 25.004px |
| font-weight | 500 |
| line-height | 32.0051px |
| margin-bottom | 12.0019px |
| padding | 0 |
| background-color | transparent |

### priceBlock
| property | value |
|---|---|
| width | 670px |
| height | 45.02px |
| color | rgb(51, 62, 72) |
| font-family | "Open Sans" |
| font-size | 35px |
| font-weight | 400 |
| line-height | 45.01px |
| margin-bottom | 24.99px |
| padding | 0 |
| background-color | transparent |

### gallery
| property | value |
|---|---|
| width | 470px |
| height | 477.83px |
| font-size | 14px |
| font-weight | 400 |
| line-height | 23.996px |
| padding | 0 |
| margin | 0 |
| background-color | transparent |

### buyBox
| property | value |
|---|---|
| width | 192.17px |
| height | 52.98px |
| background-color | rgb(254, 215, 0) |
| color | rgb(255, 255, 255) |
| font-family | "Open Sans" |
| font-size | 14px |
| font-weight | 700 |
| line-height | 23.996px |
| padding | 14.504px 48.076px |
| border-radius | 25.2px |
| border | 0px solid transparent |

White text on `rgb(254, 215, 0)` is a contrast ratio of about 1.7:1, far under
WCAG AA. This is what live does. Flagging it, not silently fixing it.

### supplierInfo
| property | value |
|---|---|
| width | 0px |
| height | 0px |
| color | rgb(0, 0, 0) |
| font-family | "Open Sans", sans-serif |
| font-size | 14px |
| font-weight | 400 |
| line-height | 23.996px |
| padding-right | 25px |
| padding-left | 25px |
| margin-bottom | 16px |

Measured 0x0: the element exists in the DOM but is collapsed on the live sample
product. Its box values are unreliable as a target. Re-measure on a product that
actually renders supplier info before building against this.

### relatedHeading
| property | value |
|---|---|
| width | 1170px |
| height | 51px |
| color | rgb(51, 62, 72) |
| font-family | "Open Sans" |
| font-size | 25.004px |
| font-weight | 500 |
| line-height | 40.0064px |
| padding-bottom | 10.0016px |
| margin-bottom | 34.0054px |

## Derived layout

- Content container: **1170px** (breadcrumb and relatedHeading both measure it).
- Split: gallery **470px** + content column **670px** = 1140px, leaving **30px**
  of gutter inside the 1170px container.
- Body rhythm: 14px / 23.996px is the page default; 25.004px / 500 is the
  heading scale, shared by productTitle and relatedHeading.

## Open items

1. `PRICE strike` has no value. Blocked on the truncated input.
2. `PRICE current: #DC3545` conflicts with the measured `rgb(51, 62, 72)`.
   Needs a call on which one is correct.
3. `supplierInfo` needs re-measurement on a product where it renders.
4. Font family: live serves `"Open Sans"`, the header of this spec calls for
   `Inter/Heebo`, and the local build reports
   `Heebo, "Heebo Fallback", Arial, sans-serif`. Three different answers. The
   local build is presumably the intended one for Hebrew, but this spec should
   say so explicitly instead of leaving the contradiction standing.
