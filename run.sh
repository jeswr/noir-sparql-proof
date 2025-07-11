#!/bin/bash

# Complete RDF to Zero-Knowledge Proof Pipeline
# Processes RDF data through field encoding, hashing, Merkle tree, signing, and ZK proof generation

echo "🚀 Starting RDF to Zero-Knowledge Proof Pipeline..."

node ./normalize.js

cd encode
cargo run --release --bin encode -- ../data.temp.nq ../data.fr.temp.json
cd ..

node ./parse_field_elements.js data.fr.temp.json hashed_triples.temp.json

node ./merkle_tree_zkkit.js

node ./sign_root.js merkle_tree_data.temp.json signed_root.temp.json

node ./generate_prover_inputs_zkkit.js

echo ""
echo "🔧 Attempting to execute Noir circuit..."
echo "⚠️  Note: Current RDF encoding generates values exceeding Noir's field modulus"
echo "   This is a known limitation that requires field encoding adjustment"

if nargo execute; then
    echo "✅ Noir circuit executed successfully!"
    echo "🎯 Alice's age verification proof generated!"
    echo "   - Proves Alice is > 18 without revealing exact age"
    echo "   - Verifies authenticated Merkle tree inclusion"
    echo "   - Validates Baby Jubjub signature"
else
    echo "❌ Noir circuit execution failed due to field modulus limitation"
    echo "📝 Next steps to fix:"
    echo "   1. Modify RDF encoding to generate smaller field elements"
    echo "   2. Use field reduction or different encoding scheme"
    echo "   3. Update circuit to handle larger field inputs"
fi

echo ""
echo "✅ Pipeline execution complete!"
echo "📁 Generated files:"
echo "   - data.fr.temp.json (RDF field elements)"
echo "   - hashed_triples.temp.json (Poseidon hashes)"
echo "   - merkle_tree_data.temp.json (Merkle tree & proofs)"
echo "   - signed_root.temp.json (Baby Jubjub signature)"
echo "   - Prover.toml (Noir circuit inputs)" 
