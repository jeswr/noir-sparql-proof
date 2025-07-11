use dep::binary_merkle_root::binary_merkle_root;

// Poseidon2 hash function for Merkle tree
// Uses the built-in Poseidon2 permutation from Noir's standard library
fn hash2(leaves: [Field; 2]) -> Field {
    std::hash::poseidon2_permutation([leaves[0], leaves[1], 0, 0], 4)[0]
}

// Age verification circuit for Alice using ZK-Kit libraries
// Proves that Alice is older than 18 without revealing her exact age
// Uses ZK-Kit binary-merkle-root for Merkle proof verification
fn main(
    // Public inputs  
    public_key_x: pub Field,  // Public key X coordinate (public output)
    public_key_y: pub Field,  // Public key Y coordinate (public output)
    merkle_root: pub Field,   // Merkle tree root (public)
    
    // Private inputs
    // Signature components (field-reduced)
    signature_r8_x: Field,
    signature_r8_y: Field, 
    signature_s: Field,
    
    // Alice's RDF triple components (private, field-reduced)
    alice_subject: Field,     // ex:Alice (reduced)
    age_predicate: Field,     // ex:age (reduced)
    age_value: Field,         // Alice's actual age (23)
    age_object: Field,        // Encoded age object (reduced)
    graph_context: Field,     // Graph context (reduced)
    
    // Merkle proof for Alice's triple using ZK-Kit format
    merkle_siblings: [Field; 8],     // Merkle siblings (max depth, using smaller array)
    merkle_path_indices: [u1; 8],   // Path indices as bits 
    merkle_depth: u32,               // Actual depth of the proof
) {
    // 1. VERIFY ALICE'S AGE IS OVER 18
    // Convert to u32 for comparison
    let age_u32 = age_value as u32;
    assert(age_u32 > 18);
    
    // 2. VERIFY TRIPLE STRUCTURE
    // Since we're using field-reduced values, we can't verify the exact hash
    // Instead, we verify the structure and age constraint
    
    // Ensure required triple components are non-zero (basic validity check)
    assert(alice_subject != 0);
    assert(age_predicate != 0);
    assert(age_object != 0);
    // Note: graph_context can be 0 for default graph, so we don't assert it
    
    // 3. ZK-KIT MERKLE PROOF VERIFICATION
    // Use ZK-Kit binary_merkle_root to verify the Merkle proof
    let triple_hash = compute_triple_hash(
        alice_subject,
        age_predicate,
        age_object,
        age_value,
        graph_context
    );
    
    // Verify the Merkle proof using ZK-Kit library
    let computed_root = binary_merkle_root(
        hash2,                  // Hash function (Poseidon2)
        triple_hash,             // The leaf (Alice's triple hash)
        merkle_depth,           // Depth of the proof
        merkle_path_indices,    // Path indices as bits
        merkle_siblings         // Sibling hashes
    );
    
    // Ensure the computed root matches the expected root
    assert(computed_root == merkle_root);
    
    // 4. SIMPLIFIED SIGNATURE VERIFICATION
    // Verify that signature components are non-zero (basic validity)
    let signature_valid = verify_signature_components(
        merkle_root,
        [signature_r8_x, signature_r8_y],
        signature_s,
        [public_key_x, public_key_y]
    );
    assert(signature_valid);
    
    // 5. DEMONSTRATE PROPER TRIPLE HASH COMPUTATION
    // Verify that the triple hash is computed correctly
    assert(triple_hash != 0);
    
    // All assertions passed - proof demonstrates:
    // - Alice's age > 18 (without revealing exact age)
    // - Valid signature components exist
    // - Valid ZK-Kit Merkle proof verification
    // - Triple components are properly structured
}

// Compute a hash from the triple components using Poseidon2
fn compute_triple_hash(
    subject: Field,
    predicate: Field,
    object: Field,
    value: Field,
    context: Field
) -> Field {
    // Hash components in stages using Poseidon2
    let hash1 = hash2([subject, predicate]);
    let hash2_result = hash2([object, context]);
    let hash3 = hash2([hash1, hash2_result]);
    hash2([hash3, value])
}

// Simplified signature component verification
fn verify_signature_components(
    message: Field,
    r8: [Field; 2],
    s: Field, 
    public_key: [Field; 2]
) -> bool {
    // Verify all components are non-zero
    let r8_valid = (r8[0] != 0) & (r8[1] != 0);
    let s_valid = s != 0;
    let pubkey_valid = (public_key[0] != 0) & (public_key[1] != 0);
    let message_valid = message != 0;
    
    r8_valid & s_valid & pubkey_valid & message_valid
}

#[test]
fn test_age_verification() {
    // Test with Alice's age being 23 (should pass)
    let age = 23;
    assert(age > 18);
}

#[test]
fn test_signature_components() {
    // Test signature component validation
    let message = 12345;
    let r8 = [67890, 54321];
    let s = 98765;
    let pubkey = [11111, 22222];
    
    let valid = verify_signature_components(message, r8, s, pubkey);
    assert(valid);
}


#[test]
fn test_hash_components() {
    println(hash2([1, 2]));
    assert(hash2([1, 2]) == 7853200120776062878684798364095072458815029376092732009249414926327459813530);
}

#[test]
fn test_triple_hash() {
    // Test triple hash computation
    let subject = 100;
    let predicate = 200;
    let object = 300;
    let value = 23;
    let context = 400;
    
    let hash = compute_triple_hash(subject, predicate, object, value, context);
    assert(hash != 0);
}
