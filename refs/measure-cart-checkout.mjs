/**
 * Electro cart + checkout — מדידה עם add-to-cart אוטומטי
 * מודד ב-380px ו-768px, שומר:
 *   refs/measure-cart-checkout.json   (computed styles מלאים)
 *   refs/electro-cart-380.png / -768.png / electro-checkout-380.png / -768.png
 *   refs/GAP-CART-CHECKOUT.md          (פערים מול ההטמעה שלך אם localhost עולה)
 *
 * הרצה (שורש הפרויקט):
 *   npm i -D playwright && npx playwright install chromium
 *   node refs/measure-cart-checkout.mjs
 *   # אופציונלי, כדי לקבל גם GAP מול שלך:
 *   node refs/measure-cart-checkout.mjs --local=http://localhost:3000
 */

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = path.resolve(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
}

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BREAKPOINTS = [380, 768];
const ELECTRO = 'https://electro.madrasthemes.com';
const localArg = (process.argv.find(a => a.startsWith('--local=')) || '').split('=')[1] || '';

// ── מאפרט אלמנים: מלא לפי הבקשה ────────────────────────────────────────────
const SPEC = {
  cart: [
    { label: 'cart-table',    sel: 'table.cart, .woocommerce-cart-form table, .shop_table' },
    { label: 'cart-row',      sel: 'tr.cart_item, .cart_item' },
    { label: 'col-thumbnail', sel: 'tr.cart_item .product-thumbnail, td.product-thumbnail' },
    { label: 'thumbnail-img', sel: 'tr.cart_item .product-thumbnail img, .cart_item img' },
    { label: 'col-name',      sel: 'tr.cart_item .product-name, td.product-name' },
    { label: 'col-price',     sel: 'tr.cart_item .product-price, td.product-price' },
    { label: 'col-qty',       sel: 'tr.cart_item .product-quantity, td.product-quantity' },
    { label: 'qty-input',     sel: 'tr.cart_item input.qty, .cart_item input.qty' },
    { label: 'col-subtotal',  sel: 'tr.cart_item .product-subtotal, td.product-subtotal' },
    { label: 'remove-btn',    sel: 'tr.cart_item a.remove, .cart_item .remove' },
    { label: 'update-btn',    sel: 'button[name="update_cart"], [name="update_cart"]' },
    { label: 'coupon-field',  sel: '#coupon_code, input[name="coupon_code"]' },
    { label: 'coupon-btn',    sel: 'button[name="apply_coupon"], [name="apply_coupon"]' },
    { label: 'cart-totals',   sel: '.cart_totals, .cart-collaterals' },
    { label: 'subtotal-row',  sel: '.cart-subtotal, tr.cart-subtotal' },
    { label: 'total-row',     sel: '.order-total, tr.order-total' },
    { label: 'total-amount',  sel: '.order-total .amount, tr.order-total .amount' },
    { label: 'checkout-btn',  sel: '.wc-proceed-to-checkout a, a.checkout-button, .checkout-button' },
  ],
  checkout: [
    { label: 'checkout-form', sel: 'form.checkout, form.woocommerce-checkout' },
    { label: 'billing-block', sel: '#customer_details, .woocommerce-billing-fields' },
    { label: 'field-row',     sel: '.form-row' },
    { label: 'field-input',   sel: '.form-row input.input-text, input.input-text' },
    { label: 'field-label',   sel: '.form-row label, form.checkout label' },
    { label: 'field-select',  sel: '.form-row select, select.country_select, select.state_select' },
    { label: 'order-review',  sel: '#order_review, .woocommerce-checkout-review-order' },
    { label: 'review-table',  sel: '.woocommerce-checkout-review-order-table, #order_review table' },
    { label: 'review-total',  sel: '.order-total .amount, tr.order-total .amount' },
    { label: 'payment-box',   sel: '#payment, .woocommerce-checkout-payment' },
    { label: 'place-order',   sel: '#place_order, button#place_order' },
    { label: 'checkout-steps',sel: '.electro-checkout-steps, .checkout-steps, [class*="checkout-step"]' },
  ],
  account: [
    { label: 'login-form',    sel: 'form.woocommerce-form-login, form.login' },
    { label: 'username',      sel: '#username, input#username' },
    { label: 'password',      sel: '#password, input#password' },
    { label: 'login-btn',     sel: 'button[name="login"], .woocommerce-form-login button' },
    { label: 'register-form', sel: 'form.register, form.woocommerce-form-register' },
    { label: 'account-nav',   sel: '.woocommerce-MyAccount-navigation, .account-nav' },
    { label: 'nav-link',      sel: '.woocommerce-MyAccount-navigation a, .account-nav a' },
    { label: 'account-content',sel: '.woocommerce-MyAccount-content, .account-content' },
    { label: 'orders-table',  sel: '.woocommerce-orders-table, table.account-orders-table' },
    { label: 'orders-th',     sel: '.woocommerce-orders-table th, table thead th' },
    { label: 'orders-btn',    sel: '.woocommerce-orders-table .button, table .button' },
  ],
  orderReceived: [
    { label: 'order-received',   sel: '.woocommerce-order, .woocommerce-thankyou-order-received, [class*="order-received"]' },
    { label: 'thankyou-msg',     sel: '.woocommerce-thankyou-order-received, p.thankyou' },
    { label: 'order-overview',   sel: '.woocommerce-order-overview, ul.order_details' },
    { label: 'overview-item',    sel: '.woocommerce-order-overview li, ul.order_details li' },
    { label: 'details-table',    sel: '.woocommerce-table--order-details, table.order_details, table.shop_table' },
    { label: 'details-th',       sel: '.woocommerce-table--order-details th, table.order_details th' },
    { label: 'details-total',    sel: '.order-total .amount, tfoot .amount' },
    { label: 'customer-details', sel: '.woocommerce-customer-details, .woocommerce-columns--addresses' },
  ],
};

