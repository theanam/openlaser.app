/** Fault injection for streaming tests (SPEC §8). All randomness comes from the simulator RNG. */
export interface SimulatorFaults {
  /** Return an error code to answer `error:N` instead of executing the line. */
  lineError?: (line: string, lineNumber: number) => number | null;
  /** Return an alarm code to raise that alarm when the line is received (it is not acknowledged). */
  lineAlarm?: (line: string, lineNumber: number) => number | null;
  /** Simulates a cable pull once this many bytes have been received in total. */
  disconnectAfterBytes?: number;
  /** Delay every response by this many ms. */
  responseDelayMs?: number;
  /** Probability per response line of first emitting a line of random garbage bytes. */
  garbageProbability?: number;
  /** Deliver output in random pieces of 1..maxPieceBytes bytes. */
  splitChunks?: { maxPieceBytes: number };
}
