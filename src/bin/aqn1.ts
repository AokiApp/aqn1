/**
 * AQN1 CLI: reads ASN.1 TLV from stdin and evaluates a query.
 * Supports -h/--help and -v/--version.
 */
import { parseAndEvaluate } from '../evaluator.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

function printHelp(): void {
  console.log(`Usage: aqn1 "<query>" < data.asn1

Options:
  -h, --help     Show help
  -v, --version  Show version

Examples:
  aqn1 ".index(0).tag(0x02)@int" < data.asn1
  aqn1 ".tag(0x04).decode()@count" < data.asn1
  aqn1 "@utf8" < data.asn1
  aqn1 "@auto" < data.asn1
`);
}

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkgText = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgText);
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function readStdin(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (d: Buffer) => chunks.push(d));
    process.stdin.on('error', reject);
    process.stdin.on('end', () => {
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
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    return;
  }
  if (args.includes('-v') || args.includes('--version')) {
    console.log(getVersion());
    return;
  }
  const queryArg = args.find(a => !a.startsWith('-'));
  if (!queryArg) {
    console.error('Error: Missing query argument.');
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
      process.stdout.write(output.text + '\n');
    } else {
      // No output; exit success
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error(msg);
    process.exitCode = 1;
  }
}