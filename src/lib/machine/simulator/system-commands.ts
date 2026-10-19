import type { Vec3 } from '../types';
import { formatSettingValue } from './default-settings';
import { interpretJog, type ModalState, type PlannedMotion } from './gcode-interpreter';

/** Simulator state names as they appear in status reports (without sub-state). */
export type SimulatorStatus = 'Idle' | 'Run' | 'Hold' | 'Jog' | 'Alarm' | 'Door' | 'Check' | 'Home';

export interface SystemCommandHost {
  readonly status: SimulatorStatus;
  readonly settings: Record<number, number>;
  readonly modal: ModalState;
  readonly workOffset: Vec3;
  readonly plannedPosition: Vec3;
  readonly homed: boolean;
  readonly checkMode: boolean;
  readonly rxBufferSize: number;
  readonly plannerBlocks: number;
  sendLine(line: string): void;
  unlock(): void;
  /** Starts homing; the host acknowledges with ok when it completes. */
  startHoming(): void;
  startJog(motion: PlannedMotion): void;
  setCheckMode(enabled: boolean): void;
  /** Soft reset without the realtime byte (used when leaving check mode). */
  reset(): void;
  restoreDefaults(): void;
}

/** 'ok', an error code, or 'deferred' when the host sends the response later ($H). */
export type SystemCommandOutcome = { response: 'ok' | 'deferred' | number; afterAck?: () => void };

export const SIMULATOR_VERSION = '1.1h.20190825';
export const SIMULATOR_WELCOME = "Grbl 1.1h ['$' for help]";

const HELP = '[HLP:$$ $# $G $I $N $x=val $Nx=line $J=line $SLP $C $X $H ~ ! ? ctrl-x]';

function fmt(value: number): string {
  return value.toFixed(3);
}

function idleOrAlarm(host: SystemCommandHost): boolean {
  return host.status === 'Idle' || host.status === 'Alarm' || host.status === 'Check';
}

/** Executes a normalized `$` line (uppercase, no spaces) against the simulator. */
export function executeSystemCommand(line: string, host: SystemCommandHost): SystemCommandOutcome {
  const body = line.slice(1);
  if (body === '') {
    host.sendLine(HELP);
    return { response: 'ok' };
  }
  if (body === '$') {
    for (const n of Object.keys(host.settings)
      .map(Number)
      .sort((a, b) => a - b)) {
      host.sendLine(`$${n}=${formatSettingValue(n, host.settings[n])}`);
    }
    return { response: 'ok' };
  }
  if (body === 'I') {
    host.sendLine(`[VER:${SIMULATOR_VERSION}:]`);
    host.sendLine(`[OPT:V,${host.plannerBlocks},${host.rxBufferSize}]`);
    return { response: 'ok' };
  }
  if (body === 'G') {
    const m = host.modal;
    const coolant = m.flood && m.mist ? 'M7 M8' : m.flood ? 'M8' : m.mist ? 'M7' : 'M9';
    host.sendLine(
      `[GC:G${m.motion} G54 G17 ${m.inches ? 'G20' : 'G21'} ${m.absolute ? 'G90' : 'G91'} G94 ${m.spindle} ${coolant} T0 F${m.feed} S${m.spindleSpeed}]`,
    );
    return { response: 'ok' };
  }
  if (body === '#') {
    const o = host.workOffset;
    for (const name of ['G54', 'G55', 'G56', 'G57', 'G58', 'G59', 'G28', 'G30'])
      host.sendLine(`[${name}:0.000,0.000,0.000]`);
    host.sendLine(`[G92:${fmt(o.x)},${fmt(o.y)},${fmt(o.z)}]`);
    host.sendLine('[TLO:0.000]');
    host.sendLine('[PRB:0.000,0.000,0.000:0]');
    return { response: 'ok' };
  }
  if (body === 'N') {
    host.sendLine('$N0=');
    host.sendLine('$N1=');
    return { response: 'ok' };
  }
  if (body === 'X') {
    if (host.status === 'Alarm') {
      host.sendLine('[MSG:Caution: Unlocked]');
      host.unlock();
    }
    return { response: 'ok' };
  }
  if (body === 'H') {
    if (host.settings[22] !== 1) return { response: 5 };
    if (!idleOrAlarm(host)) return { response: 8 };
    host.startHoming();
    return { response: 'deferred' };
  }
  if (body === 'C') {
    if (!idleOrAlarm(host)) return { response: 8 };
    if (host.checkMode) {
      host.sendLine('[MSG:Disabled]');
      return { response: 'ok', afterAck: () => host.reset() };
    }
    host.setCheckMode(true);
    host.sendLine('[MSG:Enabled]');
    return { response: 'ok' };
  }
  if (body.startsWith('J=')) return jog(body.slice(2), host);
  if (/^RST=[$#*]$/.test(body)) {
    if (!idleOrAlarm(host)) return { response: 8 };
    host.restoreDefaults();
    host.sendLine('[MSG:Restoring defaults]');
    return { response: 'ok' };
  }
  const setting = /^(\d+)=(.*)$/.exec(body);
  if (setting) return writeSetting(Number(setting[1]), setting[2], host);
  return { response: 3 };
}

function jog(body: string, host: SystemCommandHost): SystemCommandOutcome {
  if (host.status === 'Alarm') return { response: 9 };
  if (host.status !== 'Idle' && host.status !== 'Jog') return { response: 8 };
  const result = interpretJog(body, host.modal, host.plannedPosition, host.workOffset);
  if (!result.ok) return { response: result.code };
  if (host.settings[20] === 1 && host.homed) {
    const t = result.motion.target;
    const inside = t.x >= 0 && t.x <= host.settings[130] && t.y >= 0 && t.y <= host.settings[131];
    if (!inside) return { response: 15 };
  }
  host.startJog(result.motion);
  return { response: 'ok' };
}

function writeSetting(n: number, raw: string, host: SystemCommandHost): SystemCommandOutcome {
  if (!(n in host.settings)) return { response: 3 };
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(raw)) return { response: 2 };
  const value = Number.parseFloat(raw);
  if (value < 0) return { response: 4 };
  if (!idleOrAlarm(host)) return { response: 8 };
  host.settings[n] = value;
  return { response: 'ok' };
}