/**
 * The same roles, addressed in OUR markup.
 *
 * Until this existed the local side of every run was measured with the
 * WooCommerce selectors above -- `table.cart`, `tr.cart_item`, `input.qty`,
 * `#coupon_code` -- against a rebuild that deliberately uses its own BEM
 * classes and does not use a table at all. The local column could therefore
 * only ever be zero, and `GAP-CART-CHECKOUT.md` reported "36 פערים" on a cart
 * that renders correctly. A gate that cannot pass is not a gate.
 *
 * `null` means the role is deliberately absent from this design, which is a
 * different statement from "not found" and is reported as its own row.
 */
const LOCAL_SPEC = {
  cart: [
    { label: 'cart-table',    sel: '.cart-page__items' },
    { label: 'cart-row',      sel: '.cart-line' },
    { label: 'col-thumbnail', sel: '.cart-line__thumb' },
    { label: 'thumbnail-img', sel: '.cart-line__thumb img' },
    { label: 'col-name',      sel: '.cart-line__name' },
    // Electro prints a unit price and a line subtotal in separate columns.
    // This design prints the line total only, next to the quantity stepper
    // that produced it, so there is no unit-price cell to measure.
    { label: 'col-price',     sel: null },
    { label: 'col-qty',       sel: '.cart-line__qty' },
    // A stepper, not a text input: the value is a span between two buttons.
    { label: 'qty-input',     sel: '.cart-line__qty-value' },
    { label: 'col-subtotal',  sel: '.cart-line__price' },
    { label: 'remove-btn',    sel: '.cart-line__remove' },
    // No "update cart" button by design: a quantity change is a server action
    // that applies immediately, so there is nothing to submit.
    { label: 'update-btn',    sel: null },
    { label: 'coupon-field',  sel: '.cart-coupon__input' },
    { label: 'coupon-btn',    sel: '.cart-coupon__submit' },
    { label: 'cart-totals',   sel: '.cart-sidebar' },
    { label: 'subtotal-row',  sel: '.cart-sidebar__row' },
    { label: 'total-row',     sel: '.cart-sidebar__total' },
    { label: 'total-amount',  sel: '.cart-sidebar__total' },
    { label: 'checkout-btn',  sel: '.cart-checkout-btn' },
  ],
  checkout: [
    { label: 'checkout-form', sel: '.checkout-col-main form, form.checkout-form' },
    { label: 'billing-block', sel: '.checkout-section' },
    { label: 'field-row',     sel: '.checkout-fields-row' },
    { label: 'field-input',   sel: '.checkout-field input' },
    { label: 'field-label',   sel: '.checkout-field label' },
    { label: 'field-select',  sel: '.checkout-field select' },
    { label: 'order-review',  sel: '.checkout-confirm__sections' },
    { label: 'review-table',  sel: '.checkout-item__name' },
    { label: 'review-total',  sel: '.checkout-item__total' },
    { label: 'payment-box',   sel: '.checkout-payment' },
    { label: 'place-order',   sel: '.checkout-pay-btn' },
    { label: 'checkout-steps',sel: '.checkout-nav' },
  ],
  // Not remapped: these two pages are a different information architecture
  // here (a Hebrew account area and a Cardcom return page), not a restyled
  // WooCommerce one, so a role-for-role table would be inventing equivalences.
  account: [],
  orderReceived: [],
}

