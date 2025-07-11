#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Generate prover inputs for the Noir circuit with ZK-Kit libraries
 * This script creates the Prover.toml file with the necessary inputs
 */

function main() {
    console.log('🔧 Generating Noir prover inputs for ZK-Kit...');
    
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
    
    // Read the ZK-Kit Merkle tree data
    const merkleDataPath = 'merkle_tree_data.temp.json';
    if (!fs.existsSync(merkleDataPath)) {
        console.error('❌ Error: merkle_tree_data.temp.json not found. Run the pipeline first.');
        process.exit(1);
    }
    
    const merkleData = JSON.parse(fs.readFileSync(merkleDataPath, 'utf8'));
    console.log('✅ Loaded ZK-Kit Merkle tree data');
    
    // Extract data for Alice's triple (first group - index 0)
    const aliceTripleGroup = hashedTriples.groups[0];
    const aliceTripleHash = hashedTriples.poseidonHashes[0];
    
    console.log('Alice\'s triple components:', aliceTripleGroup);
    console.log('Alice\'s triple hash:', aliceTripleHash);
    
    // Extract signature and public key
    const signature = signedData.signature.signature;
    const publicKey = signedData.signature.publicKey;
    
    console.log('Public key:', publicKey);
    console.log('ZK-Kit Merkle root:', merkleData.root);
    
    // Extract Merkle proof for Alice's triple (leaf index 0)
    const merkleProof = merkleData.proofs[0];
    console.log('ZK-Kit Merkle proof:', merkleProof);
    
    // Pad arrays to match circuit expectations (max depth 8)
    const maxDepth = 8;
    const siblings = [...merkleProof.siblings];
    const pathIndices = merkleProof.pathIndices.map(idx => parseInt(idx));
    
    // Pad with zeros
    while (siblings.length < maxDepth) {
        siblings.push("0");
    }
    while (pathIndices.length < maxDepth) {
        pathIndices.push(0);
    }
    
    console.log('')
    console.log('🔧 Applying ZK-Kit compatible formatting...');
    
    // Format the prover inputs
    const proverInputs = {
        // Public inputs
        public_key_x: publicKey[0],
        public_key_y: publicKey[1],
        merkle_root: merkleData.root,
        
        // Private inputs - Signature
        signature_r8_x: signature.R8[0],
        signature_r8_y: signature.R8[1],
        signature_s: signature.S,
        
        // Private inputs - Alice's triple
        alice_subject: aliceTripleGroup[0],
        age_predicate: aliceTripleGroup[1],
        age_value: aliceTripleGroup[2],
        age_object: aliceTripleGroup[2], // Same as age_value in our case
        graph_context: aliceTripleGroup[4],
        
        // Private inputs - ZK-Kit Merkle proof
        merkle_siblings: siblings,
        merkle_path_indices: pathIndices,
        merkle_depth: merkleProof.siblings.length
    };
    
    // Generate the Prover.toml content
    let tomlContent = '# Prover inputs for Alice age verification circuit\n';
    tomlContent += '# Generated automatically from ZK-Kit data\n\n';
    
    // Add all inputs
    for (const [key, value] of Object.entries(proverInputs)) {
        if (Array.isArray(value)) {
            if (key === 'merkle_path_indices') {
                // Convert to string array for proper TOML format
                tomlContent += `${key} = [${value.map(v => `"${v}"`).join(', ')}]\n`;
            } else {
                tomlContent += `${key} = [${value.map(v => `"${v}"`).join(', ')}]\n`;
            }
        } else {
            tomlContent += `${key} = "${value}"\n`;
        }
    }
    
    // Write the Prover.toml file
    fs.writeFileSync('Prover.toml', tomlContent);
    
    console.log('\\n✅ Generated Prover.toml with ZK-Kit inputs:');
    console.log('📊 PUBLIC INPUTS:');
    console.log(`   - Public Key X: ${publicKey[0]}`);
    console.log(`   - Public Key Y: ${publicKey[1]}`);
    console.log(`   - ZK-Kit Merkle Root: ${merkleData.root}`);
    
    console.log('\\n🔒 PRIVATE INPUTS:');
    console.log(`   - Alice's Age: ${aliceTripleGroup[2]} (proves > 18 without revealing exact value)`);
    console.log(`   - Signature components: R8=[${signature.R8[0].slice(0,20)}..., ${signature.R8[1].slice(0,20)}...], S=${signature.S.slice(0,20)}...`);
    console.log('   - Triple components: Subject, Predicate, Object, Context');
    console.log(`   - ZK-Kit Merkle proof: ${merkleProof.siblings.length} siblings, depth ${merkleProof.siblings.length}`);
    
    console.log('\\n📝 Next steps:');
    console.log('   1. Run: nargo execute');
    console.log('   2. The proof will demonstrate Alice is > 18 using ZK-Kit libraries!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { main };
