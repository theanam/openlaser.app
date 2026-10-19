/** First-run tour flag, kept in long-term browser storage so the tour shows once. */
const KEY = 'openlaser.tour.v1';

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    // Storage blocked (private mode, sandbox): skip the tour instead of showing it every load.
    return true;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(KEY, 'done');
  } catch {
    // Nothing to do: the tour simply shows again next time.
  }
}

export function resetTour(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore: storage unavailable.
  }
}
