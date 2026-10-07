/**
 * Structured-data validation, against what Google's rich-result parsers
 * actually require rather than against the whole schema.org vocabulary.
 *
 * WHY THIS IS A `.mjs` WITH JSDOC. The same rules have two readers: the
 * vitest suite over every builder in `json-ld.ts`, and `scripts/seo-audit.mjs`,
 * which fetches served pages from a running build and checks what a crawler
 * would see. A `.ts` module cannot be imported by a plain node script, and two
 * copies of a rule set are the thing this file exists to prevent. Same pattern
 * as `lib/images/optimize.mjs`; `allowJs` is on in tsconfig.
 *
 * WHAT A FAILURE MEANS. An `error` is a node Google would drop from rich
 * results or flag in Search Console: a Product with no offer, an Offer with a
 * price but no currency, a breadcrumb whose positions skip a number. A
 * `warning` is a node that is valid but weaker than it could be: a Product
 * with no image, an Article with no author. The audit script fails the run on
 * errors only; warnings are listed so a reader can decide.
 *
 * NO NETWORK, NO SCHEMA DOWNLOAD. The checks are the ones from Google's
 * structured-data documentation for each type this site emits, written out.
 * The Rich Results Test remains the final word; this is the gate that stops a
 * broken node reaching it.
 *
 * @typedef {{ level: 'error' | 'warning', path: string, message: string }} JsonLdIssue
 */

const SCHEMA = 'https://schema.org'

const AVAILABILITY = new Set([
  `${SCHEMA}/InStock`,
  `${SCHEMA}/OutOfStock`,
  `${SCHEMA}/PreOrder`,
  `${SCHEMA}/BackOrder`,
  `${SCHEMA}/Discontinued`,
  `${SCHEMA}/InStoreOnly`,
  `${SCHEMA}/OnlineOnly`,
  `${SCHEMA}/LimitedAvailability`,
  `${SCHEMA}/SoldOut`,
])

/** ISO 4217, upper case, three letters. */
const CURRENCY = /^[A-Z]{3}$/

/** `YYYY-MM-DD` or a full ISO 8601 timestamp. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/

/** A number, or a string holding one, as schema.org allows for `price`. */
function isNumberLike(value) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(Number(value))
  return false
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function isAbsoluteHttpUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value) {
  return Array.isArray(value) ? value : [value]
}

/**
 * @param {JsonLdIssue[]} issues
 * @param {'error' | 'warning'} level
 * @param {string} path
 * @param {string} message
 */
function add(issues, level, path, message) {
  issues.push({ level, path, message })
}

/**
 * Checks that hold for every node regardless of type: no empty strings, no
 * `undefined`/`null` leaves, no NaN, and every URL-shaped field absolute. A
 * builder that leaves `description: undefined` in a node serialises fine and
 * reads as a missing field, so the check is on the object, not the JSON.
 */
function checkGeneric(node, path, issues) {
  for (const [key, value] of Object.entries(node)) {
    const at = `${path}.${key}`
    if (value === undefined || value === null) {
      add(issues, 'error', at, 'is null or undefined; omit the key instead')
      continue
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      add(issues, 'error', at, 'is not a finite number')
      continue
    }
    if (typeof value === 'string' && value.trim() === '') {
      add(issues, 'error', at, 'is an empty string; omit the key instead')
      continue
    }
    if (URL_KEYS.has(key) && typeof value === 'string' && !isAbsoluteHttpUrl(value)) {
      add(issues, 'error', at, `must be an absolute http(s) URL, got ${JSON.stringify(value)}`)
    }
    if (DATE_KEYS.has(key) && typeof value === 'string' && !ISO_DATE.test(value)) {
      add(issues, 'error', at, `must be an ISO 8601 date, got ${JSON.stringify(value)}`)
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (isObject(item)) checkNode(item, `${at}[${index}]`, issues, false)
        else if (typeof item === 'string' && URL_KEYS.has(key) && !isAbsoluteHttpUrl(item)) {
          add(issues, 'error', `${at}[${index}]`, 'must be an absolute http(s) URL')
        }
      })
    } else if (isObject(value)) {
      checkNode(value, at, issues, false)
    }
  }
}

const URL_KEYS = new Set(['url', 'logo', 'item', 'image', '@id', 'urlTemplate', 'sameAs'])
const DATE_KEYS = new Set(['datePublished', 'dateModified', 'priceValidUntil'])

