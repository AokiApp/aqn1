/**
 * AQN1 CLI: reads ASN.1 TLV from stdin and evaluates a query.
 * Supports -h/--help and -v/--version.
 */
import { parseAndEvaluate } from "../evaluator.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

function printHelp(): void {
  console.log(`AQN1 - Abstract Query Notation 1
A minimal query language for selecting and formatting ASN.1 TLV data.
Think jq for JSON or XPath for XML—AQN1 for ASN.1.

USAGE:
  aqn1 "<query>" < data.asn1

OPTIONS:
  -h, --help     Show this help message
  -v, --version  Show version number

QUERY SYNTAX:
  Query = [.selector(args)]...[@modifier]
  
  Example: .index(0).tag(0x02)@int

SELECTORS:
  .index(n)      Select nth immediate child (0-based index)
  .tag(t)        Find first descendant with tag t (decimal or 0x hex)
  .decode()      Decode OCTET STRING or BIT STRING content as ASN.1

MODIFIERS:
  @tlv           Output binary TLV (Tag + Length + Value)
  @tlvhex        Output TLV as hex string (lowercase, no separators)
  @hex           Output Value bytes as hex (primitives) or content hex (constructed)
  @int           Output INTEGER value as signed decimal
  @utf8          Output string types as UTF-8 text
  @count         Output number of immediate children (constructed only)
  @type          Output ASN.1 type name (e.g., INTEGER, SEQUENCE, CONTEXT 0)
  @auto          Auto-choose format: INT→@int, strings→@utf8, others→@hex/@tlv
  @pretty        Human-readable tree layout with types and values

INPUT:
  Reads ASN.1 TLV bytes from stdin (DER/BER format supported)

OUTPUT:
  Results written to stdout (binary for @tlv, text for others)

EXIT CODES:
  0              Success
  1              Error (invalid query, selection mismatch, decode failure, I/O error)

EXAMPLES:
  # Basic selection
  aqn1 ".index(0)@type" < data.asn1                    # Type of first element
  aqn1 ".index(0).index(1)@utf8" < data.asn1          # UTF-8 value of nested element
  
  # Tag-based selection
  aqn1 ".tag(0x02)@int" < data.asn1                    # First INTEGER value
  aqn1 ".tag(0x04)@hex" < data.asn1                    # First OCTET STRING as hex
  
  # Decoding nested structures
  aqn1 ".tag(0x04).decode()@count" < data.asn1         # Count elements in decoded OCTET STRING
  aqn1 ".tag(0x04).decode().tag(0x02)@int" < data.asn1 # INTEGER inside decoded OCTET STRING
  
  # Output formats
  aqn1 ".index(0)@tlvhex" < data.asn1                  # Full TLV as hex
  aqn1 ".index(0)@pretty" < data.asn1                  # Pretty-printed tree
  aqn1 "@auto" < data.asn1                             # Auto-format entire input

COMMON PATTERNS:
  Count top-level elements:     aqn1 "@count" < data.asn1
  Show structure overview:      aqn1 "@pretty" < data.asn1
  Extract first string:         aqn1 ".tag(0x0c)@utf8" < data.asn1  # UTF8String
  Extract first integer:        aqn1 ".tag(0x02)@int" < data.asn1
  Get raw value of element:     aqn1 ".index(0)@hex" < data.asn1

NOTES:
  • Tag matching uses first octet only (class + constructed + low 5 bits)
  • Long-form tags (≥31) match on 0x1f/0x5f/0x9f/0xdf patterns
  • Selection must yield exactly one element (single-selection model)
  • Indefinite-length encodings supported (@tlv preserves EOC markers)

For detailed documentation: https://github.com/AokiApp/aqn1
`);
}

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const pkgText = fs.readFileSync(pkgPath, "utf8");
    const pkgUnknown: unknown = JSON.parse(pkgText);
    if (
      pkgUnknown &&
      typeof pkgUnknown === "object" &&
      "version" in pkgUnknown
    ) {
      const v = (pkgUnknown as Record<string, unknown>).version;
      return typeof v === "string" ? v : "unknown";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

function readStdin(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (d: Buffer) => chunks.push(d));
    process.stdin.on("error", reject);
    process.stdin.on("end", () => {
      resolve(new Uint8Array(Buffer.concat(chunks)));
    });
    // Ensure flowing
    if (process.stdin.isTTY) {
      // No stdin provided
      resolve(new Uint8Array());
    } else {
      process.stdin.resume();
    }
  });
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }
  if (args.includes("-v") || args.includes("--version")) {
    console.log(getVersion());
    return;
  }
  const queryArg = args.find((a) => !a.startsWith("-"));
  if (!queryArg) {
    console.error("Error: Missing query argument.");
    printHelp();
    process.exitCode = 1;
    return;
  }
  try {
    const input = await readStdin();
    const { output } = parseAndEvaluate(input, queryArg);
    if (output.binary) {
      process.stdout.write(Buffer.from(output.binary));
    } else if (output.text) {
      process.stdout.write(output.text + "\n");
    } else {
      // No output; exit success
    }
  } catch (e: unknown) {
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : JSON.stringify(e);
    console.error(msg);
    process.exitCode = 1;
  }
}
