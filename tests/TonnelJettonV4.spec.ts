import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Dictionary, fromNano, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { hashInputs, parseG1Func, parseG2Func } from '../utils/circuit';

const Utxo = require('../utils/utxo');
const { Keypair, toFixedHex } = require('../utils/keypair');

import path from 'path';
// @ts-ignore
import { groth16 } from 'snarkjs';
import MerkleTree from 'fixed-merkle-tree';
import { bitsToNumber, CellRef, mimcHash2 } from '../utils/merkleTree';
import { getSecureRandomBytes, KeyPair, keyPairFromSeed } from '@ton/crypto';
import { TonnelV4 } from '../wrappers/TonnelV4';
import { TonnelV3HashContract } from '../wrappers/TonnelV3HashContract';
import { parseDict } from '@ton/core/dist/dict/parseDict';
import { BigNumber } from 'ethers';
import jsSHA from 'jssha';
import { TonnelJettonV4 } from '../wrappers/TonnelJettonV4';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';

let ZERO_VALUE = 21663839004416932945382355908790599225266501822907911457504978515578255421292n;


const wasmPathTreeDeposit = path.join(__dirname, '../build/depositCheck_Tree/merkleTreeUpdater.wasm');
const zkeyPathTreeDeposit = path.join(__dirname, '../build/depositCheck_Tree/merkleTreeUpdater.zkey');
const vkeyTreeDepositPath = path.join(__dirname, '../build/depositCheck_Tree/verification_key.json');
const vkeyTreeDeposit = require(vkeyTreeDepositPath);

const wasmPathTreeDepositHash = path.join(__dirname, '../build/depositCheck/depositChecker.wasm');
const zkeyPathTreeDepositHash = path.join(__dirname, '../build/depositCheck/depositChecker.zkey');
const vkeyTreeDepositHashPath = path.join(__dirname, '../build/depositCheck/verification_key.json');
const vkeyTreeDepositHash = require(vkeyTreeDepositHashPath);


const wasmPathTreeBatch = {
    32: path.join(__dirname, '../build/treeBatch32/merkleTreeUpdaterBatch.wasm'),
    16: path.join(__dirname, '../build/treeBatch16/merkleTreeUpdaterBatch.wasm'),
    8: path.join(__dirname, '../build/treeBatch8/merkleTreeUpdaterBatch.wasm')
};
const zkeyPathTreeBatch = {
    32: path.join(__dirname, '../build/treeBatch32/merkleTreeUpdaterBatch.zkey'),
    16: path.join(__dirname, '../build/treeBatch16/merkleTreeUpdaterBatch.zkey'),
    8: path.join(__dirname, '../build/treeBatch8/merkleTreeUpdaterBatch.zkey')
};
const vkeyTreeBatch = {
    32: require(path.join(__dirname, '../build/treeBatch32/verification_key.json')),
    16: require(path.join(__dirname, '../build/treeBatch16/verification_key.json')),
    8: require(path.join(__dirname, '../build/treeBatch8/verification_key.json'))
};


const wasmPathTransact2 = path.join(__dirname, '../build/transaction2/transaction2.wasm');
const zkeyPathTransact2 = path.join(__dirname, '../build/transaction2/transaction2.zkey');
const vkeyTransact2Path = path.join(__dirname, '../build/transaction2/verification_key.json');
const vkeyTransact2 = require(vkeyTransact2Path);


const protocol_fee_per_thousand = 10;
const tx_fee_deposit = 130000000n; // 0.13 TON
const tx_fee_deposit_jetton = 130000000n; // 0.13 TON

const tx_fee_transact = 120000000n; // 0.12 TON
const tx_fee_transact_jetton = 180000000n; // 0.12 TON
const tx_fee_stuck = 150000000n; // 0.15 TON