function checkProduct(node, path, issues) {
  if (!isNonEmptyString(node.name)) add(issues, 'error', `${path}.name`, 'Product needs a name')
  if (node.image === undefined) {
    add(issues, 'warning', `${path}.image`, 'Product has no image; the rich result shows none')
  }
  const offers = node.offers
  const hasOffer = offers !== undefined
  const hasRating = node.aggregateRating !== undefined
  const hasReview = node.review !== undefined
  if (!hasOffer && !hasRating && !hasReview) {
    add(
      issues,
      'error',
      `${path}.offers`,
      'Product needs at least one of offers, aggregateRating or review',
    )
  }
  if (hasOffer) {
    for (const [index, offer] of asArray(offers).entries()) {
      const at = asArray(offers).length > 1 ? `${path}.offers[${index}]` : `${path}.offers`
      if (!isObject(offer)) {
        add(issues, 'error', at, 'Offer must be an object')
        continue
      }
      // The Offer's own fields are checked when the generic walk reaches it
      // as a typed nested node; only the type claim is this node's to make.
      if (offer['@type'] !== 'Offer' && offer['@type'] !== 'AggregateOffer') {
        add(issues, 'error', `${at}.@type`, 'must be Offer or AggregateOffer')
      }
    }
  }
  if (hasRating) {
    const rating = node.aggregateRating
    const at = `${path}.aggregateRating`
    if (!isObject(rating)) add(issues, 'error', at, 'must be an object')
    else {
      if (!isNumberLike(rating.ratingValue)) add(issues, 'error', `${at}.ratingValue`, 'required')
      if (!isNumberLike(rating.reviewCount) && !isNumberLike(rating.ratingCount)) {
        add(issues, 'error', `${at}.reviewCount`, 'reviewCount or ratingCount is required')
      }
      const count = Number(rating.reviewCount ?? rating.ratingCount)
      if (Number.isFinite(count) && count <= 0) {
        add(
          issues,
          'error',
          `${at}.reviewCount`,
          'a rating over zero reviews is a fabricated claim',
        )
      }
      const value = Number(rating.ratingValue)
      const best = Number(rating.bestRating ?? 5)
      const worst = Number(rating.worstRating ?? 1)
      if (Number.isFinite(value) && (value < worst || value > best)) {
        add(issues, 'error', `${at}.ratingValue`, `must be between ${worst} and ${best}`)
      }
    }
  }
}

function checkOffer(offer, path, issues) {
  const hasPrice = offer.price !== undefined
  const hasAvailability = offer.availability !== undefined
  if (hasPrice) {
    if (!isNumberLike(offer.price)) add(issues, 'error', `${path}.price`, 'must be a number')
    else if (Number(offer.price) < 0) add(issues, 'error', `${path}.price`, 'must not be negative')
    if (!isNonEmptyString(offer.priceCurrency) || !CURRENCY.test(offer.priceCurrency)) {
      add(issues, 'error', `${path}.priceCurrency`, 'ISO 4217 code required when price is set')
    }
  } else if (!hasAvailability) {
    add(issues, 'error', `${path}.price`, 'Offer needs a price or an availability')
  }
  if (hasAvailability && !AVAILABILITY.has(offer.availability)) {
    add(
      issues,
      'error',
      `${path}.availability`,
      `must be a schema.org ItemAvailability URL, got ${JSON.stringify(offer.availability)}`,
    )
  }
  if (offer.highPrice !== undefined) {
    if (!isNumberLike(offer.highPrice))
      add(issues, 'error', `${path}.highPrice`, 'must be a number')
    else if (hasPrice && Number(offer.highPrice) < Number(offer.price)) {
      add(issues, 'error', `${path}.highPrice`, 'must not be below price')
    }
  }
  if (offer.seller !== undefined) {
    if (!isObject(offer.seller) || !isNonEmptyString(offer.seller.name)) {
      add(issues, 'error', `${path}.seller`, 'must be an Organization with a name')
    }
  }
}

