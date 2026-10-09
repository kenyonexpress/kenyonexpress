/**
 * What UptimeRobot says when it calls our webhook, turned into an alert.
 *
 * UptimeRobot's alert contact of type "webhook" calls a URL we give it and
 * substitutes `*variable*` placeholders in that URL, or in an optional POST
 * body. Which of the two it uses depends on how the contact was created, so
 * the route accepts both and this module only sees a flat bag of strings.
 *
 * Nothing here trusts the caller. The route has already checked the shared
 * secret; this parses defensively because UptimeRobot's placeholders arrive
 * empty when a monitor has no value for them, and a webhook set up by hand
 * can carry whatever someone typed.
 */

/** UptimeRobot's alertType codes. Anything else is refused, not guessed. */
export const UPTIMEROBOT_ALERT_TYPES = {
  '1': 'down',
  '2': 'up',
  '3': 'ssl_expiry',
} as const

export type UptimeRobotAlertKind =
  (typeof UPTIMEROBOT_ALERT_TYPES)[keyof typeof UPTIMEROBOT_ALERT_TYPES]

export type UptimeRobotAlert = {
  kind: UptimeRobotAlertKind
  monitorName: string
  monitorUrl: string
  /** UptimeRobot's own reason text, e.g. "HTTP 503 - Service Unavailable". */
  details: string
  /** Seconds the monitor was down, present on `up` alerts. */
  durationSeconds: number | null
  /** Days until the certificate expires, present on `ssl_expiry` alerts. */
  sslDaysLeft: number | null
}

/** The placeholders the setup script wires into the webhook URL. */
export const UPTIMEROBOT_FIELDS = [
  'alertType',
  'monitorFriendlyName',
  'monitorURL',
  'alertDetails',
  'alertDuration',
  'sslExpiryDaysLeft',
] as const

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  // A placeholder UptimeRobot could not fill arrives as the literal `*name*`.
  if (/^\*[A-Za-z]+\*$/.test(value)) return ''
  return value.trim().slice(0, max)
}

function integer(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value.trim())) return null
  return Number.parseInt(value.trim(), 10)
}

export function parseUptimeRobotAlert(fields: Record<string, unknown>): UptimeRobotAlert | null {
  const code = text(fields.alertType, 4)
  const kind = (UPTIMEROBOT_ALERT_TYPES as Record<string, UptimeRobotAlertKind | undefined>)[code]
  if (!kind) return null
  return {
    kind,
    monitorName: text(fields.monitorFriendlyName, 120) || 'monitor',
    monitorUrl: text(fields.monitorURL, 300),
    details: text(fields.alertDetails, 300),
    durationSeconds: integer(fields.alertDuration),
    sslDaysLeft: integer(fields.sslExpiryDaysLeft),
  }
}

export type FormattedAlert = {
  /** ASCII, because ntfy reads the header as ASCII (alert.ts). */
  title: string
  /** Hebrew body. */
  message: string
  priority: 'default' | 'high' | 'urgent'
  tags: string[]
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} שניות`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} דקות`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} שעות` : `${hours} שעות ו-${rest} דקות`
}

/**
 * Down is urgent: the site is not answering and the next thing that happens
 * is a customer finding out. Up is quiet: it closes the incident and should be
 * seen, not felt. Certificate expiry is high: there are days to act, and the
 * alert repeats until somebody does.
 */
export function formatUptimeRobotAlert(alert: UptimeRobotAlert): FormattedAlert {
  const where = alert.monitorUrl ? `\nכתובת: ${alert.monitorUrl}` : ''
  switch (alert.kind) {
    case 'down':
      return {
        title: `KE DOWN: ${alert.monitorName}`,
        priority: 'urgent',
        tags: ['rotating_light'],
        message: `האתר לא עונה לניטור החיצוני.${where}${
          alert.details ? `\nסיבה: ${alert.details}` : ''
        }`,
      }
    case 'up':
      return {
        title: `KE UP: ${alert.monitorName}`,
        priority: 'default',
        tags: ['white_check_mark'],
        message: `האתר חזר לענות.${where}${
          alert.durationSeconds !== null
            ? `\nמשך ההשבתה: ${formatDuration(alert.durationSeconds)}`
            : ''
        }`,
      }
    case 'ssl_expiry':
      return {
        title: `KE TLS expiry: ${alert.monitorName}`,
        priority: 'high',
        tags: ['warning'],
        message: `תעודת ה-TLS עומדת לפוג.${where}${
          alert.sslDaysLeft !== null ? `\nנותרו ${alert.sslDaysLeft} ימים` : ''
        }`,
      }
  }
}
