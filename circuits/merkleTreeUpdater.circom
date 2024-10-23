include "./merkleProof.circom";
include "./merkleTree.circom";

// inserts a subtree into a merkle tree
// checks that tree previously contained zeroes is the same positions
// zeroSubtreeRoot is a root of a subtree that contains only zeroes
template MerkleTreeUpdater(levels, subtreeLevels, zeroSubtreeRoot) {
    var remainingLevels = levels - subtreeLevels;

    signal input oldRoot;
    signal input newRoot;
    signal input leaves[1 << subtreeLevels];
    signal input pathIndices;
    signal input depositAmount;
    signal private input pathElements[remainingLevels];
    signal private input publicKey;
    signal private input binding;

    component inCommitmentHasher = HashCustom(3);
    inCommitmentHasher.in[0] <== depositAmount;
    inCommitmentHasher.in[1] <== publicKey;
    inCommitmentHasher.in[2] <== binding;
    leaves[0] === inCommitmentHasher.hash;

    // calculate subtree root
    component subtree = MerkleTree(subtreeLevels);
    for(var i = 0; i < (1 << subtreeLevels); i++) {
        subtree.leaves[i] <== leaves[i];
    }

    component treeBefore = MerkleProof(remainingLevels);
    for(var i = 0; i < remainingLevels; i++) {
        treeBefore.pathElements[i] <== pathElements[i];
    }
    treeBefore.pathIndices <== pathIndices;
    treeBefore.leaf <== zeroSubtreeRoot;
    treeBefore.root === oldRoot;

    component treeAfter = MerkleProof(remainingLevels);
    for(var i = 0; i < remainingLevels; i++) {
        treeAfter.pathElements[i] <== pathElements[i];
    }
    treeAfter.pathIndices <== pathIndices;
    treeAfter.leaf <== subtree.root;
    treeAfter.root === newRoot;
}

// hash(21663839004416932945382355908790599225266501822907911457504978515578255421292, 21663839004416932945382355908790599225266501822907911457504978515578255421292)
// todo - check the values
component main = MerkleTreeUpdater(17, 1, 3980931430868229520886859371143804898807012509083704862361052255317185812505);
