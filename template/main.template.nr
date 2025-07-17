fn main() {
    let triples = [
        {{triples}},
    ];

    let mut tree = [[0; 1024]; 11];
    let mut paths = [[0; 11]; {{triples_len}}];
    let mut pathDirection = [[0; 10]; {{triples_len}}];

    for i in 0..triples.len() {
        tree[0][i] = {{hash4}}(triples[i]);
    }

    for i in 1..11 {
        let mut max: u32 = 1;
        for _ in 0..(10 - i) {
            max *= 2;
        }

        for j in 0..max {
            tree[i][j] = {{hash2}}([tree[i - 1][j * 2], tree[i - 1][j * 2 + 1]]);
        }
    }

    // Generate paths for each triple
    for i in 0..triples.len() {
        let mut index = i;

        paths[i][0] = tree[0][i];

        for j in 1..11 {
            paths[i][j] = tree[j - 1][index ^ 1]; // XOR to get the sibling node
            pathDirection[i][j - 1] = if index % 2 == 0 { 0 } else { 1 }; // 0 for left, 1 for right
            index /= 2; // Move up the tree
        }
    }

    let root = tree[10][0];
    let root_u8: [u8; 32] = root.to_le_bytes();

    println(
        f"{{
        \"triples\": {triples}
        ,\"root\": {root}
        , \"root_u8\": {root_u8}
        , \"paths\": {paths}
        , \"direction\": {pathDirection}
        }}",
    );
}
