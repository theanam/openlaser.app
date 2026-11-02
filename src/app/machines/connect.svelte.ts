/**
 * One Connect button for every machine. The user picks USB or Bluetooth; openlaser finds out
 * which kind of machine answered, switches to (or creates) a matching profile, and connects
 * through that machine's adapter. Bluetooth today means LaserPecker, and its name says the model.
 * On USB each adapter's probe opens the port, asks in its own protocol, and closes it again.
 */
import {
  isWebSerialSupported,
  WebBluetoothTransport,
  WebSerialTransport,
  type Detection,
  type Transport,
} from '$lib/machine';
import { defaultMachineProfile } from '$lib/project/factory';
import { MACHINE_PRESETS, presetProfileFields } from '$lib/project/machine-presets';
import type { MachineProfile } from '$lib/project/types';
import { errorMessage } from '$lib/ui/errors';
import { toast } from '$lib/ui/toasts.svelte';
import { profiles } from '../state/profiles.svelte';
import { ui } from '../state/ui.svelte';
import { activeAdapter, ADAPTERS, adapterFor, connectedSession } from './registry';
import type { LiveMachine, MachineAdapter } from './types';

export type ConnectMethod = 'usb' | 'bluetooth';

type Live = MachineAdapter & { live: LiveMachine };

const METHOD_KEY = 'openlaser.connect.method';

function storedMethod(): ConnectMethod | null {
  try {
    const v = localStorage.getItem(METHOD_KEY);
    return v === 'usb' || v === 'bluetooth' ? v : null;
  } catch {
    return null;
  }
}

const isLive = (a: MachineAdapter): a is Live => a.live !== null;

/** Adapters that reach machines over `method`, the selected machine's first. */
function adaptersFor(method: ConnectMethod): Live[] {
  const active = activeAdapter();
  return [active, ...ADAPTERS.filter((a) => a !== active)]
    .filter(isLive)
    .filter((a) => a.live.transports.some((t) => t.medium === method && t.supported()));
}

const optionFor = (adapter: Live, method: ConnectMethod) =>
  adapter.live.transports.find((t) => t.medium === method)!;

class AutoConnect {
  /** Probing a port: which machine is this? */
  detecting = $state(false);
  method = $state<ConnectMethod>(storedMethod() ?? (isWebSerialSupported() ? 'usb' : 'bluetooth'));

  /** The methods this browser can use, for the Connect button's menu. */
  get methods(): ConnectMethod[] {
    return (['usb', 'bluetooth'] as const).filter((m) => adaptersFor(m).length > 0);
  }

  get busy(): boolean {
    return this.detecting || ADAPTERS.some((a) => a.live?.session.connecting);
  }

  async connect(method: ConnectMethod = this.method): Promise<void> {
    if (connectedSession() || this.busy) return;
    this.method = method;
    try {
      localStorage.setItem(METHOD_KEY, method);
    } catch {
      // Storage unavailable: the choice holds for this visit.
    }
    const candidates = adaptersFor(method);
    if (!candidates.length) {
      toast.error(method === 'bluetooth' ? 'Bluetooth needs Chrome or Edge.' : 'USB needs Chrome or Edge.');
      return;
    }
    let transport: Transport;
    try {
      transport =
        method === 'bluetooth' ? await WebBluetoothTransport.request() : await WebSerialTransport.request();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        toast.info(method === 'bluetooth' ? 'No laser chosen.' : 'No port chosen.', {
          action: { label: 'Laser not showing up?', run: () => (ui.connectHelpOpen = true) },
        });
      } else toast.error(`Could not open the laser: ${errorMessage(error)}`);
      return;
    }
    const found =
      method === 'bluetooth' ? this.byName(candidates, transport) : await this.probe(candidates, transport);
    if (!found) {
      toast.error('No laser answered on this port. Check that it is on and not in use by another app.', {
        action: { label: 'Laser not showing up?', run: () => (ui.connectHelpOpen = true) },
      });
      return;
    }
    await useProfile(found.adapter, found.detection);
    await found.adapter.live.session.connectTransport(optionFor(found.adapter, method).kind, transport);
  }

  /** Bluetooth: the advertised name says the model ("LP3-109BFB"). */
  private byName(candidates: Live[], transport: Transport) {
    const model = /^LP\d/.exec(transport.label ?? '')?.[0];
    return { adapter: candidates[0], detection: { baudRate: 0, ...(model ? { model } : {}) } };
  }

  /** USB: ask in each machine's protocol until one answers. */
  private async probe(
    candidates: Live[],
    transport: Transport,
  ): Promise<{ adapter: Live; detection: Detection } | null> {
    this.detecting = true;
    try {
      for (const adapter of candidates) {
        if (!adapter.live.probe) continue;
        const detection = await adapter.live.probe(transport, profileToTry(adapter));
        if (detection) return { adapter, detection };
      }
      return null;
    } finally {
      this.detecting = false;
    }
  }
}

/** The settings a probe should try first: the selected profile's, when it is this kind of machine. */
function profileToTry(adapter: MachineAdapter): MachineProfile {
  return adapterFor(profiles.active.controller) === adapter
    ? profiles.active
    : defaultMachineProfile({ controller: adapter.id, ...adapter.profileDefaults });
}

/**
 * The profile for what was found: the selected one if it fits, else an existing one of that kind
 * (the same model when known), else a new one from the model's preset or the adapter's defaults.
 * It keeps the baud rate that answered. `created` when it is new and needs saving.
 */
export function chooseProfile(
  adapter: MachineAdapter,
  detection: Detection,
  list: readonly MachineProfile[],
  active: MachineProfile,
): { profile: MachineProfile; created: boolean } {
  const fits = (p: MachineProfile) =>
    adapterFor(p.controller) === adapter && (!detection.model || p.name.includes(detection.model));
  let profile = fits(active) ? active : list.find(fits);
  let created = false;
  if (!profile) {
    const preset = detection.model
      ? MACHINE_PRESETS.find(
          (p) => (p.controller ?? 'grbl') === adapter.id && p.model.split(' ')[0] === detection.model,
        )
      : undefined;
    profile = defaultMachineProfile(
      preset
        ? presetProfileFields(preset)
        : { name: `${adapter.label} laser`, controller: adapter.id, ...adapter.profileDefaults },
    );
    created = true;
  }
  if (detection.baudRate && profile.baudRate !== detection.baudRate)
    profile = { ...profile, baudRate: detection.baudRate };
  return { profile, created };
}

async function useProfile(adapter: MachineAdapter, detection: Detection): Promise<void> {
  const before = profiles.list.find((p) => p.id === profiles.activeId);
  const { profile, created } = chooseProfile(adapter, detection, profiles.list, profiles.active);
  const original = profiles.list.find((p) => p.id === profile.id);
  if (created || original?.baudRate !== profile.baudRate) await profiles.save(profile);
  if (before?.id !== profile.id) {
    await profiles.activate(profile.id);
    toast.info(`Found ${profile.name}`);
  }
}

export const autoConnect = new AutoConnect();
