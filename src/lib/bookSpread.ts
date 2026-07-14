import { PAGES_PER_BOOK, clampPage } from './library'

export function clampSpread(spread: number): number {
  if (!Number.isFinite(spread)) return 1
  return Math.min(Math.ceil(PAGES_PER_BOOK / 2), Math.max(1, Math.round(spread)))
}

export function spreadToLeftPage(spread: number): number {
  return clampPage((clampSpread(spread) - 1) * 2 + 1)
}

export function spreadToRightPage(spread: number): number {
  return clampPage(spreadToLeftPage(spread) + 1)
}
