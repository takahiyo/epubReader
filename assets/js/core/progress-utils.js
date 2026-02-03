import { PROGRESS_PRECISION } from "../../constants.js";

const PERCENTAGE_BASE = 100;

export function roundProgressPercentage(value, precision = PROGRESS_PRECISION) {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(precision) || precision <= 0) return value;
  const scale = 1 / precision;
  return Math.round(value * scale) / scale;
}

export function calculateProgressPercentage(currentIndex, totalPages, precision = PROGRESS_PRECISION) {
  if (!Number.isFinite(currentIndex) || !Number.isFinite(totalPages) || totalPages <= 0) {
    return null;
  }
  const rawPercentage = ((currentIndex + 1) / totalPages) * PERCENTAGE_BASE;
  return roundProgressPercentage(rawPercentage, precision);
}

export function normalizePageIndex(value) {
  if (value && typeof value === "object") {
    return Number(value.index ?? value.pageIndex ?? 0);
  }
  return Number(value || 0);
}
