import { type Options, ScheduleSelector, type ScheduleSelectorObject } from "./types"

export const defaultOptions: Options = {
  outputHashes: false,
  outputMonthNames: false,
  outputWeekdayNames: false,
}

export const parseNumber = (value: unknown) => {
  if (typeof value === "string") {
    const str: string = value.trim()
    if (/^\d+$/.test(str)) {
      const num = Number(str)
      if (!isNaN(num) && isFinite(num)) return num
    }
  } else if (typeof value === "number") {
    if (!isNaN(value) && isFinite(value) && value === Math.floor(value)) return value
  }
  return undefined
}

export const assertValidArray = (arr: unknown) => {
  if (arr === undefined || !Array.isArray(arr) || arr.length !== 5 || arr.some((element) => !Array.isArray(element))) {
    throw new Error("Invalid cron array")
  }
}

export const range = (start: number, end: number): number[] => {
  const array: number[] = []
  for (let i = start; i <= end; i++) array.push(i)
  return array
}

export const sort = (array: number[]) => [...array].toSorted((a, b) => a - b)

export const flatten = (arrays: number[][]) => ([] as number[]).concat.apply([], arrays)

export const dedup = (array: number[]) => [...new Set(array)]

export const determineDefaultSelector = (
  scheduleSelector: ScheduleSelectorObject[],
  cron: string,
): ScheduleSelector => {
  const cronFields = cron.split(" ")
  for (let i = 0; i < scheduleSelector.length; i++) {
    const fieldValue = cronFields[cronFields.length - 1 - i]
    if (fieldValue !== "*") return scheduleSelector[i].name
  }
  return ScheduleSelector.year
}

export const updateCronString = (
  cron: string,
  selectedSelector: ScheduleSelector,
  scheduleSelectors: ScheduleSelectorObject[],
): string => {
  const cronFields = cron.split(" ")
  const selectedIndex = scheduleSelectors.findIndex((selector) => selector.name === selectedSelector)
  const updatedCronFields = cronFields.map((field, index) =>
    index > cronFields.length - 1 - selectedIndex ? "*" : field,
  )
  return updatedCronFields.join(" ")
}
