import {
  add,
  sub,
  startOfMinute,
  endOfMinute,
  startOfHour,
  endOfHour,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  getDay,
  getMonth,
  getDate,
  getHours,
  getMinutes,
  isValid,
  parseISO,
  set,
} from "date-fns"
import { assertValidArray } from "./utils"

export class Schedule {
  readonly arr: number[][]
  readonly now: Date
  date: Date
  pristine: boolean

  constructor(arr: number[][], now?: Date | string) {
    assertValidArray(arr)
    let date: Date
    if (now === undefined) date = new Date()
    else if (typeof now === "string") date = parseISO(now)
    else date = now

    if (!isValid(date)) throw new Error("Invalid reference date provided")

    if (date.getSeconds() > 0) date = add(date, { minutes: 1 })

    this.arr = arr
    this.now = date
    this.date = date
    this.pristine = true
  }

  reset = () => {
    this.pristine = true
    this.date = new Date(this.now)
  }

  next() {
    if (this.pristine) this.pristine = false
    else this.date = add(this.date, { minutes: 1 })
    this.date = findDate(this.arr, this.date, false)
    return this.date
  }

  prev() {
    this.pristine = false
    this.date = findDate(this.arr, this.date, true)
    return this.date
  }
}

const findDate = (arr: number[][], date: Date, reverse: boolean) => {
  const operation = reverse ? sub : add
  const resetMonth = reverse ? endOfMonth : startOfMonth
  const resetDay = reverse ? endOfDay : startOfDay
  const resetHour = reverse ? endOfHour : startOfHour
  const resetMinute = reverse ? endOfMinute : startOfMinute

  if (reverse) date = sub(date, { minutes: 1 })

  let retry = 24
  while (--retry) {
    date = shiftMonth(arr, date, operation, resetMonth)
    const [newDate, monthChanged] = shiftDay(arr, date, operation, resetDay)
    date = newDate
    if (!monthChanged) {
      const [updatedDate, dayChanged] = shiftHour(arr, date, operation, resetHour)
      date = updatedDate
      if (!dayChanged) {
        const [finalDate, hourChanged] = shiftMinute(arr, date, operation, resetMinute)
        date = finalDate
        if (!hourChanged) break
      }
    }
  }
  if (!retry) throw new Error("Unable to find execution time for schedule")

  return set(date, { seconds: 0, milliseconds: 0 })
}

const shiftMonth = (
  arr: number[][],
  date: Date,
  operation: typeof add | typeof sub,
  reset: typeof startOfMonth | typeof endOfMonth,
) => {
  while (!arr[3].includes(getMonth(date) + 1)) {
    date = operation(date, { months: 1 })
    date = reset(date)
  }
  return date
}

const shiftDay = (
  arr: number[][],
  date: Date,
  operation: typeof add | typeof sub,
  reset: typeof startOfDay | typeof endOfDay,
): [Date, boolean] => {
  const currentMonth = getMonth(date)
  while (!arr[2].includes(getDate(date)) || !arr[4].includes(getDay(date))) {
    date = operation(date, { days: 1 })
    date = reset(date)
    if (currentMonth !== getMonth(date)) return [date, true]
  }
  return [date, false]
}

const shiftHour = (
  arr: number[][],
  date: Date,
  operation: typeof add | typeof sub,
  reset: typeof startOfHour | typeof endOfHour,
): [Date, boolean] => {
  const currentDay = getDate(date)
  while (!arr[1].includes(getHours(date))) {
    date = operation(date, { hours: 1 })
    date = reset(date)
    if (currentDay !== getDate(date)) return [date, true]
  }
  return [date, false]
}

const shiftMinute = (
  arr: number[][],
  date: Date,
  operation: typeof add | typeof sub,
  reset: typeof startOfMinute | typeof endOfMinute,
): [Date, boolean] => {
  const currentHour = getHours(date)
  while (!arr[0].includes(getMinutes(date))) {
    date = operation(date, { minutes: 1 })
    date = reset(date)
    if (currentHour !== getHours(date)) return [date, true]
  }
  return [date, false]
}

export function getSchedule(arr: number[][], now?: Date | string) {
  return new Schedule(arr, now)
}
