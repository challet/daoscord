import {
    CreateMajorityVotingProposalParams,
    ProposalCreationSteps,
    TokenVotingClient,
    VoteValues,
} from "@aragon/sdk-client";
import { ProposalMetadata } from "@aragon/sdk-client-common";
import {tokenVotingClient} from "../aragon/client-provider";
import {CommandInteraction} from "discord.js";
import {getDb} from "../database/db-manager";
export class ProposalService {

    public async createInteractiveProposal(interaction: CommandInteraction) {
        await interaction?.deferReply({ephemeral: true})
        await this.createProposal(interaction.options.getString('title'), "This is a long description")
        await interaction?.reply("Proposal successfully created")
    }

    public async createProposal(title: string, description: string, endDate?: Date): Promise<string> {
        if(endDate) {
            endDate = new Date()
            endDate.setMinutes(endDate.getMinutes() + 1)
        }
        const metadata: ProposalMetadata = {
            title: title,
            summary: "This is a short description",
            description: description,
            resources: [],
        };

        const metadataUri: string = await tokenVotingClient.methods.pinMetadata(
            metadata,
        );

        const db = await getDb()
        const pluginAddress: string = db.data.tokenVotingPluginAddress;

        const proposalParams: CreateMajorityVotingProposalParams = {
            pluginAddress,
            metadataUri,
            actions: [],
            startDate: new Date(),
            endDate: endDate,
            executeOnPass: false,
            creatorVote: VoteValues.YES, // default NO, other options: ABSTAIN, YES. This saves gas for the voting transaction.
        };

        const steps = tokenVotingClient.methods.createProposal(proposalParams);
        let proposalId;
        for await (const step of steps) {
            try {
                switch (step.key) {
                    case ProposalCreationSteps.CREATING:
                        console.log({ txHash: step.txHash });
                        break;
                    case ProposalCreationSteps.DONE:
                        console.log({ proposalId: step.proposalId });
                        proposalId = step.proposalId
                        db.data.proposals.push({
                            proposalId: step.proposalId,
                            metadataUri: metadataUri,
                        })
                        break;
                }
            } catch (err) {
                console.error(err);
            }
        }
        await db.write()
        return proposalId
    }
}