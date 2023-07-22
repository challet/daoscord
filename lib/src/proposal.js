import logger from "./logger.js";
import {getDb} from "./db-manager.js";
import {ProposalCreationSteps, VoteValues} from "@aragon/sdk-client";

export const createProposal = async (aragonTokenVotingClient, description, endDate) => {
    logger.debug('Create DAO proposal...')
    if(!endDate) {
        endDate = new Date()
        endDate.setMinutes(endDate.getMinutes() + 1)
    }
    // const metadata = {
    //     title: "My cool proposal",
    //     summary: "This is a short description",
    //     description: description,
    //     resources: [],
    // };

    const metadataUri = 'ipfs://test.test'

    // const metadataUri = await aragonTokenVotingClient.methods.pinMetadata(
    //     metadata,
    // );

    const db = getDb()
    const pluginAddress = db.data.tokenVotingPluginAddress;

    const proposalParams = {
        pluginAddress,
        metadataUri,
        actions: [],
        startDate: new Date(),
        endDate: endDate,
        executeOnPass: false,
        creatorVote: VoteValues.YES, // default NO, other options: ABSTAIN, YES. This saves gas for the voting transaction.
    };

    let proposalId = null;

    const steps = aragonTokenVotingClient.methods.createProposal(proposalParams);
    for await (const step of steps) {
        try {
            switch (step.key) {
                case ProposalCreationSteps.CREATING:
                    logger.debug(`Proposal being created with txHash ${step.txHash}`);
                    break;
                case ProposalCreationSteps.DONE:
                    proposalId = step.proposalId
                    logger.debug(`Proposal created with id ${proposalId}`);
                    db.data.proposals.push({
                        proposalId: step.proposalId,
                        metadataUri: metadataUri,
                    })
                    break;
            }
        } catch (err) {
            console.error(err);
            logger.error(err)
            throw err
        }
    }
    await db.write()
    logger.debug('Create DAO proposal done.')
}