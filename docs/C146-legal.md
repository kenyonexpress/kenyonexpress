# C146 — Legal pages

Date: 2026-11-02. Branch: closeout/v1-final.

## Scope
- /terms, /privacy, /returns, /accessibility, /cookie-policy (/cookies 308 → /cookie-policy via next.config.ts) — all in `src/app/(legal)`, Hebrew, one renderer `LegalArticle` shaped after Electro /terms-and-conditions (refs/electro_terms_computed.json): breadcrumb, centred 40px/500 title + last-modified line, numbered `N.` section headings (25px/500), numbered `N.M` clauses, 14px/24px body, 40px section spacing (`src/styles/legal-page.css`).
- Terms: minimum age 18 per סעיף 2 לחוק הכשרות המשפטית והאפוטרופסות; returns: סעיף 14ג + 14ח לחוק הגנת הצרכן and תקנות ביטול עסקה.
- Legal name קניון אקספרס + מספר עוסק 033798513 printed on every legal page (LegalContactBlock, from src/lib/legal-entity.ts). Label kept as 'מספר עוסק' (sole-trader dealer number; the number passes the ID checksum).
- Change in this item: terms intro now names the operator inline: "האתר מופעל על ידי קניון אקספרס, מספר עוסק 033798513".
- Footer (SiteFooter.tsx, not a forbidden file) links all five; no forbidden files touched.

## Proof: HTTP (prod server :3139, curl -L)
```
/terms  200  final=http://localhost:3139/terms  redirects=0
/privacy  200  final=http://localhost:3139/privacy  redirects=0
/returns  200  final=http://localhost:3139/returns  redirects=0
/accessibility  200  final=http://localhost:3139/accessibility  redirects=0
/cookies  200  final=http://localhost:3139/cookie-policy  redirects=1
/cookie-policy  200  final=http://localhost:3139/cookie-policy  redirects=0
```

## Proof: page contents (numbered h2 count, reg number, legal name, Electro wrapper, footer links)
```
terms: h2=18 reg033798513=2 entity=21 legal-page=1 footer-links=href="/accessibility" href="/cookie-policy" href="/privacy" href="/returns" href="/terms" 
privacy: h2=17 reg033798513=2 entity=17 legal-page=1 footer-links=href="/accessibility" href="/cookie-policy" href="/privacy" href="/returns" href="/terms" 
returns: h2=14 reg033798513=2 entity=15 legal-page=1 footer-links=href="/accessibility" href="/cookie-policy" href="/privacy" href="/returns" href="/terms" 
accessibility: h2=11 reg033798513=2 entity=17 legal-page=1 footer-links=href="/accessibility" href="/cookie-policy" href="/privacy" href="/returns" href="/terms" 
cookie-policy: h2=11 reg033798513=2 entity=15 legal-page=1 footer-links=href="/accessibility" href="/cookie-policy" href="/privacy" href="/returns" href="/terms" 
סעיף 2 לחוק הכשרות המשפטית והאפוטרופסות, התשכ&quot;ב-1962,
סעיף 14ג לחוק הגנת הצרכן, התשמ&quot;א-1981, 
```

## Proof: new terms intro line (source, tsx)
```
האתר מופעל על ידי קניון אקספרס, מספר עוסק 033798513 (להלן: "מפעילת האתר").
```

## Proof: tests
```

 Test Files  5 passed (5)
      Tests  101 passed (101)
   Start at  18:57:12
   Duration  1.20s (transform 360ms, setup 1.08s, import 403ms, tests 177ms, environment 2.69s)

```

Note: the :3139 server is a prior prod build, so the new intro line appears in HTML after the next build/deploy; all other checks above are from live HTML.
