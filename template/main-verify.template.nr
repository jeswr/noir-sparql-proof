mod sparql;
mod types;
mod consts;
use sparql::{BGP, checkBinding, Variables{{h0}}};

struct PubKey {
    pub x: [u8; 32],
    pub y: [u8; 32],
}

struct Root {
    pub value: Field,
    pub signature: [u8; 64],
    pub keyIndex: u32,
}

fn main(
    public_key: [PubKey; 1],
    roots: [Root; 1],
    bgp: BGP,
    variables: pub Variables{{h1}}
) {
    for root in roots {
        let message: [u8; 32] = root.value.to_le_bytes();

        // Check that the signature on the merkle root is valid
        assert(
            std::ecdsa_secp256k1::verify_signature(public_key[root.keyIndex].x, public_key[root.keyIndex].y, root.signature, message),
            "Signature verification failed",
        );
    }

    // Check that each triple in the (private) BGP patterns
    // is a valid member of the Merkle tree
    for triple in bgp {
        // Verify the path
        let mut current = triple.path[0];
        for i in 1..11 {
            current = {{hash2}}(
                if triple.directions[i - 1] == 0 {
                    [current, triple.path[i]]
                } else {
                    [triple.path[i], current]
                },
            );
        }

        assert(current == roots[0].value, "Path does not lead to the correct root");
        assert(
            {{hash4}}(triple.terms) == triple.path[0],
            "Triple does not hash to the root",
        );
    }

    // Check that the bgp patterns satisfy the sparql query and produce the
    // public variables
    checkBinding(bgp, variables{{h2}})
}
