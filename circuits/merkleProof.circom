include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/switcher.circom";
include "./mimcsponge.circom";

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
