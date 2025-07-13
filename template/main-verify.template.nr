mod sparql;
mod types;
use sparql::{BGP, checkBinding, Variables};

fn main(
    public_key_x: pub [u8; 32],
    public_key_y: pub [u8; 32],
    signature: [u8; 64],
    root: Field,
    bgp: BGP,
    variables: pub Variables,
    {{h1}}
) {
    let message: [u8; 32] = root.to_le_bytes();

    assert(
        std::ecdsa_secp256k1::verify_signature(public_key_x, public_key_y, signature, message),
        "Signature verification failed",
    );

    for triple in bgp {
        // Verify the path
        let mut current = triple.path[0];
        for i in 1..11 {
            current = dep::poseidon2::bn254::hash_2(
                if triple.directions[i - 1] == 0 {
                    [current, triple.path[i]]
                } else {
                    [triple.path[i], current]
                },
            );
        }

        assert(current == root, "Path does not lead to the correct root");
        assert(
            dep::poseidon2::bn254::hash_4(triple.terms) == triple.path[0],
            "Triple does not hash to the root",
        );
        checkBinding(bgp, variables{{h2}})
    }
}
