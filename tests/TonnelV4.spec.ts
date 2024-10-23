import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Address, beginCell, Cell, Dictionary, toNano} from '@ton/core';
import '@ton/test-utils';
import {compile} from '@ton/blueprint';
import {parseG1Func, parseG2Func} from "../utils/circuit";

const Utxo = require('../utils/utxo');
const {Keypair, toFixedHex} = require('../utils/keypair');

import path from "path";
// @ts-ignore
import {groth16} from "snarkjs";
import MerkleTree from "fixed-merkle-tree";
import { bitsToNumber, CellRef, mimcHash2 } from '../utils/merkleTree';
import {getSecureRandomBytes, KeyPair, keyPairFromSeed} from "@ton/crypto";
import {TonnelV4} from "../wrappers/TonnelV4";
import {TonnelV3HashContract} from "../wrappers/TonnelV3HashContract";
import {parseDict} from "@ton/core/dist/dict/parseDict";
import {BigNumber} from "ethers";
import jsSHA from 'jssha';

let ZERO_VALUE = 21663839004416932945382355908790599225266501822907911457504978515578255421292n;

const toBuffer = (value: any, length: number) =>
	Buffer.from(
		BigNumber.from(value)
			.toHexString()
			.slice(2)
			.padStart(length * 2, '0'),
		'hex',
	)

function hashInputs(input: {
	oldRoot: any;
	newRoot: any;
	pathIndices: any;
	leaves: any[];
}) {
	const sha = new jsSHA('SHA-256', 'ARRAYBUFFER')
	sha.update(toBuffer(input.oldRoot, 32))
	sha.update(toBuffer(input.newRoot, 32))
	sha.update(toBuffer(input.pathIndices, 4))

	for (let i = 0; i < input.leaves.length; i++) {
		sha.update(toBuffer(input.leaves[i], 32))
	}
	const hash = '0x' + sha.getHash('HEX')
	const result = BigNumber.from(hash)
		.mod(BigNumber.from('52435875175126190479447740508185965837690552500527637822603658699938581184513'))
		.toString()
	return result
}

const wasmPathTreeDeposit = path.join(__dirname, "../build/depositCheck_Tree/merkleTreeUpdater.wasm");
const zkeyPathTreeDeposit = path.join(__dirname, "../build/depositCheck_Tree/merkleTreeUpdater.zkey");
const vkeyTreeDepositPath = path.join(__dirname, "../build/depositCheck_Tree/verification_key_merkleTreeUpdater.json");
const vkeyTreeDeposit = require(vkeyTreeDepositPath);

const wasmPathTreeDepositHash = path.join(__dirname, "../build/depositCheck/depositChecker.wasm");
const zkeyPathTreeDepositHash = path.join(__dirname, "../build/depositCheck/depositChecker.zkey");
const vkeyTreeDepositHashPath = path.join(__dirname, "../build/depositCheck/verification_key.json");
const vkeyTreeDepositHash = require(vkeyTreeDepositHashPath);


const wasmPathTreeBatch = {
	32: path.join(__dirname, "../build/treeBatch32/merkleTreeUpdaterBatch.wasm"),
	16: path.join(__dirname, "../build/treeBatch16/merkleTreeUpdaterBatch.wasm"),
	8: path.join(__dirname, "../build/treeBatch8/merkleTreeUpdaterBatch.wasm")
};
const zkeyPathTreeBatch = {
	32: path.join(__dirname, "../build/treeBatch32/merkleTreeUpdaterBatch.zkey"),
	16: path.join(__dirname, "../build/treeBatch16/merkleTreeUpdaterBatch.zkey"),
	8: path.join(__dirname, "../build/treeBatch8/merkleTreeUpdaterBatch.zkey")
};
const vkeyTreeBatch = {
	32: require(path.join(__dirname, "../build/treeBatch32/verification_key.json")),
	16: require(path.join(__dirname, "../build/treeBatch16/verification_key.json")),
	8: require(path.join(__dirname, "../build/treeBatch8/verification_key.json"))
};


const wasmPathTransact2 = path.join(__dirname, "../build/transaction2/transaction2.wasm");
const zkeyPathTransact2 = path.join(__dirname, "../build/transaction2/transaction2.zkey");
const vkeyTransact2Path = path.join(__dirname, "../build/transaction2/verification_key_transaction2.json");
const vkeyTransact2 = require(vkeyTransact2Path);


