export interface CronSchedule {
  readonly expression: string
  readonly timezone: string
}

export function matchesCronTrigger(
  trigger: CronSchedule,
  instant: Date,
): boolean {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = trigger.expression
    .trim()
    .split(/\s+/) as [string, string, string, string, string]
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
  const dayOfMonthMatches = matchesCronField(
    dayOfMonth,
    Number(value('day')),
    1,
    31,
  )
  const dayOfWeekMatches = matchesCronField(dayOfWeek, weekday, 0, 7, true)
  const bothDaysRestricted =
    !dayOfMonth.includes('*') && !dayOfWeek.includes('*')
  const dayMatches = bothDaysRestricted
    ? dayOfMonthMatches || dayOfWeekMatches
    : dayOfMonthMatches && dayOfWeekMatches
  return (
    matchesCronField(minute, Number(value('minute')), 0, 59) &&
    matchesCronField(hour, Number(value('hour')), 0, 23) &&
    matchesCronField(month, Number(value('month')), 1, 12) &&
    dayMatches
  )
}

export function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ] as const
  return fields.every((field, index) => {
    const range = ranges[index]
    return range !== undefined && isValidCronField(field, range[0], range[1])
  })
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
    const candidates = sundayAlias && value === 0 ? [0, 7] : [value]
    return (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= minimum &&
      end <= maximum &&
      candidates.some(
        (candidate) =>
          candidate >= start &&
          candidate <= end &&
          (candidate - start) % step === 0,
      )
    )
  })
}

function isValidCronField(
  field: string,
  minimum: number,
  maximum: number,
): boolean {
  return field.split(',').every((segment) => {
    const parts = segment.split('/')
    if (parts.length > 2) return false
    const rangeExpression = parts[0]
    const stepExpression = parts[1]
    if (!rangeExpression) return false
    if (
      stepExpression !== undefined &&
      (!/^\d+$/.test(stepExpression) || Number(stepExpression) <= 0)
    ) {
      return false
    }
    if (rangeExpression === '*') return true
    const bounds = rangeExpression.split('-')
    if (bounds.length > 2 || bounds.some((bound) => !/^\d+$/.test(bound))) {
      return false
    }
    const start = Number(bounds[0])
    const end = bounds[1] === undefined ? start : Number(bounds[1])
    return start >= minimum && end <= maximum && start <= end
  })
}
