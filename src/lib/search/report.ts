import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

export type SearchReport = {
  week_start: string
  week_end: string
  total_searches: number
  no_result_searches: number
  no_result_percentage: number
  total_clicks: number
  avg_ctr: number
}

export async function generateSearchReport(): Promise<SearchReport | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('fn_search_weekly_report', {})

    if (error || !data || !data[0]) {
      log.error('search.report_failed', { reason: error?.message || 'no_data' })
      return null
    }

    return {
      week_start: data[0].week_start,
      week_end: data[0].week_end,
      total_searches: data[0].total_searches,
      no_result_searches: data[0].no_result_searches,
      no_result_percentage: data[0].no_result_percentage,
      total_clicks: data[0].total_clicks,
      avg_ctr: data[0].avg_ctr,
    }
  } catch (error) {
    log.error('search.report_threw', { reason: error instanceof Error ? error.message : 'unknown' })
    return null
  }
}

export function formatSearchReport(report: SearchReport): string {
  const lines = [
    `דוח חיפוש שבועי ${report.week_start} - ${report.week_end}`,
    `סה"כ חיפושים: ${report.total_searches}`,
    `חיפושים ללא תוצאות: ${report.no_result_searches} (${report.no_result_percentage}%)`,
    `סה"כ קליקים: ${report.total_clicks}`,
    `CTR: ${report.avg_ctr}%`,
  ]
  return lines.join('\n')
}
