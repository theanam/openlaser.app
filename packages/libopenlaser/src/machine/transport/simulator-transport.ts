import type { GrblSimulator } from '../simulator/simulator';
import { Listeners } from '../store';
import type { Transport, Unsubscribe } from '../types';

/**
 * Connects the driver to an in-process GrblSimulator ("Virtual machine"). Data is delivered on a
 * microtask, never synchronously inside `write`, matching the asynchrony of a real port.
 */
export class SimulatorTransport implements Transport {
  readonly kind = 'simulator' as const;
  readonly label = 'Virtual machine';
  private isOpen = false;
  private subscriptions: Unsubscribe[] = [];
  private readonly dataListeners = new Listeners<Uint8Array>();
  private readonly disconnectListeners = new Listeners<string>();

  constructor(readonly simulator: GrblSimulator) {}

  get connected(): boolean {
    return this.isOpen;
  }

  async open(_options: { baudRate: number }): Promise<void> {
    if (this.isOpen) throw new Error('Port is already open');
    this.isOpen = true;
    this.subscriptions = [
      this.simulator.onOutput((bytes) => {
        const copy = bytes.slice();
        queueMicrotask(() => {
          if (this.isOpen) this.dataListeners.emit(copy);
        });
      }),
      this.simulator.onDisconnect((reason) => {
        this.detach();
        queueMicrotask(() => this.disconnectListeners.emit(reason));
      }),
    ];
    this.simulator.powerOn();
  }

  async close(): Promise<void> {
    if (!this.isOpen) return;
    this.detach();
    this.simulator.powerOff();
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.isOpen) throw new Error('Port is closed');
    this.simulator.receive(data);
  }

  onData(cb: (chunk: Uint8Array) => void): Unsubscribe {
    return this.dataListeners.add(cb);
  }

  onDisconnect(cb: (reason: string) => void): Unsubscribe {
    return this.disconnectListeners.add(cb);
  }

  private detach(): void {
    this.isOpen = false;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions = [];
  }
}
