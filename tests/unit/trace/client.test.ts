import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  setTraceWorkerFactory,
  stopTrace,
  trace,
  type TraceReply,
  type TraceRequest,
} from '$lib/trace/client';
import { tracePreset } from '$lib/trace/presets';
import { box, picture } from './fixtures';

const scene = picture(40, 30, [255, 255, 255, 255], [box(10, 8, 30, 22, [0, 0, 0, 255])]);

afterEach(() => setTraceWorkerFactory(null));

describe('trace client inline', () => {
  it('traces on the calling thread without a worker', async () => {
    setTraceWorkerFactory(null);
    const progress: number[] = [];
    const r = await trace(scene, tracePreset('logo').options, { onProgress: (v) => progress.push(v) });
    expect(r.width).toBe(40);
    expect(r.layers.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(1);
  });

  it('rejects an already aborted signal', async () => {
    setTraceWorkerFactory(null);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(trace(scene, tracePreset('logo').options, { signal: ctrl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('trace worker client', () => {
  type Fake = {
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    onmessage: ((e: MessageEvent<TraceReply>) => void) | null;
    onerror: ((e: ErrorEvent) => void) | null;
  };
  const fakes: Fake[] = [];
  const install = () => {
    fakes.length = 0;
    setTraceWorkerFactory(() => {
      const f: Fake = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
      fakes.push(f);
      return f as never;
    });
  };
  const reply = (f: Fake, m: TraceReply) => f.onmessage?.({ data: m } as MessageEvent<TraceReply>);
  const lastId = (f: Fake) => (f.postMessage.mock.calls.at(-1)?.[0] as TraceRequest).id;
  const empty = { width: 1, height: 1, layers: [], nodes: 0 };

  it('posts a copy of the pixels and resolves with the result', async () => {
    install();
    const progress: number[] = [];
    const p = trace(scene, tracePreset('logo').options, { onProgress: (v) => progress.push(v) });
    const [req, transfer] = fakes[0].postMessage.mock.calls[0] as [TraceRequest, ArrayBuffer[]];
    expect(req.image.data).not.toBe(scene.data);
    expect(transfer).toEqual([req.image.data.buffer]);
    reply(fakes[0], { id: req.id, progress: 0.5 });
    reply(fakes[0], { id: req.id, ok: true, result: empty });
    await expect(p).resolves.toEqual(empty);
    expect(progress).toEqual([0.5]);
  });

  it('restarts the worker when a newer trace replaces a running one', async () => {
    install();
    const first = trace(scene, tracePreset('logo').options);
    const second = trace(scene, tracePreset('photo').options);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(fakes[0].terminate).toHaveBeenCalled();
    reply(fakes[1], { id: lastId(fakes[1]), ok: true, result: empty });
    await expect(second).resolves.toBeTruthy();
  });

  it('stops on abort and reports worker errors', async () => {
    install();
    const ctrl = new AbortController();
    const p = trace(scene, tracePreset('logo').options, { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    const q = trace(scene, tracePreset('logo').options);
    reply(fakes[1], { id: lastId(fakes[1]), ok: false, error: 'Out of memory' });
    await expect(q).rejects.toThrow('Out of memory');
    stopTrace();
  });
});
