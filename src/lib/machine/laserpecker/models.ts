/**
 * LaserPecker models and their resolution steps. LP2 numbers come from the LaserPecker protocol
 * notes by nerdocs (https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md); the LP3's 4K
 * step is from LaserPecker's product page (1K/2K/4K) and still needs checking on a device.
 */

export interface Resolution {
  /** The device's step code that goes with the DPI. */
  px: number;
  dpi: number;
  label: string;
}

export const RESOLUTIONS: readonly Resolution[] = [
  { px: 4, dpi: 254, label: '1K' },
  { px: 3, dpi: 1016 / 3, label: '1.3K' },
  { px: 2, dpi: 508, label: '2K' },
  { px: 1, dpi: 1016, label: '4K' },
];

export const DEFAULT_RESOLUTION = RESOLUTIONS[0];

export function resolutionByPx(px: number): Resolution {
  return RESOLUTIONS.find((r) => r.px === px) ?? DEFAULT_RESOLUTION;
}

type Range = readonly [number, number];

const inRanges = (value: number, ranges: readonly Range[]) =>
  ranges.some(([lo, hi]) => value >= lo && value <= hi);

/** LP2 firmware versions. */
const LP2_VERSIONS: readonly Range[] = [
  [300, 399],
  [3000, 3099],
  [3500, 3599],
  [3700, 3799],
];

/** LP2 firmware that takes 1-bit packed images. */
const LP2_PACKED: readonly Range[] = [
  [315, 349],
  [359, 369],
  [374, 399],
];

/** LP3 firmware: one LP3 reported 5515 (2026-11). The range is a guess around it. */
const LP3_VERSIONS: readonly Range[] = [[5500, 5599]];

export interface ModelInfo {
  name: string;
  resolutions: readonly Resolution[];
  /** Takes 1-bit packed images, an eighth of the upload. */
  packed: boolean;
}

/** What the firmware version tells us. Unknown models get every step and 1 byte per pixel. */
export function modelFromVersion(software: number): ModelInfo {
  if (inRanges(software, LP2_VERSIONS)) {
    return { name: 'LP2', resolutions: RESOLUTIONS.slice(0, 3), packed: inRanges(software, LP2_PACKED) };
  }
  if (inRanges(software, LP3_VERSIONS)) {
    // 1K, 2K and 4K per LaserPecker's spec page; 1K is confirmed on a device.
    return { name: 'LP3', resolutions: [RESOLUTIONS[0], RESOLUTIONS[2], RESOLUTIONS[3]], packed: false };
  }
  return { name: 'LaserPecker', resolutions: RESOLUTIONS, packed: false };
}

/** 316 → "3.16"; four-digit builds are shown as they are. */
export function formatFirmware(software: number): string {
  if (software >= 100 && software < 1000) {
    return `${Math.floor(software / 100)}.${String(software % 100).padStart(2, '0')}`;
  }
  return String(software);
}
