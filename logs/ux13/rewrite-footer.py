# -*- coding: utf-8 -*-
# UX13: restructure SiteFooter.tsx in place. Every replacement asserts the old
# text occurs exactly once, so a drifted file fails loudly instead of landing
# a half edit.
import io
import re

p = 'src/components/layout/SiteFooter.tsx'
s = io.open(p, encoding='utf-8').read()


def replace_once(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)


# 1. imports
replace_once(
    "import FooterNewsletterForm from '@/components/layout/FooterNewsletterForm'\n",
    "import FooterNewsletterForm from '@/components/layout/FooterNewsletterForm'\n"
    "import PaymentLogos from '@/components/layout/PaymentLogos'\n",
)

# 2. the Telegram entry pointed at '#': a new tab that opens nothing. Live
#    lists no Telegram channel either (refs/ke_live_home.html has no t.me).
m = re.search(r"  \{\n    label: 'טלגרם',\n    href: '#',\n    path: '[^']*',\n  \},\n", s)
assert m, 'telegram entry not found'
s = s[: m.start()] + s[m.end() :]
replace_once(
    '// RTL order as listed: Telegram (rightmost) … Facebook (leftmost).',
    '// RTL order as listed: YouTube (rightmost) … Facebook (leftmost). Telegram\n'
    "// was listed here with href '#' until UX13: a new tab that opened nothing,\n"
    '// and live links no Telegram channel.',
)

# 3. split the service column: five service links, six policy links
old_service = s[s.index("const SERVICE_LINKS"): s.index("// lucide-react (this project) ships no brand icons")]
new_service = """const SERVICE_LINKS: { label: string; href: string; built?: false }[] = [
  { label: 'צור קשר', href: '/contact' },
  { label: 'אודות', href: '/about' },
  { label: 'שאלות נפוצות', href: '/faq' },
  { label: 'הבלוג', href: '/blog' },
  // The one link in the footer aimed at a business rather than a shopper. It
  // stays in the service column, where it is found, and not under the policies.
  { label: 'הצטרפו כספקים', href: '/suppliers' },
]

// UX13: the policies are their own column. Before, eleven links shared one
// "שירות לקוחות" heading, which on a phone was one 49px row hiding a list
// longer than the viewport. The four legal pages exist ([58]); the two long
// ones are the site's OWN published Hebrew text, migrated out of the
// WordPress export rather than rewritten. STEP 51 added the two policies the
// four defer to: the privacy policy hands the cookie inventory to /cookies and
// the terms hand delivery to /shipping.
const POLICY_LINKS: { label: string; href: string; built?: false }[] = [
  { label: 'תקנון', href: '/terms-and-conditions' },
  { label: 'מדיניות פרטיות', href: '/privacy-policy' },
  { label: 'ביטולים והחזרות', href: '/refund_returns' },
  { label: 'משלוחים ואספקה', href: '/shipping' },
  { label: 'מדיניות עוגיות', href: '/cookies' },
  { label: 'הצהרת נגישות', href: '/accessibility' },
]

"""
assert s.count(old_service) == 1
s = s.replace(old_service, new_service)

# 4. one column component instead of two hand-copied <details>
replace_once(
    "function SocialGlyph({ path }: { path: string }) {",
    """type FooterLink = { label: string; href: string; built?: false }

/**
 * One link column. From lg it is a heading over a list; below lg it is one of
 * live's 49px accordion rows, CLOSED, because refs/ke_live_computed.json holds
 * the widget menu collapsed on every page the gate scores (see the note in
 * globals.css). `<details>` and not a client component on purpose: the footer
 * is on every page and a disclosure widget is not worth a hydration boundary.
 * Open is forced from lg up by CSS (`.footer-disclosure`), so the desktop
 * layout never depends on the attribute.
 */
function FooterLinkColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <details className="footer-disclosure group border-b border-border lg:border-0">
      <summary className="flex h-drawer-row cursor-pointer items-center justify-between text-base font-bold text-heading lg:mb-4 lg:h-auto lg:cursor-default lg:justify-start">
        {title}
        <ChevronDown
          size={18}
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-180 lg:hidden"
        />
      </summary>
      <ul className="space-y-2.5 pb-4 lg:pb-0">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              prefetch={link.built === false ? false : undefined}
              className="text-sm text-heading/80 transition-colors hover:text-heading"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}

function SocialGlyph({ path }: { path: string }) {""",
)

