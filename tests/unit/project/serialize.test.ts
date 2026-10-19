import { describe, expect, it } from 'vitest';
import { createProject } from '$lib/project/factory';
import { deserializeProject, ProjectFileError, serializeProject } from '$lib/project/serialize';
import type { Project } from '$lib/project/types';

function sampleProject(): Project {
  const project = createProject({ name: 'Coaster set', now: '2026-01-01T00:00:00.000Z', id: () => 'p1' });
  project.layers.push({
    id: 'l1',
    name: 'Cut',
    color: '#C0392B',
    visible: true,
    output: true,
    mode: 'line',
    speed: 400,
    power: 100,
    minPower: 0,
    passes: 3,
    airAssist: false,
    line: { kerfOffset: 0 },
  });
  project.objects.push({
    id: 'o1',
    kind: 'image',
    layerId: 'l1',
    name: 'photo.png',
    locked: false,
    visible: true,
    transform: [1, 0, 0, 1, 10, 20],
    assetId: 'a1',
    width: 50,
    height: 40,
  });
  project.assets.a1 = {
    id: 'a1',
    mime: 'image/png',
    name: 'photo.png',
    data: new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' }),
    widthPx: 500,
    heightPx: 400,
  };
  return project;
}

describe('project serialization', () => {
  it('round-trips through a .olaser archive', async () => {
    const project = sampleProject();
    const bytes = await serializeProject(project);
    expect(bytes[0]).toBe(0x50);
    const restored = await deserializeProject(bytes);
    const { assets, ...rest } = restored;
    const { assets: originalAssets, ...originalRest } = project;
    expect(rest).toEqual(originalRest);
    expect(Object.keys(assets)).toEqual(Object.keys(originalAssets));
    expect(new Uint8Array(await assets.a1.data.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
    );
    expect(assets.a1.widthPx).toBe(500);
    expect(assets.a1.data.type).toBe('image/png');
  });

  it('opens plain JSON with base64 assets', async () => {
    const { assets: _assets, ...project } = sampleProject();
    const json = JSON.stringify({
      format: 'openlaser-project',
      version: 1,
      project,
      assets: [{ id: 'a1', mime: 'image/png', name: 'photo.png', base64: btoa('abc') }],
    });
    const restored = await deserializeProject(new TextEncoder().encode(json));
    expect(await restored.assets.a1.data.text()).toBe('abc');
  });

  it('rejects newer schema versions with a readable error', async () => {
    const { assets: _assets, ...project } = sampleProject();
    const json = JSON.stringify({
      format: 'openlaser-project',
      version: 99,
      project: { ...project, version: 99 },
      assets: [],
    });
    await expect(deserializeProject(new TextEncoder().encode(json))).rejects.toThrow(/newer version/);
  });

  it('rejects files that are not projects', async () => {
    await expect(deserializeProject(new TextEncoder().encode('{"hello":1}'))).rejects.toBeInstanceOf(
      ProjectFileError,
    );
    await expect(deserializeProject(new TextEncoder().encode('not json'))).rejects.toBeInstanceOf(
      ProjectFileError,
    );
  });
});