// כל ה-computed props שרלוונטיים ל-UI פיקסל-פרפקט
const FULL_PROPS = [
  'display','position','width','height','min-height','max-width',
  'margin-top','margin-right','margin-bottom','margin-left',
  'padding-top','padding-right','padding-bottom','padding-left',
  'font-family','font-size','font-weight','line-height','letter-spacing','text-align','text-transform',
  'color','background-color',
  'border-top-width','border-right-width','border-bottom-width','border-left-width',
  'border-color','border-radius','box-shadow',
  'display','flex-direction','justify-content','align-items','gap','grid-template-columns',
  'direction',
];

// page.evaluate passes ONE argument, so the two-parameter form silently bound
// `specs` to the whole [SPEC, FULL_PROPS] pair and left `props` undefined. Every
// label then came back as `undefined: null`, which is why this reported nothing
// found even on a page that had loaded.
const EXTRACT = ([specs, props]) => {
  const q = (s) => document.querySelector(s);
  const out = {};
  for (const item of specs) {
    // A null selector is "this design does not have that role", which must not
    // be reported as a missing element.
    if (!item.sel) { out[item.label] = 'N/A'; continue; }
    const el = q(item.sel);
    if (!el) { out[item.label] = null; continue; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const rec = { rect_w: Math.round(r.width), rect_h: Math.round(r.height) };
    for (const p of props) rec[p] = cs.getPropertyValue(p).trim();
    out[item.label] = rec;
  }
  const row = q('tr.cart_item, .cart_item');
  if (row) out._columns = [...row.children].map(td => ({
    cls: (td.className || '').slice(0, 30),
    w: Math.round(td.getBoundingClientRect().width),
  }));
  return out;
};

async function electroAddToCart(page) {
  await page.goto(`${ELECTRO}/shop/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(9000);
  const links = await page.$$eval(
    '.products li.product a.woocommerce-loop-product__link, .products li.product > a',
    els => els.map(a => a.href).filter(Boolean).slice(0, 12)
  ).catch(() => []);
  for (const url of links) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      const hasVariations = await page.$('.variations_form, form.variations_form');
      if (hasVariations) continue;
      const btn = await page.$('button.single_add_to_cart_button:not(.disabled)');
      if (!btn) continue;
      await btn.click({ timeout: 5000 });
      await page.waitForTimeout(2500);
      await page.goto(`${ELECTRO}/cart/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      const hasItem = await page.$('tr.cart_item, .cart_item');
      if (hasItem) { console.log('  ✓ נוסף לעגלה:', url); return true; }
    } catch (e) {}
  }
  return false;
}

async function localAddToCart(page, base) {
  const candidates = ['/product/1', '/products/1', '/p/1', '/shop'];
  for (const c of candidates) {
    try {
      await page.goto(base + c, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const btn = await page.$('[data-testid="add-to-cart"], button[aria-label*="cart" i], button:has-text("הוסף לעגלה"), button:has-text("Add to cart")');
      if (btn) { await btn.click({ timeout: 4000 }).catch(()=>{}); await page.waitForTimeout(1500); return true; }
    } catch {}
  }
  return false;
}

async function measurePage(page, url, type, width, shotPrefix, spec = SPEC) {
  await page.setViewportSize({ width, height: 1200 });
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => ({ err: e.message.split('\n')[0] }));
  if (resp && resp.err) return { __error: resp.err };
  await page.waitForTimeout(9000);
  const data = await page.evaluate(EXTRACT, [spec[type], FULL_PROPS]);
  // Screenshots deliberately skipped: the brief asks for text only.
  data.__status = resp && resp.status ? resp.status() : 0;
  data.__url = url;
  return data;
}

const CMP = ['rect_w','rect_h','font-size','font-weight','line-height','color','background-color',
             'border-radius','padding-top','padding-left','padding-right','gap','grid-template-columns','direction'];
