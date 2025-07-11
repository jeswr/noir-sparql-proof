// A script to prepare an RDF Dataset for a Merkle tree proof
import dereferenceToStore from "rdf-dereference-store";
import { RDFC10 } from "rdfjs-c14n";
import N3 from "n3";
import fs from "fs";
import process from 'process';

// Dereference, parse and canonicalize the RDF dataset
const { store } = await dereferenceToStore.default('./data.ttl', { localFiles: true });
const quads = (new N3.Parser()).parse(await new RDFC10().canonicalize(store));

// Now write the data out to an n-quads file format
const writer = new N3.Writer({
  format: 'application/n-quads',
});

fs.writeFileSync('./data.temp.nq', writer.quadsToString(quads));
