import type { MachineState, Vec3 } from '../types';
import { numericSetting } from './settings-info';

export type JogDirection = Partial<Record<'x' | 'y', -1 | 1>>;

const SETTING_FOR_AXIS = { x: 130, y: 131 } as const;

/**
 * Distance for a "button held" jog: far enough to reach the end of travel, after which the
 * release sends a jog cancel. When homed, the jog stops at the soft limit derived from
 * $130/$131. GRBL machine space is either [0, travel] or [-travel, 0] depending on homing
 * configuration; we infer which from the sign of the current machine position.
 */
export function continuousJogDelta(
  direction: JogDirection,
  state: MachineState,
  fallbackTravel: { x: number; y: number },
): Partial<Vec3> {
  const delta: Partial<Vec3> = {};
  for (const axis of ['x', 'y'] as const) {
    const sign = direction[axis];
    if (!sign) continue;
    const travel = numericSetting(state.settings, SETTING_FOR_AXIS[axis]) ?? fallbackTravel[axis];
    const position = state.mpos?.[axis];
    let distance = travel;
    if (state.homed && position !== undefined) {
      const negativeSpace = position < -0.001;
      const min = negativeSpace ? -travel : 0;
      const max = negativeSpace ? 0 : travel;
      distance = sign > 0 ? max - position : position - min;
    }
    // Round down to the jog precision so we never ask for a target past the limit.
    distance = Math.floor(distance * 1000) / 1000;
    if (distance >= 0.001) delta[axis] = sign * distance;
  }
  return delta;
}
