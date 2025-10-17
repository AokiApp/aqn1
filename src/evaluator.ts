/**
 * AQN1 selection evaluator and TLV decoder (DER-like definite lengths only)
 * Provides selector execution and modifier rendering, including @auto.
 */
import { Query, Selector, Modifier, isIndexSelector, isTagSelector } from './index.js';

// TLV node representation
export interface TLVNode {
  tag: number;
  constructed: boolean;
  length: number;
  header: Uint8Array;
  value: Uint8Array;
  children?: TLVNode[];
  start: number;
  end: number;
}

/** Decode a sequence of TLV elements from a buffer. */
export function decodeTLVs(buf: Uint8Array): TLVNode[] {
  const res: TLVNode[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const start = pos;
    const tagByte = buf[pos++];
    const constructed = (tagByte & 0x20) !== 0;
    // For now, treat one-byte tag numbers; long-form tags (0x1f) are passthrough
    const tag = tagByte;

    if (pos >= buf.length) throw new Error(`Truncated TLV after tag at ${start}`);
    const lenFirst = buf[pos++];
    let length = 0;
    if (lenFirst < 0x80) {
      length = lenFirst;
    } else {
      const n = lenFirst & 0x7f;
      if (n === 0) {
        throw new Error('Indefinite length TLV is not supported');
      }
      if (pos + n > buf.length) throw new Error(`Truncated TLV length at ${start}`);
      for (let i = 0; i < n; i++) {
        length = (length << 8) | buf[pos++];
      }
    }
    const header = buf.slice(start, pos);
    if (pos + length > buf.length) throw new Error(`Truncated TLV value at ${start}`);
    const value = buf.slice(pos, pos + length);
    pos += length;
    const end = pos;
    const node: TLVNode = { tag, constructed, length, header, value, start, end };
    if (constructed) {
      node.children = decodeTLVs(value);
    }
    res.push(node);
  }
  return res;
}

/** Depth-first find by tag across all descendants of given nodes. */
export function findByTag(nodes: TLVNode[], tag: number): TLVNode[] {
  const out: TLVNode[] = [];
  const dfs = (n: TLVNode) => {
    if (n.tag === tag) out.push(n);
    if (n.children) for (const c of n.children) dfs(c);
  };
  for (const n of nodes) dfs(n);
  return out;
}

/** Apply index selector relative to children when present, else global list. */
export function selectIndex(nodes: TLVNode[], n: number): TLVNode[] {
  const out: TLVNode[] = [];
  let anyChildren = false;
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      anyChildren = true;
      if (n >= 0 && n < node.children.length) out.push(node.children[n]);
    }
  }
  if (!anyChildren) {
    if (n >= 0 && n < nodes.length) out.push(nodes[n]);
  }
  return out;
}

/** Evaluate selectors of a query to produce the final selection. */
export function evaluateSelectors(root: TLVNode[], selectors: Selector[]): TLVNode[] {
  let selection = root;
  for (const sel of selectors) {
    if (isIndexSelector(sel)) {
      selection = selectIndex(selection, sel.value);
    } else if (isTagSelector(sel)) {
      selection = findByTag(selection, sel.value);
    }
  }
  return selection;
}

/** Format helpers */
function toHex(u8: Uint8Array): string {
  return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isAsciiPrintable(u8: Uint8Array): boolean {
  for (const b of u8) {
    if (b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e)) continue;
    return false;
  }
  return true;
}

function intFromBytes(u8: Uint8Array): bigint {
  // DER INTEGER is two's complement big-endian
  if (u8.length === 0) return 0n;
  const negative = (u8[0] & 0x80) !== 0;
  let v = 0n;
  for (const b of u8) {
    v = (v << 8n) | BigInt(b);
  }
  if (negative) {
    // Convert two's complement
    const bits = BigInt(u8.length * 8);
    const mod = 1n << bits;
    v = v - mod;
  }
  return v;
}

