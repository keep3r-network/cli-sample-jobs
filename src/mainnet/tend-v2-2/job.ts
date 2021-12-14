import { Job, JobWorkableGroup, makeid, prelog, TransactionError } from '@keep3r-network/cli-utils';
import { Contract } from 'ethers';
import TendV2Keep3rJob2ABI from '../../abi/TendV2Keep3rJob2.json';
import metadata from './metadata.json';

const jobAddress = '0xf72D7E44ec3F79379912B8d0f661bE954a101159';
const expectedErrors: string[] = ['V2Keep3rJob::work:not-workable', '!authorized'];

const getWorkableTxs: Job['getWorkableTxs'] = async (args) => {
  const logMetadata = {
    job: metadata.name,
    block: args.advancedBlock,
    logId: makeid(5),
  };

  const logConsole = prelog(logMetadata);

  logConsole.log(`Trying to work`);

  const job = new Contract(jobAddress, TendV2Keep3rJob2ABI, args.fork.ethersProvider);
  const strategies: string[] = args.retryId ? [args.retryId] : await job.strategies();

  logConsole.log(`Simulating ${strategies.length} strategies`);

  for (const [index, strategy] of strategies.entries()) {
    const strategyLogId = `${logMetadata.logId}-${makeid(5)}`;
    const strategyConsole = prelog({ ...logMetadata, logId: strategyLogId });

    if (args.skipIds.includes(strategy)) {
      strategyConsole.info('Skipping strategy', { strategy });
      continue;
    }

    try {
      await job.connect(args.keeperAddress).callStatic.work(strategy, {
        blockTag: args.advancedBlock,
      });

      strategyConsole.log(`Strategy #${index} is workable`, { strategy });

      const workableGroups: JobWorkableGroup[] = [];

      for (let index = 0; index < args.bundleBurst; index++) {
        const tx = await job.connect(args.keeperAddress).populateTransaction.work(strategy, {
          nonce: args.keeperNonce,
          gasLimit: 1_000_000,
          type: 2,
        });

        workableGroups.push({
          targetBlock: args.targetBlock + index,
          txs: [tx],
          logId: `${strategyLogId}-${makeid(5)}`,
        });
      }

      args.subject.next({
        workableGroups,
        correlationId: strategy,
      });
    } catch (err: any) {
      const isExpectedError = expectedErrors.find((expectedError) => {
        return (err as TransactionError).message?.includes(expectedError);
      });

      if (!isExpectedError) {
        strategyConsole.warn(`Strategy #${index} failed with unknown error`, {
          strategy,
          message: err.message,
        });
      } else {
        strategyConsole.log(`Strategy #${index} is not workable`, { strategy });
      }
    }
  }

  args.subject.complete();
};

module.exports = {
  getWorkableTxs,
} as Job;
