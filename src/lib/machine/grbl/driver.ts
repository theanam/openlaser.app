import type { MachineProfile } from '../../project/types';
import { CommandError, DisconnectedError, HandshakeError, MachineBusyError, ResetError } from '../errors';
import type { CommandResult, HandshakeResult, MachineDriver, Transport, Unsubscribe, Vec3 } from '../types';
import { continuousJogDelta, type JogDirection } from './continuous-jog';
import { buildJogCommand } from './gcode-format';
import { deriveBedSizeMismatch, deriveLaserModeOff } from './handshake';
import { wireLength } from './line-accounting';
import { initialMachineState } from './machine-state';
import { GrblProtocol } from './protocol';
import { REALTIME_BYTES } from './realtime';
import type { StreamChannel } from './stream-channel';

export type { GrblDriverOptions } from './driver-options';

/** GRBL 1.1 driver (SPEC §7.2). The only component that writes to the transport. */
export class GrblDriver extends GrblProtocol implements MachineDriver {
  private lastHandshake: HandshakeResult | null = null;

  get handshake(): HandshakeResult | null {
    return this.lastHandshake;
  }

  /** True while a job holds the write path. */
  get streaming(): boolean {
    return this.stream !== null;
  }

  // ---- connection ---------------------------------------------------------------------------

