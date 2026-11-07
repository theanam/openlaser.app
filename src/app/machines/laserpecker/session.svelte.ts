/**
 * The LaserPecker session for the UI: connection, burn settings, framing and jobs. All device I/O
 * goes through `LaserPeckerConnection`. Safety follows docs/decisions.md: Stop sends the device's
 * stop at any time, nothing starts or resumes on its own, and framing runs at the lowest power.
 */
import {
  WebBluetoothTransport,
  WebSerialTransport,
  type ConsoleEntry,
  type Transport,
} from 'libopenlaser/machine';
import {
  DEFAULT_RESOLUTION,
  LASERPECKER_BAUD,
  LaserPeckerConnection,
  VirtualLaserPecker,
  formatFirmware,
  resolutionByPx,
  type LaserPeckerState,
  type PreviewRect,
  type Resolution,
} from 'libopenlaser/machine';
import type { LaserPeckerPayload } from 'libopenlaser/cam';
import { confirm } from '$lib/ui/confirm.svelte';
import { errorMessage, reportError } from '$lib/ui/errors';
import { toast } from '$lib/ui/toasts.svelte';
import { encodeInWorker } from '../../lib/cam-client';
import type { JobSummary } from '../../lib/job-summary';
import { editor } from '../../state/editor.svelte';
import { appendCapped, JobWakeLock } from '../../state/machine-support';
import type { SafetyChoice, SafetyRequest } from '../../state/machine.svelte';
import { profiles } from '../../state/profiles.svelte';
import { ui } from '../../state/ui.svelte';
import type { MachineSession } from '../types';

export type LaserPeckerLinkKind = 'bluetooth' | 'usb' | 'virtual';

const LOG_LIMIT = 300;

const IDLE_STATE: LaserPeckerState = {
  connection: 'disconnected',
  version: null,
  model: null,
  status: null,
  activity: 'idle',
  uploaded: 0,
  uploadTotal: 0,
  progress: 0,
};

const rectKey = (r: PreviewRect | null) =>
  r ? [r.x, r.y, r.width, r.height].map((v) => v.toFixed(2)).join(',') : 'none';

class LaserPeckerSession implements MachineSession {
  state = $state.raw<LaserPeckerState>(IDLE_STATE);
  link = $state<LaserPeckerLinkKind | null>(null);
  label = $state<string | null>(null);
  connecting = $state(false);
  canStop = $state(false);
  /** kHz for infrared lasers; 0 leaves it to the laser. */
  frequency = $state(0);
  px = $state(DEFAULT_RESOLUTION.px);
  safetyRequest = $state.raw<SafetyRequest | null>(null);
  log = $state.raw<string[]>([]);
  private connection: LaserPeckerConnection | null = null;
  private offs: Array<() => void> = [];
  private wakeLock = new JobWakeLock();
  private safetyConfirmed = false;
  private frameConfirmed = false;
  private framedKey: string | null = null;

  get connected(): boolean {
    return this.state.connection === 'connected';
  }

  get resolutions(): readonly Resolution[] {
    return this.state.model?.resolutions ?? [DEFAULT_RESOLUTION];
  }

  get resolution(): Resolution {
    const r = resolutionByPx(this.px);
    return this.resolutions.includes(r) ? r : this.resolutions[0];
  }

  get jobActive(): boolean {
    const a = this.state.activity;
    return a === 'uploading' || a === 'engraving' || a === 'paused';
  }

  get firmware(): string | null {
    const v = this.state.version;
    if (!v) return null;
    // Firmware ranges are known for the LP2 only; the Bluetooth name says which model the rest are.
    const named = /^LP\d/.exec(this.label ?? '')?.[0];
    const model = this.state.model?.name === 'LaserPecker' && named ? named : this.state.model?.name;
    return `${model ?? 'LaserPecker'} ${formatFirmware(v.software)}`;
  }

  /** The profile has an infrared (fiber) laser, which takes a pulse frequency. */
  get infrared(): boolean {
    return (profiles.active.laserSources ?? []).some((s) => s.deviceCode === 1);
  }

