#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Generate prover inputs for the Noir circuit
 * This script creates the Prover.toml file with the necessary inputs
 */

function main() {
    console.log('🔧 Generating Noir prover inputs...');
    
    // Read the signed root data
    const signedDataPath = 'signed_root.temp.json';
    if (!fs.existsSync(signedDataPath)) {
        console.error('❌ Error: signed_root.temp.json not found. Run the pipeline first.');
        process.exit(1);
    }
    
    const signedData = JSON.parse(fs.readFileSync(signedDataPath, 'utf8'));
    console.log('✅ Loaded signed root data');
    
    // Read the hashed triples data
    const hashedTriplesPath = 'hashed_triples.temp.json';
    if (!fs.existsSync(hashedTriplesPath)) {
        console.error('❌ Error: hashed_triples.temp.json not found. Run the pipeline first.');
        process.exit(1);
    }
    
    const hashedTriples = JSON.parse(fs.readFileSync(hashedTriplesPath, 'utf8'));
    console.log('✅ Loaded hashed triples data');
    
    // Extract data for Alice's triple (first group - index 0)
    const aliceTripleGroup = hashedTriples.groups[0];
    const aliceTripleHash = hashedTriples.poseidonHashes[0];
    
    console.log('Alice\'s triple components:', aliceTripleGroup);
    console.log('Alice\'s triple hash:', aliceTripleHash);
    
    // Extract signature and public key
    const signature = signedData.signature.signature;
    const publicKey = signedData.signature.publicKey;
    const merkleRoot = signedData.metadata.merkleRoot;
    
    console.log('Public key:', publicKey);
    console.log('Merkle root:', merkleRoot);
    
    // Extract Merkle proof for Alice's triple (leaf index 0)
    const merkleProof = signedData.originalMerkleData.proofs[0];
    
    console.log('Merkle proof:', merkleProof);
    
    // Noir field modulus (BN254 scalar field)
    const NOIR_FIELD_MODULUS = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
    
    // Helper function to reduce field elements to fit within Noir's field modulus
    function reduceToField(value) {
        const bigIntValue = BigInt(value);
        return (bigIntValue % NOIR_FIELD_MODULUS).toString();
    }
    
    console.log('\n🔧 Applying field reduction for Noir compatibility...');
    
    // Create prover inputs
    const proverInputs = {
        // Public inputs (will be output)
        public_key_x: reduceToField(publicKey[0]),
        public_key_y: reduceToField(publicKey[1]),
        merkle_root: reduceToField(merkleRoot),
        
        // Private inputs
        // Signature components
        signature_r8_x: reduceToField(signature.R8[0]),
        signature_r8_y: reduceToField(signature.R8[1]),
        signature_s: reduceToField(signature.S),
        
        // Alice's RDF triple components (private)
        alice_subject: reduceToField(aliceTripleGroup[0]),     // ex:Alice
        age_predicate: reduceToField(aliceTripleGroup[1]),     // ex:age
        age_value: "23",                        // Alice's actual age (23) - no reduction needed
        age_object: reduceToField(aliceTripleGroup[2]),        // Encoded age object
        graph_context: reduceToField(aliceTripleGroup[4]),     // Graph context (5th element)
        
        // Merkle proof for Alice's triple
        merkle_path: merkleProof.path.map(reduceToField),
        merkle_path_indices: merkleProof.pathIndices
    };
    
    // Generate Prover.toml content
    let proverToml = '# Prover inputs for Alice age verification circuit\n';
    proverToml += '# Generated automatically from signed data\n\n';
    
    // Add each input
    Object.entries(proverInputs).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            proverToml += `${key} = [${value.map(v => `"${v}"`).join(', ')}]\n`;
        } else {
            proverToml += `${key} = "${value}"\n`;
        }
    });
    
    // Write Prover.toml
    const proverPath = 'Prover.toml';
    fs.writeFileSync(proverPath, proverToml);
    
    console.log(`\n✅ Generated ${proverPath} with the following inputs:`);
    console.log('📊 PUBLIC INPUTS (will be output):');
    console.log(`   - Public Key X: ${proverInputs.public_key_x}`);
    console.log(`   - Public Key Y: ${proverInputs.public_key_y}`);
    console.log(`   - Merkle Root: ${proverInputs.merkle_root}`);
    
    console.log('\n🔒 PRIVATE INPUTS:');
    console.log(`   - Alice's Age: ${proverInputs.age_value} (proves > 18 without revealing exact value)`);
    console.log(`   - Signature components: R8=[${signature.R8[0].substring(0,20)}..., ${signature.R8[1].substring(0,20)}...], S=${signature.S.substring(0,20)}...`);
    console.log(`   - Triple components: Subject, Predicate, Object, Context`);
    console.log(`   - Merkle proof: ${merkleProof.path.length} siblings`);
    
    console.log('\n📝 Next steps:');
    console.log('   1. Run: nargo prove');
    console.log('   2. Run: nargo verify');
    console.log('   3. The proof will demonstrate Alice is > 18 without revealing her exact age!');
    
    return proverInputs;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { main as generateProverInputs };
