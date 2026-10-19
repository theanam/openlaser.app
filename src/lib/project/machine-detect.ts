/**
 * Guesses which preset a connected controller is, from the text it sent during the handshake
 * (welcome line, `[VER:version:build info]`, `[OPT:…]`, messages) and the travel it reports in
 * $130/$131. GRBL has no standard model field, so this ranks candidates for the user to confirm.
 */
import { GENERIC_BRAND, MACHINE_PRESETS, presetName, type MachinePreset } from './machine-presets';

export interface MachineFingerprint {
  /** Raw lines received during the handshake. */
  text: string;
  /** $130 / $131, mm. */
  travelX: number | null;
  travelY: number | null;
}

export interface DetectedPreset {
  preset: MachinePreset;
  score: number;
  /** Why it matched, for display ("travel 300 × 200", "build info"). */
  reasons: string[];
}

/** Firmware build strings often abbreviate the brand. */
const BRAND_ALIASES: Record<string, string[]> = {
  'Two Trees': ['twotrees', 'twotree', 'tts'],
  Ortur: ['ortur', 'olm', 'aufero'],
  Sculpfun: ['sculpfun'],
  Atomstack: ['atomstack', 'atom'],
  Creality: ['creality', 'falcon'],
  Longer: ['longer', 'ray5'],
  NEJE: ['neje'],
  ACMER: ['acmer'],
  AlgoLaser: ['algolaser', 'algo'],
  Comgrow: ['comgrow'],
  Wainlux: ['wainlux'],
  'Mr Carve': ['mrcarve'],
  Genmitsu: ['genmitsu', 'sainsmart'],
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Distinctive tokens of a model name: "TS2 10W / 20W" → ["ts2"]. Power ratings are too common to count. */
export function modelTokens(model: string): string[] {
  return model
    .toLowerCase()
    .split(/[\s/()×,]+/)
    .map(squash)
    .filter(
      (t) =>
        t.length >= 2 &&
        /[a-z]/.test(t) &&
        !/^\d+w$/.test(t) &&
        !['pro', 'max', 'le', 'v2', 'laser', 'master', 'ultra'].includes(t),
    );
}

const TRAVEL_EXACT_MM = 3;
const TRAVEL_CLOSE_MM = 15;

export function detectPresets(
  fp: MachineFingerprint,
  presets: readonly MachinePreset[] = MACHINE_PRESETS,
): DetectedPreset[] {
  const text = squash(fp.text);
  const results: DetectedPreset[] = [];
  for (const preset of presets) {
    if (preset.brand === GENERIC_BRAND) continue;
    let score = 0;
    const reasons: string[] = [];
    const aliases = BRAND_ALIASES[preset.brand] ?? [squash(preset.brand)];
    const brandHit = aliases.some((a) => text.includes(a));
    if (brandHit) {
      score += 3;
      reasons.push('brand in firmware info');
    }
    const tokens = modelTokens(preset.model);
    if (tokens.length && tokens.every((t) => text.includes(t))) {
      score += brandHit ? 5 : 2;
      reasons.push('model in firmware info');
    }
    if (fp.travelX !== null && fp.travelY !== null) {
      const dx = Math.abs(fp.travelX - preset.bedWidth);
      const dy = Math.abs(fp.travelY - preset.bedHeight);
      if (dx <= TRAVEL_EXACT_MM && dy <= TRAVEL_EXACT_MM) {
        score += 4;
        reasons.push(`travel ${Math.round(fp.travelX)} × ${Math.round(fp.travelY)} mm`);
      } else if (dx <= TRAVEL_CLOSE_MM && dy <= TRAVEL_CLOSE_MM) {
        score += 1;
        reasons.push('similar travel');
      }
    }
    if (score > 0) results.push({ preset, score, reasons });
  }
  return results.sort(
    (a, b) => b.score - a.score || presetName(a.preset).localeCompare(presetName(b.preset)),
  );
}

/** The single best guess, or null when nothing stands out from the rest. */
export function bestGuess(candidates: DetectedPreset[]): DetectedPreset | null {
  const [first, second] = candidates;
  if (!first || first.score < 4) return null;
  return second && second.score === first.score ? null : first;
}

/** A profile name that came from the generic defaults, which detection may replace. */
export function isGenericProfileName(name: string): boolean {
  return name.startsWith('Generic');
}
