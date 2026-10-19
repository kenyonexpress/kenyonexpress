# Icon audit (F13.5)

Measured 2026-10-16. Source of every glyph: Electro v7's own font files, fetched
from electro.madrasthemes.com (`font-electro.svg`, and Font Awesome Free 6.5.1 from
the theme's `assets/vendor/fontawesome/webfonts`). Glyph outlines are extracted by
`fontTools` into `src/components/icons/electro-icons.tsx` and mirrored as flat files in
`public/icons/electro/`. Font Awesome Free icons are CC BY 4.0.

`refs/ke_live_singlefile.html` and `refs/ke_live_computed.json` do not exist in this
checkout; `refs/electro-home-v7.html` and `refs/electro-home-v7_computed.json` were used,
and the font files above were fetched live.

| component | element | SOURCE | STATUS |
|---|---|---|---|
| TopBar | location pin, truck, bag, user | electro-v7 (ec-map-pointer, ec-transport, ec-shopping-bag, ec-user) | FIXED |
| MastheadNav / Header | wishlist heart | electro-v7 (ec-favorites) | FIXED |
| HeaderCart / CartNavLink | cart | electro-v7 (ec-shopping-bag) | FIXED |
| MobileDrawer | menu, close | electro-v7 (ec-menu, ec-close-remove) | FIXED |
| InfoBar | transport, customers, support, payment, tag | electro-v7 | FIXED |
| BenefitBar | transport, customers, support, payment, tag | electro-v7 | FIXED |
| HeroPromoBanners | chevron | electro-v7 (fa-chevron-left) | FIXED |
| SiteFooter | YouTube, Instagram, WhatsApp, Facebook | electro-v7 (fa-youtube, fa-instagram, fa-whatsapp, fa-facebook) | FIXED |
| SiteFooter | Telegram, Twitter | not in Electro v7 | REMOVED |
| SiteFooter | accordion chevron, support | electro-v7 (fa-chevron-down, ec-support) | FIXED |
| Cart (line item, drawer, mini cart) | plus, minus, trash, close, bag | electro-v7 (fa-plus, fa-minus, fa-trash-can, ec-close-remove, ec-shopping-bag) | FIXED |
| AddToCartButton | spinner | electro-v7 (fa-circle-notch) | FIXED |
| ProductInfo | add to cart | electro-v7 (ec-add-to-cart) | FIXED |
| ProductInfo | "added" check mark | not in Electro v7 | REMOVED |
| SupplierInfo | map pin, phone | electro-v7 (ec-map-pointer, ec-phone) | FIXED |
| SupplierInfo | Waze navigation arrow | not in Electro v7 | REMOVED |
| CategoryProductCard, CityTag, CouponCard, coupons/[id] | map pin, tag | electro-v7 | FIXED |
| LocationPin | pin glyph (the link goes to Waze) | electro-v7 (ec-map-pointer); the Waze mark is not in Electro v7 and is not drawn | FIXED |
| ui/dialog, ui/select, ui/dropdown-menu | close, chevrons | electro-v7 | FIXED |
| ui/select, ui/dropdown-menu | check mark, radio dot | not in Electro v7 | REMOVED |
| ui/sonner | toast status icons | not in Electro v7 | REMOVED |
| ui/SmartImage | broken-image glyph | not in Electro v7 | REMOVED |
| SubscriptionList | warning triangle | not in Electro v7 | REMOVED |
| WhatsAppIcon, FacebookIcon | brand glyphs | electro-v7 (fa-whatsapp, fa-facebook) | FIXED |
| CitiesRow | city illustrations | generated placeholder (public/images/placeholder/city-<slug>.svg) | PENDING |
| Footer payment icons | Visa, Mastercard, Discover, Amex | public/images/electro/patment-icon1.png downloaded; footer not yet switched | PENDING |
| Admin and supplier portals | lucide-react | out of scope (storefront only) | KEPT |