function checkListItems(node, path, issues, { requireUrl }) {
  const items = node.itemListElement
  if (!Array.isArray(items) || items.length === 0) {
    add(issues, 'error', `${path}.itemListElement`, 'needs at least one ListItem')
    return
  }
  items.forEach((item, index) => {
    const at = `${path}.itemListElement[${index}]`
    if (!isObject(item)) {
      add(issues, 'error', at, 'must be a ListItem object')
      return
    }
    if (item['@type'] !== 'ListItem') add(issues, 'error', `${at}.@type`, 'must be ListItem')
    if (!Number.isInteger(item.position) || item.position < 1) {
      add(issues, 'error', `${at}.position`, 'must be a positive integer')
    }
    if (!isNonEmptyString(item.name) && !isObject(item.item)) {
      add(issues, 'error', `${at}.name`, 'ListItem needs a name (or an item node)')
    }
    const link = item.item ?? item.url
    const isLast = index === items.length - 1
    if (link === undefined) {
      if (requireUrl || !isLast) {
        add(
          issues,
          'error',
          `${at}.item`,
          'needs an absolute URL (only the last crumb may omit it)',
        )
      }
    } else if (typeof link === 'string' && !isAbsoluteHttpUrl(link)) {
      add(issues, 'error', `${at}.item`, 'must be an absolute http(s) URL')
    } else if (isObject(link) && !isAbsoluteHttpUrl(link['@id'] ?? link.url)) {
      add(issues, 'error', `${at}.item`, 'item node needs an absolute @id or url')
    }
  })
  // Positions must be consecutive and ascending. Google reads the position,
  // not the array order, and a breadcrumb numbered 1, 2, 4 is a trail with a
  // hole in it.
  const positions = items.filter(isObject).map((item) => item.position)
  if (positions.every((p) => Number.isInteger(p))) {
    const start = positions[0]
    const consecutive = positions.every((p, i) => p === start + i)
    if (!consecutive) {
      add(issues, 'error', `${path}.itemListElement`, 'positions must be consecutive and ascending')
    }
  }
}

function checkBreadcrumb(node, path, issues) {
  checkListItems(node, path, issues, { requireUrl: false })
}

function checkItemList(node, path, issues) {
  checkListItems(node, path, issues, { requireUrl: true })
  if (node.numberOfItems !== undefined && Array.isArray(node.itemListElement)) {
    if (node.numberOfItems !== node.itemListElement.length) {
      add(issues, 'error', `${path}.numberOfItems`, 'does not match the number of elements')
    }
  }
}

function checkOrganization(node, path, issues, topLevel) {
  if (!isNonEmptyString(node.name))
    add(issues, 'error', `${path}.name`, 'Organization needs a name')
  // A nested Organization (an Offer's seller, an Article's publisher) only
  // needs a name; the URL and logo are the home page's claims about itself.
  if (!topLevel) return
  if (!isAbsoluteHttpUrl(node.url)) add(issues, 'error', `${path}.url`, 'needs an absolute URL')
  if (node.logo === undefined) {
    add(issues, 'warning', `${path}.logo`, 'no logo; the knowledge panel shows none')
  }
}

function checkWebSite(node, path, issues) {
  if (!isNonEmptyString(node.name)) add(issues, 'error', `${path}.name`, 'WebSite needs a name')
  if (!isAbsoluteHttpUrl(node.url)) add(issues, 'error', `${path}.url`, 'needs an absolute URL')
  const action = node.potentialAction
  if (action === undefined) return
  const at = `${path}.potentialAction`
  if (!isObject(action) || action['@type'] !== 'SearchAction') {
    add(issues, 'error', at, 'must be a SearchAction')
    return
  }
  const target = isObject(action.target) ? action.target.urlTemplate : action.target
  if (!isNonEmptyString(target) || !isAbsoluteHttpUrl(target.replace(/\{[^}]+\}/g, 'x'))) {
    add(issues, 'error', `${at}.target`, 'needs an absolute urlTemplate')
    return
  }
  const placeholder = /\{([a-zA-Z_][\w]*)\}/.exec(target)
  if (!placeholder) {
    add(issues, 'error', `${at}.target`, 'urlTemplate needs a {placeholder}')
    return
  }
  const queryInput = action['query-input']
  const declared =
    typeof queryInput === 'string'
      ? /name=([\w-]+)/.exec(queryInput)?.[1]
      : isObject(queryInput)
        ? queryInput.valueName
        : undefined
  if (declared !== placeholder[1]) {
    add(
      issues,
      'error',
      `${at}.query-input`,
      `must name the placeholder ${placeholder[1]}, got ${JSON.stringify(queryInput)}`,
    )
  }
}