describe('Tonnel', () => {
    let code: Cell;
    let codeHash: Cell;
    let codeJettonMaster: Cell;
    let codeJettonWallet: Cell;

    async function doDeposit(tree: MerkleTree, deposit_utxo: typeof Utxo, sender: SandboxContract<any>, which : number = 0, asset_id = 0n) {
        const rootInit = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootInit);
        const old_root = tree.root;

        tree.insert(deposit_utxo.getCommitment());
        tree.insert(tree.zeros[0]);
        const new_root = tree.root;
        const { pathElements, pathIndices } = tree.path(tree.elements.length - 2);


        let input = {
            oldRoot: old_root,
            newRoot: new_root,
            leaves: [deposit_utxo.getCommitment(), tree.zeros[0]],
            pathIndices: Math.floor((tree.elements.length - 2) / 2),
            depositAmount: BigInt(deposit_utxo.amount).toString(),
            pathElements: pathElements.slice(1),
            publicKey: deposit_utxo.keypair.pubkey,
            binding: deposit_utxo.blinding.toString(),
            asset_id: asset_id
        };

        let { proof, publicSignals } = await groth16.fullProve(input,
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
            binding: deposit_utxo.blinding.toString(),
            asset_id: asset_id
        };
        let { proof: proof2, publicSignals: publicSignals2 } = await groth16.fullProve(input2,
            wasmPathTreeDepositHash, zkeyPathTreeDepositHash);
        let verify2 = await groth16.verify(vkeyTreeDepositHash, publicSignals2, proof2);

        expect(verify).toEqual(true);
        expect(verify2).toEqual(true);
        let B_x = proof.pi_b[0].map((num: string) => BigInt(num));
        let B_y = proof.pi_b[1].map((num: string) => BigInt(num));

        let B_x2 = proof2.pi_b[0].map((num: string) => BigInt(num));
        let B_y2 = proof2.pi_b[1].map((num: string) => BigInt(num));
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
            .endCell();

        if (asset_id > 0) {
            const jettonWalletPool = blockchain.openContract(JettonWallet.createFromAddress(
                await jettonMasters[which].getWalletAddress(tonnel.address)
            ));
            const jettonWalletSender = blockchain.openContract(JettonWallet.createFromAddress(
                await jettonMasters[which].getWalletAddress(sender.address)
            ));
            let before = await jettonWalletPool.getBalanceJetton();
            const protocol_fee_amount = await tonnel.getProtocolFee(deposit_utxo.amount, asset_id);
            const jetton_amount = deposit_utxo.amount + protocol_fee_amount;
            const balanceSheetBefore = await tonnel.getTVL(asset_id);

            const depositResult = await jettonWalletSender.sendTransfer(sender.getSender(), {
                value: tx_fee_deposit_jetton + toNano('0.05'),
                toAddress: tonnel.address,
                queryId: 0,
                fwdAmount: tx_fee_deposit_jetton,
                jettonAmount: jetton_amount,
                fwdPayload: payload
            })

            let after = await jettonWalletPool.getBalanceJetton();
            const balanceSheetAfter = await tonnel.getTVL(asset_id);
            expect(depositResult.transactions).toHaveTransaction({
                from: sender.address,
                to: jettonWalletSender.address,
                success: true
            });
            expect(depositResult.transactions).toHaveTransaction({
                from: jettonWalletSender.address,
                to: jettonWalletPool.address,
                success: true
            });
            expect(depositResult.transactions).toHaveTransaction({
                from: jettonWalletPool.address,
                to: tonnel.address,
                success: true
            });

            // sender should receive the residual of gas amount but not much
            expect(depositResult.transactions).toHaveTransaction({
                to: sender.address,
                success: true,
                value: (value) => {
                    if (value) {
                        console.log('value', value);
                        if (value > toNano('0.3')) {
                            return false;
                        }
                        return value > 0n;
                    }
                    return false;
                }
            });

            expect(after).toBeGreaterThanOrEqual(before + deposit_utxo.amount + protocol_fee_amount);
            expect(balanceSheetAfter.reserve).toBeGreaterThanOrEqual(protocol_fee_amount + balanceSheetBefore.reserve);
            expect(balanceSheetAfter.balance).toEqual(deposit_utxo.amount + balanceSheetBefore.balance);


        } else {
            let before = await tonnel.getBalance();
            const protocol_fee_amount = await tonnel.getProtocolFee(deposit_utxo.amount);
            const balanceSheetBefore = await tonnel.getTVL(0n);
            console.log('protocol_fee_amount', fromNano(deposit_utxo.amount), fromNano(protocol_fee_amount));
            const depositResult = await tonnel.sendInternal(sender.getSender(), {
                value: deposit_utxo.amount + protocol_fee_amount + tx_fee_deposit,
                payload: payload
            });
            let after = await tonnel.getBalance();
            const balanceSheetAfter = await tonnel.getTVL(0n);


            expect(depositResult.transactions).toHaveTransaction({
                from: sender.address,
                to: tonnel.address,
                success: true
            });


            // sender should receive the residual of gas amount but not much
            expect(depositResult.transactions).toHaveTransaction({
                from: tonnel.address,
                to: sender.address,
                success: true,
                value: (value) => {
                    if (value) {
                        console.log('value', value);
                        if (value > toNano('0.3')) {
                            return false;
                        }
                        return value > 0n;
                    }
                    return false;
                }
            });
            expect(after).toBeGreaterThanOrEqual(before + deposit_utxo.amount + protocol_fee_amount - toNano(0.2));



            expect(balanceSheetAfter.reserve).toBeGreaterThanOrEqual(protocol_fee_amount + balanceSheetBefore.reserve);
            expect(balanceSheetAfter.balance).toEqual(deposit_utxo.amount + balanceSheetBefore.balance);
        }

        const rootAfter = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootAfter);
    }


    async function doTransact({ recipient, sender, tree, outputs, inputs, fee, which = 0, asset_id = 0n }: {
        outputs: typeof Utxo[];
        inputs: typeof Utxo[];
        fee: bigint;
        tree: MerkleTree;
        recipient: Address;
        sender: SandboxContract<any>;
        which?: number;
        asset_id?: bigint;
    }) {
        const rootInit = await tonnel.getLastRoot();

        expect(BigInt(tree.root)).toEqual(rootInit);

        while (inputs.length !== 2 && inputs.length < 16) {
            inputs.push(new Utxo(
                {
                    asset_id
                }
            ));
        }
        while (outputs.length < 2) {
            outputs.push(new Utxo(
                { asset_id }
            ));
        }

        let extAmount = fee + outputs.reduce((sum, x) => sum + x.amount, 0n)
            - inputs.reduce((sum: any, x: { amount: any; }) => sum + x.amount, 0n);

        console.log(extAmount);
        const storeEncryptedOutput = (output: typeof Utxo) => {
            let data: string = output.encrypt();
            // data = 0xd23b6ca2e8b3829fe1f3966a72b7789689d505bf9d5e4b870804f640f725706350a8725b27cbffcccf92c2c4e58425f6af31ca5b6755d547e226836667460e754eafce7b5a15e3678180ab218d53e75c2fa43a70214ecb1eaa7cc9f5d7dc5be60917a1f01eb3a3a105513f59c8ee35ff4d0eb7c0f0e8b47473af7458671f01d19eaadda47a72f9146bb3f426419459525682dd69e5aa48c0889a505a
            let boc = beginCell();
            // store first 128 bytes of data
            boc.storeBuffer(Buffer.from(data.slice(2), 'hex').slice(0, 120));
            boc.storeRef(
                beginCell().storeBuffer(Buffer.from(data.slice(2), 'hex').slice(120)).endCell()
            );
            return boc.endCell();
        };
        let encryptedOutput0 = storeEncryptedOutput(outputs[0]);
        let encryptedOutput1 = storeEncryptedOutput(outputs[1]);
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
            .endCell().hash()));

        let inputMerklePathIndices = [];
        let inputMerklePathElements = [];

        for (const input of inputs) {
            if (input.amount > 0) {
                input.index = tree.indexOf(input.getCommitment());
                if (input.index < 0) {
                    throw new Error(`Input commitment ${toFixedHex(input.getCommitment())} was not found`);
                }
                const { pathElements, pathIndices } = tree.path(input.index);

                inputMerklePathIndices.push(bitsToNumber(pathIndices).toString());
                inputMerklePathElements.push(pathElements);
            } else {
                inputMerklePathIndices.push(0);
                inputMerklePathElements.push(new Array(tree.levels).fill(0));
            }
        }
        let input = {
            root: tree.root,
            publicAmount: (BigInt(extAmount) - BigInt(fee)),
            extDataHash,

            inputNullifier: inputs.map((x) => BigInt(x.getNullifier())),
            asset_id: asset_id,
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
            outPubkey: outputs.map((x) => BigInt(x.keypair.pubkey))
        };
        console.log(input);

        let { proof, publicSignals } = await groth16.fullProve(input,
            wasmPathTransact2, zkeyPathTransact2);
        // console.log(proof, publicSignals)
        // console.log(Date.now() - time)
        let verify = await groth16.verify(vkeyTransact2, publicSignals, proof);
        expect(verify).toEqual(true);


        let B_x = proof.pi_b[0].map((num: string) => BigInt(num));
        let B_y = proof.pi_b[1].map((num: string) => BigInt(num));

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
            .endCell();
        if (asset_id > 0) {
            const jettonWalletPool = blockchain.openContract(JettonWallet.createFromAddress(
                await jettonMasters[which].getWalletAddress(tonnel.address)
            ));
            const jettonWalletSender = blockchain.openContract(JettonWallet.createFromAddress(
                await jettonMasters[which].getWalletAddress(sender.address)
            ));

            const jettonWalletRecipient = blockchain.openContract(JettonWallet.createFromAddress(
                await jettonMasters[which].getWalletAddress(recipient)
            ));
            let before = await jettonWalletPool.getBalanceJetton();
            let jettonWalletRecipientBalanceBefore = await jettonWalletRecipient.getBalanceJetton();
            const protocol_fee_amount = extAmount > 0 ? await tonnel.getProtocolFee(BigInt(extAmount), asset_id) : 0n;
            const jetton_amount = extAmount > 0 ? BigInt(extAmount) + protocol_fee_amount : 0n;
            const balanceSheetBefore = await tonnel.getTVL(asset_id);
            let jettonWalletSenderBalanceBefore = await jettonWalletSender.getBalanceJetton();

            const depositResult = await jettonWalletSender.sendTransfer(sender.getSender(), {
                queryId: 0,
                toAddress: tonnel.address,
                fwdAmount: tx_fee_transact_jetton,
                jettonAmount: jetton_amount,
                value: tx_fee_transact_jetton + toNano('0.05'),
                fwdPayload: payload
            })
            const balanceSheetAfter = await tonnel.getTVL(asset_id);
            let jettonWalletRecipientBalanceAfter = await jettonWalletRecipient.getBalanceJetton();
            let jettonWalletSenderBalanceAfter = await jettonWalletSender.getBalanceJetton();

            let after = await jettonWalletPool.getBalanceJetton();
            expect(depositResult.transactions).toHaveTransaction({
                from: sender.address,
                to: jettonWalletSender.address,
                success: true
            });
            expect(depositResult.transactions).toHaveTransaction({
                from: jettonWalletSender.address,
                to: jettonWalletPool.address,
                success: true
            });
            expect(depositResult.transactions).toHaveTransaction({
                from: jettonWalletPool.address,
                to: tonnel.address,
                success: true
            });

            expect(after).toBeGreaterThanOrEqual(before + (BigInt(extAmount) - BigInt(fee)));
            expect(depositResult.transactions).toHaveTransaction({
                from: jettonWalletSender.address,
                to: sender.address,
                success: true,
                value: (value) => {
                    if (value) {
                        if (value > toNano('0.5')) {
                            return false;
                        }
                        return value >= 0;
                    }
                    return false;
                }
            });

            expect(jettonWalletSenderBalanceAfter).toEqual(jettonWalletSenderBalanceBefore + BigInt(fee) - BigInt(jetton_amount));
            if (extAmount > 0) {
                console.log('protocol_fee_amount', fromNano(protocol_fee_amount));
                console.log('balanceSheetBefore.reserve', fromNano(balanceSheetBefore.reserve));
                console.log('balanceSheetAfter.reserve', fromNano(balanceSheetAfter.reserve));
                expect(balanceSheetAfter.reserve).toBeGreaterThanOrEqual(protocol_fee_amount + balanceSheetBefore.reserve);
            } else {
                expect(jettonWalletRecipientBalanceAfter).toEqual(jettonWalletRecipientBalanceBefore + BigInt(-extAmount));


            }

            for (let i = 0; i < input.inputNullifier.length; i++) {
                let contractHash = blockchain.openContract(TonnelV3HashContract.createFromAddress(
                    await tonnel.getHashAddress(input.inputNullifier[i])
                ));
                let check = await contractHash.getIsAlreadyDeployed();

                expect(depositResult.transactions).toHaveTransaction({
                    from: tonnel.address,
                    to: contractHash.address,
                    success: true,
                    deploy: true
                });
                //
                // expect(depositResult.transactions).toHaveTransaction({
                // 	from: tonnel.address,
                // 	to: contractHash.address,
                // 	destroyed: true,
                // });
                expect(check).toEqual(true);

            }


        } else {
            let before = await tonnel.getBalance();
            const protocol_fee_amount = extAmount > 0 ? await tonnel.getProtocolFee(BigInt(extAmount), asset_id) : 0n;
            const value = tx_fee_transact + (extAmount > 0 ? BigInt(extAmount) + protocol_fee_amount : 0n);
            if (!(await tonnel.getCheckTransact(payload, value))) {
                throw new Error('Check failed');
            }
            const balanceSheetBefore = await tonnel.getTVL(asset_id);


            const depositResult = await tonnel.sendInternal(sender.getSender(), {
                value,
                payload: payload
            });
            const balanceSheetAfter = await tonnel.getTVL();

            let after = await tonnel.getBalance();
            console.log('before: ', before);
            console.log('after: ', after);

            console.log(tx_fee_transact + (extAmount > 0 ? BigInt(extAmount) + protocol_fee_amount : 0n));
            expect(after).toBeGreaterThanOrEqual(before + (BigInt(extAmount) - BigInt(fee)));


            expect(depositResult.transactions).toHaveTransaction({
                from: sender.address,
                to: tonnel.address,
                success: true
            });

            expect(depositResult.transactions).toHaveTransaction({
                from: tonnel.address,
                success: true,
                deploy: true
            });

            expect(depositResult.transactions).toHaveTransaction({
                from: tonnel.address,
                to: sender.address,
                success: true,
                value: (value) => {
                    if (value) {
                        console.log('value - fee', value, fee);
                        if (value - fee > toNano('0.5')) {
                            return false;
                        }
                        return value >= fee;
                    }
                    return false;
                }
            });


            if (extAmount > 0) {

                expect(balanceSheetAfter.reserve).toBeGreaterThanOrEqual(protocol_fee_amount + balanceSheetBefore.reserve);
            } else {
                expect(depositResult.transactions).toHaveTransaction({
                        from: tonnel.address,
                        to: recipient,
                        value: BigInt(-extAmount),
                        success: true
                    }
                );
            }

            for (let i = 0; i < input.inputNullifier.length; i++) {
                let contractHash = blockchain.openContract(TonnelV3HashContract.createFromAddress(
                    await tonnel.getHashAddress(input.inputNullifier[i])
                ));
                let check = await contractHash.getIsAlreadyDeployed();

                expect(depositResult.transactions).toHaveTransaction({
                    from: tonnel.address,
                    to: contractHash.address,
                    success: true,
                    deploy: true
                });
                //
                // expect(depositResult.transactions).toHaveTransaction({
                // 	from: tonnel.address,
                // 	to: contractHash.address,
                // 	destroyed: true,
                // });
                expect(check).toEqual(true);

            }

            expect(balanceSheetAfter.balance).toEqual(BigInt(extAmount) + balanceSheetBefore.balance - fee);
        }

        const rootAfter = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootAfter);

    }

    async function clearStucks(stuckDict: Map<bigint, {
        commitment1: bigint;
        commitment2: bigint
    }>, tree: MerkleTree, sender: SandboxContract<TreasuryContract>, count = 32) {
        const length_before = stuckDict.size;
        if (count != 32 && count != 16 && count != 8) {
            throw new Error(`Tree size is not multiple of ${count}`);
        }
        if (tree.elements.length % count !== 0) {
            throw new Error(`Tree size is not multiple of ${count}`);
        }
        // get 16 commitments from stuckDict
        const selectedCommitments = Array.from(stuckDict.keys()).slice(0, count / 2);
        const leaves: any[] = selectedCommitments.map((c) => {
            return [stuckDict.get(c)!.commitment1, stuckDict.get(c)!.commitment2];
        }).flat(1);
        console.log(leaves);


        const oldRoot = tree.root.toString();
        tree.bulkInsert(leaves);

        const newRoot = tree.root.toString();
        let { pathElements, pathIndices } = tree.path(tree.elements.length - 1);
        pathElements = pathElements.slice(Math.log2(count)).map((a: any) => BigNumber.from(a).toString());
        let pathIndices2 = bitsToNumber(pathIndices.slice(Math.log2(count))).toString();

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
            leaves
        };
        input.argsHash = hashInputs(input);

        let { proof, publicSignals } = await groth16.fullProve(input,
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
        const empty = Dictionary.empty(Dictionary.Keys.BigUint(32), CellRef);

        for (let i = 0; i < leaves.length; i++) {
            empty.set(
                BigInt(i),
                beginCell().storeUint(leaves[i], 256).endCell()
            );
        }
        let B_x = proof.pi_b[0].map((num: string) => BigInt(num));
        let B_y = proof.pi_b[1].map((num: string) => BigInt(num));
        let payload = beginCell()
            .storeUint(BigInt('0x111'), 32)
            .storeUint(0, 64)
            .storeUint(Math.floor(Math.log2(count)), 8)
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
            .endCell();

        let before = await tonnel.getBalance();
        if (!(await tonnel.getCheckStuckBatch(payload))) {
            throw new Error('Check failed');
        }
        const depositResult = await tonnel.sendInternal(sender.getSender(), {
            value: tx_fee_stuck,
            payload: payload
        });
        let after = await tonnel.getBalance();
        console.log('before: ', before);
        console.log('after: ', after);

        expect(BigInt(tree.root)).toEqual(BigInt(newRoot));
        expect(depositResult.transactions).toHaveTransaction({
            from: sender.address,
            to: tonnel.address,
            success: true
        });
        expect(depositResult.transactions).toHaveTransaction({
            from: tonnel.address,
            to: sender.address,
            success: true,
            value: (value) => {
                console.log('value fix stuck', value);
                if (value) {
                    return value > 0n;
                }
                return false;
            }
        });

        const stuckCell = await tonnel.getStuck();
        let length_after = 0;
        if (stuckCell) {
            stuckDict = parseDict(stuckCell.beginParse(), 256, (slice) => {
                const flag = slice.loadUint(4);
                if (flag) {
                    const commitment1 = slice.loadUintBig(256);
                    const commitment2 = slice.loadUintBig(256);
                    return {
                        commitment1, commitment2
                    };
                } else {
                    const commitment = slice.loadUintBig(256);
                    return {
                        commitment1: commitment,
                        commitment2: ZERO_VALUE
                    };
                }
            });
            length_after = stuckDict.size;
        }

        expect(length_after).toEqual(length_before - count / 2);


    }

    beforeAll(async () => {
        code = await compile('TonnelJettonV4');
        codeHash = await compile('TonnelV3HashContract');
        codeJettonMaster = Cell.fromHex('b5ee9c7201021001000357000114ff00f4a413f4bcf2c80b0102016202030202cc04050201580c0d04f5d906380492f81f000e8698180b8d8492f81f07d207d2018fd0018b8eb90fd0018fd001801698fe99ff6a2687d007d206a6a7a0218400aa9405d718141083deecbef29405d71814108163b5cb9a9405d71811b1c1c28aae382f9702491e001c70c1999817d20182a90e42802fd012801e78b66667a0064f6aa7011c060708090093b5f0508806e0a84026a8280790a009f404b19e2c039e2d99924591960225e801e80196019241f200e0e9919605940f97ff93a0ef003191960ab19e2ca009f4042796d625999992e3f60100c8363637375346c705535301f901018307f40e6fa131c00091709171e2b1f82816c70515b1f2e049fa40fa00d43020d08060d721fa00308102c55371a082282386f26fc10000bbf2f42510345042f00a13a0044313c85005fa025003cf16ccccf400c9ed5401c637383802fa00fa40f82854120970542013541403c85004fa0258cf1601cf16ccc922c8cb0112f400f400cb00c9f9007074c8cb02ca07cbffc9d05007c705f2e04aa146345055c85005fa025003cf16ccccf400c9ed54fa403020d70b01c300915be30d0a01fc145f0433820898968015a015bcf2e04b02fa40d3003095c821cf16c9916de28210d1735400708018c8cb055005cf1624fa0214cb6a13cb1f14cb3f23fa443070ba8e33f828440370542013541403c85004fa0258cf1601cf16ccc922c8cb0112f400f400cb00c9f9007074c8cb02ca07cbffc9d0cf16966c227001cb01e20b00e4c0048e18333504d430403304c85005fa025003cf16ccccf400c9ed54e023c0058e2533fa403071c8cb00c9d001f901588307f416444013c85005fa025003cf16ccccf400c9ed54e003c0068e1efa4030f901018307f45b30444013c85005fa025003cf16ccccf400c9ed54e05f06840ff2f0003e8210d53276db708010c8cb055003cf1622fa0212cb6acb1fcb3fc98042fb00000ef400c98040fb000201660e0f0045b8717ed44d0fa00fa40d4d4f404306c4101f901018307f40e6fa131c00091709171e280083adbcf6a2687d007d206a6a7a02180a2f827c1400b82a1009aa0a01e428027d012c678b00e78b666491646580897a007a00658064fc80383a6465816503e5ffe4e8400025af16f6a2687d007d206a6a7a0218183faa9040');
        codeJettonWallet = Cell.fromHex('b5ee9c720102110100031f000114ff00f4a413f4bcf2c80b0102016202030202cc0405001ba0f605da89a1f401f481f481a8610201d40607020120080900bb0831c02497c138007434c0c05c6c2544d7c0fc03383e903e900c7e800c5c75c87e800c7e800c00b4c7e08403e29fa954882ea54c4d167c0278208405e3514654882ea58c511100fc02b80d60841657c1ef2ea4d67c02f817c12103fcbc2000113e910c1c2ebcb853600201200a0b0083d40106b90f6a2687d007d207d206a1802698fc1080bc6a28ca9105d41083deecbef09dd0958f97162e99f98fd001809d02811e428027d012c678b00e78b6664f6aa401f1503d33ffa00fa4021f001ed44d0fa00fa40fa40d4305136a1522ac705f2e2c128c2fff2e2c254344270542013541403c85004fa0258cf1601cf16ccc922c8cb0112f400f400cb00c920f9007074c8cb02ca07cbffc9d004fa40f40431fa0020d749c200f2e2c4778018c8cb055008cf1670fa0217cb6b13cc80c0201200d0e009e8210178d4519c8cb1f19cb3f5007fa0222cf165006cf1625fa025003cf16c95005cc2391729171e25008a813a08209c9c380a014bcf2e2c504c98040fb001023c85004fa0258cf1601cf16ccc9ed5402f73b51343e803e903e90350c0234cffe80145468017e903e9014d6f1c1551cdb5c150804d50500f214013e809633c58073c5b33248b232c044bd003d0032c0327e401c1d3232c0b281f2fff274140371c1472c7cb8b0c2be80146a2860822625a019ad822860822625a028062849e5c412440e0dd7c138c34975c2c0600f1000d73b51343e803e903e90350c01f4cffe803e900c145468549271c17cb8b049f0bffcb8b08160824c4b402805af3cb8b0e0841ef765f7b232c7c572cfd400fe8088b3c58073c5b25c60063232c14933c59c3e80b2dab33260103ec01004f214013e809633c58073c5b3327b552000705279a018a182107362d09cc8cb1f5230cb3f58fa025007cf165007cf16c9718010c8cb0524cf165006fa0215cb6a14ccc971fb0010241023007cc30023c200b08e218210d53276db708010c8cb055008cf165004fa0216cb6a12cb1f12cb3fc972fb0093356c21e203c85004fa0258cf1601cf16ccc9ed54');
    });

    let blockchain: Blockchain;
    let tonnel: SandboxContract<TonnelJettonV4>;
    let jettonMasters: SandboxContract<JettonMinter>[] = [];
    let owner: SandboxContract<TreasuryContract>;
    let _keypair: KeyPair;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        owner = await blockchain.treasury('owner');

        _keypair = keyPairFromSeed(await getSecureRandomBytes(32));


        const deployer = await blockchain.treasury('deployer');


        tonnel = blockchain.openContract(
            TonnelJettonV4.createFromConfig(
                {
                    ownerAddress: owner.address,
                    hash_contract_bytecode: codeHash
                },
                code
            )
        );


        const deployResult = await tonnel.sendDeploy(deployer.getSender(), toNano('0.5'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonnel.address,
            deploy: true,
            success: true
        });

        for (let i = 0; i < 5; i++) {
            jettonMasters.push(
                blockchain.openContract(
                    JettonMinter.createFromConfig(
                        {
                            owner: owner.address,
                            rand: i,
                            jetton_wallet_code: codeJettonWallet
                        },
                        codeJettonMaster
                    )
                )
            );


            const deployJettonResult = await jettonMasters[i].sendDeploy(deployer.getSender(), toNano('0.5'));
            expect(deployJettonResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: jettonMasters[i].address,
                deploy: true,
                success: true
            });
        }

        // int min_deposit = config~load_coins();
        // int fee_per_thousand = config~load_uint(10);
        // int max_protocol_fee_asset = config~load_coins();
        const addConfigResult = await tonnel.sendAddAssetConfig(owner.getSender(), {
            asset_id: 0n,
            value: toNano('0.01'),
            config: beginCell()
                .storeCoins(toNano(5))
                .storeUint(protocol_fee_per_thousand, 8)
                .storeCoins(toNano(5))
                .endCell()

        });

        expect(addConfigResult.transactions).toHaveTransaction({
            from: owner.address,
            to: tonnel.address,
            success: true
        });

        for (let i = 0; i < jettonMasters.length; i++) {
            const asset_id = BigInt(toFixedHex(beginCell().storeAddress(await jettonMasters[i].getWalletAddress(tonnel.address)).endCell().hash()));

            const jettonWalletTonnel = await jettonMasters[i].getWalletAddress(tonnel.address);
            const addJettonResult = await tonnel.sendAddAssetConfig(owner.getSender(), {
                value: toNano('0.01'),
                config:
                    beginCell()
                        .storeAddress(jettonWalletTonnel)
                        .storeCoins(toNano(5))
                        .storeUint(5, 8)
                        .storeCoins(toNano(10))
                        .endCell(),
                asset_id: asset_id
            });
            expect(addJettonResult.transactions).toHaveTransaction({
                from: owner.address,
                to: tonnel.address,
                success: true
            });
        }


    });

    it('should deploy', () => {
        console.log(tonnel.address);
    });


    it('should deploy and then deposit', async () => {
        console.log('before-1', await tonnel.getBalance() / 1000000000n);

        const tree = new MerkleTree(17, [], {
            hashFunction: mimcHash2,
            zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292'
        });
        const rootInit = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootInit);
        console.log('before', Number(await tonnel.getBalance()) / 1000000000);

        const sender = await blockchain.treasury('sender');


        const arrayUtxo = [];


        for (let i = 0; i < 5; i++) {

            const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 1); // random amount between 1 and 1000
            const utxo_random = new Utxo({ amount: aliceDepositAmount });
            arrayUtxo.push(utxo_random);
            await doDeposit(tree, utxo_random, sender);
        }

    }, 500000);

    it('should deploy and then deposit mix with jettons', async () => {
        console.log('before-1', await tonnel.getBalance() / 1000000000n);

        const tree = new MerkleTree(17, [], {
            hashFunction: mimcHash2,
            zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292'
        });
        const rootInit = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootInit);
        console.log('before', Number(await tonnel.getBalance()) / 1000000000);

        const sender = await blockchain.treasury('sender');


        const arrayUtxo = [];


        for (let i = 0; i < 2; i++) {

            const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 1); // random amount between 1 and 1000
            const utxo_random = new Utxo({ amount: aliceDepositAmount });
            arrayUtxo.push(utxo_random);
            await doDeposit(tree, utxo_random, sender);
        }

        // pick random jetton master
        for (let i = 0; i < 5; i++) {
            const which = Math.floor(Math.random() * jettonMasters.length)
            const asset_id = BigInt(toFixedHex(beginCell().storeAddress(await jettonMasters[which].getWalletAddress(tonnel.address)).endCell().hash()));
            const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 1); // random amount between 1 and 1000
            const utxo_random = new Utxo({ amount: aliceDepositAmount, asset_id });
            arrayUtxo.push(utxo_random);
            // mint jetton for sender
            await jettonMasters[which].sendMint(owner.getSender(),
                sender.address,
                aliceDepositAmount * 2n,
                1n,
                toNano('0.05')

                );
            await doDeposit(tree, utxo_random, sender, which, asset_id);

        }

        for (let i = 0; i < 2; i++) {

            const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 1); // random amount between 1 and 1000
            const utxo_random = new Utxo({ amount: aliceDepositAmount });
            arrayUtxo.push(utxo_random);
            await doDeposit(tree, utxo_random, sender);
        }


    }, 500000);



    it('should deploy and then transact with positive external amount', async () => {
        console.log('before-1', await tonnel.getBalance() / 1000000000n);

        const tree = new MerkleTree(17, [], {
            hashFunction: mimcHash2,
            zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292'
        });
        const rootInit = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootInit);
        console.log('before', Number(await tonnel.getBalance()) / 1000000000);

        const sender = await blockchain.treasury('sender');


        // Alice deposits into tornado pool
        const aliceDepositAmount = toNano(100);
        const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount });
        await doDeposit(tree, aliceDepositUtxo, sender);

        // Bob gives Alice address to send some TON inside the shielded pool
        const bobKeypair = new Keypair(); // contains private and public keys
        const bobAddress = bobKeypair.address(); // contains only public key

        // Alice sends some TON to Bob
        const bobSendAmount = toNano(25);
        const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) });
        const aliceChangeUtxo = new Utxo({
            amount: aliceDepositAmount - bobSendAmount + toNano(10),
            keypair: aliceDepositUtxo.keypair
        });
        const relayerWallet = await blockchain.treasury('relllayer');
        const recipient = await blockchain.treasury('recipient');
        await doTransact({
            sender: relayerWallet,
            tree,
            inputs: [aliceDepositUtxo],
            outputs: [bobSendUtxo, aliceChangeUtxo],
            fee: toNano(3),
            recipient: recipient.address
        });

    }, 500000);

    it('should deploy and then transact with positive external amount- jetton', async () => {
        console.log('before-1', await tonnel.getBalance() / 1000000000n);

        const tree = new MerkleTree(17, [], {
            hashFunction: mimcHash2,
            zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292'
        });
        const rootInit = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootInit);
        console.log('before', Number(await tonnel.getBalance()) / 1000000000);

        const sender = await blockchain.treasury('sender');


        {// Alice deposits into tornado pool
            const aliceDepositAmount = toNano(100);
            const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount });
            await doDeposit(tree, aliceDepositUtxo, sender);

            // Bob gives Alice address to send some TON inside the shielded pool
            const bobKeypair = new Keypair(); // contains private and public keys
            const bobAddress = bobKeypair.address(); // contains only public key

            // Alice sends some TON to Bob
            const bobSendAmount = toNano(25);
            const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) });
            const aliceChangeUtxo = new Utxo({
                amount: aliceDepositAmount - bobSendAmount + toNano(10),
                keypair: aliceDepositUtxo.keypair
            });
            const relayerWallet = await blockchain.treasury('relllayer');
            const recipient = await blockchain.treasury('recipient');
            await doTransact({
                sender: relayerWallet,
                tree,
                inputs: [aliceDepositUtxo],
                outputs: [bobSendUtxo, aliceChangeUtxo],
                fee: toNano(3),
                recipient: recipient.address
            });
        }
        for (let i = 0; i < 4; i++) {
            const aliceDepositAmount = toNano(100);
            const which = Math.floor(Math.random() * jettonMasters.length);
            const asset_id = BigInt(toFixedHex(beginCell().storeAddress(await jettonMasters[which].getWalletAddress(tonnel.address)).endCell().hash()));
            const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, asset_id });
            // mint jetton for sender
            await jettonMasters[which].sendMint(owner.getSender(),
                sender.address,
                aliceDepositAmount * 5n,
                1n,
                toNano('0.05')
                );

            await doDeposit(tree, aliceDepositUtxo, sender, which, asset_id);

            // Bob gives Alice address to send some TON inside the shielded pool
            const bobKeypair = new Keypair(); // contains private and public keys
            const bobAddress = bobKeypair.address(); // contains only public key

            // Alice sends some TON to Bob
            const bobSendAmount = toNano(25);
            const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress), asset_id: asset_id });
            const aliceChangeUtxo = new Utxo({
                amount: aliceDepositAmount - bobSendAmount + toNano(10),
                keypair: aliceDepositUtxo.keypair,
                asset_id // test it with wrong asset_id
            });
            const relayerWallet = await blockchain.treasury('sender');
            const recipient = await blockchain.treasury('recipient');
            await doTransact({
                sender: relayerWallet,
                tree,
                inputs: [aliceDepositUtxo],
                outputs: [bobSendUtxo, aliceChangeUtxo],
                fee: toNano(3),
                recipient: recipient.address,
                asset_id,
                which: which
            });
        }


    }, 500000);

    it('should deploy and then transact with negative external amount- jetton', async () => {
        console.log('before-1', await tonnel.getBalance() / 1000000000n);

        const tree = new MerkleTree(17, [], {
            hashFunction: mimcHash2,
            zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292'
        });
        const rootInit = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootInit);
        console.log('before', Number(await tonnel.getBalance()) / 1000000000);

        const sender = await blockchain.treasury('sender');


        {// Alice deposits into tornado pool
            const aliceDepositAmount = toNano(100);
            const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount });
            await doDeposit(tree, aliceDepositUtxo, sender);

            // Bob gives Alice address to send some TON inside the shielded pool
            const bobKeypair = new Keypair(); // contains private and public keys
            const bobAddress = bobKeypair.address(); // contains only public key

            // Alice sends some TON to Bob
            const bobSendAmount = toNano(25);
            const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) });
            const aliceChangeUtxo = new Utxo({
                amount: aliceDepositAmount - bobSendAmount - toNano(10),
                keypair: aliceDepositUtxo.keypair
            });
            const relayerWallet = await blockchain.treasury('relllayer');
            const recipient = await blockchain.treasury('recipient');
            await doTransact({
                sender: relayerWallet,
                tree,
                inputs: [aliceDepositUtxo],
                outputs: [bobSendUtxo, aliceChangeUtxo],
                fee: toNano(3),
                recipient: recipient.address
            });
        }
        for (let i = 0; i < 4; i++) {
            const aliceDepositAmount = toNano(100);
            const which = Math.floor(Math.random() * jettonMasters.length);
            const asset_id = BigInt(toFixedHex(beginCell().storeAddress(await jettonMasters[which].getWalletAddress(tonnel.address)).endCell().hash()));
            const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, asset_id });
            // mint jetton for sender
            await jettonMasters[which].sendMint(owner.getSender(),
                sender.address,
                aliceDepositAmount * 5n,
                1n,
                toNano('0.05')
            );

            await doDeposit(tree, aliceDepositUtxo, sender, which, asset_id);

            // Bob gives Alice address to send some TON inside the shielded pool
            const bobKeypair = new Keypair(); // contains private and public keys
            const bobAddress = bobKeypair.address(); // contains only public key

            // Alice sends some TON to Bob
            const bobSendAmount = toNano(25);
            const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress), asset_id: asset_id });
            const aliceChangeUtxo = new Utxo({
                amount: aliceDepositAmount - bobSendAmount - toNano(10),
                keypair: aliceDepositUtxo.keypair,
                asset_id // test it with wrong asset_id
            });
            const relayerWallet = await blockchain.treasury('sender');
            const recipient = await blockchain.treasury('recipient');
            await doTransact({
                sender: relayerWallet,
                tree,
                inputs: [aliceDepositUtxo],
                outputs: [bobSendUtxo, aliceChangeUtxo],
                fee: toNano(3),
                recipient: recipient.address,
                asset_id,
                which: which
            });
        }


    }, 500000);

    it('should deploy and then transact with negative external amount', async () => {
        console.log('before-1', await tonnel.getBalance() / 1000000000n);

        const tree = new MerkleTree(17, [], {
            hashFunction: mimcHash2,
            zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292'
        });
        const rootInit = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootInit);
        console.log('before', Number(await tonnel.getBalance()) / 1000000000);

        const sender = await blockchain.treasury('sender');


        // Alice deposits into tornado pool
        const aliceDepositAmount = toNano(100);
        const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount });
        await doDeposit(tree, aliceDepositUtxo, sender);

        // Bob gives Alice address to send some TON inside the shielded pool
        const bobKeypair = new Keypair(); // contains private and public keys
        const bobAddress = bobKeypair.address(); // contains only public key

        // Alice sends some TON to Bob
        const bobSendAmount = toNano(25);
        const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) });
        const aliceChangeUtxo = new Utxo({
            amount: aliceDepositAmount - bobSendAmount - toNano(10),
            keypair: aliceDepositUtxo.keypair
        });
        const relayerWallet = await blockchain.treasury('relllayer');
        const recipient = await blockchain.treasury('recipient');
        await doTransact({
            sender: relayerWallet,
            tree,
            inputs: [aliceDepositUtxo],
            outputs: [bobSendUtxo, aliceChangeUtxo],
            fee: toNano(5),
            recipient: recipient.address
        });

    }, 500000);
    it('should deploy and then transact and then check tree', async () => {
        const tree = new MerkleTree(17, [], {
            hashFunction: mimcHash2,
            zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292'
        });

        const rootInit = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootInit);
        console.log('before', Number(await tonnel.getBalance()) / 1000000000);

        const sender = await blockchain.treasury('sender');


        const arrayUtxo = [];


        for (let i = 0; i < 16; i++) {

            const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 30); // random amount between 1 and 1000
            const utxo_random = new Utxo({ amount: aliceDepositAmount });
            arrayUtxo.push(utxo_random);
            await doDeposit(tree, utxo_random, sender);
        }


        for (let i = 0; i < 16; i++) {
            const aliceDepositUtxo = arrayUtxo[i];
            const aliceDepositAmount = aliceDepositUtxo.amount;
            // Bob gives Alice address to send some TON inside the shielded pool
            const bobKeypair = new Keypair(); // contains private and public keys
            const bobAddress = bobKeypair.address(); // contains only public key

            // Alice sends some TON to Bob
            const bobSendAmount = toNano(25);
            const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) });
            const aliceChangeUtxo = new Utxo({
                amount: aliceDepositAmount - bobSendAmount + toNano(10),
                keypair: aliceDepositUtxo.keypair
            });
            const relayerWallet = await blockchain.treasury('relllayer');
            const recipient = await blockchain.treasury('recipient');
            await doTransact({
                sender: relayerWallet,
                tree,
                inputs: [aliceDepositUtxo],
                outputs: [bobSendUtxo, aliceChangeUtxo],
                fee: toNano(3),
                recipient: recipient.address
            });
        }

        const stuckCell = await tonnel.getStuck();
        if (!stuckCell) throw new Error('Stuck cell is not found');
        const stuckDict = parseDict(stuckCell.beginParse(), 256, (slice) => {
            const flag = slice.loadUint(4);
            if (flag) {
                const commitment1 = slice.loadUintBig(256);
                const commitment2 = slice.loadUintBig(256);
                return {
                    commitment1, commitment2
                };
            } else {
                const commitment = slice.loadUintBig(256);
                return {
                    commitment1: commitment,
                    commitment2: ZERO_VALUE
                };
            }
        });

        await clearStucks(stuckDict, tree, sender);

    }, 500000);

    it('should deploy and then transact and then check tree-16', async () => {
        const tree = new MerkleTree(17, [], {
            hashFunction: mimcHash2,
            zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292'
        });

        const rootInit = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootInit);
        console.log('before', Number(await tonnel.getBalance()) / 1000000000);

        const sender = await blockchain.treasury('sender');


        const arrayUtxo = [];


        for (let i = 0; i < 8; i++) {

            const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 30); // random amount between 1 and 1000
            const utxo_random = new Utxo({ amount: aliceDepositAmount });
            arrayUtxo.push(utxo_random);
            await doDeposit(tree, utxo_random, sender);
        }


        for (let i = 0; i < 8; i++) {
            const aliceDepositUtxo = arrayUtxo[i];
            const aliceDepositAmount = aliceDepositUtxo.amount;
            // Bob gives Alice address to send some TON inside the shielded pool
            const bobKeypair = new Keypair(); // contains private and public keys
            const bobAddress = bobKeypair.address(); // contains only public key

            // Alice sends some TON to Bob
            const bobSendAmount = toNano(25);
            const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) });
            const aliceChangeUtxo = new Utxo({
                amount: aliceDepositAmount - bobSendAmount + toNano(10),
                keypair: aliceDepositUtxo.keypair
            });
            const relayerWallet = await blockchain.treasury('relllayer');
            const recipient = await blockchain.treasury('recipient');
            await doTransact({
                sender: relayerWallet,
                tree,
                inputs: [aliceDepositUtxo],
                outputs: [bobSendUtxo, aliceChangeUtxo],
                fee: toNano(3),
                recipient: recipient.address
            });
        }

        const stuckCell = await tonnel.getStuck();
        if (!stuckCell) throw new Error('Stuck cell is not found');

        const stuckDict = parseDict(stuckCell.beginParse(), 256, (slice) => {
            const flag = slice.loadUint(4);
            if (flag) {
                const commitment1 = slice.loadUintBig(256);
                const commitment2 = slice.loadUintBig(256);
                return {
                    commitment1, commitment2
                };
            } else {
                const commitment = slice.loadUintBig(256);
                return {
                    commitment1: commitment,
                    commitment2: ZERO_VALUE
                };
            }
        });

        await clearStucks(stuckDict, tree, sender, 16);

    }, 500000);

    it('should deploy and then transact and then check tree-8', async () => {
        const tree = new MerkleTree(17, [], {
            hashFunction: mimcHash2,
            zeroElement: '21663839004416932945382355908790599225266501822907911457504978515578255421292'
        });

        const rootInit = await tonnel.getLastRoot();
        expect(BigInt(tree.root)).toEqual(rootInit);
        console.log('before', Number(await tonnel.getBalance()) / 1000000000);

        const sender = await blockchain.treasury('sender');


        const arrayUtxo = [];


        for (let i = 0; i < 4; i++) {

            const aliceDepositAmount = toNano(Math.floor(Math.random() * 1000) + 30); // random amount between 1 and 1000
            const utxo_random = new Utxo({ amount: aliceDepositAmount });
            arrayUtxo.push(utxo_random);
            await doDeposit(tree, utxo_random, sender);
        }


        for (let i = 0; i < 4; i++) {
            const aliceDepositUtxo = arrayUtxo[i];
            const aliceDepositAmount = aliceDepositUtxo.amount;
            // Bob gives Alice address to send some TON inside the shielded pool
            const bobKeypair = new Keypair(); // contains private and public keys
            const bobAddress = bobKeypair.address(); // contains only public key

            // Alice sends some TON to Bob
            const bobSendAmount = toNano(25);
            const bobSendUtxo = new Utxo({ amount: bobSendAmount, keypair: Keypair.fromString(bobAddress) });
            const aliceChangeUtxo = new Utxo({
                amount: aliceDepositAmount - bobSendAmount + toNano(10),
                keypair: aliceDepositUtxo.keypair
            });
            const relayerWallet = await blockchain.treasury('relllayer');
            const recipient = await blockchain.treasury('recipient');
            await doTransact({
                sender: relayerWallet,
                tree,
                inputs: [aliceDepositUtxo],
                outputs: [bobSendUtxo, aliceChangeUtxo],
                fee: toNano(3),
                recipient: recipient.address
            });
        }

        const stuckCell = await tonnel.getStuck();
        if (!stuckCell) throw new Error('Stuck cell is not found');

        const stuckDict = parseDict(stuckCell.beginParse(), 256, (slice) => {
            const flag = slice.loadUint(4);
            if (flag) {
                const commitment1 = slice.loadUintBig(256);
                const commitment2 = slice.loadUintBig(256);
                return {
                    commitment1, commitment2
                };
            } else {
                const commitment = slice.loadUintBig(256);
                return {
                    commitment1: commitment,
                    commitment2: ZERO_VALUE
                };
            }
        });

        await clearStucks(stuckDict, tree, sender, 8);

    }, 500000);

});
