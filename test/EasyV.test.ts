import { expect } from "chai";
import { ethers } from "hardhat";
import { EasyV } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("EasyV Token", function () {
  let easyV: EasyV;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    const EasyVFactory = await ethers.getContractFactory("EasyV");
    easyV = await EasyVFactory.deploy(INITIAL_SUPPLY);
    await easyV.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      expect(await easyV.name()).to.equal("EasyV");
      expect(await easyV.symbol()).to.equal("EASYV");
    });

    it("Should assign the total supply to the owner", async function () {
      const ownerBalance = await easyV.balanceOf(owner.address);
      expect(await easyV.totalSupply()).to.equal(ownerBalance);
      expect(ownerBalance).to.equal(INITIAL_SUPPLY);
    });

    it("Should have 18 decimals", async function () {
      expect(await easyV.decimals()).to.equal(18);
    });
  });

  describe("Transfers", function () {
    it("Should transfer tokens between accounts", async function () {
      const transferAmount = ethers.parseEther("100");
      
      await easyV.transfer(addr1.address, transferAmount);
      expect(await easyV.balanceOf(addr1.address)).to.equal(transferAmount);
      
      const ownerBalance = await easyV.balanceOf(owner.address);
      expect(ownerBalance).to.equal(INITIAL_SUPPLY - transferAmount);
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      const initialOwnerBalance = await easyV.balanceOf(owner.address);
      
      await expect(
        easyV.connect(addr1).transfer(owner.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(easyV, "ERC20InsufficientBalance");
      
      expect(await easyV.balanceOf(owner.address)).to.equal(initialOwnerBalance);
    });

    it("Should emit Transfer events", async function () {
      const transferAmount = ethers.parseEther("100");
      
      await expect(easyV.transfer(addr1.address, transferAmount))
        .to.emit(easyV, "Transfer")
        .withArgs(owner.address, addr1.address, transferAmount);
    });
  });

  describe("Allowances", function () {
    it("Should approve and transfer from", async function () {
      const approveAmount = ethers.parseEther("100");
      const transferAmount = ethers.parseEther("50");
      
      await easyV.approve(addr1.address, approveAmount);
      expect(await easyV.allowance(owner.address, addr1.address)).to.equal(approveAmount);
      
      await easyV.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount);
      
      expect(await easyV.balanceOf(addr2.address)).to.equal(transferAmount);
      expect(await easyV.allowance(owner.address, addr1.address)).to.equal(approveAmount - transferAmount);
    });

    it("Should fail transferFrom without approval", async function () {
      await expect(
        easyV.connect(addr1).transferFrom(owner.address, addr2.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(easyV, "ERC20InsufficientAllowance");
    });

    it("Should emit Approval events", async function () {
      const approveAmount = ethers.parseEther("100");
      
      await expect(easyV.approve(addr1.address, approveAmount))
        .to.emit(easyV, "Approval")
        .withArgs(owner.address, addr1.address, approveAmount);
    });
  });
}); 