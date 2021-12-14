# Keep3r CLI Sample Jobs

`@keep3r-network/cli-sample-jobs` aims to provide keepers using `@keep3r-network/cli` out-of-the-box jobs they can run immediately, as well as examples for job owners to follow if they wish to create scripts of their own jobs in order to add extra incentives for keepers using the CLI to run theirs.


## Adding a Job

For a detailed breakdown of how to successfully write a Keep3r CLI Job script, please refer to the **Creating a Keep3r CLI compatible job** section.

If a job owner has written a script to have keepers using Keep3r CLI immediately run his job, he will have to publish this script as a separate npm package for keepers to install and run. 

We recommend job owners to add their packages in a specific section of their documentation where keepers can easily find it.

We have chosen this method to reduce the possibility of people uploading malicious packages disguised as jobs and distracted keepers installing them. We urge keepers running Keep3r CLI to be careful with the packages they install, and to only download jobs from trusted sources.

## Testnet Jobs

This repository comes with two jobs deployed to goerli that serve as a safe and easy way to test whether users running Keep3r CLI have setup their keepers correctly. These jobs are:

- [Job A](https://github.com/keep3r-network/cli-sample-jobs/blob/main/src/goerli/job-a/README.md)
- [Job A Stealth](https://github.com/keep3r-network/cli-sample-jobs/blob/main/src/goerli/job-a-stealth/README.md)

## Mainnet Jobs

These are real jobs keepers can run if they meet the requirements specified by the protocols. They also serve as a great example of how to write scripts for more complex jobs:

- [Mean Finance](https://github.com/keep3r-network/cli-sample-jobs/blob/main/src/mainnet/dca/README.md)
- [Yearn Harvest V2](https://github.com/keep3r-network/cli-sample-jobs/blob/main/src/mainnet/harvest-v2/README.md)
- [Yearn Tend V2](https://github.com/keep3r-network/cli-sample-jobs/blob/main/src/mainnet/tend-v2/README.md)
- [Yearn Tend V2 (Beta)](https://github.com/keep3r-network/cli-sample-jobs/blob/main/src/mainnet/tend-v2-2/README.md)

## Job Paths

To choose what jobs to run, you will need to add their paths to your `.config.json` file. You can find each job path in their respective docs.

## Creating a Keep3r CLI compatible job

A Keep3r CLI compatible job is as easy as it gets. You will only need to create two files:

- `metadata.json`: Super simple `.json` file containing the name of the job. This is an example of how it would look like if your job was called `My First Job`.
    
    ```bash
    {
      "name": "DCA"
    }
    ```
    
    Right now this file seems unimportant, but in future versions it will be used to add extra information about each specific job. An example of this, would be the tokens the job uses to pay the keepers—right now we assume they pay in KP3R or ETH—which will help the Keep3r-CLI properly calculate the profitability of the transaction. In the current version, the name is used to create an id for each job, which will help the Keep3r-CLI know which job is currently in progress to avoid rerunning it unnecessarily. 
    
- `job.ts`: This file will contain the logic of the job script, and therefore it will be the file the Keep3r-CLI runs when it intends to work your job. Writing the logic in this file can sound like a daunting task at first, but we have built everything so that there's a lot of shared logic between scripts, which makes creating a script for your job a simple task. 
After going through the examples you will find that all the jobs follow a similar pattern to this one:
    - Declare a variable that contains the address of your job.
    - Create an async function called `getWorkableTxs` which will take `args` as arguments. This function will contain all the important logic to create what we call **workable groups** and send them along with an id to the Keep3r-CLI.
    A workable group is an array that contains objects that have:
        - The target block at which to perform a transaction.
        - An array containing the populated transactions to be performed
        - An id to identify each array in the workable group, so it's easier for keepers to read the logs.
        
        For example, let's say `ExampleJob` needs a keeper to call the `work` function and let's say the keeper establishes `100` as the target block. When a keeper executes `getWorkableTxs`, this function will output the following working group:
        
        ```bash
        workableGroup = [{
        	targetBlock: 100,
        	txs: [populated tx data to call work],
        	logId: some randomly generated id
        }]
        ```
        
        This working group will then be passed to the Keep3r-CLI `job-wrapper.ts` file, for additional checks before sending the transactions to flashbots.
        **All of the following points will be different points of logic inside `getWorkableTxs`**
        
    - Create a `correlationId`, which will be used to track if the current job being executed to avoid rerunning it unnecessarily.
    - Create an if check that checks, using the `correlationId`, whether that job should be rerun in a block or not. For example: the keeper runs your job at block `100`, but specifies `105` as its target block. The `correlationId` and this additional check will prevent all the logic to check whether the job is workable or not from being rerun in the blocks `101, 102, 103, 104`, where it's not necessary.
    - Create a variable `logMetadata` containing all the relevant information you would like the keeper to see in their logs. We recommend creating an object containing the name of your job, the current block, and a logId to help identify each job.
    - Create a `logConsole` variable that calls the `prelog` utility function passing in the `logMetadata` as an argument. This is simply used to log better logs. It appends all the information established in `logMetadata` to each log that uses `logConsole` instead of `console.log`
    - Create a variable containing your job's contract. This will be used to populate the transactions the keeper will end up running.
    - Create a try catch finally statement.
    - The try statement will call the `work` function to check if, in the current block, that job can be worked or if it's on cooldown. If it is workable, it adds a log and then creates a `workableGroup` variable initialized to an empty array.
    Things get interesting after this. Because we know the job is workable, we can now populate the transactions we will need to send to flashbots in order to execute this job, and then push an object containing those transactions along with the target block and id of each one to our `workableGroup`. 
    To populate transactions for consequent blocks we use a for loop that will push as many objects to `workableGroups` as the keeper has passed as the `bundleBurst` parameter. In these objects, the array of populated transactions will always be the same, but the target block and the id will change.
    If everything went well, `getWorkableTxs` sends an object containing the workable groups and the current job `correlationId` to the Keep3r-CLI, which will be received by `job-wrapper.ts`.
    - The catch statement will catch any error and log out a message for the keeper to read. The most common error that will occur is that the job is currently in cooldown, therefore it can't be worked.
    - The finally statement will kill the process once it has concluded.
    - Lastly, and outside the `getWorkableTxs` function, we export `getWorkableTxs`.
    
    This is the shared structure among jobs and it's exactly the structure that can be found in the `JobA` example we provide. However, some jobs will have protocol-specific logic that will modify this structure ever-so-slightly. 
    
    For example: some jobs will have multiple strategies that need to be run. Others will require the keeper to call a function before calling the `work` function. For these two cases we have provided examples that show how to modify the basic structure to add protocol-specific features:
    
    - Strategies are covered in `harvest-v2`, `tend-v2`, `tend-v2-2`.
    - Jobs that require a previous function to be called is covered in `dca`
    - Jobs that use relayers are covered in `harvest-v2`, `jobAStealth`

If you still have doubts as to how to implement a script for your job, reach out to us!
