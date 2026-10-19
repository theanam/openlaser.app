/**
 * Text objects: creation, style edits, and keeping their cached outlines in step with the text.
 * Outlines come from the font asynchronously, so an edit commits right away (one undo step) and
 * the outlines follow as a silent update to the same step.
 */
import { DEFAULT_TEXT_FONT } from '$lib/fonts/catalog';
import { outlineText } from '$lib/fonts/outline';
import { multiply, translation } from '$lib/geometry/mat2d';
import type { PathData, Vec2 } from '$lib/geometry/types';
import { makeId } from '$lib/project/ids';
import { updateObject } from '$lib/project/operations';
import { textPlaceholderSize } from '$lib/project/outline';
import type { Id, Project, TextObject } from '$lib/project/types';
import { reportError } from '$lib/ui/errors';
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

/** Height of the text block as currently drawn (outlines, or the estimate while loading). */
function blockHeight(t: TextObject): number {
  if (!t.paths.length) return textPlaceholderSize(t).height;
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

  /** Creates a text object with its top-left at `at` (bed mm) and selects it. */
  create(at: Vec2, text = 'Text'): Id {
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
        transform: translation(at.x, at.y - height),
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

  /** Outlines any text that has none yet (projects opened before their fonts were cached). */
  ensureAll(project: Project): void {
    for (const o of project.objects) {
      if (
        o.kind === 'text' &&
        o.paths.length === 0 &&
        o.text.trim() &&
        !this.pending.has(o.id) &&
        !this.failed.has(styleKey(o))
      ) {
        this.schedule(o.id, 0);
      }
    }
  }

  private schedule(id: Id, delayMs: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => void this.refresh(id), delayMs),
    );
  }

  private async refresh(id: Id): Promise<void> {
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
      this.applyOutline(latest, outline.paths, outline.height);
    } catch (error) {
      reportError(error, 'Text outlines');
    } finally {
      const next = new Set(this.pending);
      next.delete(id);
      this.pending = next;
    }
  }

  /** Swaps in new outlines, keeping the block's top-left corner where it was. */
  private applyOutline(object: TextObject, paths: PathData[], height: number): void {
    const shift = blockHeight(object) - height;
    const transform =
      Math.abs(shift) > 1e-9 ? multiply(object.transform, translation(0, shift)) : object.transform;
    editor.commit((p) => updateObject(p, object.id, { paths, transform }), { record: false });
  }
}

export const textOutlines = new TextOutlines();
