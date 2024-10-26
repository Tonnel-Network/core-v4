import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider, Dictionary,
    Sender,
    SendMode
} from '@ton/core';
import { TupleItemSlice } from '@ton/core/dist/tuple/tuple';
import { TonnelV3HashContract } from './TonnelV3HashContract';
import { CellRef } from '../utils/merkleTree';

export type TonnelJettonConfig = {
    ownerAddress: Address;
    hash_contract_bytecode: Cell;
};

export function tonnelJettonConfigToCell(config: TonnelJettonConfig): Cell {
    const roots = Dictionary.empty(Dictionary.Keys.BigUint(8), CellRef);
    roots.set(BigInt(0), beginCell().storeUint(19096106942954019993875136086593746569543555098695219945677796669366144218534n, 256).endCell());

    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeRef(beginCell().storeUint(0, 8).storeUint(0, 32).storeDict(roots).endCell())
        .storeRef(
            beginCell().storeDict(null).storeDict(null).endCell()
        )
        .storeRef(config.hash_contract_bytecode)
        .storeDict(null)
        .endCell();
}



export class TonnelJettonV4 implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new TonnelJettonV4(address);
    }

    static createFromConfig(config: TonnelJettonConfig, code: Cell, workchain = 0) {
        const data = tonnelJettonConfigToCell(config);
        const init = { code, data };
        return new TonnelJettonV4(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell()
        });
    }

    async sendInternal(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            payload: Cell;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: opts.payload
        });
    }

    async sendAddAssetConfig(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            config: Cell;
            asset_id: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x666, 32)
                .storeUint(0, 64)
                .storeUint(opts.asset_id, 256)
                .storeRef(opts.config)
                .endCell()
        });
    }

    async getLastRoot(provider: ContractProvider) {
        const result = await provider.get('get_last_root', []);
        return result.stack.readBigNumberOpt();
    }

    async getRootKnown(provider: ContractProvider, root: bigint) {
        const result = await provider.get('get_root_known', [
            { type: 'int', value: root }
        ]);
        return result.stack.readNumber();
    }

    async getCheckTransact(provider: ContractProvider, cell: Cell, transact_amount: bigint, asset_id = 0n) {
        try {
            const result = await provider.get('check_transact', [
                { type: 'slice', cell: cell },
                { type: 'int', value: transact_amount },
                { type: 'int', value: asset_id }
            ]);
            const check_res = result.stack.readNumber();
            console.log('check_res', check_res);
            return check_res;
        } catch (e) {
            console.log('error', e);
            return false;
        }

    }

    async getCheckStuckBatch(provider: ContractProvider, cell: Cell) {
        try {
            const result = await provider.get('check_remove_stuck', [
                { type: 'slice', cell: cell },
            ]);
            const check_res = result.stack.readNumber();
            console.log('check_stuck', check_res);
            return check_res;
        } catch (e) {
            console.log('error', e);
            return false;
        }

    }

    async getStuck(provider: ContractProvider) {
        try {
            const result = await provider.get('get_stuck', []);
            return result.stack.readCell();
        } catch (e) {
            return null;
        }

    }

    async getTVL(provider: ContractProvider, asset_id = 0n) {
        try {
            const result = await provider.get('get_tvl', [
                { type: 'int', value: asset_id }
            ]);
            return {
                balance: result.stack.readBigNumber(),
                reserve: result.stack.readBigNumber()
            };
        } catch (e) {
            return {
                balance: 0n,
                reserve: 0n
            };
        }

    }

    async getProtocolFee(provider: ContractProvider, deposit: bigint, asset_id = 0n) {
        try {
            const result = await provider.get('get_protocol_fee', [
                {
                    type: 'int',
                    value: deposit
                },
                { type: 'int', value: asset_id }
            ]);
            return result.stack.readBigNumber();
        } catch (e) {
            return 0n;
        }

    }

    async getHashAddress(provider: ContractProvider, hash: bigint) {
        const result = await provider.get('get_hash_contract', [
            { type: 'int', value: hash }
        ]);
        return result.stack.readAddress();
    }

    async getBalance(provider: ContractProvider) {
        const result = await provider.getState();
        return result.balance;
    }

    async getStorage(provider: ContractProvider) {
        const result = await provider.getState();
        if (result.state.type === 'active') {
            return result.state.data;
        }
        return null;

    }


}
