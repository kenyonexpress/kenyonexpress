/**
 * IS THIS PROCESS ACTUALLY SERVING A DEPLOYMENT?
 *
 * `NODE_ENV === 'production'` does not answer that question, and treating it as
 * though it does is how a boot-time security control ends up bricking the local
 * gates. `next start` on a laptop runs with `NODE_ENV=production` -- that is not
 * a configuration mistake, it is what the command is for: the pixel gate, the
 * Playwright suite and Lighthouse all have to measure a production build, and
 * they all reach it through `pnpm start`.
 *
 * Measured, not assumed: with the compromised-key guard keyed on `NODE_ENV`,
 * `PORT=3312 pnpm start` answered 500 on every route with
 * "An error occurred while loading instrumentation hook: refusing to boot",
 * and the homepage pixel gate read 26.30% at 380 against an 11% ceiling --
 * it was comparing an error page to the live site.
 *
 * The discriminator used here has two halves, in this order:
 *
 * 1. A platform marker outranks everything. Vercel sets `VERCEL=1` and
 *    `VERCEL_ENV` on every build and every serverless invocation. If either is
 *    present the process is on the platform and no local waiver applies -- so
 *    pasting the waiver into the project's environment variables cannot disarm
 *    a guard that depends on this function.
 * 2. Otherwise, production plus the local waiver means a local `next start`.
 *    `ALLOW_INCOMPLETE_ENV=true` is already this repo's marker for exactly that
 *    ("correct for a local `next start`; wrong anywhere a customer can reach",
 *    `src/lib/env.ts`), and `scripts/deploy-preflight.mjs` refuses to build an
 *    environment that carries it. A deploy therefore cannot wear it.
 *
 * The residual gap is a self-hosted production server started through
 * `pnpm start` with the waiver set. That is not this project's deploy path --
 * Vercel serves the Next.js output through its own runtime and never invokes
 * the `start` script -- and the build-time refusal in
 * `scripts/deploy-preflight.mjs` is the control that stands in front of this
 * one regardless. Recorded here rather than left to be rediscovered.
 */
export function isDeployedRuntime(source: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  if (source.VERCEL === '1' || source.VERCEL_ENV) return true
  if (source.NODE_ENV !== 'production') return false
  return source.ALLOW_INCOMPLETE_ENV !== 'true'
}
