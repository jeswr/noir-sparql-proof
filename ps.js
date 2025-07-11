import { poseidon2 } from 'poseidon-lite';

const b1 = BigInt(1);
const b2 = BigInt(2);

console.log('Poseidon2 hash function for Merkle tree');
console.log(poseidon2([b1, b2]))
