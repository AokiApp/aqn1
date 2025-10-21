/**
 * AQN1 Evaluator
 * - Parses ASN.1 TLV bytes
 * - Applies AQN1 selectors (.index(n), .tag(t))
 * - Emits output using modifiers (@tlv, @tlvhex, @hex, @int, @count, @utf8, @auto, @type, @pretty)
 *
 * This implementation includes a minimal TLV decoder to avoid relying on external runtime introspection.
 * It supports:
 *  - Definite lengths (short/long form)
 *  - Indefinite-length constructed values terminated by EOC (0x00 0x00)
 *  - Universal/Application/Context/Private tag classes
 *
 * Note:
 *  - Queries reference tag values using the first tag octet (e.g., 0x02 for INTEGER, 0x04 for OCTET STRING, 0xA0 for [CONTEXT|constructed]).
 *  - .tag(t) searches depth-first within the current selection's subtree and returns the first match.
 *  - Selection is always a single node.
 */

import { parseQuery, Query, Selector, isIndexSelector, isTagSelector, isDecodeSelector, Modifier } from "./index.js";
import { BasicTLVParser } from "@aokiapp/tlv/parser";

// Tag class enum as strings for display
type TagClassName = "UNIVERSAL" | "APPLICATION" | "CONTEXT" | "PRIVATE";

/**
 * TLV Node representation
 */
interface TLVNode {
  offset: number;           // byte offset in the original buffer where the TLV starts
  tagFirstOctet: number;    // first tag octet (used by queries)
  tagClass: TagClassName;   // derived from bits 8..7 of first tag octet
  constructed: boolean;     // derived from bit 6 (0x20) of first tag octet
  tagNumber: number;        // full tag number; for long-form tags, computed across subsequent tag bytes
  length: number | null;    // content length for definite-length; null for indefinite
  indefinite: boolean;      // true when length octet is 0x80
  headerBytes: Uint8Array;  // tag + length bytes
  contentBytes: Uint8Array; // content bytes (TLV value)
  fullBytes: Uint8Array;    // entire TLV (header + content + optional EOC for indefinite)
  children: TLVNode[];      // decoded nested TLVs if constructed; empty for primitives
}

/**
 * Return a hex string for bytes
 */
function toHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parse a stream of TLVs between [start, end)
 */
function parseTLVStream(buf: Uint8Array, start = 0, end = buf.length): TLVNode[] {
  const nodes: TLVNode[] = [];
  let pos = start;
  while (pos < end) {
    const { node, nextPos } = parseOneTLV(buf, pos, end);
    nodes.push(node);
    pos = nextPos;
  }
  return nodes;
}

/**
 * Parse one TLV at position pos. End is the parsing boundary (exclusive).
 */
function parseOneTLV(buf: Uint8Array, pos: number, end: number): { node: TLVNode; nextPos: number } {
  const startPos = pos;
  if (pos >= end) {
    throw new Error("Invalid Query Syntax: Unexpected end of input TLV");
  }

  // Use library parser to decode the next TLV from remaining bytes
  const remainder = buf.slice(pos, end);
  let res;
  try {
    res = BasicTLVParser.parse(remainder.buffer);
  } catch (e: any) {
    throw new Error(e?.message ?? "TLV Parse Error");
  }

  const consumed = res.endOffset;
  const contentBytes = new Uint8Array(res.value);
  const headerLength = consumed - contentBytes.length;

  const fullBytes = buf.slice(startPos, startPos + consumed);
  const headerBytes = buf.slice(startPos, startPos + headerLength);

  const tagClassName: TagClassName =
    res.tag.tagClass === 0 ? "UNIVERSAL" : res.tag.tagClass === 1 ? "APPLICATION" : res.tag.tagClass === 2 ? "CONTEXT" : "PRIVATE";

  const tagFirstOctet =
    ((res.tag.tagClass & 0x03) << 6) |
    (res.tag.constructed ? 0x20 : 0x00) |
    (res.tag.tagNumber < 31 ? (res.tag.tagNumber & 0x1f) : 0x1f);

  let children: TLVNode[] = [];
  if (res.tag.constructed) {
    children = parseTLVStream(contentBytes, 0, contentBytes.length);
  }

  const node: TLVNode = {
    offset: startPos,
    tagFirstOctet,
    tagClass: tagClassName,
    constructed: res.tag.constructed,
    tagNumber: res.tag.tagNumber,
    length: res.length,
    indefinite: false,
    headerBytes,
    contentBytes,
    fullBytes,
    children,
  };

  const nextPos = startPos + consumed;
  return { node, nextPos };
}

