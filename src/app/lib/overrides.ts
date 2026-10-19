/** GRBL overrides move in ±10 % and ±1 % steps. This plans the bytes to reach a target. */
import type { RealtimeCommand } from '$lib/machine';

export type OverrideAxis = 'feed' | 'spindle';

export const OVERRIDE_MIN = 10;
export const OVERRIDE_MAX = 200;

export function overrideSteps(axis: OverrideAxis, current: number, target: number): RealtimeCommand[] {
  const goal = Math.min(OVERRIDE_MAX, Math.max(OVERRIDE_MIN, Math.round(target)));
  if (goal === 100) return current === 100 ? [] : [`${axis}-100`];
  const steps: RealtimeCommand[] = [];
  let value = current;
  // Starting from 100 can be shorter than stepping from far away.
  if (Math.abs(goal - 100) + 1 < Math.abs(goal - current)) {
    steps.push(`${axis}-100`);
    value = 100;
  }
  while (Math.abs(goal - value) >= 10) {
    const up = goal > value;
    steps.push(`${axis}${up ? '+' : '-'}10` as RealtimeCommand);
    value += up ? 10 : -10;
  }
  while (value !== goal) {
    const up = goal > value;
    steps.push(`${axis}${up ? '+' : '-'}1` as RealtimeCommand);
    value += up ? 1 : -1;
  }
  return steps;
}
