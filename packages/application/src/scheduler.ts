import type { CronTriggerDescriptor } from '@loutrejs/core'

interface CronFields {
  readonly minute: string
  readonly hour: string
  readonly dayOfMonth: string
  readonly month: string
  readonly dayOfWeek: string
}

export function matchesCronTrigger(
  trigger: CronTriggerDescriptor<any>,
  instant: Date,
): boolean {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = trigger.expression
    .trim()
    .split(/\s+/) as [string, string, string, string, string]
  const fields: CronFields = { minute, hour, dayOfMonth, month, dayOfWeek }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: trigger.timezone,
    minute: 'numeric',
    hour: 'numeric',
    day: 'numeric',
    month: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    value('weekday'),
  )
  return (
    matchesCronField(fields.minute, Number(value('minute')), 0, 59) &&
    matchesCronField(fields.hour, Number(value('hour')), 0, 23) &&
    matchesCronField(fields.dayOfMonth, Number(value('day')), 1, 31) &&
    matchesCronField(fields.month, Number(value('month')), 1, 12) &&
    matchesCronField(fields.dayOfWeek, weekday, 0, 7, true)
  )
}

function matchesCronField(
  expression: string,
  value: number,
  minimum: number,
  maximum: number,
  sundayAlias = false,
): boolean {
  return expression.split(',').some((segment) => {
    const [rangeExpression, stepExpression] = segment.split('/')
    const step = stepExpression === undefined ? 1 : Number(stepExpression)
    if (!Number.isInteger(step) || step <= 0 || !rangeExpression) return false
    let start = minimum
    let end = maximum
    if (rangeExpression !== '*') {
      const [startExpression, endExpression] = rangeExpression.split('-')
      start = Number(startExpression)
      end = endExpression === undefined ? start : Number(endExpression)
    }
    const normalized = sundayAlias && value === 0 && start === 7 ? 7 : value
    return (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= minimum &&
      end <= maximum &&
      normalized >= start &&
      normalized <= end &&
      (normalized - start) % step === 0
    )
  })
}
