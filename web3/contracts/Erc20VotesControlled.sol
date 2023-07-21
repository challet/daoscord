// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Erc20VotesControlled is ERC20Votes, Ownable {
  error NotTransferable();
  
  constructor(string memory name_, string memory symbol_) ERC20Permit(name_) ERC20(name_, symbol_) Ownable() {
  }
  
  function decimals() public pure override returns (uint8) {
    return 0;
  }
  
  function transfer(address, uint) public pure override returns (bool) {
    revert NotTransferable();
  }
  
  function transferFrom(address, address, uint256) public pure override returns (bool) {
    revert NotTransferable();
  }
  
  function approve(address, uint256) public pure override returns (bool) {
    revert NotTransferable();
  }
  
  function allowance(address, address spender) public view override returns (uint256) {
    if (spender == super.owner()) {
      return type(uint256).max;
    } else {
      return 0;
    }
  }
  
  function allot(address to, uint256 newBalance) public onlyOwner returns (bool) {
    int256 delta = int256(newBalance) - int256(super.balanceOf(to));
    if (delta > 0) {
      _mint(to, uint256(delta));
    }
    if (delta < 0) {
      _burn(to, uint256(-delta));
    }
    return true;
  }
  
}
