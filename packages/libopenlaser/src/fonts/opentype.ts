/* opentype.js, loaded on first use so it stays out of the start-up bundle. */
import type { OtFont } from './outline';

/** The font metadata this app reads besides outlines. */
export type OtFontInfo = OtFont & {
  getEnglishName(name: string): string | undefined;
  tables: { os2?: { usWeightClass?: number; fsSelection?: number }; head?: { macStyle?: number } };
};

type OpentypeModule = { parse(buffer: ArrayBuffer): OtFontInfo };
let otModule: Promise<OpentypeModule> | null = null;

export const loadOpentype = () =>
  // @ts-expect-error opentype.js ships no type declarations; the module is narrowed to OpentypeModule below.
  (otModule ??= import('opentype.js').then((m: unknown) => {
    // The UMD build (picked under the "browser" condition) exposes the API on `default` only.
    const mod = m as Partial<OpentypeModule> & { default?: OpentypeModule };
    return (mod.parse ? mod : mod.default) as OpentypeModule;
  }));
