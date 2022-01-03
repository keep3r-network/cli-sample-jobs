import { getStealthHash, Job, JobWorkableGroup, makeid, prelog, toKebabCase } from '@keep3r-network/cli-utils';
import { Contract } from 'ethers';
import StealthRelayerABI from '../../abi/StealthRelayer.json';
import TestJobABI from '../../abi/TestJob.json';
import metadata from './metadata.json';

const jobAddress = '0x9DC52d978290f13b73692C5AeA21B4C8954e909A';
const stealthRelayerAddress = '0xD44A48001A4BAd6f23aD8750eaD0036765A35d4b';

const getWorkableTxs: Job['getWorkableTxs'] = async (args) => {
  const correlationId = toKebabCase(metadata.name);
  const logMetadata = {
    job: metadata.name,
    block: args.advancedBlock,
    logId: makeid(5),
  };
  const logConsole = prelog(logMetadata);

  if (args.skipIds.includes(correlationId)) {
    logConsole.log(`Job in progress, avoid running`);
    return args.subject.complete();
  }

  logConsole.log(`Trying to work`);

  const job = new Contract(jobAddress, TestJobABI, args.fork.ethersProvider);
  const stealthRelayer = new Contract(stealthRelayerAddress, StealthRelayerABI, args.fork.ethersProvider);

  const workData: string = job.interface.encodeFunctionData('work');
  const stealthHash: string = getStealthHash();

  try {
    await stealthRelayer.connect(args.keeperAddress).callStatic.execute(jobAddress, workData, stealthHash, args.advancedBlock, {
      blockTag: args.advancedBlock,
    });

    logConsole.log(`Found workable block`);

    const workableGroups: JobWorkableGroup[] = [];

    for (let index = 0; index < args.bundleBurst; index++) {
      const tx = await stealthRelayer
        .connect(args.keeperAddress)
        .populateTransaction.execute(jobAddress, workData, stealthHash, args.targetBlock + index, {
          nonce: args.keeperNonce,
          gasLimit: args.block.gasLimit,
          type: 2,
        });

      workableGroups.push({
        targetBlock: args.targetBlock + index,
        txs: [tx],
        logId: `${logMetadata.logId}-${makeid(5)}`,
      });
    }

    args.subject.next({
      workableGroups,
      correlationId,
    });
  } catch (err) {
    logConsole.warn('Simulation failed, maybe in cooldown?');
  } finally {
    args.subject.complete();
  }
};

module.exports = {
  getWorkableTxs,
} as Job;
