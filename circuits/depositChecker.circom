include "./merkleProof.circom";
include "./merkleTree.circom";

// inserts a subtree into a merkle tree
// checks that tree previously contained zeroes is the same positions
// zeroSubtreeRoot is a root of a subtree that contains only zeroes
template DepositChecker() {
    signal input depositAmount;
    signal input leaf;
    signal input asset_id;

    signal private input publicKey;
    signal private input binding;

    component inCommitmentHasher = HashCustom(4);
    inCommitmentHasher.in[0] <== depositAmount;
    inCommitmentHasher.in[1] <== publicKey;
    inCommitmentHasher.in[2] <== binding;
    inCommitmentHasher.in[3] <== asset_id;
    leaf === inCommitmentHasher.hash;
}

component main = DepositChecker();