start = s.index("          {/* middle column: שירות לקוחות.")
end_marker = "          </details>\n        </div>\n\n        {/* 3. Social icons row"
end = s.index(end_marker) + len("          </details>\n")
s = s[:start] + """          {/* UX13: three link columns beside the contact column, four in all.
              Below lg each is one closed accordion row (live's 49px rows, three
              of them now instead of two: the policies were eleven links under
              one heading). */}
          <FooterLinkColumn title="שירות לקוחות" links={SERVICE_LINKS} />
          <FooterLinkColumn title="מדיניות ותקנון" links={POLICY_LINKS} />
          <FooterLinkColumn title="אזור אישי" links={PERSONAL_LINKS} />
""" + s[end:]

# 5. the grid: four columns from lg
replace_once(
    "      {/* 2. Three columns — white bg, RTL (right col first) */}",
    "      {/* 2. Four columns — white bg, RTL (contact col first) */}",
)
replace_once(
    "        {/* Measured on live: three columns of 492 / 335 / 335 with no gutter of\n"
    "            their own inside the 1170 content width, and 60px of clearance under\n"
    "            the newsletter bar before the headings. */}\n"
    "        <div className=\"mx-auto grid max-w-store-footer grid-cols-1 gap-y-0 px-gutter pt-0 pb-0 lg:grid-cols-[492fr_335fr_335fr] lg:gap-x-0 lg:gap-y-8 lg:pt-footer-columns-top lg:pb-10\">",
    "        {/* Measured on live: three columns of 492 / 335 / 335 with no gutter of\n"
    "            their own inside the 1170 content width, and 60px of clearance under\n"
    "            the newsletter bar before the headings. UX13 adds a fourth column,\n"
    "            so the contact column keeps its 42% and the three link columns\n"
    "            share the rest (Electro's four-widget footer shape). */}\n"
    "        <div\n"
    "          data-footer-columns\n"
    "          className=\"mx-auto grid max-w-store-footer grid-cols-1 gap-y-0 px-gutter pt-0 pb-0 lg:grid-cols-[492fr_240fr_240fr_198fr] lg:gap-x-6 lg:gap-y-8 lg:pt-footer-columns-top lg:pb-10\"\n"
    "        >",
)

# 6. social row: a labelled nav, and the comment says what the row is
replace_once(
    "        {/* 3. Social icons row — dark circular */}\n"
    "        <div className=\"border-t border-border\">\n"
    "          <div className=\"mx-auto flex max-w-store-footer items-center justify-center gap-3 px-4 py-4 lg:py-6\">",
    "        {/* 3. Social icons row — dark circular, every link a real profile (UX13\n"
    "            dropped the '#' one). A labelled nav so a screen reader can jump\n"
    "            to it; the icons carry their own Hebrew names. */}\n"
    "        <nav aria-label=\"רשתות חברתיות\" className=\"border-t border-border\">\n"
    "          <div className=\"mx-auto flex max-w-store-footer items-center justify-center gap-3 px-4 py-4 lg:py-6\">",
)
replace_once(
    "                <SocialGlyph path={s.path} />\n"
    "              </a>\n"
    "            ))}\n"
    "          </div>\n"
    "        </div>\n",
    "                <SocialGlyph path={s.path} />\n"
    "              </a>\n"
    "            ))}\n"
    "          </div>\n"
    "        </nav>\n",
)

# 7. payment marks: on the handheld bar too, and the text badges go
replace_once(
    "          <p className=\"m-0 text-micro text-white/70\">\n"
    "            כל הזכויות שמורות © <strong className=\"font-bold\">Kenyon Express</strong>\n"
    "          </p>\n"
    "        </div>\n"
    "      </div>\n",
    "          <p className=\"m-0 text-micro text-white/70\">\n"
    "            כל הזכויות שמורות © <strong className=\"font-bold\">Kenyon Express</strong>\n"
    "          </p>\n"
    "          {/* UX13: the cards the store takes, on the phone too. Before, only\n"
    "              the desktop bar said so, and as text. */}\n"
    "          <PaymentLogos className=\"mt-2\" />\n"
    "        </div>\n"
    "      </div>\n",
)
old_badges = s[s.index('          <ul className="flex items-center gap-2.5" aria-label="אמצעי תשלום">'): s.index("          </ul>\n        </div>\n      </div>\n    </footer>") + len("          </ul>\n")]
s = s.replace(old_badges, "          <PaymentLogos />\n")
replace_once(
    "      {/* 4b. Bottom gray bar — bg bottom-bar, copyright (right) + payment (left).\n"
    "          Desktop only: 4a is live's handheld ending. */}",
    "      {/* 4b. Bottom gray bar — bg bottom-bar, copyright (right) + payment marks\n"
    "          (left). Desktop only: 4a is live's handheld ending. */}",
)

io.open(p, 'w', encoding='utf-8').write(s)
print('rewrote', p, len(s.splitlines()), 'lines')
