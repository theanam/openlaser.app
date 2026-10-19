/** Central error sink for boundaries and global handlers. Keeps the last few for bug reports. */
export interface ReportedError {
  time: number;
  where: string;
  message: string;
  stack?: string;
}

const MAX_ERRORS = 20;
export const recentErrors: ReportedError[] = [];

export function reportError(error: unknown, where: string): void {
  const err = error instanceof Error ? error : new Error(String(error));
  recentErrors.push({ time: Date.now(), where, message: err.message, stack: err.stack });
  if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
  console.error(`[openlaser] ${where}:`, error);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
