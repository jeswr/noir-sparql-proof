import { poseidon2Hash } from '@zkpassport/poseidon2';

const b1 = BigInt(1);
const b2 = BigInt(2);

console.log('Poseidon2 hash function for Merkle tree');
console.log(poseidon2Hash([b1, b2]))
