include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/switcher.circom";
include "./mimcsponge.circom";
include "./merkleTree.circom";


template HashCustom(length) {
    signal input in[length];
    signal output hash;

    component hasher = MiMCSponge(length, 220, 1);
    for (var i = 0; i < length; i++) {
        hasher.ins[i] <== in[i];
    }
    hasher.k <== 0;
    hash <== hasher.outs[0];
}



// Verifies that merkle proof is correct for given merkle root and a leaf
// pathIndices bits is an array of 0/1 selectors telling whether given pathElement is on the left or right side of merkle path
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices;
    signal output root;

    component switcher[levels];
    component hasher[levels];

    component indexBits = Num2Bits(levels);
    indexBits.in <== pathIndices;

    for (var i = 0; i < levels; i++) {
        switcher[i] = Switcher();
        switcher[i].L <== i == 0 ? leaf : hasher[i - 1].hash;
        switcher[i].R <== pathElements[i];
        switcher[i].sel <== indexBits.out[i];

        hasher[i] = HashCustom(2);
        hasher[i].in[0] <== switcher[i].outL;
        hasher[i].in[1] <== switcher[i].outR;
    }

    root <== hasher[levels - 1].hash;
}


template MerkleTreeUpdaterSimple(levels, subtreeLevels, zeroSubtreeRoot) {
    var remainingLevels = levels - subtreeLevels;

    signal input oldRoot;
    signal input newRoot;
    signal input leaves[1 << subtreeLevels];
    signal input pathIndices;
    signal private input pathElements[remainingLevels];

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
