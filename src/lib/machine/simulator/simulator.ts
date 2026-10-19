import { isRealtimeByte } from '../grbl/realtime';
import type { Unsubscribe, Vec3 } from '../types';
import { defaultModalState } from './gcode-interpreter';
import type { BurnSegment } from './motion';
import { applyOverrideByte, defaultOverrides } from './status';
import { SimulatorCore } from './simulator-core';

export type { GrblSimulatorOptions } from './simulator-core';

/**
 * In-process fake GRBL 1.1 controller (SPEC §8): RX buffer, planner, simulated motion, realtime
 * commands, status reports and fault injection. It records every received byte and every burn.
 */
export class GrblSimulator extends SimulatorCore {
  // ---- inspection for tests -------------------------------------------------------------------

  get burns(): readonly BurnSegment[] {
    return this.planner.burns;
  }

  get position(): Vec3 {
    return this.planner.currentPosition();
  }

  get isPowered(): boolean {
    return this.powered;
  }

  get bytesReceived(): number {
    return this.recorder.length;
  }

  /** Every byte received since construction, realtime bytes included. */
  receivedBytes(): Uint8Array {
    return this.recorder.bytes();
  }

  onOverflow(cb: (event: { byte: number; total: number }) => void): Unsubscribe {
    return this.overflowListeners.add(cb);
  }

  // ---- wiring used by SimulatorTransport ------------------------------------------------------

  onOutput(cb: (bytes: Uint8Array) => void): Unsubscribe {
    return this.output.onData(cb);
  }

  onDisconnect(cb: (reason: string) => void): Unsubscribe {
    return this.disconnectListeners.add(cb);
  }

  powerOn(): void {
    if (this.powered) return;
    this.powered = true;
    this.rx = '';
    this.modal = defaultModalState();
    this.overrides = defaultOverrides();
    this.homed = false;
    this.checkMode = false;
    // GRBL locks at power-up when homing is enabled.
    this.alarm = this.settings[22] === 1 ? { code: null, critical: false } : null;
    if (this.options.bootGarbage) this.output.sendGarbage();
    if (this.options.welcomeOnOpen ?? true) this.sendWelcome();
  }

  powerOff(): void {
    if (!this.powered) return;
    this.powered = false;
    this.planner.abort();
    this.plannedPosition = this.planner.currentPosition();
    this.cancelHoming();
    this.output.reset();
    this.rx = '';
  }

  receive(bytes: Uint8Array): void {
    if (!this.powered) return;
    for (const byte of bytes) {
      this.recorder.push(byte);
      const limit = this.faults.disconnectAfterBytes;
      if (limit !== undefined && this.recorder.length > limit) {
        this.powerOff();
        this.disconnectListeners.emit('Device disconnected (simulated)');
        return;
      }
      if (isRealtimeByte(byte)) {
        this.handleRealtime(byte);
      } else if (this.rx.length >= this.rxBufferSize) {
        this.overflowCount++;
        this.overflowListeners.emit({ byte, total: this.overflowCount });
      } else {
        this.rx += String.fromCharCode(byte);
        if (this.rx.length > this.peakRxBytes) this.peakRxBytes = this.rx.length;
        // GRBL's main loop consumes lines while bytes are still arriving.
        if (byte === 0x0a || byte === 0x0d) this.processRx();
      }
    }
    this.processRx();
  }

  // ---- realtime commands ----------------------------------------------------------------------

  private handleRealtime(byte: number): void {
    switch (byte) {
      case 0x3f:
        this.output.sendLine(this.statusReport());
        return;
      case 0x18:
        this.reset();
        return;
      case 0x21:
        this.feedHold();
        return;
      case 0x7e:
        if (this.alarm || this.homingTimer !== null) return;
        this.door = false;
        this.spindleStopped = false;
        if (this.planner.resume()) this.processRx();
        return;
      case 0x84:
        if (this.alarm || this.homingTimer !== null) return;
        this.door = true;
        this.planner.hold(this.decelerationMs());
        return;
      case 0x85:
        this.jogCancel();
        return;
      case 0x9e:
        if (this.status === 'Hold') this.spindleStopped = !this.spindleStopped;
        return;
      case 0xa0:
        this.modal = { ...this.modal, flood: !this.modal.flood };
        return;
      default: {
        const next = applyOverrideByte(this.overrides, byte);
        if (next) {
          this.overrides = next;
          this.overridesChanged = true;
          this.planner.reprice();
        }
      }
    }
  }

  private feedHold(): void {
    if (this.alarm || this.homingTimer !== null) return;
    // GRBL turns a feed hold during a jog into a jog cancel.
    if (this.planner.jogging) {
      this.jogCancel();
      return;
    }
    this.planner.hold(this.decelerationMs());
  }

  private jogCancel(): void {
    if (!this.planner.jogging) return;
    this.planner.abort();
    this.plannedPosition = this.planner.currentPosition();
    this.processRx();
  }

  /** Time to stop from the current speed at the X acceleration ($120, mm/s²). */
  private decelerationMs(): number {
    const speed = this.planner.currentFeed / 60;
    return (speed / Math.max(this.settings[120], 1)) * 1000;
  }

  /** Soft reset (0x18): stops at once; a reset during motion raises ALARM:3 (homing: ALARM:6). */
  override reset(): void {
    const wasHoming = this.homingTimer !== null;
    const phase = this.planner.state;
    const wasMoving = wasHoming || phase === 'running' || phase === 'decelerating';
    this.planner.abort();
    this.plannedPosition = this.planner.currentPosition();
    this.cancelHoming();
    this.rx = '';
    this.lineOverflowed = false;
    this.modal = defaultModalState();
    this.overrides = defaultOverrides();
    this.spindleStopped = false;
    this.door = false;
    this.checkMode = false;
    if (this.alarm) this.alarm = { ...this.alarm, critical: false };
    if (wasMoving) this.raiseAlarm(wasHoming ? 6 : 3);
    this.sendWelcome();
  }
}
