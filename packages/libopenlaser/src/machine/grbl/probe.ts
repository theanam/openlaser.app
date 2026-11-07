/** Is a GRBL controller (grblHAL, FluidNC) on this port? A reset makes it print its welcome. */
import { listen, type Detection, type ProbeOptions } from '../probe';
import type { Transport } from '../types';

const ASCII = new TextDecoder('latin1');
const WELCOME = /Grbl|FluidNC|\[VER:/i;

/** Tries each baud rate in turn; the first that answers wins. */
export async function probeGrbl(
  transport: Transport,
  bauds: readonly number[],
  options: ProbeOptions = {},
): Promise<Detection | null> {
  for (const baudRate of [...new Set(bauds)]) {
    const hit = await listen(
      transport,
      baudRate,
      async (write) => {
        // Soft reset: GRBL answers with its welcome line. `$I` also gets [VER:…] from boards
        // that ignore the reset byte. Neither moves anything.
        await write(Uint8Array.of(0x18));
        await write(new TextEncoder().encode('\n$I\n'));
        return (r) => (WELCOME.test(ASCII.decode(r)) ? { baudRate } : null);
      },
      options,
    );
    if (hit) return hit;
  }
  return null;
}
