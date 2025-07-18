mod sparql;
mod types;
use sparql::{BGP, checkBinding, Variables, Hidden};

fn main(
    public_key_x: pub [u8; 32],
    public_key_y: pub [u8; 32],
    signature: [u8; 64],
    root: Field,
    bgp: BGP,
    variables: pub Variables,
    hidden: Hidden
) {
    let message: [u8; 32] = root.to_le_bytes();

    // Check that the signature on the merkle root is valid
    assert(
        std::ecdsa_secp256k1::verify_signature(public_key_x, public_key_y, signature, message),
        "Signature verification failed",
    );

    // Check that each triple in the (private) BGP patterns
    // is a valid member of the Merkle tree
    for triple in bgp {
        // Verify the path
        let mut current = triple.path[0];
        for i in 1..11 {
            current = std::hash::pedersen_hash(
                if triple.directions[i - 1] == 0 {
                    [current, triple.path[i]]
                } else {
                    [triple.path[i], current]
                },
            );
        }

        assert(current == root, "Path does not lead to the correct root");
        assert(
            std::hash::pedersen_hash(triple.terms) == triple.path[0],
            "Triple does not hash to the root",
        );
    }

    // Check that the bgp patterns satisfy the sparql query and produce the
    // public variables
    checkBinding(bgp, variables, hidden)
}
