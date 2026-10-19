import { describe, expect, it } from 'vitest';
import { NOTABLE_FEATURES } from '$app/features';
import { TOUR_STEPS } from '$app/tour/steps';

describe('first-run tour', () => {
  it('covers every notable feature', () => {
    const covered = new Set(TOUR_STEPS.flatMap((s) => s.features));
    const missing = NOTABLE_FEATURES.filter((f) => !covered.has(f));
    expect(missing).toEqual([]);
  });

  it('only references known features', () => {
    const known = new Set<string>(NOTABLE_FEATURES);
    expect(TOUR_STEPS.flatMap((s) => s.features).filter((f) => !known.has(f))).toEqual([]);
  });

  it('has unique steps with short copy', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeLessThanOrEqual(40);
      expect(step.body.length).toBeLessThanOrEqual(120);
      for (const p of step.points) expect(p.text.length).toBeLessThanOrEqual(80);
    }
  });

  it('avoids "this, not that" phrasing', () => {
    const text = TOUR_STEPS.flatMap((s) => [s.title, s.body, ...s.points.map((p) => p.text)]).join('\n');
    expect(text).not.toMatch(/,\s*not\s+\w+/i);
    expect(text).not.toMatch(/\binstead of\b/i);
    expect(text).not.toMatch(/\brather than\b/i);
  });

  it('ends with picking a machine', () => {
    expect(TOUR_STEPS.at(-1)?.art).toBe('pick-machine');
  });
});

describe('shortcut registry', () => {
  it('has unique labels, so lists render without duplicate keys', async () => {
    const { LISTED_SHORTCUTS } = await import('$app/shortcuts');
    const labels = LISTED_SHORTCUTS.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
