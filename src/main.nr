
#[test]
fn test() {
    let triples = [
        [
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/jesse>".as_bytes())),
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/type>".as_bytes())),
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/Person>".as_bytes())),
            0,
        ],
        [
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/jesse>".as_bytes())),
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/age>".as_bytes())),
            Field::from_le_bytes(std::hash::blake2s("\"23\"^^<http://www.w3.org/2001/XMLSchema#integer>".as_bytes())),
            0,
        ],
        [
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/john>".as_bytes())),
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/a>".as_bytes())),
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/person>".as_bytes())),
            0,
        ],
        [
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/jesse>".as_bytes())),
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/knows>".as_bytes())),
            Field::from_le_bytes(std::hash::blake2s("<http://example.org/john>".as_bytes())),
            0,
        ],
    ];

    let mut tree = [[0; 1024]; 11];
    let mut paths = [[0; 10]; 4];

    for i in 0..triples.len() {
        tree[0][i] = dep::poseidon2::bn254::hash_4(triples[i]);
    }

    for i in 1..11 {
        let mut max: u32 = 1;
        for _ in 0..(10 - i) {
            max *= 2;
        }

        for j in 0..max {
            tree[i][j] = dep::poseidon2::bn254::hash_2([
                tree[i - 1][j * 2],
                tree[i - 1][j * 2 + 1],
            ]);
        }
    }

    // Generate paths for each triple
    for i in 0..triples.len() {
        let mut index = i;
        for j in 0..10 {
            paths[i][j] = tree[j][index ^ 1]; // XOR to get the sibling node
            index /= 2; // Move up the tree
        }
    }

    println(f"triples: {triples}, tree: {tree}, paths: {paths}");
}

fn main() {
    test();
}
