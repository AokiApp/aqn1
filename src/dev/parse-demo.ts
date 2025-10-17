/**
 * Demo: Parse AQN1 queries and print AST
 */
import { parseQuery } from '../index.js';

function runSample(query: string) {
  try {
    const ast = parseQuery(query);
    console.log(`Query: ${query}`);
    console.log(JSON.stringify(ast, null, 2));
    console.log('---');
  } catch (e: any) {
    console.error(`Failed to parse: ${query}`);
    if (e && e.message) {
      console.error(e.message);
    } else {
      console.error(e);
    }
    console.log('---');
  }
}

function main() {
  const samples = [
    '.index(0).index(0x1)@tlv',
    '.index(0)@tlvhex',
    '.tag(0x02)@int',
    '.tag(0x02)@type',
    '.tag(0xa0).index(1).tag(0x04)@hex',
    '.tag(0x16)@utf8',
    '@utf8',
    '@auto',
    '@type',
  ];
  for (const q of samples) {
    runSample(q);
  }
}

main();