function gaps(electro, local) {
  const rows = [];
  for (const bp of BREAKPOINTS) {
    const e = electro[bp] || {}, l = local[bp] || {};
    if (e.__error || l.__error) continue;
    const labels = new Set([...Object.keys(e), ...Object.keys(l)].filter(k => !k.startsWith('__') && k !== '_columns'));
    for (const label of labels) {
      const er = e[label], lr = l[label];
      if (!er && !lr) continue;
      if (!er || !lr) { rows.push({ bp, label, prop: '(exists)', electro: er?'present':'MISSING', local: lr?'present':'MISSING' }); continue; }
      for (const k of CMP) if ((er[k]||'') !== (lr[k]||'')) rows.push({ bp, label, prop: k, electro: er[k]??'—', local: lr[k]??'—' });
    }
  }
  return rows;
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ locale: 'he-IL', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const result = {
    electro: { cart: {}, checkout: {}, account: {}, orderReceived: {} },
    local:   { cart: {}, checkout: {}, account: {}, orderReceived: {} },
  };

  console.log('→ Electro: מוסיף לעגלה…');
  const added = await electroAddToCart(page);
  if (!added) console.log('  ⚠ לא הצלחתי להוסיף אוטומטי ת— cart/checkout עלולים לצאת ריקים');

  for (const bp of BREAKPOINTS) {
    console.log(`→ Electro cart @${bp}px`);
    result.electro.cart[bp] = await measurePage(page, `${ELECTRO}/cart/`, 'cart', bp, 'electro-cart');
    console.log(`→ Electro checkout @${bp}px`);
    result.electro.checkout[bp] = await measurePage(page, `${ELECTRO}/checkout/`, 'checkout', bp, 'electro-checkout');
    console.log(`→ Electro my-account @${bp}px`);
    result.electro.account[bp] = await measurePage(page, `${ELECTRO}/my-account/`, 'account', bp, 'electro-account');
    console.log(`→ Electro order-received @${bp}px`);
    result.electro.orderReceived[bp] = await measurePage(page, `${ELECTRO}/order-received/`, 'orderReceived', bp, 'electro-order-received');
  }

  let gapReport = '';
  if (localArg) {
    console.log('→ Local: מוסיף לעגלה…');
    await localAddToCart(page, localArg);
    for (const bp of BREAKPOINTS) {
      console.log(`→ Local cart @${bp}px`);
      result.local.cart[bp] = await measurePage(page, `${localArg}/cart`, 'cart', bp, 'local-cart', LOCAL_SPEC);
      console.log(`→ Local checkout @${bp}px`);
      result.local.checkout[bp] = await measurePage(page, `${localArg}/checkout`, 'checkout', bp, 'local-checkout', LOCAL_SPEC);
      console.log(`→ Local account @${bp}px`);
      result.local.account[bp] = await measurePage(page, `${localArg}/account`, 'account', bp, 'local-account', LOCAL_SPEC);
      console.log(`→ Local order-received @${bp}px`);
      result.local.orderReceived[bp] = await measurePage(page, `${localArg}/order-received`, 'orderReceived', bp, 'local-order-received', LOCAL_SPEC);
    }
    const cartGaps = gaps(result.electro.cart, result.local.cart);
    const coGaps   = gaps(result.electro.checkout, result.local.checkout);
    const acctGaps = gaps(result.electro.account, result.local.account);
    const orGaps   = gaps(result.electro.orderReceived, result.local.orderReceived);
    const fmt = (title, rows) => {
      let md = `## ${title} — ${rows.length} פערים\n\n`;
      if (!rows.length) return md + 'אין פערים שנמדדו.\n\n';
      md += `| bp | element | property | electro (יעד) | שלך |\n|---|---|---|---|---|\n`;
      for (const r of rows) md += `| ${r.bp} | ${r.label} | ${r.prop} | ${r.electro} | ${r.local} |\n`;
      return md + '\n';
    };
    gapReport = `# GAP — cart + checkout + account + order-received (Electro.<מול שלך)\n\n`
      + fmt('CART', cartGaps) + fmt('CHECKOUT', coGaps)
      + fmt('MY-ACCOUNT', acctGaps) + fmt('ORDER-RECEIVED', orGaps);
    await writeFile(path.join(OUT, 'GAP-CART-CHECKOUT.md'), gapReport, 'utf8');
  }

  await writeFile(path.join(OUT, 'measure-cart-checkout.json'), JSON.stringify(result, null, 2), 'utf8');
  await browser.close();
  console.log('\n✅ refs/measure-cart-checkout.json + צילומי מסך נשמרו');
  if (gapReport) console.log('✅ refs/GAP-CART-CHECKOUT.md נשמר');
})();
