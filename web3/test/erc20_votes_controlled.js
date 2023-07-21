const BN = require('bn.js');
const { expectRevert } = require("@openzeppelin/test-helpers");

const Erc20VotesControlled = artifacts.require("Erc20VotesControlled");

const MAX_UINT256 = new BN('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 16)

/*
 * uncomment accounts to access the test accounts made available by the
 * Ethereum client
 * See docs: https://www.trufflesuite.com/docs/truffle/testing/writing-tests-in-javascript
 */
contract("Erc20VotesControlled", function (accounts) {
  it("should deploy with initial parameters", async function () {
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    assert.isTrue(true)
    assert.equal(await contract.name.call(), 'Voting Power Token')
    assert.equal(await contract.symbol.call(), 'VPT')
    assert.equal(await contract.decimals.call(), 0)
    assert.equal(await contract.owner.call(), accounts[0])
  });
  
  it("should revert on a tranfer call", async function() {
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    await expectRevert.unspecified(contract.transfer.call(accounts[2], 50, { from: accounts[1] }))
  })
  
  it("should revert on a transferFrom call", async function() {
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    await expectRevert.unspecified(contract.transferFrom.call(accounts[1], accounts[2], 50, { from: accounts[1] }), "NotTransferable")
  })
  
  it("should revert on an approve call", async function() {
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    await expectRevert.unspecified(contract.approve.call(accounts[2], 50, { from: accounts[1] }))
  })
  
  it("should show the owner has an infinite allowance on everyone's balance", async function () {
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    const allowance = await contract.allowance(accounts[1], accounts[0])
    assert.isTrue(allowance.eq(MAX_UINT256))
  });
  
  it("should show a non owner has no allowance on anyone", async function () {
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    const allowance = await contract.allowance(accounts[2], accounts[1])
    assert.equal(allowance.toNumber(), 0)
  });
  
});
