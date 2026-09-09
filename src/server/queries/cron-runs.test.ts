import { describe, expect, it, vi } from 'vitest'

/**
 * THE THREE WAYS A JOB CAN HAVE NO ROWS, AND WHY THEY MUST NOT LOOK ALIKE.
 *
 * `job_runs` does not exist in production yet, so the honest reading of an
 * empty screen today is "nothing is recorded", not "nothing ran". A dashboard
 * that could not tell those apart would be worse than none, because it would
 * be read as evidence. Same for the alert: firing "seventeen jobs failing" the
 * moment the table appears is how a new alert gets muted on its first day.
 */

const rpc = vi.fn()
const from = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc, from }) }))

import {
  FAILURE_THRESHOLD,
  type JobHealth,
  SCHEDULED_JOB_NAMES,
  buildCronFailureAlert,
  fetchCronRuns,
  jobsFailingRepeatedly,
} from './cron-runs'

function health(overrides: Partial<JobHealth> & { jobName: string }): JobHealth {
  return {
    cron: '0 4 * * *',
    lastStartedAt: '2026-09-10T04:00:00Z',
    lastStatus: 'failed',
    lastDurationMs: 120,
    consecutiveFailures: 0,
    ...overrides,
  }
}

describe('fetchCronRuns while the migration is unapplied', () => {
  it('reports tableMissing and still lists every scheduled job', async () => {
    // PGRST202 is PostgREST answering "no such function", which is what the
    // health RPC returns until 228 is approved.
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })

    const view = await fetchCronRuns()

    expect(view.tableMissing).toBe(true)
    expect(view.health.map((job) => job.jobName)).toEqual(SCHEDULED_JOB_NAMES)
    // Not one of them is described as failing. There is no evidence either way.
    expect(view.health.every((job) => job.lastStatus === null)).toBe(true)
    expect(jobsFailingRepeatedly(view.health)).toEqual([])
    // And it never went on to read the table it just learned does not exist.
    expect(from).not.toHaveBeenCalled()
  })

  it('treats a missing table the same as a missing function', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })
    await expect(fetchCronRuns()).resolves.toMatchObject({ tableMissing: true })
  })
})

describe('jobsFailingRepeatedly', () => {
  it('is silent below the threshold and speaks at it', () => {
    const jobs = [
      health({ jobName: 'one', consecutiveFailures: 1 }),
      health({ jobName: 'two', consecutiveFailures: 2 }),
      health({ jobName: 'three', consecutiveFailures: 9 }),
    ]
    expect(jobsFailingRepeatedly(jobs, 2).map((j) => j.jobName)).toEqual(['two', 'three'])
  })

  it('never counts a job that has no rows at all', () => {
    // The trap: `consecutiveFailures` defaults to 0 for an unseen job, but a
    // future change that defaulted it to the run count would fire for all
    // seventeen on the day the table appears. The status check is the guard.
    const unseen = health({ jobName: 'never', lastStatus: null, consecutiveFailures: 99 })
    expect(jobsFailingRepeatedly([unseen], 2)).toEqual([])
  })

  it('does not keep alerting after a recovery', () => {
    // A job whose newest run succeeded has zero consecutive failures however
    // ugly its history is. This is the difference between counting backwards
    // from now and counting failures in a window.
    const recovered = health({ jobName: 'ok-now', lastStatus: 'ok', consecutiveFailures: 0 })
    expect(jobsFailingRepeatedly([recovered], 2)).toEqual([])
  })
})

describe('buildCronFailureAlert', () => {
  it('returns null when nothing is failing, rather than an empty line', () => {
    expect(buildCronFailureAlert([health({ jobName: 'a', lastStatus: 'ok' })])).toBeNull()
    expect(buildCronFailureAlert([])).toBeNull()
  })

  it('names the worst offender first', () => {
    const message = buildCronFailureAlert([
      health({ jobName: 'reconcile', consecutiveFailures: 2 }),
      health({ jobName: 'whatsapp', consecutiveFailures: 7 }),
    ])
    expect(message).toBe('Scheduled jobs failing 2+ times in a row: whatsapp x7, reconcile x2')
  })

  it('uses two as the threshold, matching what the dashboard shows', () => {
    expect(FAILURE_THRESHOLD).toBe(2)
    expect(buildCronFailureAlert([health({ jobName: 'a', consecutiveFailures: 1 })])).toBeNull()
    expect(buildCronFailureAlert([health({ jobName: 'a', consecutiveFailures: 2 })])).not.toBeNull()
  })
})
