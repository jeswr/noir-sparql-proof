#!/usr/bin/env node

import fs from 'fs';
import { poseidon2 } from 'poseidon-lite';

/**
 * Simple Merkle Tree implementation using Poseidon2 hash
 */
class PoseidonMerkleTree {
    constructor(leaves) {
        this.leaves = leaves.map(leaf => BigInt(leaf));
        this.tree = this.buildTree();
    }

    /**
     * Build the complete Merkle tree
     * @returns {Array} Array of tree levels, with leaves at index 0
     */
    buildTree() {
        let currentLevel = [...this.leaves];
        const tree = [currentLevel];

        while (currentLevel.length > 1) {
            const nextLevel = [];
            
            // Process pairs of nodes
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left; // Duplicate last node if odd
                
                // Hash the pair using Poseidon2
                const hash = poseidon2([left, right]);
                nextLevel.push(hash);
            }
            
            currentLevel = nextLevel;
            tree.push(currentLevel);
        }

        return tree;
    }

    /**
     * Get the root of the Merkle tree
     * @returns {bigint} The root hash
     */
    getRoot() {
        return this.tree[this.tree.length - 1][0];
    }

    /**
     * Generate a Merkle proof for a given leaf index
     * @param {number} leafIndex - Index of the leaf
     * @returns {Object} Proof object containing path and directions
     */
    generateProof(leafIndex) {
        if (leafIndex >= this.leaves.length) {
            throw new Error(`Leaf index ${leafIndex} out of bounds`);
        }

        const proof = {
            leaf: this.leaves[leafIndex],
            leafIndex,
            path: [],
            pathIndices: []
        };

        let currentIndex = leafIndex;

        // Traverse from leaf to root
        for (let level = 0; level < this.tree.length - 1; level++) {
            const currentLevelSize = this.tree[level].length;
            const isRightNode = currentIndex % 2 === 1;
            
            let siblingIndex;
            if (isRightNode) {
                // We are the right node, sibling is to the left
                siblingIndex = currentIndex - 1;
                proof.pathIndices.push(0); // Sibling goes on the left
            } else {
                // We are the left node, sibling is to the right
                siblingIndex = currentIndex + 1;
                if (siblingIndex >= currentLevelSize) {
                    // No right sibling (odd number of nodes), use the current node itself
                    siblingIndex = currentIndex;
                }
                proof.pathIndices.push(1); // Sibling goes on the right
            }

            proof.path.push(this.tree[level][siblingIndex]);
            currentIndex = Math.floor(currentIndex / 2);
        }

        return proof;
    }

    /**
     * Verify a Merkle proof
     * @param {Object} proof - The proof object
     * @param {bigint} root - Expected root hash
     * @returns {boolean} True if proof is valid
     */
    static verifyProof(proof, root) {
        let currentHash = proof.leaf;

        for (let i = 0; i < proof.path.length; i++) {
            const sibling = proof.path[i];
            const siblingIsOnRight = proof.pathIndices[i] === 1;

            if (siblingIsOnRight) {
                // Sibling goes on the right: hash(current, sibling)
                currentHash = poseidon2([currentHash, sibling]);
            } else {
                // Sibling goes on the left: hash(sibling, current)
                currentHash = poseidon2([sibling, currentHash]);
            }
        }

        return currentHash === root;
    }

    /**
     * Get tree statistics
     * @returns {Object} Tree statistics
     */
    getStats() {
        return {
            leafCount: this.leaves.length,
            height: this.tree.length - 1,
            root: this.getRoot().toString(),
            totalNodes: this.tree.reduce((sum, level) => sum + level.length, 0)
        };
    }

    /**
     * Export tree data for JSON serialization
     * @returns {Object} Serializable tree data
     */
    exportTree() {
        return {
            leaves: this.leaves.map(leaf => leaf.toString()),
            tree: this.tree.map(level => level.map(node => node.toString())),
            root: this.getRoot().toString(),
            stats: this.getStats()
        };
    }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        return {
            inputFile: 'hashed_triples.temp.json',
            outputFile: null
        };
    } else if (args.length === 1) {
        return {
            inputFile: args[0],
            outputFile: null
        };
    } else if (args.length === 2) {
        return {
            inputFile: args[0],
            outputFile: args[1]
        };
    } else {
        console.error('Usage: node merkle_tree.js [input_file] [output_file]');
        console.error('  input_file:  JSON file with Poseidon hashes (default: hashed_triples.temp.json)');
        console.error('  output_file: Output file for Merkle tree (optional, prints to console if not specified)');
        process.exit(1);
    }
}

