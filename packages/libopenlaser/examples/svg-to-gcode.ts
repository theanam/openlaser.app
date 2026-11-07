/**
 * SVG in, G-code out. SVG parsing uses the browser's DOMParser; in Node, provide one (jsdom).
 */
import { compileJob } from 'libopenlaser/cam';
import { buildProjectObjectsFromSvg, importSvg } from 'libopenlaser/import';
import { addLayer, addObjects, createProject, defaultMachineProfile, makeId } from 'libopenlaser/project';

export function svgToGcode(svgText: string): string[] {
  // A 400 × 400 mm diode laser on GRBL. Units are mm and mm/min everywhere.
  const profile = defaultMachineProfile({ bedWidth: 400, bedHeight: 400 });

  // Each stroke or fill colour becomes one object on a layer of that colour.
  const drawing = importSvg(svgText);
  const { layersToAdd, objects, assets } = buildProjectObjectsFromSvg(drawing, [], makeId, { name: 'logo' });

  let project = createProject({ name: 'Logo' });
  for (const layer of layersToAdd) project = addLayer(project, { ...layer, power: 60, speed: 1200 });
  project = addObjects(project, objects, assets);

  const plan = compileJob({ project, profile, assets: new Map() });
  for (const warning of plan.warnings) console.warn(warning.message);
  return plan.gcode;
}
