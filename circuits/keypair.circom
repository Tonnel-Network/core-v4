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

// Since we don't use signatures, the keypair can be based on a simple hash
template Keypair() {
    signal input privateKey;
    signal output publicKey;

    component hasher = HashCustom(1);
    hasher.in[0] <== privateKey;
    publicKey <== hasher.hash;
}

template Signature() {
    signal input privateKey;
    signal input commitment;
    signal input merklePath;
    signal output out;

    component hasher = HashCustom(3);
    hasher.in[0] <== privateKey;
    hasher.in[1] <== commitment;
    hasher.in[2] <== merklePath;
    out <== hasher.hash;
}
