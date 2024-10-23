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

// Helper template that computes hashes of the next tree layer
template TreeLayer(height) {
  var nItems = 1 << height;
  signal input ins[nItems * 2];
  signal output outs[nItems];

  component hash[nItems];
  for(var i = 0; i < nItems; i++) {
    hash[i] = HashCustom(2);
    hash[i].in[0] <== ins[i * 2];
    hash[i].in[1] <== ins[i * 2 + 1];
    hash[i].hash ==> outs[i];
  }
}

// Builds a merkle tree from leaf array
template MerkleTree(levels) {
  signal input leaves[1 << levels];
  signal output root;

  component layers[levels];
  for(var level = levels - 1; level >= 0; level--) {
    layers[level] = TreeLayer(level);
    for(var i = 0; i < (1 << (level + 1)); i++) {
      layers[level].ins[i] <== level == levels - 1 ? leaves[i] : layers[level + 1].outs[i];
    }
  }

  root <== levels > 0 ? layers[0].outs[0] : leaves[0];
}
