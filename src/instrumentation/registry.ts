import type { WatchnocClient } from '../client';

export interface Instrumentation {
  name: string;
  init(client: WatchnocClient): void;
}

export class InstrumentationRegistry {
  private instruments: Instrumentation[] = [];

  register(instrument: Instrumentation): void {
    this.instruments.push(instrument);
  }

  initAll(client: WatchnocClient): void {
    for (const instrument of this.instruments) {
      try {
        instrument.init(client);
      } catch (err) {
        if (client.getConfig().debug) {
          process.stderr.write(`[watchnoc] failed to init instrumentation ${instrument.name}: ${err}\n`);
        }
      }
    }
  }
}

export const registry = new InstrumentationRegistry();
