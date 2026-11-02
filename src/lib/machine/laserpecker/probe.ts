/**
 * Is a LaserPecker (its own protocol) on this port? It answers a version query with an AA BB
 * frame. Protocol details from the LaserPecker protocol notes by nerdocs
 * (https://github.com/nerdocs/pyrograph/blob/main/docs/protocol.md); implemented independently.
 */
import { listen, type Detection, type ProbeOptions } from '../probe';
import type { Transport } from '../types';
import { Func, Query, queryCommand } from './commands';
import { FrameReader } from './frame';
import { modelFromVersion } from './models';
import { parseVersion } from './replies';

export async function probeLaserPecker(
  transport: Transport,
  baudRate = 460800,
  options: ProbeOptions = {},
): Promise<Detection | null> {
  return listen(
    transport,
    baudRate,
    async (write) => {
      await write(queryCommand(Query.version));
      return (received) => {
        // Read the whole buffer each time: replies may arrive in pieces.
        for (const frame of new FrameReader().push(received)) {
          if (frame.kind !== 'short' || frame.func !== Func.query) continue;
          const version = parseVersion(frame.bytes);
          if (version) return { baudRate, model: modelFromVersion(version.software).name };
        }
        return null;
      };
    },
    { listenMs: 1500, ...options },
  );
}
