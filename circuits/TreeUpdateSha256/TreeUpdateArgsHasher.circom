include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/sha256/sha256.circom";

// Computes a SHA256 hash of all inputs packed into a byte array
// Field elements are padded to 256 bits with zeroes
template TreeUpdateArgsHasher(nLeaves) {
    signal input oldRoot;
    signal input newRoot;
    signal input pathIndices;
    signal input leaves[nLeaves];
    signal output out;

    var header = 256 + 256 + 32;
    var bitsPerLeaf = 256; // it was 256 + 160 + 32, but we don't need to use full address of instance
    component hasher = Sha256(header + nLeaves * bitsPerLeaf);

    // the range check on old root is optional, it's enforced by smart contract anyway
    component bitsOldRoot = Num2Bits(256);
    component bitsNewRoot = Num2Bits(256);
    component bitsPathIndices = Num2Bits(32);
    component bitsLeaves[nLeaves];

    bitsOldRoot.in <== oldRoot;
    bitsNewRoot.in <== newRoot;
    bitsPathIndices.in <== pathIndices;

    var index = 0;

    for(var i = 0; i < 256; i++) {
        hasher.in[index++] <== bitsOldRoot.out[255 - i];
    }
    for(var i = 0; i < 256; i++) {
        hasher.in[index++] <== bitsNewRoot.out[255 - i];
    }
    for(var i = 0; i < 32; i++) {
        hasher.in[index++] <== bitsPathIndices.out[31 - i];
    }
    for(var leaf = 0; leaf < nLeaves; leaf++) {
        // the range check on hash is optional, it's enforced by the smart contract anyway
        bitsLeaves[leaf] = Num2Bits(256);
        bitsLeaves[leaf].in <== leaves[leaf];
        for(var i = 0; i < 256; i++) {
            hasher.in[index++] <== bitsLeaves[leaf].out[255 - i];
        }
    }
    component b2n = Bits2Num(256);
    for (var i = 0; i < 256; i++) {
        b2n.in[i] <== hasher.out[255 - i];
    }
    out <== b2n.out;
}
