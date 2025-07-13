// A script to prepare an RDF Dataset for a Merkle tree proof
import { Term } from "@rdfjs/types";
import { execSync } from 'child_process';
import fs from "fs";
import { termToString } from "rdf-string-ttl";
import { DataFactory as DF } from "n3";

export function getTermEncodingsStrings(term: Term[]): string[] {
  fs.mkdirSync('./noir_encode/src/', { recursive: true });

  const content = 'fn main() {\n let triples = [' +
    term.map((term) => 
      `Field::from_le_bytes(std::hash::blake2s("${termToString(term).replaceAll('"', '\\"')}".as_bytes())),`
    )
    .join('\n') +
    '];\n' +
    'println(f"{{ \\"triples\\": {triples} }}");\n' +
    '\n}';

  fs.writeFileSync('./noir_encode/src/main.nr', content);

  const res = execSync('cd noir_encode && nargo execute', { stdio: 'pipe' }).toString();
  fs.rmSync('./noir_encode/src', { force: true, recursive: true });
  const resObj = res
    .slice(res.indexOf('{'), res.lastIndexOf('}') + 1)
    .replace(/0x[0-9a-fA-F]+/g, match => `"${match}"`);

  // Add quotes around anything that looks like a hex encoding and then parse to json
  const jsonRes = JSON.parse(resObj);

  return jsonRes.triples;
}

export function getTermEncodings(term: Term[]): BigInt[] {
  return getTermEncodingsStrings(term).map((triple: string) => BigInt(triple));
}
