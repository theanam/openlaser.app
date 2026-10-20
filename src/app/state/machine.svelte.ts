/**
 * Machine connection and job control for the UI. All machine I/O goes through the driver and the
 * job runner (SPEC §3 rule 4). Safety checks before a job follow SPEC §11.
 */
import {
  GrblDriver,
  GrblSimulator,
  JobRunner,
  SimulatorTransport,
  WebSerialTransport,
  buildFrameGcode,
  describeAlarm,
  isManualLaserOnCommand,
  numericSetting,
  BED_SIZE_TOLERANCE_MM,
  type ConsoleEntry,
  type HandshakeResult,
  type JogDirection,
  type JobOutcome,
  type JobProgress,
  type MachineState,
  type RealtimeCommand,
  type Transport,
} from '$lib/machine';
import type { MachineLimits } from '$lib/cam/types';
import type { Vec2 } from '$lib/geometry/types';
import { confirm } from '$lib/ui/confirm.svelte';
import { errorMessage, reportError } from '$lib/ui/errors';
import { toast } from '$lib/ui/toasts.svelte';
import { ui } from './ui.svelte';
import { setJobSettings } from '$lib/project/operations';
import { editor } from './editor.svelte';
import { boundsKey, jobSummary, type JobSummary } from '../lib/job-summary';
import { defaultMachineProfile } from '$lib/project/factory';
import {
  bestGuess,
  detectPresets,
  isGenericProfileName,
  type DetectedPreset,
} from '$lib/project/machine-detect';
import { presetName, presetProfileFields, type MachinePreset } from '$lib/project/machine-presets';
import { appendCapped, ConsoleBatcher, JobWakeLock } from './machine-support';
import { preferences } from './preferences.svelte';
import { preview } from './preview.svelte';
import { profiles } from './profiles.svelte';

const CONSOLE_UI_LIMIT = 2000;

/** Statuses where the machine is moving or paused mid-motion. */
const MOVING_STATES = new Set<MachineState['status']>(['Run', 'Jog', 'Home', 'Hold', 'Door', 'Check']);

const IDLE_STATE: MachineState = {
  connection: 'disconnected',
  firmware: null,
  status: 'Unknown',
  subState: null,
  mpos: null,
  wpos: null,
  wco: null,
  feed: 0,
  spindle: 0,
  overrides: { feed: 100, rapid: 100, spindle: 100 },
  buffer: null,
  alarm: null,
  lastError: null,
  settings: {},
  homed: false,
};

const IDLE_PROGRESS: JobProgress = {
  phase: 'idle',
  kind: 'job',
  total: 0,
  sent: 0,
  acked: 0,
  elapsedMs: 0,
  remainingMs: null,
  error: null,
  failureReason: null,
};

export type ConnectionKind = 'webserial' | 'simulator';

export type SafetyChoice = 'start' | 'frame' | 'cancel';

export interface SafetyRequest {
  summary: JobSummary;
  /** The first job of the session asks for each hazard to be confirmed. */
  firstThisSession: boolean;
  /** The job outline was traced since it last changed. */
  framed: boolean;
  resolve: (choice: SafetyChoice) => void;
}

export interface DetectRequest {
  candidates: DetectedPreset[];
  best: DetectedPreset | null;
  travelX: number | null;
  travelY: number | null;
  /** Raw handshake text, shown so users can see what the controller said. */
  info: string;
  resolve: (preset: MachinePreset | null) => void;
}

const DISMISSED_KEY = 'openlaser.detect.dismissed';