const protocol_fee = 10;
const tx_fee_deposit = 130000000n; // 0.13 TON
const tx_fee_transact = 120000000n; // 0.12 TON
const tx_fee_stuck = 150000000n; // 0.15 TON


describe('Tonnel', () => {
	let code: Cell;
	let codeHash: Cell;

	async function doDeposit(tree: MerkleTree, deposit_utxo: typeof Utxo, sender: SandboxContract<any>) {
		const rootInit = await tonnel.getLastRoot();
		expect(BigInt(tree.root)).toEqual(rootInit);
		const tvlBefore = await tonnel.getTVL();

		const old_root = tree.root;
		// signal input oldRoot;
		// signal input newRoot;
		// signal input leaves[1 << subtreeLevels];
		// signal input pathIndices;
		// signal input depositAmount;
		// signal private input pathElements[remainingLevels];
		// signal private input publicKey;
		// signal private input binding;
		tree.insert(deposit_utxo.getCommitment());
		tree.insert(tree.zeros[0]);
		const new_root = tree.root;
		const {pathElements, pathIndices} = tree.path(tree.elements.length - 2)


		let input = {
			oldRoot: old_root,
			newRoot: new_root,
			leaves: [deposit_utxo.getCommitment(), tree.zeros[0]],
			pathIndices: Math.floor((tree.elements.length - 2) / 2),
			depositAmount: BigInt(deposit_utxo.amount).toString(),
			pathElements: pathElements.slice(1),
			publicKey: deposit_utxo.keypair.pubkey,
			binding: deposit_utxo.blinding.toString()
		}

		let {proof, publicSignals} = await groth16.fullProve(input,
			wasmPathTreeDeposit, zkeyPathTreeDeposit);
		// console.log(proof, publicSignals)
		// console.log(Date.now() - time)
		let verify = await groth16.verify(vkeyTreeDeposit, publicSignals, proof);
		// signal input depositAmount;
		// signal input leaf;
		//
		// signal private input publicKey;
		// signal private input binding;
		let input2 = {
			depositAmount: BigInt(deposit_utxo.amount).toString(),
			leaf: deposit_utxo.getCommitment(),
			publicKey: deposit_utxo.keypair.pubkey,
			binding: deposit_utxo.blinding.toString()
		}
		let {proof: proof2, publicSignals: publicSignals2} = await groth16.fullProve(input2,
			wasmPathTreeDepositHash, zkeyPathTreeDepositHash);
		let verify2 = await groth16.verify(vkeyTreeDepositHash, publicSignals2, proof2);

		expect(verify).toEqual(true);
		expect(verify2).toEqual(true);
		let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
		let B_y = proof.pi_b[1].map((num: string) => BigInt(num))

		let B_x2 = proof2.pi_b[0].map((num: string) => BigInt(num))
		let B_y2 = proof2.pi_b[1].map((num: string) => BigInt(num))
		//
		// ;; _ a:^Cell b:^Cell c:^Cell = Proof;
		// ;; _ commitment:uint256 new_root:uint256 old_root:uint256 proof:Proof = Commitment;
		// ;; deposit#888 query_id:uint64 deposit_amount:gram commitment:Commitment = InMsgBody;
		let payload = beginCell()
			.storeUint(0x888, 32)
			.storeUint(0, 64)
			.storeCoins(deposit_utxo.amount)
			.storeRef(
				beginCell()
					.storeUint(deposit_utxo.getCommitment(), 256)
					.storeUint(BigInt(new_root), 256)
					.storeUint(BigInt(old_root), 256)
					.storeRef(
						beginCell()
							.storeRef(parseG1Func(proof.pi_a.slice(0, 2).map((num: string) => BigInt(num))))
							.storeRef(parseG2Func(B_x[0], B_x[1], B_y))
							.storeRef(parseG1Func(proof.pi_c.slice(0, 2).map((num: string) => BigInt(num)))
							)
					).storeRef(
					beginCell()
						.storeRef(parseG1Func(proof2.pi_a.slice(0, 2).map((num: string) => BigInt(num))))
						.storeRef(parseG2Func(B_x2[0], B_x2[1], B_y2))
						.storeRef(parseG1Func(proof2.pi_c.slice(0, 2).map((num: string) => BigInt(num)))
						)
				)
					.endCell()
			)
			.endCell()
		let before = await tonnel.getBalance();
		const depositResult = await tonnel.sendDeposit(sender.getSender(), {
			value: deposit_utxo.amount + ((deposit_utxo.amount * BigInt(protocol_fee)) / 1000n) + tx_fee_deposit,
			payload: payload
		});
		let after = await tonnel.getBalance();


		expect(depositResult.transactions).toHaveTransaction({
			from: sender.address,
			to: tonnel.address,
			success: true,
		});


		expect(depositResult.transactions).toHaveTransaction({
			from: tonnel.address,
			to: owner.address,
			success: true,
			value: (value) => {
				if (value) {
					if (value - (deposit_utxo.amount * BigInt(protocol_fee)) / 1000n > toNano('0.5')) {
						return false
					}
					return value >= (deposit_utxo.amount * BigInt(protocol_fee)) / 1000n
				}
				return false
			},
		});

		expect(depositResult.transactions).toHaveTransaction({
			from: tonnel.address,
			to: sender.address,
			success: true,
			value: (value) => {
				if (value) {
					console.log('value', value)
					if (value > toNano('0.5')) {
						return false
					}
					return value > 0n
				}
				return false
			},
		});
		expect(after).toBeGreaterThanOrEqual(before + deposit_utxo.amount);

		const rootAfter = await tonnel.getLastRoot();
		expect(BigInt(tree.root)).toEqual(rootAfter);

		const tvlAfter = await tonnel.getTVL();
		expect(tvlAfter).toEqual(deposit_utxo.amount + tvlBefore);


	}


	async function doTransact({recipient, sender, tree, outputs, inputs, fee}: {
		outputs: typeof Utxo[];
		inputs: typeof Utxo[];
		fee: bigint;
		tree: MerkleTree;
		recipient: Address;
		sender: SandboxContract<any>;
	}) {
		const rootInit = await tonnel.getLastRoot();
		const tvlBefore = await tonnel.getTVL();

		expect(BigInt(tree.root)).toEqual(rootInit);

		while (inputs.length !== 2 && inputs.length < 16) {
			inputs.push(new Utxo())
		}
		while (outputs.length < 2) {
			outputs.push(new Utxo())
		}

		let extAmount = fee + outputs.reduce((sum, x) => sum + x.amount, 0n)
			- inputs.reduce((sum: any, x: { amount: any; }) => sum + x.amount, 0n)

		console.log(extAmount)
		const storeEncryptedOutput = (output: typeof Utxo) => {
			let data: string = output.encrypt()
			// data = 0xd23b6ca2e8b3829fe1f3966a72b7789689d505bf9d5e4b870804f640f725706350a8725b27cbffcccf92c2c4e58425f6af31ca5b6755d547e226836667460e754eafce7b5a15e3678180ab218d53e75c2fa43a70214ecb1eaa7cc9f5d7dc5be60917a1f01eb3a3a105513f59c8ee35ff4d0eb7c0f0e8b47473af7458671f01d19eaadda47a72f9146bb3f426419459525682dd69e5aa48c0889a505a
			let boc = beginCell()
			// store first 128 bytes of data
			boc.storeBuffer(Buffer.from(data.slice(2), 'hex').slice(0, 120))
			boc.storeRef(
				beginCell().storeBuffer(Buffer.from(data.slice(2), 'hex').slice(120)).endCell()
			)
			return boc.endCell()
		}
		let encryptedOutput0 = storeEncryptedOutput(outputs[0])
		let encryptedOutput1 = storeEncryptedOutput(outputs[1])
		let extDataHash = BigInt(toFixedHex(beginCell()
			.storeUint(BigInt(fee), 64)
			.storeInt(extAmount, 248)
			.storeAddress(recipient)
			.storeRef(
				encryptedOutput0
			)
			.storeRef(
				encryptedOutput1
			)
			.endCell().hash()))

		let inputMerklePathIndices = []
		let inputMerklePathElements = []

		for (const input of inputs) {
			if (input.amount > 0) {
				input.index = tree.indexOf(input.getCommitment())
				if (input.index < 0) {
					throw new Error(`Input commitment ${toFixedHex(input.getCommitment())} was not found`)
				}
				const {pathElements, pathIndices} = tree.path(input.index)

				inputMerklePathIndices.push(bitsToNumber(pathIndices).toString())
				inputMerklePathElements.push(pathElements)
			} else {
				inputMerklePathIndices.push(0)
				inputMerklePathElements.push(new Array(tree.levels).fill(0))
			}
		}
		let input = {
			root: tree.root,
			publicAmount: (BigInt(extAmount) - BigInt(fee)),
			extDataHash,

			inputNullifier: inputs.map((x) => BigInt(x.getNullifier())),
			inAmount: inputs.map((x) => x.amount),
			inPrivateKey: inputs.map((x) => BigInt(x.keypair.privkey)),
			inBlinding: inputs.map((x) => x.blinding),
			inPathIndices: inputMerklePathIndices,
			inPathElements: inputMerklePathElements,


			outputCommitment: outputs.map((x) => BigInt(x.getCommitment())),

			// data for 2 transaction inputs


			// data for 2 transaction outputs
			outAmount: outputs.map((x) => x.amount),
			outBlinding: outputs.map((x) => x.blinding),
			outPubkey: outputs.map((x) => BigInt(x.keypair.pubkey)),
		}
		console.log(input)

		let {proof, publicSignals} = await groth16.fullProve(input,
			wasmPathTransact2, zkeyPathTransact2);
		// console.log(proof, publicSignals)
		// console.log(Date.now() - time)
		let verify = await groth16.verify(vkeyTransact2, publicSignals, proof);
		expect(verify).toEqual(true);


		let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
		let B_y = proof.pi_b[1].map((num: string) => BigInt(num))

		let payload = beginCell()
			.storeUint(0x777, 32)
			.storeUint(0, 64)
			.storeRef(
				beginCell()
					.storeUint(BigInt(tree.root), 256)
					.storeUint(input.inputNullifier[0], 256)
					.storeUint(input.inputNullifier[1], 256)
					.storeRef(
						beginCell()
							.storeUint(input.outputCommitment[0], 256)
							.storeUint(input.outputCommitment[1], 256)
							.storeRef(
								beginCell()
									.storeUint(BigInt(fee), 64)
									.storeInt(extAmount, 248)
									.storeAddress(recipient)
									.storeRef(
										encryptedOutput0
									)
									.storeRef(
										encryptedOutput1
									)
									.endCell()
							)
							.endCell()
					)
					.storeRef(
						beginCell()
							.storeRef(parseG1Func(proof.pi_a.slice(0, 2).map((num: string) => BigInt(num))))
							.storeRef(parseG2Func(B_x[0], B_x[1], B_y))
							.storeRef(parseG1Func(proof.pi_c.slice(0, 2).map((num: string) => BigInt(num)))
							)
					)
					.endCell()
			)
			.endCell()
		let before = await tonnel.getBalance();
		const depositResult = await tonnel.sendDeposit(sender.getSender(), {
			value: tx_fee_transact + (extAmount > 0 ? BigInt(extAmount) + BigInt(extAmount) * BigInt(protocol_fee) / 1000n : 0n),
			payload: payload
		});
		let after = await tonnel.getBalance();
		console.log('before: ', before)
		console.log('after: ', after)

		console.log(tx_fee_transact + (extAmount > 0 ? BigInt(extAmount) + BigInt(extAmount) * BigInt(protocol_fee) / 1000n : 0n))
		expect(after).toBeGreaterThanOrEqual(before + (BigInt(extAmount) - BigInt(fee)));


		expect(depositResult.transactions).toHaveTransaction({
			from: sender.address,
			to: tonnel.address,
			success: true,
		});

		expect(depositResult.transactions).toHaveTransaction({
			from: tonnel.address,
			success: true,
			deploy: true,
		});

		expect(depositResult.transactions).toHaveTransaction({
			from: tonnel.address,
			to: sender.address,
			success: true,
			value: (value) => {
				if (value) {
					console.log('value - fee', value, fee)
					if (value - fee > toNano('0.5')) {
						return false
					}
					return value >= fee
				}
				return false
			}
		})


		if (extAmount > 0) {
			expect(depositResult.transactions).toHaveTransaction({
				from: tonnel.address,
				to: owner.address,
				value: BigInt(extAmount) * BigInt(protocol_fee) / 1000n,
				success: true,
			});
		} else {
			expect(depositResult.transactions).toHaveTransaction({
					from: tonnel.address,
					to: recipient,
					value: BigInt(-extAmount),
					success: true,
				}
			);
		}


		const rootAfter = await tonnel.getLastRoot();
		expect(BigInt(tree.root)).toEqual(rootAfter);
		for (let i = 0; i < input.inputNullifier.length; i++) {
			let contractHash = blockchain.openContract(TonnelV3HashContract.createFromAddress(
				await tonnel.getHashAddress(input.inputNullifier[i])
			));
			let check = await contractHash.getIsAlreadyDeployed();

			expect(depositResult.transactions).toHaveTransaction({
				from: tonnel.address,
				to: contractHash.address,
				success: true,
				deploy: true,
			});
			//
			// expect(depositResult.transactions).toHaveTransaction({
			// 	from: tonnel.address,
			// 	to: contractHash.address,
			// 	destroyed: true,
			// });
			expect(check).toEqual(true);

		}

		const tvlAfter = await tonnel.getTVL();
		console.log(fee / BigInt(1e9), BigInt(extAmount) / BigInt(1e9), tvlBefore/ BigInt(1e9), tvlAfter/ BigInt(1e9))
		expect(tvlAfter).toEqual(BigInt(extAmount) + tvlBefore - fee);


	}

	async function clearStucks(stuckDict: Map<bigint, {
		commitment1: bigint;
		commitment2: bigint
	}>, tree: MerkleTree, sender: SandboxContract<TreasuryContract>, count = 32) {
		const length_before = stuckDict.size
		if (count != 32 && count != 16 && count != 8) {
			throw new Error(`Tree size is not multiple of ${count}`)
		}
		if (tree.elements.length % count !== 0) {
			throw new Error(`Tree size is not multiple of ${count}`)
		}
		// get 16 commitments from stuckDict
		const selectedCommitments = Array.from(stuckDict.keys()).slice(0, count / 2)
		const leaves: any[] = selectedCommitments.map((c) => {
			return [stuckDict.get(c)!.commitment1, stuckDict.get(c)!.commitment2]
		}).flat(1)
		console.log(leaves)


		const oldRoot = tree.root.toString()
		tree.bulkInsert(leaves)

		const newRoot = tree.root.toString()
		let {pathElements, pathIndices} = tree.path(tree.elements.length - 1)
		pathElements = pathElements.slice(Math.log2(count)).map((a: any) => BigNumber.from(a).toString())
		let pathIndices2 = bitsToNumber(pathIndices.slice(Math.log2(count))).toString()

		// signal input argsHash;
		// signal private input oldRoot;
		// signal private input newRoot;
		// signal private input pathIndices;
		// signal private input pathElements[height];
		// signal private input leaves[nLeaves];
		const input = {
			argsHash: '',
			oldRoot,
			newRoot,
			pathIndices: pathIndices2,
			pathElements,
			leaves,
		}
		input.argsHash = hashInputs(input)

		let {proof, publicSignals} = await groth16.fullProve(input,
			wasmPathTreeBatch[count], zkeyPathTreeBatch[count]);
		let verify = await groth16.verify(vkeyTreeBatch[count], publicSignals, proof);
		expect(verify).toEqual(true);


		// cell args = in_msg_body~load_ref();
		// slice args_slice = args.begin_parse();
		// int args_hash = args_slice~load_uint(256);
		// int _currentRoot = args_slice~load_uint(256);
		// int _newRoot = args_slice~load_uint(256);
		// int _pathIndices = args_slice~load_uint(32);
		// slice insert_proof_slice = args_slice~load_ref().begin_parse();
		const empty = Dictionary.empty(Dictionary.Keys.BigUint(32), CellRef)

		for (let i = 0; i < leaves.length; i++) {
			empty.set(
				BigInt(i),
				beginCell().storeUint(leaves[i], 256).endCell()
			)
		}
		let B_x = proof.pi_b[0].map((num: string) => BigInt(num))
		let B_y = proof.pi_b[1].map((num: string) => BigInt(num))
		let payload = beginCell()
			.storeUint(BigInt('0x111' + count), 32)
			.storeUint(0, 64)
			.storeDict(
				empty
			).storeRef(
				beginCell()
					.storeUint(BigInt(input.argsHash), 256)
					.storeUint(BigInt(input.oldRoot), 256)
					.storeUint(BigInt(input.newRoot), 256)
					.storeUint(BigInt(input.pathIndices), 32)
					.storeRef(
						beginCell()
							.storeRef(parseG1Func(proof.pi_a.slice(0, 2).map((num: string) => BigInt(num))))
							.storeRef(parseG2Func(B_x[0], B_x[1], B_y))
							.storeRef(parseG1Func(proof.pi_c.slice(0, 2).map((num: string) => BigInt(num))))
							.endCell()
					)
					.endCell()
			)
			.endCell()

		let before = await tonnel.getBalance();
		const depositResult = await tonnel.sendDeposit(sender.getSender(), {
			value: tx_fee_stuck,
			payload: payload
		});
		let after = await tonnel.getBalance();
		console.log('before: ', before)
		console.log('after: ', after)

		expect(BigInt(tree.root)).toEqual(BigInt(newRoot))
		expect(depositResult.transactions).toHaveTransaction({
			from: sender.address,
			to: tonnel.address,
			success: true,
		})
		expect(depositResult.transactions).toHaveTransaction({
			from: tonnel.address,
			to: sender.address,
			success: true,
			value: (value) => {
				console.log('value fix stuck', value)
				if (value) {
					return value > 0n
				}
				return false
			}
		})

		const stuckCell = await tonnel.getStuck()
		let length_after = 0
		if (stuckCell) {
			stuckDict = parseDict(stuckCell.beginParse(), 256, (slice) => {
				const flag = slice.loadUint(4)
				if (flag) {
					const commitment1 = slice.loadUintBig(256)
					const commitment2 = slice.loadUintBig(256)
					return {
						commitment1, commitment2
					}
				} else {
					const commitment = slice.loadUintBig(256)
					return {
						commitment1: commitment,
						commitment2: ZERO_VALUE
					}
				}
			})
			length_after = stuckDict.size
		}

		expect(length_after).toEqual(length_before - count / 2)


	}

	beforeAll(async () => {
		code = await compile('TonnelV4');
		codeHash = await compile('TonnelV3HashContract');
	});

	let blockchain: Blockchain;
	let tonnel: SandboxContract<TonnelV4>;
	let owner: SandboxContract<TreasuryContract>;
	let _keypair: KeyPair;

	beforeEach(async () => {
		blockchain = await Blockchain.create();
		owner = await blockchain.treasury('owner');

		_keypair = keyPairFromSeed(await getSecureRandomBytes(32));


		const deployer = await blockchain.treasury('deployer');


		tonnel = blockchain.openContract(
			TonnelV4.createFromConfig(
				{
					ownerAddress: owner.address,
					protocolFee: protocol_fee,
					hash_contract_bytecode: codeHash,
				},
				code
			)
		);


		const deployResult = await tonnel.sendDeploy(deployer.getSender(), toNano('0.5'));

		expect(deployResult.transactions).toHaveTransaction({
			from: deployer.address,
			to: tonnel.address,
			deploy: true,
			success: true,
		});


	});

	it('should deploy', () => {
		console.log(tonnel.address);
	});


	it('should deploy and then deposit', async () => {
		console.log('before-1', await tonnel.getBalance() / 1000000000n);

		const tree = new MerkleTree(17, [], {
			hashFunction: mimcHash2,
			zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
		});
		const rootInit = await tonnel.getLastRoot();
		expect(BigInt(tree.root)).toEqual(rootInit);
		console.log('before', Number(await tonnel.getBalance()) / 1000000000);

		const sender = await blockchain.treasury('sender');


		const arrayUtxo = []


		for (let i = 0; i < 5; i++) {

			const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 1) // random amount between 1 and 1000
			const utxo_random = new Utxo({amount: aliceDepositAmount})
			arrayUtxo.push(utxo_random)
			await doDeposit(tree, utxo_random, sender)
		}

	}, 500000);


	it('should deploy and then transact', async () => {
		console.log('before-1', await tonnel.getBalance() / 1000000000n);

		const tree = new MerkleTree(17, [], {
			hashFunction: mimcHash2,
			zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
		});
		const rootInit = await tonnel.getLastRoot();
		expect(BigInt(tree.root)).toEqual(rootInit);
		console.log('before', Number(await tonnel.getBalance()) / 1000000000);

		const sender = await blockchain.treasury('sender');


		// Alice deposits into tornado pool
		const aliceDepositAmount = toNano(100)
		const aliceDepositUtxo = new Utxo({amount: aliceDepositAmount})
		await doDeposit(tree, aliceDepositUtxo, sender)

		// Bob gives Alice address to send some TON inside the shielded pool
		const bobKeypair = new Keypair() // contains private and public keys
		const bobAddress = bobKeypair.address() // contains only public key

		// Alice sends some TON to Bob
		const bobSendAmount = toNano(25)
		const bobSendUtxo = new Utxo({amount: bobSendAmount, keypair: Keypair.fromString(bobAddress)})
		const aliceChangeUtxo = new Utxo({
			amount: aliceDepositAmount - bobSendAmount + toNano(10),
			keypair: aliceDepositUtxo.keypair,
		})
		const relayerWallet = await blockchain.treasury('relllayer');
		const recipient = await blockchain.treasury('recipient');
		await doTransact({
			sender: relayerWallet,
			tree,
			inputs: [aliceDepositUtxo],
			outputs: [bobSendUtxo, aliceChangeUtxo],
			fee: toNano(3),
			recipient: recipient.address
		})

	}, 500000);


	it('should deploy and then transact and then check tree', async () => {
		const tree = new MerkleTree(17, [], {
			hashFunction: mimcHash2,
			zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
		});

		const rootInit = await tonnel.getLastRoot();
		expect(BigInt(tree.root)).toEqual(rootInit);
		console.log('before', Number(await tonnel.getBalance()) / 1000000000);

		const sender = await blockchain.treasury('sender');


		const arrayUtxo = []


		for (let i = 0; i < 16; i++) {

			const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 30) // random amount between 1 and 1000
			const utxo_random = new Utxo({amount: aliceDepositAmount})
			arrayUtxo.push(utxo_random)
			await doDeposit(tree, utxo_random, sender)
		}


		for (let i = 0; i < 16; i++) {
			const aliceDepositUtxo = arrayUtxo[i]
			const aliceDepositAmount = aliceDepositUtxo.amount
			// Bob gives Alice address to send some TON inside the shielded pool
			const bobKeypair = new Keypair() // contains private and public keys
			const bobAddress = bobKeypair.address() // contains only public key

			// Alice sends some TON to Bob
			const bobSendAmount = toNano(25)
			const bobSendUtxo = new Utxo({amount: bobSendAmount, keypair: Keypair.fromString(bobAddress)})
			const aliceChangeUtxo = new Utxo({
				amount: aliceDepositAmount - bobSendAmount + toNano(10),
				keypair: aliceDepositUtxo.keypair,
			})
			const relayerWallet = await blockchain.treasury('relllayer');
			const recipient = await blockchain.treasury('recipient');
			await doTransact({
				sender: relayerWallet,
				tree,
				inputs: [aliceDepositUtxo],
				outputs: [bobSendUtxo, aliceChangeUtxo],
				fee: toNano(3),
				recipient: recipient.address
			})
		}

		const stuckCell = await tonnel.getStuck()
		if (!stuckCell) throw new Error('Stuck cell is not found')
		const stuckDict = parseDict(stuckCell.beginParse(), 256, (slice) => {
			const flag = slice.loadUint(4)
			if (flag) {
				const commitment1 = slice.loadUintBig(256)
				const commitment2 = slice.loadUintBig(256)
				return {
					commitment1, commitment2
				}
			} else {
				const commitment = slice.loadUintBig(256)
				return {
					commitment1: commitment,
					commitment2: ZERO_VALUE
				}
			}
		})

		await clearStucks(stuckDict, tree, sender)

	}, 500000);

	it('should deploy and then transact and then check tree-16', async () => {
		const tree = new MerkleTree(17, [], {
			hashFunction: mimcHash2,
			zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
		});

		const rootInit = await tonnel.getLastRoot();
		expect(BigInt(tree.root)).toEqual(rootInit);
		console.log('before', Number(await tonnel.getBalance()) / 1000000000);

		const sender = await blockchain.treasury('sender');


		const arrayUtxo = []


		for (let i = 0; i < 8; i++) {

			const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 30) // random amount between 1 and 1000
			const utxo_random = new Utxo({amount: aliceDepositAmount})
			arrayUtxo.push(utxo_random)
			await doDeposit(tree, utxo_random, sender)
		}


		for (let i = 0; i < 8; i++) {
			const aliceDepositUtxo = arrayUtxo[i]
			const aliceDepositAmount = aliceDepositUtxo.amount
			// Bob gives Alice address to send some TON inside the shielded pool
			const bobKeypair = new Keypair() // contains private and public keys
			const bobAddress = bobKeypair.address() // contains only public key

			// Alice sends some TON to Bob
			const bobSendAmount = toNano(25)
			const bobSendUtxo = new Utxo({amount: bobSendAmount, keypair: Keypair.fromString(bobAddress)})
			const aliceChangeUtxo = new Utxo({
				amount: aliceDepositAmount - bobSendAmount + toNano(10),
				keypair: aliceDepositUtxo.keypair,
			})
			const relayerWallet = await blockchain.treasury('relllayer');
			const recipient = await blockchain.treasury('recipient');
			await doTransact({
				sender: relayerWallet,
				tree,
				inputs: [aliceDepositUtxo],
				outputs: [bobSendUtxo, aliceChangeUtxo],
				fee: toNano(3),
				recipient: recipient.address
			})
		}

		const stuckCell = await tonnel.getStuck()
		if (!stuckCell) throw new Error('Stuck cell is not found')

		const stuckDict = parseDict(stuckCell.beginParse(), 256, (slice) => {
			const flag = slice.loadUint(4)
			if (flag) {
				const commitment1 = slice.loadUintBig(256)
				const commitment2 = slice.loadUintBig(256)
				return {
					commitment1, commitment2
				}
			} else {
				const commitment = slice.loadUintBig(256)
				return {
					commitment1: commitment,
					commitment2: ZERO_VALUE
				}
			}
		})

		await clearStucks(stuckDict, tree, sender, 16)

	}, 500000);

	it('should deploy and then transact and then check tree-8', async () => {
		const tree = new MerkleTree(17, [], {
			hashFunction: mimcHash2,
			zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292',
		});

		const rootInit = await tonnel.getLastRoot();
		expect(BigInt(tree.root)).toEqual(rootInit);
		console.log('before', Number(await tonnel.getBalance()) / 1000000000);

		const sender = await blockchain.treasury('sender');


		const arrayUtxo = []


		for (let i = 0; i < 4; i++) {

			const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 30) // random amount between 1 and 1000
			const utxo_random = new Utxo({amount: aliceDepositAmount})
			arrayUtxo.push(utxo_random)
			await doDeposit(tree, utxo_random, sender)
		}


		for (let i = 0; i < 4; i++) {
			const aliceDepositUtxo = arrayUtxo[i]
			const aliceDepositAmount = aliceDepositUtxo.amount
			// Bob gives Alice address to send some TON inside the shielded pool
			const bobKeypair = new Keypair() // contains private and public keys
			const bobAddress = bobKeypair.address() // contains only public key

			// Alice sends some TON to Bob
			const bobSendAmount = toNano(25)
			const bobSendUtxo = new Utxo({amount: bobSendAmount, keypair: Keypair.fromString(bobAddress)})
			const aliceChangeUtxo = new Utxo({
				amount: aliceDepositAmount - bobSendAmount + toNano(10),
				keypair: aliceDepositUtxo.keypair,
			})
			const relayerWallet = await blockchain.treasury('relllayer');
			const recipient = await blockchain.treasury('recipient');
			await doTransact({
				sender: relayerWallet,
				tree,
				inputs: [aliceDepositUtxo],
				outputs: [bobSendUtxo, aliceChangeUtxo],
				fee: toNano(3),
				recipient: recipient.address
			})
		}

		const stuckCell = await tonnel.getStuck()
		if (!stuckCell) throw new Error('Stuck cell is not found')

		const stuckDict = parseDict(stuckCell.beginParse(), 256, (slice) => {
			const flag = slice.loadUint(4)
			if (flag) {
				const commitment1 = slice.loadUintBig(256)
				const commitment2 = slice.loadUintBig(256)
				return {
					commitment1, commitment2
				}
			} else {
				const commitment = slice.loadUintBig(256)
				return {
					commitment1: commitment,
					commitment2: ZERO_VALUE
				}
			}
		})

		await clearStucks(stuckDict, tree, sender, 8)

	}, 500000);

});
