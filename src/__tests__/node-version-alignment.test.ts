import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THREE PLACES NAME A NODE VERSION, AND THEY MUST AGREE.
 *
 *   package.json engines.node   what the project REQUIRES
 *   @types/node                 what type-checking VALIDATES against
 *   ci.yml NODE_VERSION         what actually RUNS the gates
 *
 * They had drifted: engines said >=22.11.0 and CI ran 22, while @types/node was
 * ^20 - so every type-check validated the code against an API surface two
 * majors OLDER than the project's own minimum. Nothing failed, because being
 * typed against an older Node is not an error; it just means a Node 22 API is
 * either missing from the types or typed by accident.
 *
 * The types follow the ENGINE, not the newest release and not the laptop.
 * @types/node 26 was available and would have been wrong: it describes APIs
 * that Node 22 does not have, and CI runs 22, so code could type-check here and
 * fail there - the drift inverted, and harder to see.
 *
 * 2026-09-09: there was a FOURTH place, and this file could not see it. The
 * secrets-audit job named `node-version: 22` as a literal instead of reading
 * `env.NODE_VERSION`, and agreed with the other three by coincidence. A bump to
 * `NODE_VERSION` would have satisfied every assertion below while leaving one
 * job on the old runtime. The last case now asserts that no job names a version
 * of its own, which is why three names stay three.
 */
const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  engines: { node: string }
  devDependencies: Record<string, string>
}
const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')

/** First integer in a range like ">=22.11.0", "^22", "22.20.1", "'22'". */
function major(value: string): number {
  const match = value.match(/(\d+)/)
  return match?.[1] ? Number(match[1]) : Number.NaN
}

const engineMajor = major(manifest.engines.node)
const typesMajor = major(manifest.devDependencies['@types/node'] ?? '')
const ciMajor = major(workflow.match(/NODE_VERSION:\s*'?(\d+)/)?.[1] ?? '')

describe('the Node version named in three places', () => {
  it('parsed all three, so a rename cannot make this vacuous', () => {
    expect(Number.isNaN(engineMajor)).toBe(false)
    expect(Number.isNaN(typesMajor)).toBe(false)
    expect(Number.isNaN(ciMajor)).toBe(false)
  })

  it('types the code against the version the project requires', () => {
    expect(
      typesMajor,
      `@types/node is ${typesMajor} while engines.node requires ${engineMajor}. Types below the engine hide APIs the project may use; types above it accept APIs CI does not have.`,
    ).toBe(engineMajor)
  })

  it('runs the gates on the version the project requires', () => {
    expect(ciMajor, `ci.yml runs Node ${ciMajor} while engines.node requires ${engineMajor}.`).toBe(
      engineMajor,
    )
  })

  it('lets no job in ci.yml name a version of its own', () => {
    const literals = workflow
      .split('\n')
      .map((text, index) => ({ text: text.trim(), line: index + 1 }))
      .filter(({ text }) => /^node-version:\s*['"]?\d/.test(text))
    expect(
      literals,
      `${literals
        .map((l) => `ci.yml:${l.line} ${l.text}`)
        .join(
          ', ',
        )}. A literal agrees with NODE_VERSION only until NODE_VERSION moves, and the three assertions above read NODE_VERSION - so they would stay green while that job ran the old runtime.`,
    ).toEqual([])
  })
})
