[
    Field::from_le_bytes(std::hash::blake2s("{{subject}}".as_bytes())),
    Field::from_le_bytes(std::hash::blake2s("{{predicate}}".as_bytes())),
    Field::from_le_bytes(std::hash::blake2s("{{object}}".as_bytes())),
    0,
]