function headerPlusValue(n: TLVNode): Uint8Array {
  const out = new Uint8Array(n.header.length + n.value.length);
  out.set(n.header, 0);
  out.set(n.value, n.header.length);
  return out;
}

function concatBuffers(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/** Return ASN.1 type name for a TLV node's tag. */
function typeStringFor(n: TLVNode): string {
  const tag = n.tag;
  const tagNum = tag & 0x1f;
  const cls = (tag & 0xc0) >> 6;
  if (cls === 0) {
    // UNIVERSAL
    const universal: Record<number, string> = {
      0x01: "BOOLEAN",
      0x02: "INTEGER",
      0x03: "BIT STRING",
      0x04: "OCTET STRING",
      0x05: "NULL",
      0x06: "OBJECT IDENTIFIER",
      0x0c: "UTF8String",
      0x10: "SEQUENCE",
      0x11: "SET",
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
      0x1e: "BMPString",
    };
    if (universal[tagNum]) return universal[tagNum];
    if (tagNum === 0x1f) return "Universal(LongForm)";
    return `Universal(${tagNum})`;
  } else if (cls === 1) {
    // APPLICATION
    return `[APPLICATION ${tagNum}]`;
  } else if (cls === 2) {
    // CONTEXT-SPECIFIC
    return `[${tagNum}]`;
  } else {
    // PRIVATE
    return `[PRIVATE ${tagNum}]`;
  }
}

/** Decide automatic modifier based on tag and content. */
export function autoModifierFor(node: TLVNode): Exclude<Modifier, null | "auto"> {
  const t = node.tag;
  // Universal INTEGER
  if (t === 0x02) return "int";
  // Universal SEQUENCE or SET (constructed)
  if (t === 0x30 || t === 0x31 || node.constructed) return "count";
  // UTF8String / PrintableString / IA5String
  if (t === 0x0c || t === 0x13 || t === 0x16) return "utf8";
  // Octet String: try ASCII, else hex
  if (t === 0x04) return isAsciiPrintable(node.value) ? "utf8" : "hex";
  // Default to hex
  return "hex";
}

/** Render selection according to modifier. For @tlv, returns binary; else text. */
export function renderSelection(selection: TLVNode[], modifier: Modifier): { binary?: Uint8Array; text?: string } {
  if (modifier === "tlv") {
    const chunks = selection.map(headerPlusValue);
    return { binary: concatBuffers(chunks) };
  }
  if (modifier === "count") {
    return { text: String(selection.length) };
  }
  const lines: string[] = [];
  const dec = new TextDecoder('utf-8');
  for (const n of selection) {
    const m = modifier === "auto" ? autoModifierFor(n) : modifier ?? "hex";
    switch (m) {
      case "int": {
        lines.push(intFromBytes(n.value).toString());
        break;
      }
      case "utf8": {
        lines.push(dec.decode(n.value));
        break;
      }
      case "hex": {
        lines.push(toHex(n.value));
        break;
      }
      case "tlv": {
        // Not chosen by auto, but handle explicitly
        lines.push(toHex(headerPlusValue(n)));
        break;
      }
      case "tlvhex": {
        lines.push(toHex(headerPlusValue(n)));
        break;
      }
      case "count": {
        lines.push(n.children ? String(n.children.length) : "0");
        break;
      }
      case "type": {
        lines.push(typeStringFor(n));
        break;
      }
    }
  }
  return { text: lines.join('\n') };
}

/** End-to-end evaluator: decode, select, render. */
export function evaluate(input: Uint8Array, query: Query): { selection: TLVNode[]; output: { binary?: Uint8Array; text?: string } } {
  const roots = decodeTLVs(input);
  const selection = evaluateSelectors(roots, query.selectors);
  const output = renderSelection(selection, query.modifier);
  return { selection, output };
}

/** Utility to parse then evaluate a raw query string. */
import { parseQuery } from './index.js';
export function parseAndEvaluate(input: Uint8Array, q: string) {
  return evaluate(input, parseQuery(q));
}