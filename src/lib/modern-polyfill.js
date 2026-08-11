/**
 * Empty stand-in for `next/dist/build/polyfills/polyfill-module`.
 *
 * Next 16's supported browsers already include Array.at / flat / Object.hasOwn,
 * but the framework still ships those polyfills into the main client chunk.
 * Lighthouse mobile flags ~13KiB as legacy-javascript ([32]). Alias this file
 * in next.config turbopack.resolveAlias so modern visitors do not download
 * dead code. Do not use if a real need for IE/old Safari returns.
 */