function checkFaq(node, path, issues) {
  const questions = node.mainEntity
  if (!Array.isArray(questions) || questions.length === 0) {
    add(issues, 'error', `${path}.mainEntity`, 'FAQPage needs at least one Question')
    return
  }
  questions.forEach((q, index) => {
    const at = `${path}.mainEntity[${index}]`
    if (!isObject(q) || q['@type'] !== 'Question') {
      add(issues, 'error', at, 'must be a Question')
      return
    }
    if (!isNonEmptyString(q.name)) add(issues, 'error', `${at}.name`, 'Question needs its text')
    const answer = q.acceptedAnswer
    if (!isObject(answer) || answer['@type'] !== 'Answer' || !isNonEmptyString(answer.text)) {
      add(issues, 'error', `${at}.acceptedAnswer`, 'needs an Answer with text')
    }
  })
}

function checkArticle(node, path, issues) {
  if (!isNonEmptyString(node.headline))
    add(issues, 'error', `${path}.headline`, 'Article needs a headline')
  else if (node.headline.length > 110) {
    add(issues, 'warning', `${path}.headline`, 'over 110 characters; Google truncates it')
  }
  if (!isNonEmptyString(node.datePublished)) {
    add(issues, 'error', `${path}.datePublished`, 'Article needs datePublished')
  }
  if (node.author === undefined) add(issues, 'warning', `${path}.author`, 'no author')
  if (node.image === undefined)
    add(issues, 'warning', `${path}.image`, 'no image; the card shows none')
  if (node.dateModified !== undefined && node.datePublished !== undefined) {
    if (String(node.dateModified) < String(node.datePublished)) {
      add(issues, 'error', `${path}.dateModified`, 'is before datePublished')
    }
  }
}

function checkBlog(node, path, issues) {
  const posts = node.blogPost
  if (posts === undefined) return
  if (!Array.isArray(posts)) {
    add(issues, 'error', `${path}.blogPost`, 'must be an array of BlogPosting')
    return
  }
  posts.forEach((post, index) => {
    if (!isObject(post) || post['@type'] !== 'BlogPosting') {
      add(issues, 'error', `${path}.blogPost[${index}]`, 'must be a BlogPosting')
    }
  })
}

const BY_TYPE = {
  Product: checkProduct,
  Offer: checkOffer,
  BreadcrumbList: checkBreadcrumb,
  ItemList: checkItemList,
  Organization: checkOrganization,
  WebSite: checkWebSite,
  FAQPage: checkFaq,
  Article: checkArticle,
  BlogPosting: checkArticle,
  NewsArticle: checkArticle,
  Blog: checkBlog,
}

/** The types this validator has rules for. Anything else passes generic checks only. */
export const KNOWN_TYPES = Object.freeze(Object.keys(BY_TYPE))

/**
 * @param {Record<string, unknown>} node
 * @param {string} path
 * @param {JsonLdIssue[]} issues
 * @param {boolean} topLevel
 */
function checkNode(node, path, issues, topLevel) {
  if (topLevel) {
    if (node['@context'] !== SCHEMA) {
      add(issues, 'error', `${path}.@context`, `must be ${JSON.stringify(SCHEMA)}`)
    }
  }
  const type = node['@type']
  if (!isNonEmptyString(type)) {
    add(issues, 'error', `${path}.@type`, 'every node needs a @type string')
    return
  }
  checkGeneric(node, path, issues)
  const typed = BY_TYPE[type]
  if (typed) typed(node, path, issues, topLevel)
}

/**
 * Validates one top-level node or an array of them.
 *
 * @param {unknown} input
 * @returns {JsonLdIssue[]} empty when the data is clean
 */
export function validateJsonLd(input) {
  /** @type {JsonLdIssue[]} */
  const issues = []
  const nodes = asArray(input)
  nodes.forEach((node, index) => {
    const path = nodes.length > 1 || Array.isArray(input) ? `$[${index}]` : '$'
    if (!isObject(node)) {
      add(issues, 'error', path, 'must be an object')
      return
    }
    checkNode(node, path, issues, true)
  })
  return issues
}

/**
 * Parses the text of a `<script type="application/ld+json">` and validates it.
 * Unparseable JSON is one error rather than a throw: the audit lists it with
 * the page it came from.
 *
 * @param {string} text
 * @returns {{ nodes: unknown[], issues: JsonLdIssue[] }}
 */
export function validateJsonLdText(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      nodes: [],
      issues: [
        {
          level: 'error',
          path: '$',
          message: `not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    }
  }
  return { nodes: asArray(parsed), issues: validateJsonLd(parsed) }
}

/**
 * @param {JsonLdIssue[]} issues
 * @returns {JsonLdIssue[]} the errors only
 */
export function jsonLdErrors(issues) {
  return issues.filter((issue) => issue.level === 'error')
}
