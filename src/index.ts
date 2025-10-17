/**
 * AQN1 AST types and parser wrapper
 */
import {
  parse as pegParse,
  SyntaxError as PeggySyntaxError,
} from "./aqn1parser.gen.js";

/** Modifier type specifies output transformation modifiers. */
export type Modifier = "tlv" | "int" | "count" | "utf8" | "hex" | "auto" | null;

/** Selector discriminated unions */
export interface IndexSelector {
  type: "index";
  value: number;
}
export interface TagSelector {
  type: "tag";
  value: number;
}
export type Selector = IndexSelector | TagSelector;

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
  // Peggy parser returns the AST according to aqn1.peggy grammar.
  // grammarSource is useful in formatted error messages.
  try {
    return pegParse(input, { grammarSource: "aqn1.peggy" }) as Query;
  } catch (err) {
    // Re-throw with original error semantics for callers to handle
    // while preserving type narrowing for Peggy syntax errors.
    if (err instanceof PeggySyntaxError) {
      throw err;
    }
    // Non-peggy errors should still propagate.
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
