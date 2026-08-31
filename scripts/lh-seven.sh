#!/usr/bin/env bash
# Lighthouse over the seven compared pages, mobile and desktop.
#
# `pnpm dlx lighthouse` deliberately: the package is not a dependency here and
# adding it for a measurement tool would put a build-time dependency in the
# tree for something only ever run by hand. Recorded in STATE.
#
# Read the score with the caveat that is already measured and written down:
# on localhost LCP is a Lantern SIMULATION over a graph that contains the whole
# page, not an observation. A 2.7 second real improvement once showed up here
# as noise. Performance deltas are judged on a deployment; accessibility,
# best-practices and SEO are honest locally.
set -u
BASE="${1:-http://localhost:3312}"
OUT="${2:-/tmp/lh}"
mkdir -p "$OUT"
PAGES=(
  "home:/"
  "products:/products"
  "category:/category/hot-deals"
  "search:/search?q=%D7%90%D7%95%D7%96%D7%A0%D7%99%D7%95%D7%AA"
  "product:/product/%D7%9E%D7%95%D7%A6%D7%A8-%D7%9C%D7%93%D7%95%D7%92%D7%9E%D7%90"
  "cart:/cart"
  "checkout:/checkout"
)
printf '%-10s %-8s %5s %5s %5s %5s\n' page form perf a11y bp seo
for form in mobile desktop; do
  for entry in "${PAGES[@]}"; do
    name="${entry%%:*}"; path="${entry#*:}"
    json="$OUT/$name-$form.json"
    pnpm dlx lighthouse "$BASE$path" \
      --preset="$([ "$form" = desktop ] && echo desktop || echo perf)" \
      $([ "$form" = mobile ] && echo "--form-factor=mobile --screenEmulation.mobile") \
      --only-categories=performance,accessibility,best-practices,seo \
      --output=json --output-path="$json" --quiet \
      --chrome-flags="--headless=new --no-sandbox" >/dev/null 2>&1
    if [ -f "$json" ]; then
      node -e "
        const r=require('$json').categories;
        const p=(k)=>r[k]?Math.round(r[k].score*100):'-';
        console.log('$name'.padEnd(10)+' '+'$form'.padEnd(8)+
          String(p('performance')).padStart(5)+String(p('accessibility')).padStart(6)+
          String(p('best-practices')).padStart(6)+String(p('seo')).padStart(6));
      "
    else
      printf '%-10s %-8s %s\n' "$name" "$form" "FAILED"
    fi
  done
done
