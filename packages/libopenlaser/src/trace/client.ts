/* Runs traces in a module worker so the editor stays responsive. A new trace replaces one still running
   (the worker is restarted), which keeps the live preview current while settings change. */
import { traceImage } from './trace';
import type { Pixels, TraceOptions, TraceResult } from './types';

export type TraceRequest = { id: number; image: Pixels; options: TraceOptions };
export type TraceReply =
  | { id: number; progress: number }
  | { id: number; ok: true; result: TraceResult }
  | { id: number; ok: false; error: string };

type WorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((e: MessageEvent<TraceReply>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
};

let factory: (() => WorkerLike) | null =
  typeof Worker === 'function'
    ? () =>
        new Worker(new URL('./trace.worker.ts', import.meta.url), {
          type: 'module',
          name: 'openlaser-trace',
        })
    : null;

/** Tests only: swap the worker factory, or pass null to trace on the calling thread. */
export function setTraceWorkerFactory(f: (() => WorkerLike) | null) {
  stopTrace();
  factory = f;
}

let worker: WorkerLike | null = null;
let pending: { id: number; reject(e: Error): void } | null = null;
let seq = 0;

const abortError = () => new DOMException('Trace cancelled', 'AbortError');

/** Stop the running trace, if any. */
export function stopTrace() {
  worker?.terminate();
  worker = null;
  pending?.reject(abortError() as unknown as Error);
  pending = null;
}

export function trace(
  image: Pixels,
  options: TraceOptions,
  opts: { signal?: AbortSignal; onProgress?(p: number): void } = {},
): Promise<TraceResult> {
  if (opts.signal?.aborted) return Promise.reject(abortError());
  if (!factory) {
    try {
      return Promise.resolve(traceImage(image, options, opts.onProgress));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  if (pending) stopTrace();
  const make = factory;
  return new Promise<TraceResult>((resolve, reject) => {
    const id = ++seq;
    worker ??= make();
    const w = worker;
    const done = () => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (pending?.id === id) pending = null;
    };
    const onAbort = () => {
      if (pending?.id === id) stopTrace();
    };
    pending = {
      id,
      reject: (e) => {
        done();
        reject(e);
      },
    };
    opts.signal?.addEventListener('abort', onAbort);
    w.onmessage = (e) => {
      const m = e.data;
      if (m.id !== id) return;
      if ('progress' in m) return opts.onProgress?.(m.progress);
      done();
      if (m.ok) resolve(m.result);
      else reject(new Error(m.error || 'Tracing failed.'));
    };
    w.onerror = (e) => {
      done();
      worker?.terminate();
      worker = null;
      reject(new Error(e.message || 'Tracing failed.'));
    };
    // Copy the pixels so the caller keeps its own buffer.
    const data = image.data.slice();
    w.postMessage({ id, image: { width: image.width, height: image.height, data }, options }, [data.buffer]);
  });
}