  // ------------------------------------------------------------ connection

  async connect(kind: string): Promise<void> {
    if (this.connected || this.connecting) return;
    let transport: Transport;
    try {
      transport =
        kind === 'virtual'
          ? new VirtualLaserPecker()
          : kind === 'bluetooth'
            ? await WebBluetoothTransport.request()
            : await WebSerialTransport.request();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        toast.info('No laser chosen.', {
          action: { label: 'Laser not showing up?', run: () => (ui.connectHelpOpen = true) },
        });
        return;
      }
      toast.error(`Could not open the laser: ${errorMessage(error)}`);
      return;
    }
    await this.connectTransport(kind, transport);
  }

  async connectTransport(kind: string, transport: Transport): Promise<void> {
    if (this.connected || this.connecting) return;
    this.connecting = true;
    try {
      const connection = await LaserPeckerConnection.open(transport, {
        baudRate: profiles.active.baudRate || LASERPECKER_BAUD,
      });
      this.connection = connection;
      this.offs = [
        connection.device.subscribe((s) => {
          this.state = s;
          this.canStop = connection.canStop;
        }),
        connection.onConsole((entry) => this.addLog(entry)),
        connection.onLost((reason) => this.onLost(reason)),
      ];
      this.link = kind as LaserPeckerLinkKind;
      this.label = transport.label ?? null;
      toast.success(`Connected to ${this.firmware ?? 'LaserPecker'}`);
    } catch (error) {
      toast.error(`Could not connect: ${errorMessage(error)}`);
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.jobActive) {
      const ok = await confirm({
        title: 'Disconnect during a job?',
        message: 'The job stops and the laser halts.',
        confirmLabel: 'Stop and disconnect',
        tone: 'danger',
      });
      if (!ok) return;
    }
    if (this.canStop) await this.stop();
    const connection = this.connection;
    this.detach();
    await connection?.disconnect().catch((error: unknown) => reportError(error, 'Disconnect'));
  }

  private detach(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.connection = null;
    this.link = null;
    this.label = null;
    this.state = IDLE_STATE;
    this.canStop = false;
    void this.wakeLock.release();
  }

  private onLost(reason: string): void {
    toast.error(`The laser disconnected: ${reason}`, { duration: 0 });
    this.detach();
  }

  private addLog(entry: ConsoleEntry): void {
    const arrow = entry.direction === 'sent' ? '→' : entry.kind === 'command' ? '←' : '⇠';
    this.log = appendCapped(this.log, [`${arrow} ${entry.text}`], LOG_LIMIT);
  }

  // ------------------------------------------------------------ jobs

  private async compile(): Promise<{ payload: LaserPeckerPayload | null; blocking: string[] } | null> {
    const project = editor.project;
    if (!project) {
      toast.info('Open a project first.');
      return null;
    }
    try {
      const r = this.resolution;
      const { payload, warnings } = await encodeInWorker('laserpecker', {
        project,
        profile: profiles.active,
        options: { dpi: r.dpi, px: r.px, packed: this.state.model?.packed ?? false },
      });
      return { payload, blocking: warnings.filter((w) => w.blocking).map((w) => w.message) };
    } catch (error) {
      toast.error(`The job could not be compiled: ${errorMessage(error)}`);
      return null;
    }
  }

  private ready(): LaserPeckerConnection | null {
    const connection = this.connection;
    if (!connection || !this.connected) {
      toast.error('Connect the laser first.');
      return null;
    }
    if (this.state.activity !== 'idle') {
      toast.error('The laser is busy.');
      return null;
    }
    return connection;
  }

  /** Traces the job outline with the beam at its lowest power until stopped. */
  async frame(): Promise<void> {
    const connection = this.ready();
    if (!connection) return;
    if (!this.frameConfirmed) {
      const ok = await confirm({
        title: 'Frame with the laser on?',
        message: 'The beam traces the outline at its lowest power. Wear your laser glasses.',
        confirmLabel: 'Frame',
      });
      if (!ok) return;
      this.frameConfirmed = true;
    }
    const job = await this.compile();
    if (!job) return;
    if (!job.payload) {
      toast.warning('Nothing to frame yet.');
      return;
    }
    const rect = job.payload.frame;
    // Resolves when the frame ends; Stop framing or Stop ends it.
    connection
      .frame({ rect, px: this.resolution.px })
      .catch((error: unknown) => toast.error(errorMessage(error)));
    this.framedKey = rectKey(rect);
  }

  async stopFrame(): Promise<void> {
    await this.connection?.stopFrame().catch((error: unknown) => reportError(error, 'Frame'));
  }

  async startJob(): Promise<void> {
    const connection = this.ready();
    if (!connection) return;
    const status = this.state.status;
    // Code 1 shows right after power-up and does not stop jobs; anything else needs attention.
    if (status?.mode === 'error' && status.errorCode !== 1) {
      toast.error('The laser reports an error. Check it, then try again.');
      return;
    }
    const job = await this.compile();
    if (!job) return;
    const payload = job.payload;
    if (!payload) {
      toast.warning('The job is empty. Turn on output for a layer with objects.');
      return;
    }
    if (job.blocking.length) {
      const ok = await confirm({
        title: 'Start with warnings?',
        message: job.blocking.map((m) => `• ${m}`).join('\n'),
        confirmLabel: 'Start anyway',
        tone: 'danger',
      });
      if (!ok) return;
    }
    const summary: JobSummary = {
      name: editor.project?.name ?? 'Job',
      width: payload.frame.width,
      height: payload.frame.height,
      estimatedSeconds: null,
      maxPower: Math.max(...payload.parts.map((p) => p.power)),
      layers: payload.layers,
      lines: 0,
    };
    const choice = await new Promise<SafetyChoice>((resolve) => {
      this.safetyRequest = {
        summary,
        firstThisSession: !this.safetyConfirmed,
        framed: this.framedKey === rectKey(payload.frame),
        resolve,
      };
    });
    this.safetyRequest = null;
    if (choice === 'frame') {
      await this.frame();
      return;
    }
    if (choice !== 'start' || !this.connected) return;
    this.safetyConfirmed = true;
    await this.wakeLock.acquire();
    try {
      // One part per burn setting, each with its layers' power, depth and passes.
      const result = await connection.run({
        accessory: payload.accessory,
        parts: payload.parts.map((part) => ({
          file: { id: part.file.id, data: part.file.data },
          settings: {
            power: part.power,
            depth: part.depth,
            frequency: part.laserType === 1 ? this.frequency : 0,
            passes: part.passes,
            x: part.file.x,
            y: part.file.y,
            laserType: part.laserType,
            objectDiameter: payload.objectDiameter,
          },
        })),
      });
      if (result.outcome === 'completed') toast.success('Job complete');
      else if (result.outcome === 'aborted') toast.info('Job stopped');
      else toast.error(`Job failed: ${result.reason}`, { duration: 0 });
    } finally {
      await this.wakeLock.release();
    }
  }

  pause(): void {
    void this.connection?.pause().catch((error: unknown) => reportError(error, 'Pause'));
  }

  resume(): void {
    void this.connection?.resume().catch((error: unknown) => reportError(error, 'Resume'));
  }

  /** Stop: no confirmation, it must be instant (SPEC §9.6, §11). */
  async stop(): Promise<void> {
    await this.connection?.stop().catch((error: unknown) => reportError(error, 'Stop'));
  }

  /** beforeunload during a job: pause while the browser asks to leave. */
  pauseForUnload(): void {
    if (this.state.activity === 'engraving') this.pause();
  }

  async onVisibilityChange(): Promise<void> {
    await this.wakeLock.onVisibilityChange();
  }
}

export const laserpecker = new LaserPeckerSession();

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => void laserpecker.onVisibilityChange());
}
