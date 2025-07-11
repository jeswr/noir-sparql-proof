#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { poseidon5 } from 'poseidon-lite';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert field element strings directly to JavaScript BigInts
 * 
 * @param {string[]} fieldElementStrings - Array of string representations of field elements
 * @returns {bigint[]} - Array of JavaScript BigInts
 */
function stringArrayToFieldElements(fieldElementStrings) {
    return fieldElementStrings.map((str, index) => {
        try {
            return BigInt(str);
        } catch (error) {
            throw new Error(`Error converting element ${index} "${str}" to BigInt: ${error.message}`);
        }
    });
}

/**
 * Group field elements into sets of 5 (representing RDF triples with additional data)
 * 
 * @param {bigint[]} fieldElements - Array of field elements
 * @returns {bigint[][]} - Array of groups, each containing 5 field elements
 */
function groupFieldElements(fieldElements) {
    if (fieldElements.length % 5 !== 0) {
        throw new Error(`Field elements array length (${fieldElements.length}) is not divisible by 5`);
    }
    
    const groups = [];
    for (let i = 0; i < fieldElements.length; i += 5) {
        groups.push(fieldElements.slice(i, i + 5));
    }
    
    return groups;
}

/**
 * Apply Poseidon5 hash to each group of 5 field elements
 * 
 * @param {bigint[][]} groups - Array of groups, each containing 5 field elements
 * @returns {bigint[]} - Array of Poseidon5 hashes
 */
function hashGroups(groups) {
    return groups.map((group, index) => {
        try {
            // poseidon5 expects 5 BigInt inputs
            return poseidon5(group);
        } catch (error) {
            throw new Error(`Error hashing group ${index}: ${error.message}`);
        }
    });
}

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        return {
            inputFile: 'data.fr.temp.json',
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
        console.error('Usage: node parse_field_elements.js [input_file] [output_file]');
        console.error('  input_file:  JSON file with field element arrays (default: data.fr.temp.json)');
        console.error('  output_file: Output file for parsed BigInts (optional, prints to console if not specified)');
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
    
    console.log(`Reading field elements from: ${inputFile}`);
    
    // Read and parse the JSON file
    let fieldElementStrings;
    try {
        const jsonContent = fs.readFileSync(inputFile, 'utf8');
        fieldElementStrings = JSON.parse(jsonContent);
    } catch (error) {
        console.error(`Error reading or parsing JSON file: ${error.message}`);
        process.exit(1);
    }
    
    if (!Array.isArray(fieldElementStrings)) {
        console.error('Error: JSON file should contain an array of field element strings');
        process.exit(1);
    }
    
    console.log(`Loaded ${fieldElementStrings.length} field element strings`);
    
    // Convert each field element string to a BigInt
    let fieldElements;
    try {
        fieldElements = stringArrayToFieldElements(fieldElementStrings);
    } catch (error) {
        console.error(`Error converting field elements: ${error.message}`);
        process.exit(1);
    }
    
    console.log(`Successfully converted ${fieldElements.length} field elements to BigInts`);
    
    // Group field elements into sets of 5
    let groups;
    try {
        groups = groupFieldElements(fieldElements);
        console.log(`Grouped into ${groups.length} sets of 5 field elements`);
    } catch (error) {
        console.error(`Error grouping field elements: ${error.message}`);
        process.exit(1);
    }
    
    // Apply Poseidon5 hash to each group
    let hashes;
    try {
        hashes = hashGroups(groups);
        console.log(`Successfully computed ${hashes.length} Poseidon5 hashes`);
    } catch (error) {
        console.error(`Error computing hashes: ${error.message}`);
        process.exit(1);
    }
    
    // Prepare output
    const output = {
        metadata: {
            totalElements: fieldElements.length,
            totalGroups: groups.length,
            totalHashes: hashes.length,
            generatedAt: new Date().toISOString(),
            sourceFile: inputFile
        },
        fieldElements: fieldElements.map(fe => fe.toString()),
        groups: groups.map(group => group.map(fe => fe.toString())),
        poseidonHashes: hashes.map(hash => hash.toString())
    };
    
    // Output results
    if (outputFile) {
        // Write to file
        try {
            fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
            console.log(`\n✅ Results written to: ${outputFile}`);
        } catch (error) {
            console.error(`Error writing output file: ${error.message}`);
            process.exit(1);
        }
    } else {
        // Print to console
        console.log('\n=== FIELD ELEMENTS AS BIGINTS ===');
        fieldElements.forEach((fe, index) => {
            console.log(`[${index}]: ${fe.toString()}`);
        });
        
        console.log('\n=== GROUPED FIELD ELEMENTS ===');
        groups.forEach((group, index) => {
            console.log(`Group ${index}: [${group.map(fe => fe.toString()).join(', ')}]`);
        });
        
        console.log('\n=== POSEIDON5 HASHES ===');
        hashes.forEach((hash, index) => {
            console.log(`Hash ${index}: ${hash.toString()}`);
            console.log(`  Hex: 0x${hash.toString(16)}`);
        });
        
        console.log('\n=== SAMPLE COMPARISONS ===');
        // Show first few elements in both formats for comparison
        for (let i = 0; i < Math.min(3, fieldElements.length); i++) {
            console.log(`Element ${i}:`);
            console.log(`  String:     "${fieldElementStrings[i]}"`);
            console.log(`  BigInt:     ${fieldElements[i].toString()}`);
            console.log(`  Hex:        0x${fieldElements[i].toString(16)}`);
            console.log('');
        }
    }
    
    console.log(`\n✅ Processing complete!`);
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export {
    stringArrayToFieldElements,
    groupFieldElements,
    hashGroups,
    parseArgs
};
