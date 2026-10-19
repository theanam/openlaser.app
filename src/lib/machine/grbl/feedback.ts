import type { MachineState } from '../types';
import { parseOptionsFeedback, parseVersionFeedback } from './line-classifier';

export interface FeedbackEffect {
  firmware?: NonNullable<MachineState['firmware']>;
  rxSize?: number;
  /** "[MSG:Reset to continue]": GRBL ignores everything but a reset. */
  needsResetToUnlock?: boolean;
}

/** What a `[TAG:content]` feedback line tells the driver about the controller. */
export function interpretFeedback(
  tag: string,
  content: string,
  firmware: MachineState['firmware'],
): FeedbackEffect {
  if (tag === 'VER') {
    const version = parseVersionFeedback(content);
    const name = /FluidNC/i.test(content) ? 'fluidnc' : (firmware?.name ?? 'grbl');
    return version ? { firmware: { name, version } } : {};
  }
  if (tag === 'OPT') {
    const { rxSize } = parseOptionsFeedback(content);
    return rxSize ? { rxSize } : {};
  }
  if (tag === 'FIRMWARE' && /grblHAL/i.test(content)) {
    return { firmware: { name: 'grblHAL', version: firmware?.version ?? '' } };
  }
  if (tag === 'MSG' && /Reset to continue/i.test(content)) return { needsResetToUnlock: true };
  return {};
}
