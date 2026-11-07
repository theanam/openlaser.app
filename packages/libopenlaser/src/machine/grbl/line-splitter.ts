/**
 * Accumulates received bytes and yields complete lines (split on `\n`, `\r` trimmed). Bytes are
 * decoded as Latin-1 so line noise can never throw a decoding error.
 */
export class LineSplitter {
  private partial = '';

  push(chunk: Uint8Array): string[] {
    let text = this.partial;
    for (let i = 0; i < chunk.length; i++) text += String.fromCharCode(chunk[i]);
    const parts = text.split('\n');
    this.partial = parts.pop() ?? '';
    return parts.map((line) => line.replace(/\r/g, ''));
  }

  reset(): void {
    this.partial = '';
  }
}

export function encodeAscii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}
