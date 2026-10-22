/**
 * First-run tour content. Keep copy short and plain; the illustration carries most of the
 * message. When a notable feature ships, add it to features.ts and to a step here.
 */
import type { Component } from 'svelte';
import Globe from '@lucide/svelte/icons/globe';
import WifiOff from '@lucide/svelte/icons/wifi-off';
import Heart from '@lucide/svelte/icons/heart';
import Usb from '@lucide/svelte/icons/usb';
import Cpu from '@lucide/svelte/icons/cpu';
import Plug from '@lucide/svelte/icons/plug';
import Upload from '@lucide/svelte/icons/upload';
import SquircleDashed from '@lucide/svelte/icons/squircle-dashed';
import Unplug from '@lucide/svelte/icons/unplug';
import ScanSearch from '@lucide/svelte/icons/scan-search';
import FileCode from '@lucide/svelte/icons/file-code';
import Image from '@lucide/svelte/icons/image';
import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
import Spline from '@lucide/svelte/icons/spline';
import PaintBucket from '@lucide/svelte/icons/paint-bucket';
import Layers from '@lucide/svelte/icons/layers';
import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
import SunMedium from '@lucide/svelte/icons/sun-medium';
import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
import Square from '@lucide/svelte/icons/square';
import Type from '@lucide/svelte/icons/type';
import Shapes from '@lucide/svelte/icons/shapes';
import Ruler from '@lucide/svelte/icons/ruler';
import Move from '@lucide/svelte/icons/move';
import Play from '@lucide/svelte/icons/play';
import Timer from '@lucide/svelte/icons/timer';
import Download from '@lucide/svelte/icons/download';
import Scan from '@lucide/svelte/icons/scan';
import Gauge from '@lucide/svelte/icons/gauge';
import OctagonX from '@lucide/svelte/icons/octagon-x';
import Crosshair from '@lucide/svelte/icons/crosshair';
import Ghost from '@lucide/svelte/icons/ghost';
import Terminal from '@lucide/svelte/icons/terminal';
import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
import Save from '@lucide/svelte/icons/save';
import Package from '@lucide/svelte/icons/package';
import Settings from '@lucide/svelte/icons/settings';
import Printer from '@lucide/svelte/icons/printer';
import Keyboard from '@lucide/svelte/icons/keyboard';
import ShieldCheck from '@lucide/svelte/icons/shield-check';
import ListChecks from '@lucide/svelte/icons/list-checks';
import Siren from '@lucide/svelte/icons/siren';
import Undo2 from '@lucide/svelte/icons/undo-2';
import type { FeatureId } from '../features';

export type TourArt =
  | 'welcome'
  | 'connect'
  | 'import'
  | 'layers'
  | 'photos'
  | 'design'
  | 'text-shapes'
  | 'preview'
  | 'run'
  | 'machine'
  | 'files'
  | 'safety'
  | 'pick-machine';

export interface TourPoint {
  icon: Component;
  text: string;
}

