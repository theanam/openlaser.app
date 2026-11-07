/**
 * Text objects: creation, style edits, and keeping their cached outlines in step with the text.
 * Outlines come from the font asynchronously, so an edit commits right away (one undo step) and
 * the outlines follow as a silent update to the same step.
 */
import { DEFAULT_TEXT_FONT } from 'libopenlaser/fonts';
import { outlineText, TEXT_OUTLINE_VERSION } from 'libopenlaser/fonts';
import { multiply, translation } from 'libopenlaser/geometry';
import type { PathData, Vec2 } from 'libopenlaser/geometry';
import { makeId } from 'libopenlaser/project';
import { updateObject } from 'libopenlaser/project';
import { textPlaceholderSize } from 'libopenlaser/project';
import type { Id, Project, TextObject } from 'libopenlaser/project';
import { reportError } from '$lib/ui/errors';
import type { BedFrame } from '../canvas/viewport';
import { uprightTextAt } from '../lib/placement';
import { editor } from './editor.svelte';

export const DEFAULT_TEXT_SIZE_MM = 10;

type TextStyle = Pick<
  TextObject,
  'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'italic' | 'align' | 'lineHeight' | 'letterSpacing'
>;

const styleKey = (t: TextStyle) =>
  JSON.stringify([
    t.text,
    t.fontFamily,
    t.fontSize,
    t.fontWeight,
    t.italic,
    t.align,
    t.lineHeight,
    t.letterSpacing,
  ]);

/**
 * Height of the block the transform is anchored to: the last outline's, or the estimate while
 * the font loads. A font without these letters outlines to nothing yet still has a height, so the
 * stored height wins over the estimate whenever there is one.
 */
function blockHeight(t: TextObject): number {
  if (t.blockHeight !== undefined) return t.blockHeight;
  if (!t.paths.length) return textPlaceholderSize(t).height;
  // Text saved before blockHeight existed: the tallest glyph is the closest measure there is.
  let maxY = 0;
  for (const p of t.paths) {
    maxY = Math.max(maxY, p.start.y);
    for (const s of p.segments) maxY = Math.max(maxY, s.to.y);
  }
  return maxY;
}

class TextOutlines {
  /** Object ids with an outline request in flight. */
  pending = $state<ReadonlySet<Id>>(new Set());
  private timers = new Map<Id, ReturnType<typeof setTimeout>>();
  private failed = new Set<string>();

  /**
   * Creates a text object with its top-left (as seen on screen) at `at` (bed mm) and selects it.
   * On beds homed at the top or right the screen mirrors bed space, so the text is flipped to match
   * and reads upright.
   */
  create(at: Vec2, bed?: BedFrame, text = 'Text'): Id {
    const style: TextStyle = {
      text,
      fontFamily: DEFAULT_TEXT_FONT.family,
      fontSize: DEFAULT_TEXT_SIZE_MM,
      fontWeight: DEFAULT_TEXT_FONT.weight,
      italic: false,
      align: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
    };
    const height = textPlaceholderSize(style).height;
    const [object] = editor.addOnLayer('fill', (layerId): TextObject[] => [
      {
        id: makeId(),
        kind: 'text',
        layerId,
        name: text,
        locked: false,
        visible: true,
        transform: bed ? uprightTextAt(bed, at, height) : translation(at.x, at.y - height),
        paths: [],
        ...style,
      },
    ]);
    this.schedule(object.id, 0);
    return object.id;
  }

  /** Applies a style or text edit and refreshes the outlines. */
  update(id: Id, patch: Partial<TextStyle>, options: { live?: boolean; field?: string } = {}): void {
    const named = patch.text !== undefined ? { name: patch.text.split('\n')[0].slice(0, 40) || 'Text' } : {};
    editor.commit((p) => updateObject(p, id, { ...patch, ...named }), {
      coalesce: `text-${id}-${options.field ?? 'style'}`,
    });
    if (!options.live) editor.sealHistory();
    this.schedule(id, patch.text !== undefined ? 150 : 60);
  }

  /**
   * Outlines text that has none yet (projects opened before their fonts were cached), and
   * re-outlines text made by an older outliner, in place.
   */
  ensureAll(project: Project): void {
    for (const o of project.objects) {
      if (o.kind !== 'text' || !o.text.trim() || this.pending.has(o.id) || this.failed.has(styleKey(o)))
        continue;
      // Never outlined, or outlined by an older outliner (which may also have drawn nothing, for
      // scripts it could not handle). Text the current outliner drew as nothing keeps its version
      // and stays as it is: outlining it again would give nothing again, forever.
      const never = o.paths.length === 0 && o.outlineVersion === undefined;
      const stale =
        o.outlineVersion !== undefined ? o.outlineVersion < TEXT_OUTLINE_VERSION : o.paths.length > 0;
      if (never || stale) this.schedule(o.id, 0, stale && o.paths.length > 0);
    }
  }

  /** Re-outlines text set in `family`, after that font was uploaded, removed or became available. */
  refreshFamily(family: string): void {
    const project = editor.project;
    if (!project) return;
    const wanted = family.toLowerCase();
    for (const o of project.objects) {
      if (o.kind !== 'text' || o.fontFamily.toLowerCase() !== wanted) continue;
      this.failed.delete(styleKey(o));
      this.schedule(o.id, 0);
    }
  }

  private schedule(id: Id, delayMs: number, inPlace = false): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => void this.refresh(id, inPlace), delayMs),
    );
  }

  /** `inPlace`: same text and style, new outliner; the block stays exactly where it is. */
  private async refresh(id: Id, inPlace = false): Promise<void> {
    this.timers.delete(id);
    const object = editor.project?.objects.find((o): o is TextObject => o.id === id && o.kind === 'text');
    if (!object) return;
    const key = styleKey(object);
    this.pending = new Set([...this.pending, id]);
    try {
      const outline = await outlineText(object);
      const latest = editor.project?.objects.find((o): o is TextObject => o.id === id && o.kind === 'text');
      // Drop results for text that changed again while the font was loading.
      if (!latest || styleKey(latest) !== key) return;
      if (!outline) {
        this.failed.add(key);
        return;
      }
      this.failed.delete(key);
      this.applyOutline(latest, outline.paths, outline.height, inPlace, outline.missing);
    } catch (error) {
      reportError(error, 'Text outlines');
    } finally {
      const next = new Set(this.pending);
      next.delete(id);
      this.pending = next;
    }
  }

  /** Swaps in new outlines, keeping the block's top-left corner where it was. */
  private applyOutline(
    object: TextObject,
    paths: PathData[],
    height: number,
    inPlace = false,
    missing?: string[],
  ): void {
    const shift = inPlace ? 0 : blockHeight(object) - height;
    const transform =
      Math.abs(shift) > 1e-9 ? multiply(object.transform, translation(0, shift)) : object.transform;
    editor.commit(
      (p) =>
        updateObject(p, object.id, {
          paths,
          transform,
          blockHeight: height,
          outlineVersion: TEXT_OUTLINE_VERSION,
          missingGlyphs: missing,
        }),
      {
        record: false,
      },
    );
  }
}

export const textOutlines = new TextOutlines();
