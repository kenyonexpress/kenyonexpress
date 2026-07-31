import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Run } from './log.mjs'

/**
 * The contract these cover is not "counting works". It is that a run which
 * recorded failures cannot report success, because that is the exact shape of
 * the bug found on 2026-07-29: every stage failed on a wrong service key, and
 * the runner printed a green "dry run complete" and exited 0.
 */

test('a clean run reports no failures', () => {
  const run = new Run({ kind: 'staging_load' })
  run.op({ stage: 'load_staging', entity: 'product', wpId: 1, action: 'insert' })
  run.op({ stage: 'load_staging', entity: 'product', wpId: 2, action: 'update' })
  assert.equal(run.failureCount(), 0)
  assert.deepEqual(run.failedStages(), [])
})

test('recorded failures are counted even though fail() never throws', () => {
  const run = new Run({ kind: 'staging_load' })
  assert.doesNotThrow(() =>
    run.fail('load_staging', 'product', 1, 'invalid_key', new Error('Invalid API key')),
  )
  run.fail('load_staging', 'category', 2, 'invalid_key', new Error('Invalid API key'))
  assert.equal(run.failureCount(), 2)
})

test('failures are attributed per stage and entity', () => {
  const run = new Run({ kind: 'staging_load' })
  run.fail('load_staging', 'product', 1, 'x', new Error('e'))
  run.fail('media_sync', 'media', 2, 'x', new Error('e'))
  const stages = run.failedStages().join(' ')
  assert.match(stages, /load_staging\.product \(1\)/)
  assert.match(stages, /media_sync\.media \(1\)/)
})

test('a successful op does not mask a failed one', () => {
  // The realistic case: most rows load, a few do not. The run must still exit
  // non-zero, or a partial import is indistinguishable from a whole one.
  const run = new Run({ kind: 'staging_load' })
  for (let i = 0; i < 100; i += 1) {
    run.op({ stage: 'load_staging', entity: 'product', wpId: i, action: 'insert' })
  }
  run.fail('load_staging', 'product', 101, 'constraint', new Error('duplicate slug'))
  assert.equal(run.failureCount(), 1)
})