export interface TourStep {
  id: string;
  title: string;
  body: string;
  points: TourPoint[];
  art: TourArt;
  features: FeatureId[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to openlaser',
    body: 'Design, preview and run laser jobs right in your browser.',
    art: 'welcome',
    points: [
      { icon: Globe, text: 'Runs in Chrome, Edge, Opera and Brave' },
      { icon: WifiOff, text: 'Installs as an app and works offline' },
      { icon: Heart, text: 'Free and open source' },
    ],
    features: ['browser-app', 'offline-pwa', 'open-source'],
  },
  {
    id: 'connect',
    title: 'Connect in one click',
    body: 'Plug in your laser over USB and pick its port. Practice anytime on the built-in virtual machine.',
    art: 'connect',
    points: [
      { icon: Usb, text: 'GRBL 1.1, grblHAL and FluidNC over Web Serial' },
      { icon: Cpu, text: 'Virtual machine for safe dry runs' },
      { icon: ScanSearch, text: 'Recognises your machine and its bed size' },
      { icon: Plug, text: 'One-click reconnect to known ports' },
      { icon: Usb, text: 'CO₂ lasers too: GRBL over USB, Ruida through a .rd file' },
      { icon: Unplug, text: 'Step-by-step help when the laser is missing' },
    ],
    features: [
      'web-serial',
      'virtual-machine',
      'grbl-firmwares',
      'machine-detect',
      'connect-help',
      'co2-lasers',
    ],
  },
  {
    id: 'import',
    title: 'Bring your art',
    body: 'Drop files onto the bed or use the Image tool. Projects and G-code open with Open.',
    art: 'import',
    points: [
      { icon: FileCode, text: 'SVG and DXF at their real size' },
      { icon: Image, text: 'PNG, JPEG, WebP, AVIF, BMP and GIF at their DPI size' },
      { icon: MousePointerClick, text: 'Drag and drop anywhere in the app' },
    ],
    features: ['svg-import', 'dxf-import', 'image-import', 'gcode-sender', 'drag-drop'],
  },
  {
    id: 'layers',
    title: 'Layers drive the laser',
    body: 'Each layer has a mode, speed, power and passes. Drag layers to set the run order.',
    art: 'layers',
    points: [
      { icon: Spline, text: 'Line for cuts and scores, with kerf offset' },
      { icon: PaintBucket, text: 'Fill engraves areas at any angle, with cross-hatch' },
      { icon: Layers, text: 'Each SVG or DXF color lands on its own layer' },
      { icon: MousePointerClick, text: 'Objects sit under their layer; drag them to another' },
    ],
    features: ['layers', 'layer-objects', 'line-mode', 'fill-mode'],
  },
  {
    id: 'photos',
    title: 'Photos that engrave well',
    body: 'Seven modes turn photos into crisp dots, with a live preview on the bed.',
    art: 'photos',
    points: [
      { icon: Grid3x3, text: 'Floyd–Steinberg, Atkinson, Jarvis, Stucki, Bayer, threshold, grayscale' },
      { icon: SunMedium, text: 'Brightness, contrast, gamma and invert' },
      { icon: ArrowLeftRight, text: 'Bidirectional scanning with overscan' },
      { icon: WandSparkles, text: 'Trace logos and photos into clean vectors to cut or engrave' },
    ],
    features: ['image-mode', 'dithering', 'image-adjustments', 'image-trace'],
  },
  {
    id: 'text-shapes',
    title: 'Text and shapes',
    body: 'Set text in any Google Font, your installed fonts or your own files, and draw from a library of parametric shapes.',
    art: 'text-shapes',
    points: [
      { icon: Type, text: 'Every Google Font, with live previews by category' },
      { icon: Upload, text: 'Upload TTF, OTF or WOFF files, or use installed fonts' },
      { icon: Shapes, text: 'Stars, gears, arrows, hearts and 20 more, all adjustable' },
      { icon: Spline, text: 'Text and shapes burn as clean vector outlines' },
      { icon: SquircleDashed, text: 'Outline a selection at any offset, for key rings and stickers' },
    ],
    features: ['text-tool', 'google-fonts', 'local-fonts', 'shape-library', 'outline-tool'],
  },
  {
    id: 'design',
    title: 'Arrange with precision',
    body: 'Draw shapes, then move, scale and rotate by hand or by number.',
    art: 'design',
    points: [
      { icon: Square, text: 'Rectangle and ellipse tools' },
      { icon: Ruler, text: 'Measure any distance on the bed' },
      { icon: Move, text: 'X, Y, W, H and angle with a 9-point anchor. Drag a label to scrub.' },
      { icon: Undo2, text: 'Undo and redo for every change' },
    ],
    features: ['shape-tools', 'measure-tool', 'transform-fields', 'label-scrubbing', 'undo-redo'],
  },
  {
    id: 'preview',
    title: 'See the job before it burns',
    body: 'Preview draws every move. Play it or scrub through it line by line.',
    art: 'preview',
    points: [
      { icon: Play, text: 'Burns shaded by power, travel dashed' },
      { icon: Timer, text: 'Time estimate with burn and travel distance' },
      { icon: Download, text: 'Export G-code for SD cards and other senders' },
    ],
    features: ['toolpath-preview', 'time-estimate', 'gcode-export'],
  },
  {
    id: 'run',
    title: 'Frame, start, stop',
    body: 'Trace the outline first, then start the job. Stop stays on screen the whole time.',
    art: 'run',
    points: [
      { icon: Scan, text: 'Frame once or on a loop, laser off or at 1% to line things up' },
      { icon: Gauge, text: 'Pause, resume, and live speed and power overrides' },
      { icon: OctagonX, text: 'Esc stops the job instantly' },
      { icon: Ghost, text: 'A faint ghost shows where a job from a user or current origin burns' },
      { icon: Layers, text: 'The layer being burned lights up in the Layers panel' },
    ],
    features: ['framing', 'frame-loop', 'job-control', 'job-ghost', 'burning-layer', 'overrides', 'stop-esc'],
  },
  {
    id: 'machine',
    title: 'Full machine control',
    body: 'Jog, home and set origins. The console shows every line sent and received.',
    art: 'machine',
    points: [
      { icon: Crosshair, text: 'Jog pad with 0.1 to 50 mm steps, Home and Set origin' },
      {
        icon: Terminal,
        text: 'Console shows every line to and from the laser, with history and log download',
      },
      { icon: SlidersHorizontal, text: 'View, edit and back up $$ settings' },
    ],
    features: ['jog-home', 'console', 'console-panel', 'device-settings'],
  },
  {
    id: 'files',
    title: 'Your work, kept safe',
    body: 'Projects save in the browser as you work. Save to disk whenever you like.',
    art: 'files',
    points: [
      { icon: Save, text: 'Autosave and recent projects' },
      { icon: Package, text: '.olaser project files carry their images' },
      { icon: Settings, text: 'Machine profiles as .json files to share' },
      { icon: Printer, text: 'Print a 1:1 paper template' },
      { icon: Keyboard, text: 'Familiar shortcuts. Press ? for the list.' },
    ],
    features: ['autosave', 'project-files', 'machine-profiles', 'print-template', 'keyboard-shortcuts'],
  },
  {
    id: 'safety',
    title: 'Safe by default',
    body: 'The laser fires only when you start a job.',
    art: 'safety',
    points: [
      { icon: ShieldCheck, text: 'Laser off while jogging and framing' },
      { icon: ListChecks, text: 'A visual pre-flight check before every job' },
      { icon: Siren, text: 'Alarms explained with what to do next' },
    ],
    features: ['safety-checklist', 'preflight', 'alarm-help'],
  },
  {
    id: 'pick-machine',
    title: 'Pick your machine',
    body: 'Over 50 GRBL lasers built in, from Ortur, Sculpfun, Atomstack, Two Trees and more. Edit it anytime.',
    art: 'pick-machine',
    points: [],
    features: ['machine-presets'],
  },
];
