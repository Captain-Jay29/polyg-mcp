export interface BootstrapResult {
  mean: number;
  lower: number;
  upper: number;
  ci: number;
}

/**
 * Mulberry32 — a simple seeded 32-bit PRNG.
 * Returns a function that produces values in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapCI(
  scores: number[],
  nBootstrap = 1000,
  ci = 0.95,
  seed = 42,
): BootstrapResult {
  if (scores.length === 0) {
    throw new Error('scores must be a non-empty array');
  }
  for (const s of scores) {
    if (s < 0 || s > 1) {
      throw new Error(`score ${s} is outside [0, 1]`);
    }
  }
  if (ci <= 0 || ci >= 1) {
    throw new Error(`ci must be in (0, 1), got ${ci}`);
  }
  if (nBootstrap < 1) {
    throw new Error(`nBootstrap must be >= 1, got ${nBootstrap}`);
  }

  const n = scores.length;
  const rand = mulberry32(seed);

  // Compute overall mean
  const overallMean = scores.reduce((a, b) => a + b, 0) / n;

  // Resample and compute means
  const means: number[] = new Array(nBootstrap);
  for (let i = 0; i < nBootstrap; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += scores[Math.floor(rand() * n)];
    }
    means[i] = sum / n;
  }

  // Sort for percentile computation
  means.sort((a, b) => a - b);

  const lowerIdx = Math.floor(((1 - ci) / 2) * nBootstrap);
  const upperIdx = Math.floor(((1 + ci) / 2) * nBootstrap);

  return {
    mean: overallMean,
    lower: means[Math.min(lowerIdx, nBootstrap - 1)],
    upper: means[Math.min(upperIdx, nBootstrap - 1)],
    ci,
  };
}

export function formatCI(result: BootstrapResult, decimals = 3): string {
  const pct = Math.round(result.ci * 100);
  const m = result.mean.toFixed(decimals);
  const lo = result.lower.toFixed(decimals);
  const hi = result.upper.toFixed(decimals);
  return `${m} (${pct}% CI: ${lo}\u2013${hi})`;
}
