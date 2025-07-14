# NOIR SPARQL Proof

A zero-knowledge proof system for SPARQL queries using the Noir programming language.

## Quick Start

To get started with this project, you only need to run two commands:

```bash
npm i
npm test
```

## What happens when you run `npm test`

The `npm test` command runs a complete pipeline that builds the project, generates cryptographic signatures, and creates zero-knowledge proofs. Here's the detailed breakdown:

### 1. `npm run build` (TypeScript compilation + Noir circuit generation)

**`npm run build:tsc`** - Compiles TypeScript source files
- Compiles all TypeScript files in the `src/` directory to JavaScript
- Outputs compiled files to the `dist/` directory
- Uses the configuration from `tsconfig.json`

**`npm run build:noir`** - Generates Noir functional circuits
- Runs `node ./dist/generateFunctional.js`
- Processes SPARQL queries and RDF data to generate Noir circuit code
- Creates the necessary zero-knowledge proof circuits for SPARQL verification

### 2. `npm run sign` - Cryptographic signing

- Executes `node ./sign.js`
- Canonicalizes RDF data using RDF Dataset Canonicalization (RDFC10)
- Builds a Poseidon2 Merkle tree from RDF triples (each triple hashed with `poseidon2::bn254::hash_4`)
- Generates ECDSA signatures using secp256k1 curve on the Merkle tree root
- Outputs signed data with Merkle paths and directions to `temp/main.json`

### 3. `npm run prove` - Zero-knowledge proof generation

- Executes `node ./prove.js`
- Uses the secp256k1 public key, ECDSA signature, and Merkle tree data
- Generates zero-knowledge proofs in Noir that verify SPARQL query execution against the signed RDF dataset
- Proves SPARQL query results without revealing the underlying RDF triples or private signing key

## Project Structure

- `inputs/` - Contains RDF data (`data.ttl`) and SPARQL queries (`sparql.rq`)
- `src/` - TypeScript source code for circuit generation and proof utilities
- `noir_prove/` - Noir circuit files for proof generation
- `noir_encode/` - Noir encoding utilities
- `template/` - Template files for Noir circuit generation

This project demonstrates how to create privacy-preserving SPARQL query verification using zero-knowledge proofs, allowing you to prove that a query result is correct without revealing the underlying RDF data.
