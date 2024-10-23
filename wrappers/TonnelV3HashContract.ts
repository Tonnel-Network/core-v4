import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode
} from '@ton/core';
type HashConfig = {
  owner: Address;
  commitment: bigint;
};

function TonnelV3HashContractConfig(config: HashConfig): Cell {

  return beginCell()
      .storeUint(0, 2)
      .storeUint(config.commitment, 256)
      .storeAddress(config.owner)
      .endCell();
}

export class TonnelV3HashContract implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromConfig(config: HashConfig, code: Cell, workchain = 0) {
    const data = TonnelV3HashContractConfig(config);
    const init = {code, data};
    return new TonnelV3HashContract(contractAddress(workchain, init), init);
  }

  static createFromAddress(address: Address) {
    return new TonnelV3HashContract(address);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(0xd3ac2d8d, 32).endCell(),
    });
  }


  async getIsAlreadyDeployed(provider: ContractProvider) {
    try {
      const result = await provider.get('get_info', []);

      return result.stack.readBoolean();

    } catch (e) {
      return false;
    }
  }

}
