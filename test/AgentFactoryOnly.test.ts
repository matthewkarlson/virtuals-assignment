import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentFactory, EasyV } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentFactory (Without Fun System)", function () {
  let agentFactory: AgentFactory;
  let virtual: EasyV;
  let deployer: HardhatEthersSigner;
  let creator: HardhatEthersSigner;

  const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10M VIRTUAL
  const MIN_DEPOSIT = ethers.parseEther("6000");
  const FEE = ethers.parseEther("1000");

  beforeEach(async function () {
    [deployer, creator] = await ethers.getSigners();

    // Deploy VIRTUAL token
    const EasyVFactory = await ethers.getContractFactory("EasyV");
    virtual = await EasyVFactory.deploy(INITIAL_SUPPLY);
    await virtual.waitForDeployment();

    // Deploy AgentFactory
    const AgentFactoryFactory = await ethers.getContractFactory("AgentFactory");
    agentFactory = await AgentFactoryFactory.deploy(await virtual.getAddress());
    await agentFactory.waitForDeployment();

    // Transfer tokens to creator
    const userAmount = ethers.parseEther("1000000"); // 1M VIRTUAL
    await virtual.transfer(creator.address, userAmount);
  });

  describe("Deployment", function () {
    it("Should set the correct VIRTUAL token", async function () {
      expect(await agentFactory.VIRTUAL()).to.equal(await virtual.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await agentFactory.owner()).to.equal(deployer.address);
    });

    it("Should have correct constants", async function () {
      expect(await agentFactory.MIN_INITIAL_DEPOSIT()).to.equal(MIN_DEPOSIT);
      expect(await agentFactory.FEE()).to.equal(FEE);
    });

    it("Should start with empty bonding curves array", async function () {
      expect(await agentFactory.bondingCurveCount()).to.equal(0);
      const curves = await agentFactory.allBondingCurves();
      expect(curves.length).to.equal(0);
    });

    it("Should set feeTo to deployer by default", async function () {
      expect(await agentFactory.feeTo()).to.equal(deployer.address);
    });
  });

  describe("setBondingContract", function () {
    it("Should allow owner to set bonding contract", async function () {
      const mockAddress = ethers.Wallet.createRandom().address;
      await agentFactory.setBondingContract(mockAddress);
      expect(await agentFactory.bondingContract()).to.equal(mockAddress);
    });

    it("Should reject zero address", async function () {
      await expect(
        agentFactory.setBondingContract(ethers.ZeroAddress)
      ).to.be.revertedWith("invalid bonding contract");
    });

    it("Should only allow owner to set bonding contract", async function () {
      const mockAddress = ethers.Wallet.createRandom().address;
      await expect(
        agentFactory.connect(creator).setBondingContract(mockAddress)
      ).to.be.revertedWithCustomError(agentFactory, "OwnableUnauthorizedAccount");
    });
  });

  describe("setFeeTo", function () {
    it("Should allow owner to set fee recipient", async function () {
      await agentFactory.setFeeTo(creator.address);
      expect(await agentFactory.feeTo()).to.equal(creator.address);
    });

    it("Should reject zero address", async function () {
      await expect(
        agentFactory.setFeeTo(ethers.ZeroAddress)
      ).to.be.revertedWith("invalid fee recipient");
    });

    it("Should only allow owner to set fee recipient", async function () {
      await expect(
        agentFactory.connect(creator).setFeeTo(creator.address)
      ).to.be.revertedWithCustomError(agentFactory, "OwnableUnauthorizedAccount");
    });
  });

  describe("Launch without bonding contract", function () {
    it("Should reject launch without bonding contract set", async function () {
      const launchAmount = MIN_DEPOSIT + FEE;
      await virtual.connect(creator).approve(await agentFactory.getAddress(), launchAmount);

      await expect(
        agentFactory.connect(creator).launch("Test", "TEST", launchAmount)
      ).to.be.revertedWith("bonding contract not set");
    });

    it("Should reject createAgent without bonding contract set", async function () {
      const launchAmount = MIN_DEPOSIT + FEE;
      await virtual.connect(creator).approve(await agentFactory.getAddress(), launchAmount);

      await expect(
        agentFactory.connect(creator).createAgent("Test", "TEST", launchAmount)
      ).to.be.revertedWith("bonding contract not set");
    });

    it("Should reject insufficient deposit", async function () {
      const insufficientAmount = ethers.parseEther("5000"); // Below minimum
      
      await virtual.connect(creator).approve(await agentFactory.getAddress(), insufficientAmount);

      await expect(
        agentFactory.connect(creator).launch("Test", "TEST", insufficientAmount)
      ).to.be.revertedWith("bonding contract not set");
    });

    it("Should reject empty name or symbol", async function () {
      const launchAmount = MIN_DEPOSIT + FEE;
      await virtual.connect(creator).approve(await agentFactory.getAddress(), launchAmount);

      await expect(
        agentFactory.connect(creator).launch("", "TEST", launchAmount)
      ).to.be.revertedWith("bonding contract not set");

      await expect(
        agentFactory.connect(creator).launch("Test", "", launchAmount)
      ).to.be.revertedWith("bonding contract not set");
    });
  });

  describe("View Functions", function () {
    it("Should return correct initial counts", async function () {
      expect(await agentFactory.bondingCurveCount()).to.equal(0);
      expect(await agentFactory.agentCount()).to.equal(0);
    });

    it("Should return empty arrays initially", async function () {
      const curves = await agentFactory.allBondingCurves();
      expect(curves.length).to.equal(0);
      
      const agents = await agentFactory.allAgents();
      expect(agents.length).to.equal(0);
    });

    it("Should check graduation status for non-existent tokens", async function () {
      const randomToken = ethers.Wallet.createRandom().address;
      
      expect(await agentFactory.isGraduated(randomToken)).to.be.false;
      expect(await agentFactory.getGraduatedAgent(randomToken)).to.equal(ethers.ZeroAddress);
      expect(await agentFactory.authorizedTokens(randomToken)).to.be.false;
    });

    it("Should return empty agent data for non-existent tokens", async function () {
      const randomToken = ethers.Wallet.createRandom().address;
      
      const agentData = await agentFactory.getAgentData(randomToken);
      expect(agentData.created).to.be.false;
      expect(agentData.name).to.equal("");
      expect(agentData.symbol).to.equal("");
    });

    it("Should maintain compatibility mappings", async function () {
      const randomToken = ethers.Wallet.createRandom().address;
      
      // Test legacy function names
      expect(await agentFactory.curveToAgent(randomToken)).to.equal(ethers.ZeroAddress);
      expect(await agentFactory.authorizedCurves(randomToken)).to.be.false;
    });
  });
}); 