export interface RemainingTimeInput {
  total: number;
  acked: number;
  /** Time spent streaming, excluding pauses. */
  activeMs: number;
  /** CAM estimate for the whole job, if known. */
  estimatedMs: number | null;
}

/** Observed rates from the first few lines are noise (header, first rapid); wait for a sample. */
function minimumSample(total: number): number {
  return Math.max(10, Math.ceil(total * 0.01));
}

/**
 * Remaining time blended from the CAM estimate and the observed line rate. The observed rate
 * gets more weight as the job progresses (weight = fraction done). Null until either is known.
 */
export function estimateRemainingMs(input: RemainingTimeInput): number | null {
  const { total, acked, activeMs, estimatedMs } = input;
  if (total <= 0 || acked >= total) return 0;
  const fraction = acked / total;
  const fromEstimate = estimatedMs !== null && estimatedMs > 0 ? estimatedMs * (1 - fraction) : null;
  const fromRate =
    acked >= minimumSample(total) && activeMs > 0 ? (activeMs / acked) * (total - acked) : null;
  if (fromEstimate !== null && fromRate !== null) return (1 - fraction) * fromEstimate + fraction * fromRate;
  return fromRate ?? fromEstimate;
}
