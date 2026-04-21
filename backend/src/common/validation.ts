import { BadRequestException } from "@nestjs/common"

export function assertPositiveMs(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${field} must be a positive millisecond value`)
  }
  return Math.round(value)
}
