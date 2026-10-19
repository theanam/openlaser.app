/** Append-only record of every byte the simulator received, for test assertions. */
export class ByteRecorder {
  private buffer = new Uint8Array(4096);
  private size = 0;

  get length(): number {
    return this.size;
  }

  push(byte: number): void {
    if (this.size === this.buffer.length) {
      const grown = new Uint8Array(this.buffer.length * 2);
      grown.set(this.buffer);
      this.buffer = grown;
    }
    this.buffer[this.size++] = byte;
  }

  bytes(): Uint8Array {
    return this.buffer.slice(0, this.size);
  }
}