/**
 * Depth-first search for first node whose first tag octet equals t in the subtree of root.
 * Current node itself is not compared; search starts with its children.
 */
function findFirstByTag(root: TLVNode, t: number): TLVNode | null {
  const stack: TLVNode[] = [...root.children];
  while (stack.length > 0) {
    const n = stack.shift()!;
    if (n.tagFirstOctet === t) return n;
    if (n.constructed && n.children.length > 0) {
      stack.unshift(...n.children);
    }
  }
  return null;
}

/**
 * Universal tag name mapping (first tag octet values for common types)
 */
const UNIVERSAL_NAMES: Record<number, string> = {
  0x01: "BOOLEAN",
  0x02: "INTEGER",
  0x03: "BIT STRING",
  0x04: "OCTET STRING",
  0x05: "NULL",
  0x06: "OBJECT IDENTIFIER",
  0x0c: "UTF8String",
  0x12: "NumericString",
  0x13: "PrintableString",
  0x14: "TeletexString",
  0x15: "VideotexString",
  0x16: "IA5String",
  0x17: "UTCTime",
  0x18: "GeneralizedTime",
  0x19: "GraphicString",
  0x1a: "VisibleString",
  0x1b: "GeneralString",
  0x1c: "UniversalString",
  0x1e: "BMPString",
  0x30: "SEQUENCE",
  0x31: "SET",
};

/**
 * Human-readable ASN.1 type for a node: Universal names or CLASS number
 */
function typeOf(node: TLVNode): string {
  if (node.tagClass === "UNIVERSAL") {
    const name = UNIVERSAL_NAMES[node.tagFirstOctet];
    if (name) return name;
    return `UNIVERSAL ${node.tagNumber}`;
  }
  const cls =
    node.tagClass === "APPLICATION"
      ? "APPLICATION"
      : node.tagClass === "CONTEXT"
      ? "CONTEXT"
      : "PRIVATE";
  return `${cls} ${node.tagNumber}`;
}

/**
 * Signed INTEGER decode (two's complement) to string using BigInt
 */
function decodeInteger(value: Uint8Array): string {
  if (value.length === 0) return "0";
  let x = 0n;
  for (let i = 0; i < value.length; i++) {
    x = (x << 8n) + BigInt(value[i]);
  }
  const bits = BigInt(value.length * 8);
  if ((value[0] & 0x80) !== 0) {
    // Negative
    x = x - (1n << bits);
  }
  return x.toString();
}

const utf8Decoder = new TextDecoder("utf-8");

/**
 * Determine if node is a string type suitable for @utf8
 */
function isStringNode(node: TLVNode): boolean {
  if (node.tagClass !== "UNIVERSAL" || node.constructed) return false;
  const first = node.tagFirstOctet;
  return (
    first === 0x0c || // UTF8String
    first === 0x16 || // IA5String
    first === 0x13 || // PrintableString
    first === 0x1a || // VisibleString
    first === 0x1e // BMPString (decoded as UTF-8 may not be correct for UCS-2, but we keep simple)
  );
}

/**
 * Choose an automatic modifier based on tag
 */
function chooseAuto(node: TLVNode): Modifier {
  if (node.tagClass === "UNIVERSAL" && !node.constructed && node.tagNumber === 2) {
    return "int";
  }
  if (isStringNode(node)) {
    return "utf8";
  }
  if (node.constructed) {
    return "tlv";
  }
  return "hex";
}

/**
 * Pretty-print node and subtree
 */
function pretty(node: TLVNode, indent = ""): string {
  const head = `${indent}${typeOf(node)}${node.constructed ? " (constructed)" : ""}, length=${node.length ?? "indef"}`;
  if (!node.constructed) {
    if (node.tagClass === "UNIVERSAL" && node.tagNumber === 2) {
      return `${head}\n${indent}  INTEGER: ${decodeInteger(node.contentBytes)}`;
    } else if (isStringNode(node)) {
      let text: string;
      try {
        text = utf8Decoder.decode(node.contentBytes);
      } catch {
        text = `<invalid utf8> ${toHex(node.contentBytes)}`;
      }
      return `${head}\n${indent}  String: "${text}"`;
    } else {
      const hex = toHex(node.contentBytes);
      const sample = hex.length > 64 ? hex.slice(0, 64) + "…" : hex;
      return `${head}\n${indent}  Hex: ${sample}`;
    }
  } else {
    let s = `${head}`;
    for (const c of node.children) {
      s += `\n${pretty(c, indent + "  ")}`;
    }
    return s;
  }
}

