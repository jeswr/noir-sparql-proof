#!/usr/bin/env node

import fs from 'fs';
import { buildEddsa, buildPoseidon } from 'circomlibjs';

/**
 * Baby Jubjub Signature Generator for Merkle Tree Root
 */
class BabyJubSignature {
    constructor() {
        this.eddsa = null;
        this.poseidon = null;
        this.initialized = false;
    }

    /**
     * Initialize the cryptographic primitives
     */
    async initialize() {
        if (this.initialized) return;
        
        console.log('Initializing Baby Jubjub signature system...');
        this.eddsa = await buildEddsa();
        this.poseidon = await buildPoseidon();
        this.initialized = true;
        console.log('✅ Baby Jubjub signature system initialized');
    }

    /**
     * Generate a new private key
     * @returns {Buffer} Private key
     */
    generatePrivateKey() {
        return Buffer.from(this.eddsa.F.random());
    }

    /**
     * Derive public key from private key
     * @param {Buffer} privateKey - Private key
     * @returns {Array} Public key [Ax, Ay]
     */
    getPublicKey(privateKey) {
        return this.eddsa.prv2pub(privateKey);
    }

    /**
     * Sign a message using Baby Jubjub EdDSA
     * @param {string|BigInt} message - Message to sign (Merkle root)
     * @param {Buffer} privateKey - Private key
     * @returns {Object} Signature object
     */
    sign(message, privateKey) {
        // Convert message to BigInt if it's a string
        const msgBigInt = typeof message === 'string' ? BigInt(message) : message;
        
        // Hash the message using Poseidon
        const hashedMessage = this.poseidon([msgBigInt]);
        
        // Sign the hashed message
        const signature = this.eddsa.signPoseidon(privateKey, hashedMessage);
        
        return {
            R8: signature.R8,
            S: signature.S,
            hashedMessage: hashedMessage.toString()
        };
    }

    /**
     * Verify a signature
     * @param {string|BigInt} message - Original message
     * @param {Object} signature - Signature object
     * @param {Array} publicKey - Public key [Ax, Ay]
     * @returns {boolean} True if signature is valid
     */
    verify(message, signature, publicKey) {
        try {
            // Convert message to BigInt if it's a string
            const msgBigInt = typeof message === 'string' ? BigInt(message) : message;
            
            // Hash the message using Poseidon
            const hashedMessage = this.poseidon([msgBigInt]);
            
            // Verify the signature
            return this.eddsa.verifyPoseidon(hashedMessage, signature, publicKey);
        } catch (error) {
            console.error('Verification error:', error);
            return false;
        }
    }

    /**
     * Convert field element to string
     * @param {*} element - Field element
     * @returns {string} String representation
     */
    fieldToString(element) {
        if (typeof element === 'bigint') {
            return element.toString();
        }
        if (Array.isArray(element) || element instanceof Uint8Array) {
            // Convert byte array to BigInt (little-endian)
            let result = 0n;
            for (let i = 0; i < element.length; i++) {
                result += BigInt(element[i]) * (256n ** BigInt(i));
            }
            return result.toString();
        }
        if (element && typeof element.toString === 'function') {
            return element.toString();
        }
        return String(element);
    }

    /**
     * Export signature data for JSON serialization
     * @param {Object} signature - Signature object
     * @param {Array} publicKey - Public key
     * @returns {Object} Serializable signature data
     */
    exportSignature(signature, publicKey) {
        return {
            signature: {
                R8: [
                    this.fieldToString(signature.R8[0]),
                    this.fieldToString(signature.R8[1])
                ],
                S: this.fieldToString(signature.S)
            },
            publicKey: [
                this.fieldToString(publicKey[0]),
                this.fieldToString(publicKey[1])
            ],
            hashedMessage: this.fieldToString(signature.hashedMessage)
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
            inputFile: 'merkle_tree_data.temp.json',
            outputFile: null,
            generateNewKey: true
        };
    } else if (args.length === 1) {
        return {
            inputFile: args[0],
            outputFile: null,
            generateNewKey: true
        };
    } else if (args.length === 2) {
        return {
            inputFile: args[0],
            outputFile: args[1],
            generateNewKey: true
        };
    } else {
        console.error('Usage: node sign_root.js [input_file] [output_file]');
        console.error('  input_file:  JSON file with Merkle tree data (default: merkle_tree_data.temp.json)');
        console.error('  output_file: Output file for signed data (optional, prints to console if not specified)');
        process.exit(1);
    }
}

