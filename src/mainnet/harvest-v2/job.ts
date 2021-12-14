import { createForks, GanacheFork, getStealthHash, Job, JobWorkableGroup, makeid, prelog, TransactionError } from '@keep3r-network/cli-utils';
import { Contract } from 'ethers';
import HarvestV2Keep3rStealthJobABI from '../../abi/HarvestV2Keep3rStealthJob.json';
import StealthRelayerABI from '../../abi/StealthRelayer.json';
import metadata from './metadata.json';

const jobAddress = '0x2150b45626199CFa5089368BDcA30cd0bfB152D6';
const stealthRelayerAddress = '0x0a61c2146A7800bdC278833F21EBf56Cd660EE2a';
const expectedErrors: string[] = ['V2Keep3rJob::work:not-workable', '!authorized', '!healthcheck'];
const maxStrategiesPerFork = 5;

const getWorkableTxs: Job['getWorkableTxs'] = async (args) => {
  const logMetadata = {
    job: metadata.name,
    block: args.advancedBlock,
    logId: makeid(5),
  };

  const logConsole = prelog(logMetadata);

  logConsole.log(`Trying to work`);

  const job = new Contract(jobAddress, HarvestV2Keep3rStealthJobABI, args.fork.ethersProvider);
  const strategies: string[] = args.retryId ? [args.retryId] : await job.strategies();

  logConsole.log(`Simulating ${strategies.length} strategies`);

  const forksToCreate = Math.ceil(strategies.length / maxStrategiesPerFork) - 1;
  const forks: GanacheFork[] = [args.fork, ...(await createForks(forksToCreate, args))];
  logConsole.debug(`Created ${forks.length} forks in order to work in parellel`);

  const workPromises = forks.map(async (fork, forkIndex) => {
    const job = new Contract(jobAddress, HarvestV2Keep3rStealthJobABI, fork.ethersProvider);
    const stealthRelayer = new Contract(stealthRelayerAddress, StealthRelayerABI, fork.ethersProvider);
    const forkStrategies = strategies.slice(forkIndex * maxStrategiesPerFork, forkIndex * maxStrategiesPerFork + maxStrategiesPerFork);

    for (const [index, strategy] of forkStrategies.entries()) {
      const strategyIndex = forkIndex * maxStrategiesPerFork + index;

      const strategyLogId = `${logMetadata.logId}-${makeid(5)}`;
      const strategyConsole = prelog({ ...logMetadata, logId: strategyLogId });

      if (args.skipIds.includes(strategy)) {
        strategyConsole.info('Skipping strategy', { strategy });
        continue;
      }

      const workData: string = job.interface.encodeFunctionData('work', [strategy]);
      const stealthHash: string = getStealthHash();

      try {
        await stealthRelayer.connect(args.keeperAddress).callStatic.execute(jobAddress, workData, stealthHash, args.advancedBlock, {
          blockTag: args.advancedBlock,
        });

        strategyConsole.log(`Strategy #${strategyIndex} is workable`, { strategy });

        const workableGroups: JobWorkableGroup[] = [];

        for (let index = 0; index < args.bundleBurst; index++) {
          const tx = await stealthRelayer
            .connect(args.keeperAddress)
            .populateTransaction.execute(jobAddress, workData, stealthHash, args.targetBlock + index, {
              nonce: args.keeperNonce,
              gasLimit: 5_000_000,
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
          strategyConsole.warn(`Strategy #${strategyIndex} failed with unknown error`, {
            strategy,
            message: err.message,
          });
        } else {
          strategyConsole.log(`Strategy #${strategyIndex} is not workable`, { strategy });
        }
      }
    }
  });

  await Promise.all(workPromises);

  args.subject.complete();
};

module.exports = {
  getWorkableTxs,
} as Job;
