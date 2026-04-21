import type { Options, Unit } from "./types"
import { units } from "./units"
import { assertValidArray, dedup, defaultOptions, flatten, parseNumber, range, sort } from "./utils"

export function arrayToString(arr: number[][], options?: Partial<Options>) {
  assertValidArray(arr)
  const parts = arr.map((part, idx) => arrayToStringPart(part, units[idx], { ...defaultOptions, ...options }))
  return parts.join(" ")
}

export const arrayToStringPart = (arr: number[], unit: Unit, options: Options) => {
  const values = sort(
    dedup(
      fixSunday(
        arr.map((value) => {
          const parsedValue = parseNumber(value)
          if (parsedValue === undefined) throw getError(`Invalid value "${value}"`, unit)
          return parsedValue
        }),
        unit,
      ),
    ),
  )
  if (!values.length) throw getError("Empty interval value", unit)
  assertInRange(values, unit)
  return toString(values, unit, options)
}

export function stringToArray(str: string) {
  if (typeof str !== "string") {
    throw new Error("Invalid cron expression, make sure you have spaces in between each expression")
  }
  const parts = str.replace(/\s+/g, " ").trim().split(" ")
  if (parts.length !== 5) {
    throw new Error("Invalid cron string format")
  }
  return parts.map((s, idx) => stringToArrayPart(s, units[idx]))
}

export const stringToArrayPart = (str: string, unit: Unit) => {
  const values = sort(
    dedup(
      fixSunday(
        flatten(
          replaceAlternatives(str, unit)
            .split(",")
            .map((value: string) => {
              const valueParts = value.split("/")
              if (valueParts.length > 2) throw getError(`Invalid value "${str}"`, unit)
              let parsedValues: number[]
              const left = valueParts[0]
              const right = valueParts[1]
              if (left === "*") parsedValues = range(unit.min, unit.max)
              else parsedValues = parseRange(left, str, unit)
              const step = parseStep(right, unit)
              return applyInterval(parsedValues, step)
            }),
        ),
        unit,
      ),
    ),
  )
  assertInRange(values, unit)
  return values
}

const toRanges = (values: number[]) => {
  const retval: number[][] = []
  let startPart: number | undefined = undefined
  values.forEach(function (value, index, self) {
    if (value !== self[index + 1] - 1) {
      if (startPart !== undefined) {
        retval.push([startPart, value])
        startPart = undefined
      } else {
        retval.push([value])
      }
    } else if (startPart === undefined) {
      startPart = value
    }
  })
  return retval
}

const toString = (values: number[], unit: Unit, options: Options) => {
  let retval = ""
  if (isFull(values, unit)) {
    retval = options.outputHashes ? "H" : "*"
  } else {
    const step = getStep(values)
    if (step && isInterval(values, step)) {
      if (isFullInterval(values, unit, step)) {
        retval = options.outputHashes ? `H/${step}` : `*/${step}`
      } else {
        const min = values[0]
        const max = values[values.length - 1]
        const rangeStr = formatValue(min, unit, options) + "-" + formatValue(max, unit, options)
        retval = options.outputHashes ? `H(${rangeStr})/${step}` : `${rangeStr}/${step}`
      }
    } else {
      retval = toRanges(values)
        .map((r) => {
          if (r.length === 1) return String(formatValue(r[0], unit, options))
          return formatValue(r[0], unit, options) + "-" + formatValue(r[1], unit, options)
        })
        .join(",")
    }
  }
  return retval
}

const formatValue = (value: number, unit: Unit, options: Options) => {
  if ((options.outputWeekdayNames && unit.name === "weekday") || (options.outputMonthNames && unit.name === "month")) {
    if (unit.alt) return unit.alt[value - unit.min]
  }
  return value
}

export const getError = (error: string, unit: Unit) => new Error(`${error} for ${unit.name}`)

const parseRange = (rangeString: string, context: string, unit: Unit) => {
  const subparts = rangeString.split("-")
  if (subparts.length === 1) {
    const value = parseNumber(subparts[0])
    if (value === undefined) throw getError(`Invalid value "${context}"`, unit)
    return [value]
  } else if (subparts.length === 2) {
    const minValue = parseNumber(subparts[0])
    const maxValue = parseNumber(subparts[1])
    if (minValue === undefined || maxValue === undefined) throw getError(`Invalid value "${context}"`, unit)
    if (maxValue < minValue) throw getError(`Max range is less than min range in "${rangeString}"`, unit)
    return range(minValue, maxValue)
  }
  throw getError(`Invalid value "${rangeString}"`, unit)
}

const parseStep = (step: string, unit: Unit) => {
  if (step !== undefined) {
    const parsedStep = parseNumber(step)
    if (parsedStep === undefined) throw getError(`Invalid interval step value "${step}"`, unit)
    return parsedStep
  }
  return 0
}

const applyInterval = (values: number[], step: number) => {
  if (step) {
    const minVal = values[0]
    values = values.filter((value) => value % step === minVal % step || value === minVal)
  }
  return values
}

const fixSunday = (values: number[], unit: Unit) => {
  if (unit.name === "weekday") {
    values = values.map((value) => (value === 7 ? 0 : value))
  }
  return values
}

const replaceAlternatives = (str: string, unit: Unit) => {
  if (unit.alt) {
    str = str.toUpperCase()
    for (let i = 0; i < unit.alt.length; i++) {
      str = str.replace(unit.alt[i], String(i + unit.min))
    }
  }
  return str
}

const assertInRange = (values: number[], unit: Unit) => {
  const first = values[0]
  const last = values[values.length - 1]
  if (first < unit.min) throw getError(`Value "${first}" out of range`, unit)
  if (last > unit.max) throw getError(`Value "${last}" out of range`, unit)
}

const isInterval = (values: number[], step: number) => {
  for (let i = 1; i < values.length; i++) {
    if (values[i] - values[i - 1] !== step) return false
  }
  return true
}

const isFullInterval = (values: number[], unit: Unit, step: number) => {
  const min = values[0]
  const max = values[values.length - 1]
  const haveAllValues = values.length === (max - min) / step + 1
  return min === unit.min && max + step > unit.max && haveAllValues
}

const getStep = (values: number[]) => {
  if (values.length > 2) {
    const step = values[1] - values[0]
    if (step > 1) return step
  }
  return 0
}

export const isFull = (values: number[], unit: Unit) => values.length === unit.max - unit.min + 1

export const createRanges = (values: number[]): string[] => {
  const aggregated: string[] = []
  let startRange: number | null = null

  for (let i = 0; i < values.length; i++) {
    if (startRange == null) startRange = values[i]
    if (i === values.length - 1 || values[i + 1] !== values[i] + 1) {
      if (startRange === values[i]) aggregated.push(startRange.toString())
      else aggregated.push(`${startRange}-${values[i]}`)
      startRange = null
    }
  }
  return aggregated
}
