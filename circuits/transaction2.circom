include "./transaction.circom"

// zeroLeaf = Poseidon(zero, zero)
// default `zero` value is keccak256("tornado") % FIELD_SIZE = 21663839004416932945382355908790599225266501822907911457504978515578255421292
component main = Transaction(17, 2, 2, 21663839004416932945382355908790599225266501822907911457504978515578255421292);
