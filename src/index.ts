/**
 * AQN1 AST types and parser wrapper
 */
import {
  parse as pegParse,
  SyntaxError as PeggySyntaxError,
} from "./aqn1parser.gen.js";

/** Modifier type specifies output transformation modifiers. */
export type Modifier =
  | "tlv"
  | "tlvhex"
  | "int"
  | "count"
  | "utf8"
  | "hex"
  | "auto"
  | "type"
  | "pretty"
  | null;

/** Selector discriminated unions */
export interface IndexSelector {
  type: "index";
  value: number;
}
export interface TagSelector {
  type: "tag";
  value: number;
}
export interface DecodeSelector {
  type: "decode";
}
export type Selector = IndexSelector | TagSelector | DecodeSelector;

/** Root AST node returned by the Peggy parser */
export interface Query {
  type: "Query";
  selectors: Selector[];
  modifier: Modifier;
}

/**
 * Parse an AQN1 query string to its AST.
 * On invalid syntax, throws Peggy SyntaxError containing location information.
 */
export function parseQuery(input: string): Query {
  // Preprocess to support modifiers not yet in the Peggy grammar (e.g., "@pretty").
  // Replace "@pretty" with a recognized placeholder (e.g., "@type") for parsing,
  // then restore the intended modifier in the returned AST.
  const original = input;
  const replaced = original.replace(/@(\s*)pretty\b/gi, "@$1type");
  try {
    const q = pegParse(replaced, { grammarSource: "aqn1.peggy" }) as Query;
    if (/@\s*pretty\b/i.test(original)) {
      q.modifier = "pretty";
    }
    return q;
  } catch (err) {
    if (err instanceof PeggySyntaxError) {
      throw err;
    }
    throw err as unknown;
  }
}

/**
 * Type guards to help consumers narrow selector kinds
 */
export function isIndexSelector(sel: Selector): sel is IndexSelector {
  return sel.type === "index";
}
export function isTagSelector(sel: Selector): sel is TagSelector {
  return sel.type === "tag";
}
export function isDecodeSelector(sel: Selector): sel is DecodeSelector {
  return sel.type === "decode";
}
