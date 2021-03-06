//SPDX-License-Identifier: MIT

import "@nomiclabs/hardhat-waffle";
import { expect } from "chai";
import { ethers } from "hardhat";
import GovernanceAbi from "../contracts/external/governance";
import TornAbi from "../contracts/external/torn";
import { advanceTime, getSignerFromAddress } from "./utils";

describe("Enable transfer proposal", () => {
  // Proposer address (delegate)
  const tornDelegate = "0xd26BaA5F41CC7839CEdb020b6d98E1C6e1642D75";
  // 1k Delegator address
  const tornDelegator = "0xb3e7c32d7c328aeabc8f34e90a879326b6482750";
  // TORN whale to vote with 25k votes
  const tornWhale = "0x5f48c2a71b2cc96e3f0ccae4e39318ff0dc375b2";
  // Live TORN contract
  const tornToken = "0x77777FeDdddFfC19Ff86DB637967013e6C6A116C";
  // Live governance contract
  const governanceAddress = "0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce";

  const torn15k = ethers.utils.parseEther("15000");
  const torn25k = ethers.utils.parseEther("25000");

  it("Should execute proposal and hove lowered the vote quorum", async () => {
    // This test is forking the mainnet state

    // Proposal contract
    const Proposal = await ethers.getContractFactory("ProposalLowerVoteQuorum");

    // Get Tornado governance contract
    let governance = await ethers.getContractAt(
      GovernanceAbi,
      governanceAddress
    );

    await expect(await governance.proposalCount()).equal(0);

    // Get TORN token contract
    let torn = await ethers.getContractAt(TornAbi, tornToken);

    // Set the current date as the date TORN transfers can be enabled (01.02.2021)
    await ethers.provider.send("evm_setNextBlockTimestamp", [1612274437]);

    await expect(await governance.QUORUM_VOTES()).equal(torn25k);

    // == Propose ==

    // Impersonate a TORN address with more than 1k token delegated
    const tornDelegateSigner = await getSignerFromAddress(tornDelegate);
    torn = torn.connect(tornDelegateSigner);
    governance = governance.connect(tornDelegateSigner);

    // Deploy and send the proposal
    const proposal = await Proposal.deploy();
    await governance.proposeByDelegate(
      tornDelegator,
      proposal.address,
      "Change the vote quorum form 25k to 15k TORN.",
      {
        gasPrice: 0,
      }
    );

    await expect(await governance.proposalCount()).equal(1);

    // == Vote ==

    // Impersonate a TORN whale to vote with 25k tokens
    // We use one of the team vesting contract with 800k+ TORN that
    // we will use like if it was an EOA.
    const tornWhaleSigner = await getSignerFromAddress(tornWhale);
    torn = torn.connect(tornWhaleSigner);
    governance = governance.connect(tornWhaleSigner);

    // Lock 25k TORN in governance
    await torn.approve(governance.address, torn25k, { gasPrice: 0 });
    await governance.lockWithApproval(torn25k, { gasPrice: 0 });

    // Wait the voting delay and vote for the proposal
    await advanceTime((await governance.VOTING_DELAY()).toNumber() + 1);
    await governance.castVote(1, true, { gasPrice: 0 });

    // == Execute ==

    // Wait voting period + execution delay
    await advanceTime(
      (await governance.VOTING_PERIOD()).toNumber() +
        (await governance.EXECUTION_DELAY()).toNumber()
    );

    // Execute the proposal
    await governance.execute(1, { gasPrice: 0 });

    // Check the new vote quorum
    await expect(await governance.QUORUM_VOTES()).equal(torn15k);
  });
});
