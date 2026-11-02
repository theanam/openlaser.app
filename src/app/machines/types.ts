/**
 * App-layer machine adapters. Each controller (GRBL, Ruida, …) is one adapter object in its own
 * folder, listed once in `registry.ts`. The UI asks the registry and the adapter's capabilities;
 * it never checks a controller id.
 */
import type { Component } from 'svelte';
import type { Detection, MachineConnection, ProbeOptions, Scheduler, Transport } from '$lib/machine';
import type { MachineProfile } from '$lib/project/types';
import type { SafetyRequest } from '../state/machine.svelte';

/** One way to reach the machine, offered as a Connect button. */
export interface TransportOption {
  /** Passed back to `MachineSession.connect`. */
  kind: string;
  label: string;
  /** An in-process device for dry runs: no hardware involved. */
  virtual?: boolean;
  /** How a real transport reaches the machine, for the shared Connect button's USB and Bluetooth. */
  medium?: 'usb' | 'bluetooth';
  /** Whether this browser can use it. */
  supported(): boolean;
}

/** The live side of an adapter, as the UI sees it. Reactive: read it from components and effects. */
export interface MachineSession {
  readonly connected: boolean;
  readonly connecting: boolean;
  /** Something is running, moving or held, so Stop has work to do. */
  readonly canStop: boolean;
  /** A job (not a frame) is in progress. */
  readonly jobActive: boolean;
  /** Pending pre-flight question, shown by the shared safety checklist. */
  readonly safetyRequest: SafetyRequest | null;
  connect(kind: string): Promise<void>;
  /** Connects over a transport the user already picked (auto-detection probed it first). */
  connectTransport(kind: string, transport: Transport): Promise<void>;
  disconnect(): Promise<void>;
  /** No confirmation: it must be instant (SPEC §9.6, §11). */
  stop(): Promise<void>;
  /** The browser asks to leave during a job: hold it. Never resumes on its own. */
  pauseForUnload(): void;
}

export interface LiveMachine {
  transports: readonly TransportOption[];
  session: MachineSession;
  /** The machine-layer connection over an open-able transport. The shared contract tests drive it. */
  open(
    transport: Transport,
    profile: MachineProfile,
    options?: { scheduler?: Scheduler },
  ): Promise<MachineConnection>;
  /** The in-process device behind the `virtual` transport. */
  virtual(profile: MachineProfile, options?: { scheduler?: Scheduler }): Transport;
  /**
   * Whether a picked USB port is this kind of machine: opens it, asks, closes it. The baud rate
   * that answered, and the model when the reply says. Null when it is not.
   */
  probe?(transport: Transport, profile: MachineProfile, options?: ProbeOptions): Promise<Detection | null>;
}

export interface MachineCapabilities {
  /** The job can start at the head or a user origin; without it jobs burn at bed positions. */
  jobOrigin: boolean;
  /** A console of what was sent and received. */
  console: boolean;
  /** Takes G-code: S range, baud, jog and frame speeds, G-code header and footer in the profile. */
  gcode: boolean;
  /**
   * Layers' scan settings (fill interval and angle, overscan, direction, cross-hatch, image DPI)
   * apply. Off for machines that draw the job as one bitmap at their own resolution.
   */
  scanSettings: boolean;
}

export interface MachineAdapter {
  /** Stored as `MachineProfile.controller`. */
  id: string;
  /** Controller name in Machine profiles. */
  label: string;
  /** Shown next to the machine name; empty for the default controller. */
  tag: string;
  /** Profile fields set when a profile switches to this controller. */
  profileDefaults: Partial<MachineProfile>;
  capabilities: MachineCapabilities;
  /** The top bar's export, e.g. "Export G-code". */
  exportLabel: string;
  exportJob(): Promise<void>;
  /** Null for machines that run exported files from their own panel. */
  live: LiveMachine | null;
  /** Status pill in the Machine panel header. */
  badge?: Component;
  /** The Machine panel body. */
  panel: Component;
  /** Pinned under the side panel while connected (Start, Frame, Stop). */
  controls?: Component;
}