/**
 * Main function
 */
async function main() {
    const { inputFile, outputFile, generateNewKey } = parseArgs();
    
    // Check if input file exists
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: Input file '${inputFile}' not found`);
        process.exit(1);
    }
    
    console.log(`Reading Merkle tree data from: ${inputFile}`);
    
    // Read and parse the JSON file
    let merkleData;
    try {
        const jsonContent = fs.readFileSync(inputFile, 'utf8');
        merkleData = JSON.parse(jsonContent);
    } catch (error) {
        console.error(`Error reading or parsing JSON file: ${error.message}`);
        process.exit(1);
    }
    
    if (!merkleData.merkleTree || !merkleData.merkleTree.root) {
        console.error('Error: JSON file should contain merkleTree.root');
        process.exit(1);
    }
    
    const merkleRoot = merkleData.merkleTree.root;
    console.log(`Merkle root to sign: ${merkleRoot}`);
    
    // Initialize Baby Jubjub signature system
    const signatureSystem = new BabyJubSignature();
    await signatureSystem.initialize();
    
    // Generate or load private key
    let privateKey;
    if (generateNewKey) {
        console.log('Generating new private key...');
        privateKey = signatureSystem.generatePrivateKey();
        console.log(`Private key: 0x${privateKey.toString('hex')}`);
    }
    
    // Derive public key
    const publicKey = signatureSystem.getPublicKey(privateKey);
    console.log(`Public key: [${signatureSystem.fieldToString(publicKey[0])}, ${signatureSystem.fieldToString(publicKey[1])}]`);
    
    // Sign the Merkle root
    console.log('Signing Merkle root...');
    const signature = signatureSystem.sign(merkleRoot, privateKey);
    console.log('✅ Merkle root signed successfully');
    
    // Verify the signature
    console.log('Verifying signature...');
    const isValid = signatureSystem.verify(merkleRoot, signature, publicKey);
    console.log(`Signature verification: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    
    if (!isValid) {
        console.error('❌ Signature verification failed!');
        process.exit(1);
    }
    
    // Prepare output
    const output = {
        metadata: {
            sourceFile: inputFile,
            generatedAt: new Date().toISOString(),
            merkleRoot: merkleRoot,
            signatureAlgorithm: 'Baby Jubjub EdDSA',
            hashFunction: 'Poseidon'
        },
        originalMerkleData: merkleData,
        signature: signatureSystem.exportSignature(signature, publicKey),
        verification: {
            isValid: isValid,
            verifiedAt: new Date().toISOString()
        },
        keys: {
            privateKey: `0x${privateKey.toString('hex')}`,
            publicKey: [
                signatureSystem.fieldToString(publicKey[0]),
                signatureSystem.fieldToString(publicKey[1])
            ]
        }
    };
    
    // Output results
    if (outputFile) {
        // Write to file
        try {
            fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
            console.log(`\n✅ Signed Merkle tree data written to: ${outputFile}`);
        } catch (error) {
            console.error(`Error writing output file: ${error.message}`);
            process.exit(1);
        }
    } else {
        // Print summary to console
        console.log('\n=== BABY JUBJUB SIGNATURE SUMMARY ===');
        console.log(`Merkle Root: ${merkleRoot}`);
        console.log(`Hashed Message: ${signatureSystem.fieldToString(signature.hashedMessage)}`);
        console.log(`Signature R8: [${signatureSystem.fieldToString(signature.R8[0])}, ${signatureSystem.fieldToString(signature.R8[1])}]`);
        console.log(`Signature S: ${signatureSystem.fieldToString(signature.S)}`);
        console.log(`Public Key: [${signatureSystem.fieldToString(publicKey[0])}, ${signatureSystem.fieldToString(publicKey[1])}]`);
        console.log(`Private Key: 0x${privateKey.toString('hex')}`);
        console.log(`Verification: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    }
    
    console.log(`\n✅ Baby Jubjub signature process complete!`);
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export {
    BabyJubSignature
};