  /** Opens the transport and runs the handshake (welcome, `$I`, `$$`), then starts polling. */
  async connect(transport: Transport, profile: MachineProfile): Promise<HandshakeResult> {
    if (this.transport) throw new Error('Already connected; disconnect first');
    this.profile = profile;
    this.store.set({ ...initialMachineState(), connection: 'connecting' });
    this.attachTransport(transport);
    try {
      await transport.open({ baudRate: profile.baudRate });
      this.info(`Port opened at ${profile.baudRate} baud${transport.label ? ` (${transport.label})` : ''}`);
      if (!(await this.waitForWelcome(this.welcomeTimeoutMs))) {
        this.info('No welcome message; sending a soft reset');
        await this.writeBytes(Uint8Array.of(REALTIME_BYTES['soft-reset']));
        if (!(await this.waitForWelcome(this.welcomeTimeoutMs))) {
          throw new HandshakeError(
            `No response from the controller. Check that it is a GRBL device and that the baud rate (${profile.baudRate}) is right.`,
          );
        }
      }
      await this.readIdentity();
      const settings = { ...this.store.get().settings };
      const firmware = this.store.get().firmware ?? { name: 'unknown' as const, version: '' };
      const result: HandshakeResult = {
        firmware,
        rxSize: this.accounting.rxSize,
        settings,
        laserModeOff: deriveLaserModeOff(settings),
        bedSizeMismatch: deriveBedSizeMismatch(settings, profile),
      };
      this.lastHandshake = result;
      this.handshakeDone = true;
      this.patch({ connection: 'connected' });
      this.info(`Connected: ${firmware.name} ${firmware.version}, RX buffer ${result.rxSize} bytes`);
      this.realtime('status');
      this.schedulePoll();
      return result;
    } catch (error) {
      if (this.transport === transport)
        await this.teardown(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * `$I` then `$$`. Some boards reset a second time shortly after the port opens, which
   * discards these commands with a ResetError; one retry covers that.
   */
  private async readIdentity(): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.commandOrThrow('$I');
        await this.commandOrThrow('$$');
        return;
      } catch (error) {
        if (!(error instanceof ResetError) || attempt >= 1) throw error;
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.teardown('Disconnected');
  }

  // ---- commands -----------------------------------------------------------------------------

  /** Queued behind other commands; resolves on ok/error. Rejected while a job runs. */
  sendCommand(line: string): Promise<CommandResult> {
    if (!this.transport || this.store.get().connection !== 'connected')
      return Promise.reject(new DisconnectedError());
    if (this.stream) return Promise.reject(new MachineBusyError());
    return this.enqueueCommand(line);
  }

  private async commandOrThrow(line: string): Promise<void> {
    const result = await this.enqueueCommand(line);
    if (!result.ok) throw new CommandError(result.code, result.message, line);
  }

  private async manualCommandOrThrow(line: string): Promise<void> {
    const result = await this.sendCommand(line);
    if (!result.ok) throw new CommandError(result.code, result.message, line);
  }

  async jog(delta: Partial<Vec3>, feed: number): Promise<void> {
    const command = buildJogCommand(delta, feed);
    // Jogs never fire the laser: if a manual M3/M4 may still be active, switch it off first.
    if (this.laserMaybeOn) await this.manualCommandOrThrow('M5');
    await this.manualCommandOrThrow(command);
  }

  /** Jog toward the end of travel while a button is held; call `cancelJog` on release. */
  async startContinuousJog(direction: JogDirection, feed: number): Promise<void> {
    const fallback = { x: this.profile?.bedWidth ?? 1000, y: this.profile?.bedHeight ?? 1000 };
    const delta = continuousJogDelta(direction, this.store.get(), fallback);
    if (delta.x === undefined && delta.y === undefined) return;
    await this.jog(delta, feed);
  }

  cancelJog(): void {
    this.realtime('jog-cancel');
  }

  async home(): Promise<void> {
    await this.manualCommandOrThrow('$H');
    this.patch({ homed: true });
  }

  /** `$X`; after a critical alarm (hard/soft limit) GRBL needs a reset first. */
  async unlock(): Promise<void> {
    if (this.needsResetToUnlock) await this.softReset('user');
    await this.manualCommandOrThrow('$X');
  }

  async readSettings(): Promise<Record<number, string>> {
    await this.manualCommandOrThrow('$$');
    return { ...this.store.get().settings };
  }

  async writeSetting(n: number, value: string): Promise<void> {
    const trimmed = value.trim();
    if (!Number.isInteger(n) || n < 0 || !/^[-+.\w]+$/.test(trimmed))
      throw new RangeError(`Invalid setting $${n}=${value}`);
    await this.manualCommandOrThrow(`$${n}=${trimmed}`);
    this.patch({ settings: { ...this.store.get().settings, [n]: trimmed } });
  }

  // ---- streaming channel --------------------------------------------------------------------

  /** Exclusive write path for the JobRunner (see StreamChannel). */
  acquireStream(): StreamChannel {
    if (!this.transport || !this.handshakeDone) throw new DisconnectedError();
    if (this.stream) throw new MachineBusyError('Another job already holds the machine');
    const subscriptions: Unsubscribe[] = [];
    const track = (unsubscribe: Unsubscribe) => {
      subscriptions.push(unsubscribe);
      return unsubscribe;
    };
    let released = false;
    const accounting = this.accounting;
    const channel: StreamChannel = {
      state: this.state,
      get rxSize() {
        return accounting.rxSize;
      },
      get inFlightBytes() {
        return accounting.inFlightBytes;
      },
      canWrite: (line) =>
        !released && !!this.transport && !this.awaitingWelcome && accounting.fits(wireLength(line)),
      writeLine: (line, onResponse) => {
        if (released) return Promise.reject(new Error('Stream channel was released'));
        // Lines discarded by a reset are reported through onReset, not per line.
        return this.writeLine(line, {
          line,
          byteLength: wireLength(line),
          settle: onResponse,
          discard: () => undefined,
        });
      },
      realtime: (cmd) => this.realtime(cmd),
      softReset: () => this.softReset('stream'),
      onWritable: (cb) => track(this.writableListeners.add(cb)),
      onStatusReport: (cb) => track(this.statusListeners.add(cb)),
      onAlarm: (cb) => track(this.alarmListeners.add(cb)),
      onReset: (cb) => track(this.resetListeners.add(cb)),
      onDisconnect: (cb) => track(this.disconnectListeners.add(cb)),
      release: () => {
        if (released) return;
        released = true;
        for (const unsubscribe of subscriptions) unsubscribe();
        if (this.stream === channel) this.stream = null;
        this.schedulePoll();
        this.pumpCommands();
      },
    };
    this.stream = channel;
    this.schedulePoll();
    return channel;
  }
}