function dismissedFingerprints(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function rememberDismissed(fingerprint: string): void {
  try {
    const all = [...dismissedFingerprints(), fingerprint].slice(-20);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable: the question may come up again next time.
  }
}

class MachineController {
  state = $state.raw<MachineState>(IDLE_STATE);
  progress = $state.raw<JobProgress>(IDLE_PROGRESS);
  consoleEntries = $state.raw<ConsoleEntry[]>([]);
  handshake = $state.raw<HandshakeResult | null>(null);
  transportKind = $state<ConnectionKind | null>(null);
  transportLabel = $state<string | null>(null);
  connecting = $state(false);
  jogStep = $state(10);
  /** Pending "which machine is this?" question after connecting. */
  detectRequest = $state.raw<DetectRequest | null>(null);
  /** Pending pre-flight question before a job starts. */
  safetyRequest = $state.raw<SafetyRequest | null>(null);
  /** A frame (single or looping) is in progress. */
  framing = $state(false);
  /** Keep tracing the outline until stopped. */
  frameLoop = $state(false);
  /** The Frame button repeats until stopped (the toggle next to it). */
  frameRepeat = $state(false);
  framePass = $state(0);
  /** Bounds of the last completed frame, to tell whether this job was framed. */
  private framedKey: string | null = null;

  driver: GrblDriver | null = null;
  runner: JobRunner | null = null;
  private unsubscribers: Array<() => void> = [];
  private consoleBatch = new ConsoleBatcher(
    (more) => (this.consoleEntries = appendCapped(this.consoleEntries, more, CONSOLE_UI_LIMIT)),
  );
  private wakeLock = new JobWakeLock();
  private safetyConfirmed = false;
  private manualLaserWarned = false;

  get connected(): boolean {
    return this.state.connection === 'connected';
  }

  get jobActive(): boolean {
    const p = this.progress.phase;
    return p === 'running' || p === 'paused' || p === 'error-hold' || p === 'stopping';
  }

  /** Work position in bed space. */
  get position(): Vec2 | null {
    const p = this.state.wpos ?? this.state.mpos;
    return p ? { x: p.x, y: p.y } : null;
  }

  get headPosition(): Vec2 | null {
    return this.connected ? this.position : null;
  }

  get limits(): MachineLimits | undefined {
    const s = this.state.settings;
    if (!Object.keys(s).length) return undefined;
    const pick = (n: number) => numericSetting(s, n) ?? undefined;
    return { maxRateX: pick(110), maxRateY: pick(111), accelX: pick(120), accelY: pick(121) };
  }

  // ------------------------------------------------------------ connection

  async connect(kind: ConnectionKind, transport?: Transport): Promise<void> {
    if (this.connected || this.connecting) return;
    let t = transport;
    try {
      if (!t) {
        if (kind === 'simulator') {
          const profile = profiles.active;
          t = new SimulatorTransport(
            new GrblSimulator({
              settings: { 130: profile.bedWidth, 131: profile.bedHeight, 30: profile.maxS },
            }),
          );
        } else {
          t = await WebSerialTransport.request();
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        // Picker closed: often because the laser was missing from it.
        toast.info('No port chosen.', {
          action: { label: 'Laser not showing up?', run: () => (ui.connectHelpOpen = true) },
        });
        return;
      }
      toast.error(`Could not open the port: ${errorMessage(error)}`);
      return;
    }

    this.connecting = true;
    const driver = new GrblDriver({ statusPollMs: preferences.value.statusPollMs });
    this.attach(driver);
    try {
      const handshake = await driver.connect(t, profiles.active);
      this.driver = driver;
      this.runner = new JobRunner(driver);
      this.unsubscribers.push(this.runner.progress.subscribe((p) => (this.progress = p)));
      this.unsubscribers.push(this.runner.onEvent((e) => this.onJobEvent(e)));
      this.handshake = handshake;
      this.transportKind = kind;
      this.transportLabel = kind === 'simulator' ? 'Virtual machine' : (t.label ?? 'USB serial');
      await this.afterHandshake(handshake);
    } catch (error) {
      this.detach();
      await driver.disconnect().catch(() => undefined);
      toast.error(`Could not connect: ${errorMessage(error)}`);
    } finally {
      this.connecting = false;
    }
  }

  /** Reconnects to a port granted earlier, without the picker. */
  async reconnect(): Promise<void> {
    const [port] = await WebSerialTransport.grantedPorts();
    if (port) await this.connect('webserial', port);
    else await this.connect('webserial');
  }

  async hasGrantedPort(): Promise<boolean> {
    return (await WebSerialTransport.grantedPorts()).length > 0;
  }

  private attach(driver: GrblDriver): void {
    this.unsubscribers.push(driver.state.subscribe((s) => this.onState(s)));
    this.unsubscribers.push(driver.onConsole((entry) => this.queueConsole(entry)));
  }

  private detach(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    this.driver = null;
    this.runner = null;
    this.handshake = null;
    this.transportKind = null;
    this.transportLabel = null;
    this.state = IDLE_STATE;
    this.progress = IDLE_PROGRESS;
    void this.wakeLock.release();
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
      await this.stop();
    }
    const driver = this.driver;
    this.detach();
    await driver?.disconnect().catch((error: unknown) => reportError(error, 'Disconnect'));
  }

  private onState(s: MachineState): void {
    const wasConnected = this.state.connection === 'connected';
    this.state = s;
    if (wasConnected && s.connection === 'disconnected' && this.driver) {
      toast.error('The machine disconnected.');
      this.detach();
    }
  }

  private async afterHandshake(h: HandshakeResult): Promise<void> {
    toast.success(
      `Connected to ${h.firmware.name === 'grbl' ? 'GRBL' : h.firmware.name} ${h.firmware.version}`,
    );
    const travelX = numericSetting(h.settings, 130);
    const travelY = numericSetting(h.settings, 131);
    const identified = await this.identifyMachine(travelX, travelY);
    const profile = profiles.active;
    const maxS = numericSetting(h.settings, 30);
    if (maxS && maxS !== profile.maxS) await profiles.save({ ...profiles.active, maxS });
    const mismatch =
      travelX !== null &&
      travelY !== null &&
      (Math.abs(travelX - profile.bedWidth) > BED_SIZE_TOLERANCE_MM ||
        Math.abs(travelY - profile.bedHeight) > BED_SIZE_TOLERANCE_MM);
    if (mismatch && !identified) {
      const ok = await confirm({
        title: 'Update the bed size?',
        message: `The machine reports ${travelX} × ${travelY} mm of travel. Your profile says ${profile.bedWidth} × ${profile.bedHeight} mm.`,
        confirmLabel: 'Use machine size',
        cancelLabel: 'Keep profile',
      });
      if (ok) await profiles.save({ ...profiles.active, bedWidth: travelX, bedHeight: travelY });
    }
    if (h.laserModeOff && profiles.active.laserModeRequired) {
      toast.warning('Laser mode is off ($32=0). The laser stays on during travel moves.', {
        duration: 0,
        action: { label: 'Enable $32=1', run: () => void this.enableLaserMode() },
      });
    }
  }

  /** Text the controller sent while connecting: welcome line, [VER:…] build info, [OPT:…], messages. */
  private handshakeText(): string {
    const entries = this.driver?.console.entries() ?? [];
    return entries
      .filter(
        (e) =>
          e.direction === 'received' &&
          (e.kind === 'welcome' || e.kind === 'feedback' || e.kind === 'unknown'),
      )
      .map((e) => e.text)
      .join('\n');
  }

  /**
   * Asks which machine this is when the profile is generic, or when the controller looks like a
   * different preset. Returns true when the user picked a machine (its size is then settled).
   */
  private async identifyMachine(travelX: number | null, travelY: number | null): Promise<boolean> {
    if (this.transportKind === 'simulator') return false;
    const info = this.handshakeText();
    const candidates = detectPresets({ text: info, travelX, travelY });
    const best = bestGuess(candidates);
    const active = profiles.active;
    const generic = isGenericProfileName(active.name);
    if (!generic && (!best || presetName(best.preset) === active.name)) return false;
    const fingerprint = `${active.id}|${travelX}|${travelY}|${info.length}`;
    if (!generic && dismissedFingerprints().has(fingerprint)) return false;

    const chosen = await new Promise<MachinePreset | null>((resolve) => {
      this.detectRequest = { candidates, best, travelX, travelY, info, resolve };
    });
    this.detectRequest = null;
    if (!chosen) {
      rememberDismissed(fingerprint);
      return false;
    }
    const name = presetName(chosen);
    const existing = profiles.list.find((p) => p.name === name);
    // The controller's own travel is the truth for soft limits; the preset fills the rest.
    const size = travelX && travelY ? { bedWidth: travelX, bedHeight: travelY } : {};
    if (existing) {
      await profiles.save({ ...existing, ...size });
      await profiles.activate(existing.id);
    } else {
      const profile = defaultMachineProfile({ ...presetProfileFields(chosen), ...size });
      await profiles.save(profile);
      await profiles.activate(profile.id);
    }
    toast.success(`Machine set to ${name}`);
    return true;
  }

  async enableLaserMode(): Promise<boolean> {
    const ok = await confirm({
      title: 'Enable laser mode?',
      message:
        'This writes $32=1 to the controller. In laser mode GRBL turns the laser off during travel moves and keeps motion smooth through power changes.',
      confirmLabel: 'Enable laser mode',
    });
    if (!ok || !this.driver) return false;
    try {
      await this.driver.writeSetting(32, '1');
      toast.success('Laser mode enabled');
      return true;
    } catch (error) {
      toast.error(`Could not enable laser mode: ${errorMessage(error)}`);
      return false;
    }
  }

  // ------------------------------------------------------------ console

  private queueConsole(entry: ConsoleEntry): void {
    // Batched: status reports arrive every 100–200 ms.
    this.consoleBatch.push(entry);
  }

  clearConsole(): void {
    this.driver?.console.clear();
    this.consoleEntries = [];
  }

  async sendManual(line: string): Promise<void> {
    const driver = this.driver;
    if (!driver) return;
    if (!this.manualLaserWarned && isManualLaserOnCommand(line, this.state.spindle)) {
      const ok = await confirm({
        title: 'Turn the laser on?',
        message: `"${line}" fires the laser. Wear eye protection and keep the beam on the material.`,
        confirmLabel: 'Send',
        tone: 'danger',
      });
      if (!ok) return;
      this.manualLaserWarned = true;
    }
    try {
      const result = await driver.sendCommand(line);
      if (!result.ok) toast.error(`${line}: ${result.message}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  // ------------------------------------------------------------ motion

  private guard(): GrblDriver | null {
    if (!this.driver || this.jobActive) return null;
    return this.driver;
  }

  async jog(dx: number, dy: number): Promise<void> {
    const driver = this.guard();
    if (!driver) return;
    try {
      await driver.jog({ x: dx, y: dy }, profiles.active.defaultJogSpeed);
    } catch (error) {
      toast.error(`Jog failed: ${errorMessage(error)}`);
    }
  }

  startContinuousJog(dx: number, dy: number): void {
    const driver = this.guard();
    if (!driver) return;
    const direction: JogDirection = {};
    if (dx) direction.x = dx > 0 ? 1 : -1;
    if (dy) direction.y = dy > 0 ? 1 : -1;
    driver
      .startContinuousJog(direction, profiles.active.defaultJogSpeed)
      .catch((error: unknown) => toast.error(`Jog failed: ${errorMessage(error)}`));
  }

  cancelJog(): void {
    this.driver?.cancelJog();
  }

  async home(): Promise<void> {
    const driver = this.guard();
    if (!driver) return;
    try {
      await driver.home();
    } catch (error) {
      toast.error(`Homing failed: ${errorMessage(error)}`);
    }
  }

  async unlock(): Promise<void> {
    if (!this.driver) return;
    try {
      await this.driver.unlock();
    } catch (error) {
      toast.error(`Unlock failed: ${errorMessage(error)}`);
    }
  }

  /** Sets the project's user origin to the current head position. */
  setUserOriginHere(): void {
    const position = this.position;
    if (!position || !editor.project) return;
    editor.commit((p) => setJobSettings(p, { origin: 'user-origin', userOrigin: position }));
    toast.success(`Origin set to ${position.x.toFixed(1)}, ${position.y.toFixed(1)}`);
  }

  /** Moves to the user origin (or 0,0) with the laser off. */
  async goToOrigin(): Promise<void> {
    const driver = this.guard();
    if (!driver) return;
    const target =
      editor.project?.jobSettings.origin === 'user-origin'
        ? (editor.project.jobSettings.userOrigin ?? { x: 0, y: 0 })
        : { x: 0, y: 0 };
    const feed = profiles.active.defaultJogSpeed;
    await this.sendManual(`$J=G90 G21 X${target.x.toFixed(3)} Y${target.y.toFixed(3)} F${Math.round(feed)}`);
  }

  realtime(cmd: RealtimeCommand): void {
    this.driver?.realtime(cmd);
  }

  // ------------------------------------------------------------ jobs

  private async preflight(): Promise<boolean> {
    if (!this.driver || !this.runner) {
      toast.error('Connect a machine first.');
      return false;
    }
    if (this.state.alarm) {
      toast.error(
        `The machine is in alarm: ${describeAlarm(this.state.alarm.code).name}. Unlock or home it first.`,
      );
      return false;
    }
    if (this.state.status !== 'Idle') {
      toast.error(`The machine is ${this.state.status}. Wait until it is Idle.`);
      return false;
    }
    return true;
  }

  /**
   * Traces the job outline. With `loop`, it keeps tracing until Stop (or "Stop framing"), so you can
   * walk to the machine and line things up. Each pass is its own mini-job through the runner, so
   * Stop behaves exactly as during a job.
   */
  async frame(options: { loop?: boolean } = {}): Promise<void> {
    if (this.framing) return;
    if (!(await this.preflight())) return;
    const job = await preview.ensure();
    const bounds = job?.bounds ?? null;
    if (!bounds) {
      toast.warning('Nothing to frame yet.');
      return;
    }
    this.framing = true;
    this.frameLoop = options.loop ?? false;
    this.framePass = 0;
    try {
      do {
        this.framePass++;
        const outcome = await this.run(buildFrameGcode(bounds, profiles.active), 'frame');
        if (outcome !== 'completed') break;
        this.framedKey = boundsKey(bounds);
        // The machine reports Idle a moment after the last move; wait for it before the next pass.
        if (this.frameLoop) await this.waitForIdle();
      } while (this.frameLoop && this.connected && !this.state.alarm);
    } finally {
      this.framing = false;
      this.frameLoop = false;
    }
  }

  /** Ends a framing loop after the current pass. Stop halts it at once. */
  stopFramingLoop(): void {
    this.frameLoop = false;
  }

  private async waitForIdle(timeoutMs = 3000): Promise<void> {
    const start = Date.now();
    while (this.connected && this.state.status !== 'Idle' && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async startJob(): Promise<void> {
    if (!(await this.preflight())) return;
    const job = await preview.ensure();
    if (!job) {
      toast.error(preview.error ?? 'The job could not be compiled.');
      return;
    }
    if (job.lines.length === 0) {
      toast.warning('The job is empty. Turn on output for a layer with objects.');
      return;
    }
    const blocking = job.warnings.filter((w) => w.blocking);
    if (blocking.length) {
      const ok = await confirm({
        title: 'Start with warnings?',
        message: blocking.map((w) => `• ${w.message}`).join('\n'),
        confirmLabel: 'Start anyway',
        tone: 'danger',
      });
      if (!ok) return;
    }
    const origin = editor.project?.jobSettings.origin;
    if (origin === 'user-origin' && !editor.project?.jobSettings.userOrigin) {
      toast.error('Set a user origin first.');
      return;
    }
    if (
      (origin === 'absolute' || editor.gcode) &&
      !this.state.homed &&
      numericSetting(this.state.settings, 22) === 1
    ) {
      const ok = await confirm({
        title: 'Machine not homed',
        message: 'Absolute positions assume a homed machine. Start anyway?',
        confirmLabel: 'Start anyway',
      });
      if (!ok) return;
    }
    if (
      profiles.active.laserModeRequired &&
      this.state.settings[32] !== undefined &&
      this.state.settings[32] !== '1'
    ) {
      const fixed = await this.enableLaserMode();
      if (!fixed) {
        toast.warning('Without laser mode ($32=1) the laser stays on during travel moves.');
        return;
      }
    }
    // Every start shows the pre-flight: hazards plus what is about to burn (SPEC §11.7, stricter).
    const choice = await new Promise<SafetyChoice>((resolve) => {
      this.safetyRequest = {
        summary: jobSummary(job, editor.project),
        firstThisSession: !this.safetyConfirmed,
        framed: this.framedKey === boundsKey(job.bounds),
        resolve,
      };
    });
    this.safetyRequest = null;
    if (choice === 'frame') {
      await this.frame();
      return;
    }
    if (choice !== 'start') return;
    this.safetyConfirmed = true;
    await this.run(job.lines, 'job', job.stats?.estimatedSeconds);
  }

  private async run(
    lines: string[],
    kind: 'job' | 'frame',
    estimatedSeconds?: number,
  ): Promise<JobOutcome | null> {
    const runner = this.runner;
    if (!runner) return null;
    if (kind === 'job') await this.wakeLock.acquire();
    try {
      const outcome = await runner.run(lines, {
        kind,
        errorPolicy: preferences.value.errorPolicy,
        estimatedSeconds,
      });
      if (kind === 'job' && outcome === 'completed') toast.success('Job complete');
      return outcome;
    } catch (error) {
      toast.error(errorMessage(error));
      return null;
    } finally {
      await this.wakeLock.release();
    }
  }

  private onJobEvent(event: Parameters<Parameters<JobRunner['onEvent']>[0]>[0]): void {
    if (event.type === 'failed') toast.error(`Job failed: ${event.reason}`, { duration: 0 });
    if (event.type === 'aborted') toast.info('Job stopped');
  }

  pause(): void {
    this.runner?.pause();
  }

  resume(): void {
    this.runner?.resume();
  }

  continueAfterError(): void {
    this.runner?.continueAfterError();
  }

  /** Something is moving or held, so Stop has work to do. */
  get canStop(): boolean {
    if (!this.connected) return false;
    if (this.jobActive || this.framing) return true;
    return MOVING_STATES.has(this.state.status);
  }

  /** Stop: no confirmation, it must be instant (SPEC §9.6, §11). */
  async stop(): Promise<void> {
    this.frameLoop = false;
    if (this.runner?.active) {
      await this.runner.stop();
      return;
    }
    const driver = this.driver;
    if (!driver || !MOVING_STATES.has(this.state.status)) return;
    if (this.state.status === 'Jog') {
      // Jog cancel stops a jog cleanly and leaves the machine Idle; a feed hold would strand it in Hold.
      driver.cancelJog();
      return;
    }
    // Manual moves or homing: hold, then reset, which empties the planner so nothing resumes later.
    driver.realtime('feed-hold');
    await this.waitForStatus(['Hold', 'Idle', 'Alarm'], 500);
    await driver.softReset('user').catch((error: unknown) => reportError(error, 'Stop'));
  }

  /** Resumes a hold that did not come from a job (machine button, door, earlier pause). */
  resumeHold(): void {
    this.driver?.realtime('cycle-start');
  }

  /** Clears a hold by resetting the controller: queued motion is dropped. */
  async clearHold(): Promise<void> {
    await this.driver?.softReset('user').catch((error: unknown) => reportError(error, 'Reset'));
  }

  private async waitForStatus(states: MachineState['status'][], timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (!states.includes(this.state.status) && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /** beforeunload during a job: hold motion while the browser asks to leave. */
  pauseForUnload(): void {
    this.runner?.pause();
  }

  async onVisibilityChange(): Promise<void> {
    await this.wakeLock.onVisibilityChange();
  }
}

export const machine = new MachineController();

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => void machine.onVisibilityChange());
}
