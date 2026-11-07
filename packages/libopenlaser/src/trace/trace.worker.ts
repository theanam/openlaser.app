/// <reference lib="webworker" />
import { traceImage } from './trace';
import type { TraceRequest, TraceReply } from './client';

declare const self: DedicatedWorkerGlobalScope;

const post = (m: TraceReply) => self.postMessage(m);

self.onmessage = (e: MessageEvent<TraceRequest>) => {
  const { id, image, options } = e.data;
  try {
    const result = traceImage(image, options, (p) => post({ id, progress: p }));
    post({ id, ok: true, result });
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
