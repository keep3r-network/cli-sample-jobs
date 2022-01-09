import { Job, JobWorkableGroup, makeid, prelog, toKebabCase } from '@keep3r-network/cli-utils';
import { Contract } from 'ethers';
import kp3rJobABI from '../../abi/MushroomsFinanceKp3rJobV2.json';
import metadata from './metadata.json';

const jobAddress = '0x0bD1d668d8E83d14252F2e01D5873df77A6511f0';

const getWorkableTxs: Job['getWorkableTxs'] = async (args) => {
  const correlationId = toKebabCase(metadata.name);
  const logMetadata = {job: metadata.name, block: args.advancedBlock, logId: makeid(5),};
  const logConsole = prelog(logMetadata);

  if(args.skipIds.includes(correlationId)) {
    logConsole.log(`Job in progress, avoid running`);
    return args.subject.complete();
  }

  logConsole.log(`Trying to work`);

  const job = new Contract(jobAddress, kp3rJobABI, args.fork.ethersProvider);

  try {

    const workableGroups: JobWorkableGroup[] = [];
    const harvestableStrategies = [];
    const earnableVaults = [];
	 
    /////////////////////////////////////////////////////////////////////////
    // find workable harvest()  
    /////////////////////////////////////////////////////////////////////////
    job.getStrategies().then((result) => {
        for (i = 0; i < result.length; i++) {
            let workable = await job.callStatic.harvestable(result[i], {blockTag: args.advancedBlock,});
            logConsole.log('harvestable() check for ' + result[i] + '=' + workable);
            if(workable == 'true'){
               harvestableStrategies.push(result[i]);
            }
        }
    }).catch(err: any){
        logConsole.warn('checking harvestable() but failed', {message: err.message,});
        return args.subject.complete();
    }
	 
    /////////////////////////////////////////////////////////////////////////
    // find workable earn() 
    /////////////////////////////////////////////////////////////////////////
    job.getVaults().then((result) => {
        for (i = 0; i < result.length; i++) {
            let workable = await job.earnable(result[i], {blockTag: args.advancedBlock,});
            logConsole.log('earnable() check for ' + result[i] + '=' + workable);
            if(workable == 'true'){
               earnableVaults.push(result[i]);
            }
        }
    }).catch(err: any){
        logConsole.warn('checking earnable() but failed', {message: err.message,});
        return args.subject.complete();
    }
	 
    /////////////////////////////////////////////////////////////////////////
    // populate workable transactions 
    /////////////////////////////////////////////////////////////////////////    
    if(harvestableStrategies.length > 0 || earnableVaults.length > 0){	   	
        let workableTxs = [];
        let gas_limit = 2_500_000;
        let tx_type = 2;
		
        for(let i = 0; i < harvestableStrategies.length; i++){
            const tx = await job.connect(args.keeperAddress).populateTransaction.harvest(harvestableStrategies[i], {nonce: (args.keeperNonce + i), gasLimit: gas_limit, type: tx_type,});
            workableTxs.push(tx);
        }
        for(let i = 0; i < earnableVaults.length; i++){
            const tx = await job.connect(args.keeperAddress).populateTransaction.earn(earnableVaults[i], {nonce: (args.keeperNonce + workableTxs.length + i), gasLimit: gas_limit, type: tx_type,});
            workableTxs.push(tx);
        }
      		
        for (let index = 0; index < args.bundleBurst; index++) {
            workableGroups.push({targetBlock: args.targetBlock + index,  txs: workableTxs, logId: `${logMetadata.logId}-${makeid(5)}`,});
        }		
    }	

    if (!workableGroups.length) return args.subject.complete();
    args.subject.next({workableGroups, correlationId,});
	
  } catch (err: any) {
    logConsole.warn('Unexpected error', { message: err.message });
  }

  args.subject.complete();
};

module.exports = {
  getWorkableTxs,
} as Job;