/**
 * Main function
 */
function main() {
    const { inputFile, outputFile } = parseArgs();
    
    // Check if input file exists
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: Input file '${inputFile}' not found`);
        process.exit(1);
    }
    
    console.log(`Reading Poseidon hashes from: ${inputFile}`);
    
    // Read and parse the JSON file
    let data;
    try {
        const jsonContent = fs.readFileSync(inputFile, 'utf8');
        data = JSON.parse(jsonContent);
    } catch (error) {
        console.error(`Error reading or parsing JSON file: ${error.message}`);
        process.exit(1);
    }
    
    if (!data.poseidonHashes || !Array.isArray(data.poseidonHashes)) {
        console.error('Error: JSON file should contain a poseidonHashes array');
        process.exit(1);
    }
    
    const hashes = data.poseidonHashes;
    console.log(`Loaded ${hashes.length} Poseidon hashes as leaves`);
    
    // Build Merkle tree
    console.log('Building Merkle tree...');
    const merkleTree = new PoseidonMerkleTree(hashes);
    const stats = merkleTree.getStats();
    
    console.log(`Merkle tree built successfully!`);
    console.log(`  Leaves: ${stats.leafCount}`);
    console.log(`  Height: ${stats.height}`);
    console.log(`  Total nodes: ${stats.totalNodes}`);
    console.log(`  Root: ${stats.root}`);
    
    // Generate proofs for all leaves
    console.log('\nGenerating proofs for all leaves...');
    const proofs = [];
    for (let i = 0; i < hashes.length; i++) {
        const proof = merkleTree.generateProof(i);
        proofs.push({
            leafIndex: i,
            leaf: proof.leaf.toString(),
            path: proof.path.map(p => p.toString()),
            pathIndices: proof.pathIndices
        });
        
        // Verify the proof
        const isValid = PoseidonMerkleTree.verifyProof(proof, merkleTree.getRoot());
        console.log(`  Proof ${i}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    }
    
    // Prepare output
    const output = {
        metadata: {
            sourceFile: inputFile,
            generatedAt: new Date().toISOString(),
            leafCount: stats.leafCount,
            treeHeight: stats.height,
            totalNodes: stats.totalNodes
        },
        merkleTree: merkleTree.exportTree(),
        proofs: proofs
    };
    
    // Output results
    if (outputFile) {
        // Write to file
        try {
            fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
            console.log(`\n✅ Merkle tree and proofs written to: ${outputFile}`);
        } catch (error) {
            console.error(`Error writing output file: ${error.message}`);
            process.exit(1);
        }
    } else {
        // Print summary to console
        console.log('\n=== MERKLE TREE SUMMARY ===');
        console.log(`Root: ${stats.root}`);
        console.log(`Root (hex): 0x${BigInt(stats.root).toString(16)}`);
        
        console.log('\n=== TREE LEVELS ===');
        merkleTree.tree.forEach((level, index) => {
            const levelName = index === 0 ? 'Leaves' : `Level ${index}`;
            console.log(`${levelName}: ${level.length} nodes`);
            if (level.length <= 8) { // Only show details for small levels
                level.forEach((node, nodeIndex) => {
                    console.log(`  [${nodeIndex}]: ${node.toString()}`);
                });
            }
        });
        
        console.log('\n=== SAMPLE PROOF (Leaf 0) ===');
        const sampleProof = proofs[0];
        console.log(`Leaf: ${sampleProof.leaf}`);
        console.log(`Path: [${sampleProof.path.join(', ')}]`);
        console.log(`Path indices: [${sampleProof.pathIndices.join(', ')}]`);
    }
    
    console.log(`\n✅ Merkle tree processing complete!`);
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export {
    PoseidonMerkleTree
};
