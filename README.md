# Abstract Query Notation 1 (AQN1)

AQN1 is a minimal query language for selecting and formatting ASN.1 TLV data. Think jq for JSON or XPath for XML—AQN1 for ASN.1.

## Quickstart

Given this ASN.1 DER-encoded structure (hex):

```
300a020105160548656c6c6f
```

It represents:

- SEQUENCE
  - INTEGER 5
  - IA5String "Hello"

Example queries:

- Select the first element of the SEQUENCE and show its type:
```
.index(0).index(0)@type
```
Output:
```
INTEGER
```

- Select the second element of the SEQUENCE and show its UTF-8 value:
```
.index(0).index(1)@utf8
```
Output:
```
Hello
```

- Count immediate children of the first top-level SEQUENCE:
```
.index(0)@count
```
Output:
```
2
```

- Show the full TLV of the first top-level element as hex:
```
.index(0)@tlvhex
```
Output:
```
300a020105160548656c6c6f
```

## Concepts

AQN1 operates on a single-selection model: each step refines the current selection to exactly one ASN.1 element. If a step cannot yield exactly one element, it is an error.

- Element: One ASN.1 item, either primitive (leaf) or constructed (branch).
- Selector: A step that changes the current selection (navigation).
- Modifier: A terminal that formats the selected element for output.

The initial selection is a synthetic root (constructed) whose children are the top-level TLVs from the input. For example, `.index(0)` selects the first top-level TLV.

## Syntax

An AQN1 query is a sequence of selectors followed by an optional modifier:

```
.selector(args).selector(args)...@modifier
```

### Selectors

- `.index(n)`: Select the nth immediate child of the current constructed element. Indices are zero-based. Using `index` on a primitive selection is an error.
- `.tag(t)`: Depth-first search within the current selection’s subtree; select the first descendant whose first tag octet equals `t`. Tags may be decimal (e.g., `2`) or hexadecimal (e.g., `0x02`). The comparison is performed on the first tag octet (class + constructed bit + low 5 bits or 0x1f for long-form).
- `.decode()`: If the current selection is an OCTET STRING or BIT STRING, decode its content as ASN.1 TLV and set the selection to the decoded root element. For BIT STRING, the first content byte (unused-bits count) is skipped. Chaining `decode()` is allowed.

### Modifiers

- `@tlv`: Output the selected element as binary TLV (Tag + Length + Value). For constructed types, the entire nested TLV is emitted. For indefinite-length encodings, the EOC (0x00 0x00) is preserved.
- `@tlvhex`: Same as `@tlv` but hex-encoded (lowercase, no separators).
- `@hex`: For primitive types, output the Value bytes in hex (no outer Tag/Length). For constructed types, output the inner content hex (concatenated TLVs of immediate children; outer Tag/Length omitted).
- `@int`: If the selected element is INTEGER, output its signed integer value (DER semantics).
- `@utf8`: If the selected element is a string type (e.g., UTF8String, IA5String, PrintableString, VisibleString, BMPString), output its value as UTF-8.
- `@count`: If the selected element is constructed, output the number of immediate children.
- `@type`: Output the ASN.1 type name of the selected element (e.g., INTEGER, OCTET STRING, SEQUENCE, APPLICATION n, CONTEXT n, PRIVATE n).
- `@auto`: Choose an output automatically based on the type:
  - INTEGER → `@int`
  - String types → `@utf8`
  - Constructed → `@tlv`
  - Other primitive → `@hex`
- `@pretty`: Human-readable layout of the selection (type, length, and nested elements).

Note: `@pretty` is accepted by the parser wrapper even if it does not appear in the low-level grammar file; treat this section as the surface syntax.

### Grammar (EBNF)

```
Query      = Steps [Modifier] ;
Steps      = Step { Step } ;
Step       = "." Identifier "(" [ Argument ] ")" ;
Identifier = "index" | "tag" | "decode" ;
Argument   = Number | HexNumber ;
Modifier   = "@" ( "tlv" | "tlvhex" | "int" | "count" | "utf8" | "hex" | "auto" | "type" | "pretty" ) ;
Number     = DIGIT { DIGIT } ;
HexNumber  = "0x" HEXDIGIT { HEXDIGIT } ;
```

## Examples

Using the same sample (`300a020105160548656c6c6f`):

- First INTEGER value:
```
.tag(0x02)@int
```
Output:
```
5
```

- Second element’s raw value as hex:
```
.index(0).index(1)@hex
```
Output:
```
48656c6c6f
```

- Type of the second element:
```
.index(0).index(1)@type
```
Output:
```
IA5String
```

- Pretty-print the first top-level element:
```
.index(0)@pretty
```
Output (example):
```
SEQUENCE (constructed), length=10
  INTEGER, length=1
    INTEGER: 5
  IA5String, length=5
    String: "Hello"
```

- Decode nested ASN.1 from OCTET STRING (example pattern):
```
.tag(0x04).decode()@count
```

## CLI

AQN1 includes an optional command-line tool.

### Install and run

- Run with npx (no install):
```
npx @aokiapp/aqn1 ".index(0)@type" < data.asn1
```

- Install globally:
```
npm install -g @aokiapp/aqn1
aqn1 ".index(0).index(1)@utf8" < data.asn1
```

### Inputs

- Reads TLV bytes from stdin.

### Exit codes

- `0`: Success
- `1`: Any error (invalid query, selection/type mismatch, decode errors, I/O errors)

### Help

```
npx @aokiapp/aqn1 --help
npx @aokiapp/aqn1 --version
```

## Errors

- Invalid Query Syntax: The query does not conform to the grammar.
- Index Out of Bounds: `index(n)` exceeds the child count, or current selection is not constructed.
- Tag Not Found: No matching descendant whose first tag octet equals `t`.
- Invalid Modifier: Unknown or unsupported modifier.
- Incompatible Output Format: Selected data cannot be represented in the requested format (e.g., `@int` on non-INTEGER, `@count` on primitive).
- Value Error: Selected value cannot be processed as requested (e.g., non-UTF8 string for `@utf8`, failed inner decode).
- Empty Selection: No selection available to format.

## Notes and limitations

- Tag comparisons use the first tag octet. For long-form tag numbers (≥ 31), the first octet is 0x1f (plus class/constructed bits). Therefore, `.tag(0x1f)` (or `0x5f/0x9f/0xdf` for other classes) matches any long-form tag in that class/constructed combination; exact long-form tag-number matching is not yet supported.
- `.tag(t)` searches depth-first within the current selection’s subtree and returns the first match.
- Definite and indefinite lengths are supported. For indefinite-length values, `@tlv` preserves the trailing EOC.
- DER/BER inputs are supported when provided as TLV bytes.

## License

This project is licensed under the AokiApp Normative Applicable License - Tight (ANAL-Tight). See License:
https://github.com/AokiApp/ANAL/blob/main/licenses/ANAL-Tight-1.0.1.md