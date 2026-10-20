/**
 * Promise API over the CAM workers. Compiles run on their own worker so a long photo compile never
 * delays previews; a newer compile supersedes an older one by restarting that worker.
 */
import type {
  CompileRdRequest,
  CompileRdResult,
  CompileRequest,
  CompileResult,
  DitherRequest,
  DitherResult,
  ParseGcodeResult,
  WorkerRequest,
  WorkerResponse,
} from '$lib/workers/protocol';
import CamWorker from '$lib/workers/cam.worker.ts?worker';

/** Omit that distributes over the request union. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

export class SupersededError extends Error {
  override name = 'SupersededError';
}

class WorkerChannel {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  private ensure(): Worker {
    if (!this.worker) {
      this.worker = new CamWorker();
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const entry = this.pending.get(event.data.id);
        if (!entry) return;
        this.pending.delete(event.data.id);
        if (event.data.ok) entry.resolve(event.data.result);
        else entry.reject(new Error(event.data.error));
      };
      this.worker.onerror = (event) => {
        const error = new Error(event.message || 'The CAM worker crashed.');
        for (const entry of this.pending.values()) entry.reject(error);
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    }
    return this.worker;
  }

  get busy(): boolean {
    return this.pending.size > 0;
  }

  request<T>(message: WithoutId<WorkerRequest>): Promise<T> {
    const id = this.nextId++;
    const worker = this.ensure();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ ...message, id } as WorkerRequest);
    });
  }

  /** Stops current work. Pending requests reject as superseded. */
  restart(): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    for (const entry of this.pending.values())
      entry.reject(new SupersededError('Superseded by a newer request.'));
    this.pending.clear();
  }
}

const compileChannel = new WorkerChannel();
const previewChannel = new WorkerChannel();

export function compileInWorker(request: Omit<CompileRequest, 'type' | 'id'>): Promise<CompileResult> {
  if (compileChannel.busy) compileChannel.restart();
  return compileChannel.request<CompileResult>({ type: 'compile', ...request });
}

export function compileRdInWorker(request: Omit<CompileRdRequest, 'type' | 'id'>): Promise<CompileRdResult> {
  return compileChannel.request<CompileRdResult>({ type: 'compile-rd', ...request });
}

export function parseGcodeInWorker(text: string, maxS: number): Promise<ParseGcodeResult> {
  return previewChannel.request<ParseGcodeResult>({ type: 'parse-gcode', text, maxS });
}

export function ditherInWorker(request: Omit<DitherRequest, 'type' | 'id'>): Promise<DitherResult> {
  return previewChannel.request<DitherResult>({ type: 'dither', ...request });
}
