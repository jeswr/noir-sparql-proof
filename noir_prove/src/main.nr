fn main(
    public_key_x: pub [u8; 32],
    public_key_y: pub [u8; 32],
    signature: [u8; 64],
    root: Field,
) {
    let message: [u8; 32] = root.to_le_bytes();

    assert(std::ecdsa_secp256k1::verify_signature(
        public_key_x,
        public_key_y,
        signature,
        message,
    ));

    
}