/**
 * Evaluate selectors on a synthetic root (constructed) wrapping top-level TLVs
 */
function select(root: TLVNode, selectors: Selector[]): TLVNode {
  let current = root;
  for (const sel of selectors) {
    if (isIndexSelector(sel)) {
      if (!current.constructed) {
        throw new Error("Index Out of Bounds: Current selection is not constructed");
      }
      if (sel.value < 0 || sel.value >= current.children.length) {
        throw new Error("Index Out of Bounds");
      }
      current = current.children[sel.value];
    } else if (isTagSelector(sel)) {
      const found = findFirstByTag(current, sel.value);
      if (!found) {
        throw new Error(`Tag Not Found: 0x${sel.value.toString(16)}`);
      }
      current = found;
    } else if (isDecodeSelector(sel)) {
      // Decode inner ASN.1 TLVs from OCTET STRING or BIT STRING content
      if (!(current.tagClass === "UNIVERSAL" && (current.tagNumber === 4 || current.tagNumber === 3))) {
        throw new Error("Value Error: Selected element is not OCTET STRING or BIT STRING");
      }
      let inner = current.contentBytes;
      if (current.tagNumber === 3) {
        // BIT STRING: first byte is 'unused bits' count
        if (inner.length < 1) {
          throw new Error("Value Error: BIT STRING has no content to decode");
        }
        inner = inner.slice(1);
      }
      let children: TLVNode[];
      try {
        children = parseTLVStream(inner);
      } catch (e: any) {
        throw new Error("Value Error: Failed to decode inner ASN.1 content");
      }
      const syntheticDecodedRoot: TLVNode = {
        offset: current.offset,
        tagFirstOctet: 0x00,
        tagClass: "UNIVERSAL",
        constructed: true,
        tagNumber: 0,
        length: inner.length,
        indefinite: false,
        headerBytes: new Uint8Array(0),
        contentBytes: inner,
        fullBytes: inner,
        children,
      };
      current = syntheticDecodedRoot;
    } else {
      throw new Error("Invalid Query Syntax: Unknown selector");
    }
  }
  return current;
}

/**
 * Public API for CLI and library
 * Parse query, parse TLV, evaluate, and format output
 */
export function parseAndEvaluate(input: Uint8Array, queryText: string): { output: { binary?: Uint8Array; text?: string } } {
  const ast: Query = parseQuery(queryText);
  const top = parseTLVStream(input);
  const syntheticRoot: TLVNode = {
    offset: 0,
    tagFirstOctet: 0x00,
    tagClass: "UNIVERSAL",
    constructed: true,
    tagNumber: 0,
    length: input.length,
    indefinite: false,
    headerBytes: new Uint8Array(0),
    contentBytes: input,
    fullBytes: input,
    children: top,
  };

  const selected = select(syntheticRoot, ast.selectors);
  const modifier: Modifier = ast.modifier ?? "auto";
  const out: { binary?: Uint8Array; text?: string } = {};

  switch (modifier === "auto" ? chooseAuto(selected) : modifier) {
    case "tlv":
      out.binary = selected.fullBytes;
      break;
    case "tlvhex":
      out.text = toHex(selected.fullBytes);
      break;
    case "hex":
      // For constructed types, output only inner content in hex (outer TL headers omitted)
      out.text = toHex(selected.contentBytes);
      break;
    case "int":
      if (!(selected.tagClass === "UNIVERSAL" && !selected.constructed && selected.tagNumber === 2)) {
        throw new Error("Incompatible Output Format: Selected element is not INTEGER");
      }
      out.text = decodeInteger(selected.contentBytes);
      break;
    case "count":
      if (!selected.constructed) {
        throw new Error("Incompatible Output Format: Selected element is not constructed");
      }
      out.text = String(selected.children.length);
      break;
    case "utf8":
      if (!isStringNode(selected)) {
        throw new Error("Value Error: Selected value is not a supported string type");
      }
      try {
        out.text = utf8Decoder.decode(selected.contentBytes);
      } catch (e: any) {
        throw new Error("Value Error: Failed to decode UTF-8 string");
      }
      break;
    case "type":
      out.text = typeOf(selected);
      break;
    case "pretty":
      out.text = pretty(selected);
      break;
    default:
      throw new Error("Invalid Modifier");
  }

  return { output: out };
}
