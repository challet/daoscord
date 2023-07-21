const BN = require('bn.js');
const { expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

const Erc20VotesControlled = artifacts.require("Erc20VotesControlled");

const MAX_UINT256 = new BN('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 16)
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'

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
    await expectRevert.unspecified(contract.transferFrom.call(accounts[1], accounts[2], 50, { from: accounts[1] }));
  })
  
  it("should revert on an approve call", async function() {
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    await expectRevert.unspecified(contract.approve.call(accounts[2], 50, { from: accounts[1] }))
  })
  
  it("should show the owner has an infinite allowance on everyone's balance", async function () {
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    const allowance = await contract.allowance(accounts[1], accounts[0]);
    assert.isTrue(allowance.eq(MAX_UINT256));
  });
  
  it("should show a non owner has no allowance on anyone", async function () {
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    const allowance = await contract.allowance(accounts[2], accounts[1]);
    assert.equal(allowance.toNumber(), 0);
  });
  
  it("should only allow the owner to call allot", async function () {
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    await contract.allot(accounts[1], 500, { from: accounts[0] });
    assert.isTrue(true); // it didn't throw before
    
    await expectRevert(contract.allot(accounts[2], 500, { from: accounts[1] }), 'Error: Revert (message: Ownable: caller is not the owner)');
    
  });
  
  it("should burn or mint tokens on an allot call", async function () {
    let balance, receipt;
    const contract = await Erc20VotesControlled.new('Voting Power Token', 'VPT');
    
    receipt = await contract.allot(accounts[1], 500);
    balance = await contract.balanceOf.call(accounts[1]);
    assert.equal(balance.toNumber(), 500);
    expectEvent(receipt, 'Transfer', { from: NULL_ADDRESS, to: accounts[1], value: '500'})
    
    receipt = await contract.allot(accounts[1], 250);
    balance = await contract.balanceOf.call(accounts[1]);
    assert.equal(balance.toNumber(), 250);
    expectEvent(receipt, 'Transfer', { from: accounts[1], to: NULL_ADDRESS, value: '250'})
  });
  
});
