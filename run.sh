node ./normalize.js

cd encode
cargo run --release --bin encode -- ../data.temp.nq ../data.fr.temp.json
cd ..
