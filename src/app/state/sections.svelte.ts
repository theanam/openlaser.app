/**
 * Which side-panel sections are open. Remembered in this browser; everything opens by default.
 */
export type SectionId = 'machine' | 'layers' | 'inspector';

const KEY = 'openlaser.sections.closed';

function stored(): Set<SectionId> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as SectionId[]) : []);
  } catch {
    return new Set();
  }
}

class Sections {
  private closed = $state.raw<ReadonlySet<SectionId>>(stored());

  isOpen(id: SectionId): boolean {
    return !this.closed.has(id);
  }

  set(id: SectionId, open: boolean): void {
    if (this.isOpen(id) === open) return;
    const next = new Set(this.closed);
    if (open) next.delete(id);
    else next.add(id);
    this.closed = next;
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // Storage unavailable: the choice holds for this visit.
    }
  }

  toggle(id: SectionId): void {
    this.set(id, !this.isOpen(id));
  }
}

export const sections = new Sections();
