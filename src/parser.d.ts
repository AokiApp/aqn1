declare module "./aqn1parser.gen.js" {
  export interface Location {
    source?: string;
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  }

  export class SyntaxError extends Error {
    expected?: unknown[];
    found?: string | null;
    location: Location;
    format?(sources: { source: string; text: string }[]): string;
  }

  export type ParseOptions = {
    grammarSource?: string;
    startRule?: "start";
    peg$currPos?: number;
    peg$maxFailExpected?: unknown[];
    peg$silentFails?: number;
    peg$library?: boolean;
  };

  export function parse(input: string, options?: ParseOptions): unknown;

  export const StartRules: string[];
}
