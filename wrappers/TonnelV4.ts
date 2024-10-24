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
import {TupleItemSlice} from "@ton/core/dist/tuple/tuple";
import {TonnelV3HashContract} from "./TonnelV3HashContract";
import { CellRef } from '../utils/merkleTree';

export type TonnelConfig = {
	ownerAddress: Address;
	protocolFee: number;
	hash_contract_bytecode: Cell;
};

export function tonnelConfigToCell(config: TonnelConfig): Cell {
	const roots = Dictionary.empty(Dictionary.Keys.BigUint(8), CellRef)
	roots.set(BigInt(0), beginCell().storeUint(19096106942954019993875136086593746569543555098695219945677796669366144218534n, 256).endCell())

	return beginCell()
		.storeRef(beginCell().storeUint(0, 8).storeUint(0, 32).storeDict(roots).endCell())
		.storeRef(beginCell().storeUint(config.protocolFee, 10).storeAddress(config.ownerAddress).storeCoins(0).endCell())
		.storeRef(config.hash_contract_bytecode)
		.storeDict(null)
		.endCell();
}

export const Opcodes = {
	deposit: 0x888,
	withdraw: 0x777,
	changeConfig: 0x999,
	stuck_remove: 0x111

};

export const ERRORS = {
	verify_failed_root: 106,
	verify_failed_double_spend: 107,
	unknown_op: 101,
	access_denied: 102,
	fund: 103,
	verify_failed: 104,
	verify_failed_fee: 105,

};

export class TonnelV4 implements Contract {
	constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
	}

	static createFromAddress(address: Address) {
		return new TonnelV4(address);
	}

	static createFromConfig(config: TonnelConfig, code: Cell, workchain = 0) {
		const data = tonnelConfigToCell(config);
		const init = {code, data};
		return new TonnelV4(contractAddress(workchain, init), init);
	}

	async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
		await provider.internal(via, {
			value,
			sendMode: SendMode.PAY_GAS_SEPARATELY,
			body: beginCell().endCell(),
		});
	}

	async sendDeposit(
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
			body: opts.payload,
		});
	}

	async getLastRoot(provider: ContractProvider) {
		const result = await provider.get('get_last_root', []);
		return result.stack.readBigNumberOpt();
	}

	async getRootKnown(provider: ContractProvider, root: bigint) {
		const result = await provider.get('get_root_known', [
			{type: 'int', value: root},
		]);
		return result.stack.readNumber();
	}

	async getCheckVerify(provider: ContractProvider, cell: Cell) {
		const result = await provider.get('check_verify', [
			{type: 'slice', cell: cell} as TupleItemSlice,
		]);
		const check_res = result.stack.readNumber()
		if (check_res == 1) {
			const hash_contract = result.stack.readAddress();
			console.log(hash_contract)
			const contractHash = TonnelV3HashContract.createFromAddress(hash_contract);
			const check = await contractHash.getIsAlreadyDeployed(provider);
			console.log(check,'check')
			return 1;
		}
		return 0;
	}

	async getStuck(provider: ContractProvider) {
		try {
			const result = await provider.get('get_stuck', []);
			return result.stack.readCell();
		} catch (e) {
			return null
		}

	}

	async getTVL(provider: ContractProvider) {
		try {
			const result = await provider.get('get_tvl', []);
			return result.stack.readBigNumber();
		} catch (e) {
			return 0n
		}

	}

	async getHashAddress(provider: ContractProvider, hash: bigint) {
		const result = await provider.get('get_hash_contract', [
			{type: 'int', value: hash},
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
