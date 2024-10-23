import { toNano } from '@ton/core';
import { TonnelV4 } from '../wrappers/TonnelV4';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    // const tonnelV4 = provider.open(TonnelV4.createFromConfig({}, await compile('TonnelV4')));
    //
    // await tonnelV4.sendDeploy(provider.sender(), toNano('0.05'));
    //
    // await provider.waitForDeploy(tonnelV4.address);

    // run methods on `tonnelV4`
}
