import { Job, JobWorkableGroup, makeid, prelog, toKebabCase } from '@keep3r-network/cli-utils';
import { Contract } from 'ethers';
import TestJobABI from '../../abi/TestJob.json';
import metadata from './metadata.json';

const jobAddress = '0xd50345ca88e0B2cF9a6f5eD29C1F1f9d76A16C3c';

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

  try {
    await job.connect(args.keeperAddress).callStatic.work({
      blockTag: args.advancedBlock,
    });

    logConsole.log(`Found workable block`);

    const workableGroups: JobWorkableGroup[] = [];

    for (let index = 0; index < args.bundleBurst; index++) {
      const tx = await job.connect(args.keeperAddress).populateTransaction.work({
        nonce: args.keeperNonce,
        gasLimit: 2_000_000,
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
  } catch (err: any) {
    logConsole.warn('Simulation failed, maybe in cooldown?');
  } finally {
    args.subject.complete();
  }
};

module.exports = {
  getWorkableTxs,
} as Job;
