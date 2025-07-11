#!/usr/bin/env node

import fs from 'fs';
import { LeanIMT } from '@zk-kit/lean-imt';
import { poseidon2 } from 'poseidon-lite';

/**
 * ZK-Kit Lean IMT wrapper for our RDF SPARQL proof pipeline
 * Uses the standard ZK-Kit library instead of custom implementation
 */

async function main() {
    console.log('🌳 Building Merkle tree with ZK-Kit Lean IMT...');
    
    // Read Poseidon hashes from the previous step
    const hashesData = JSON.parse(fs.readFileSync('hashed_triples.temp.json', 'utf8'));
    const leaves = hashesData.poseidonHashes.map(hash => BigInt(hash));
    
    console.log(`Loaded ${leaves.length} Poseidon hashes as leaves`);
    
    // Create Lean IMT with Poseidon2 hasher
    // Note: Lean IMT expects a hash function that takes an array of 2 elements
    const tree = new LeanIMT((a, b) => poseidon2([a, b]));
    
    // Insert all leaves into the tree
    for (const leaf of leaves) {
        tree.insert(leaf);
    }
    
    console.log('Merkle tree built successfully!');
    console.log(`  Leaves: ${tree.leaves.length}`);
    console.log(`  Depth: ${tree.depth}`);
    console.log(`  Size: ${tree.size}`);
    console.log(`  Root: ${tree.root}`);
    
    // Generate proofs for all leaves
    const proofs = [];
    for (let i = 0; i < tree.leaves.length; i++) {
        const proof = tree.generateProof(i);
        
        // Verify the proof to ensure correctness
        const isValid = tree.verifyProof(proof);
        console.log(`  Proof ${i}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
        
        // Convert proof to format compatible with ZK-Kit binary-merkle-root
        const pathIndices = [];
        let currentIndex = proof.index;
        for (let depth = 0; depth < proof.siblings.length; depth++) {
            pathIndices.push(currentIndex % 2);
            currentIndex = Math.floor(currentIndex / 2);
        }
        
        proofs.push({
            leafIndex: i,
            leaf: proof.leaf.toString(),
            siblings: proof.siblings.map(s => s.toString()),
            pathIndices: pathIndices.map(idx => idx.toString()),
            root: proof.root.toString()
        });
    }
    
    // Save the tree data and proofs
    const merkleData = {
        root: tree.root.toString(),
        leaves: tree.leaves.map(leaf => leaf.toString()),
        depth: tree.depth,
        size: tree.size,
        proofs: proofs
    };
    
    fs.writeFileSync('merkle_tree_data.temp.json', JSON.stringify(merkleData, null, 2));
    
    console.log('\n=== ZK-KIT LEAN IMT SUMMARY ===');
    console.log(`Root: ${tree.root}`);
    console.log(`Root (hex): 0x${tree.root.toString(16)}`);
    console.log(`Depth: ${tree.depth}`);
    console.log(`Leaves: ${tree.leaves.length}`);
    
    console.log('\n=== SAMPLE PROOF (Leaf 0) ===');
    if (proofs.length > 0) {
        const sampleProof = proofs[0];
        console.log(`Leaf: ${sampleProof.leaf}`);
        console.log(`Siblings: [${sampleProof.siblings.join(', ')}]`);
        console.log(`Path indices: [${sampleProof.pathIndices.join(', ')}]`);
        console.log(`Root: ${sampleProof.root}`);
    }
    
    console.log('\n✅ ZK-Kit Lean IMT processing complete!');
    console.log('✅ Merkle tree and proofs written to: merkle_tree_data.temp.json');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { main };
