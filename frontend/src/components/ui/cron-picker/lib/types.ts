export type CronState = {
  expression: string
  array: number[][]
  error: string
  next: string
}

export type ValuePayload = {
  index: number
  values: number[]
}

export type Unit = {
  name: "minute" | "hour" | "day" | "month" | "weekday"
  min: number
  max: number
  alt?: ReadonlyArray<string>
}

export type Options = {
  outputHashes: boolean
  outputWeekdayNames: boolean
  outputMonthNames: boolean
}

export enum ScheduleSelector {
  year = "year",
  weekday = "weekday",
  month = "month",
  day = "day",
  hour = "hour",
  minute = "minute",
}

export type ScheduleSelectorObject = {
  name: ScheduleSelector
  prefix: string
}
