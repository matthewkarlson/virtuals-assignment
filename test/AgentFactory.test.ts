import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentFactory, EasyV, BondingCurve } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentFactory", function () {
  let agentFactory: AgentFactory;
  let easyV: EasyV;
  let bondingCurveImplementation: BondingCurve;
  let owner: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let user: HardhatEthersSigner;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const MIN_DEPOSIT = ethers.parseEther("6000");
  const GRAD_THRESHOLD = ethers.parseEther("42000");

  beforeEach(async function () {
    [owner, creator, user] = await ethers.getSigners();

    // Deploy EasyV token
    const EasyVFactory = await ethers.getContractFactory("EasyV");
    easyV = await EasyVFactory.deploy(INITIAL_SUPPLY);
    await easyV.waitForDeployment();

    // Deploy BondingCurve implementation
    const BondingCurveFactory = await ethers.getContractFactory("BondingCurve");
    bondingCurveImplementation = await BondingCurveFactory.deploy();
    await bondingCurveImplementation.waitForDeployment();

    // Deploy AgentFactory
    const AgentFactoryFactory = await ethers.getContractFactory("AgentFactory");
    agentFactory = await AgentFactoryFactory.deploy(await easyV.getAddress());
    await agentFactory.waitForDeployment();

    // Set bonding curve implementation
    await agentFactory.setBondingCurveImplementation(await bondingCurveImplementation.getAddress());

    // Set Uniswap router (use mainnet address since we're forking)
    const uniswapRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    await agentFactory.setUniswapRouter(uniswapRouter);

    // Transfer some EasyV to creator
    await easyV.transfer(creator.address, ethers.parseEther("50000"));
  });

  describe("Deployment", function () {
    it("Should set the correct VIRTUAL token", async function () {
      expect(await agentFactory.VIRTUAL()).to.equal(await easyV.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await agentFactory.owner()).to.equal(owner.address);
    });

    it("Should have correct constants", async function () {
      expect(await agentFactory.MIN_INITIAL_DEPOSIT()).to.equal(MIN_DEPOSIT);
      expect(await agentFactory.GRAD_THRESHOLD()).to.equal(GRAD_THRESHOLD);
    });

    it("Should start with empty agents array", async function () {
      expect(await agentFactory.agentCount()).to.equal(0);
      const agents = await agentFactory.allAgents();
      expect(agents.length).to.equal(0);
    });
  });

  describe("setBondingCurveImplementation", function () {
    it("Should allow owner to set implementation", async function () {
      const newImpl = await bondingCurveImplementation.getAddress();
      await agentFactory.setBondingCurveImplementation(newImpl);
      expect(await agentFactory.bondingCurveImplementation()).to.equal(newImpl);
    });

    it("Should reject zero address", async function () {
      await expect(
        agentFactory.setBondingCurveImplementation(ethers.ZeroAddress)
      ).to.be.revertedWith("invalid impl");
    });

    it("Should only allow owner to set implementation", async function () {
      await expect(
        agentFactory.connect(creator).setBondingCurveImplementation(await bondingCurveImplementation.getAddress())
      ).to.be.revertedWithCustomError(agentFactory, "OwnableUnauthorizedAccount");
    });
  });

  describe("createAgent", function () {
    beforeEach(async function () {
      // Approve factory to spend creator's tokens
      await easyV.connect(creator).approve(await agentFactory.getAddress(), ethers.parseEther("50000"));
    });

    it("Should create agent successfully", async function () {
      const agentName = "Test Agent";
      const agentSymbol = "TEST";
      const deposit = MIN_DEPOSIT;

      const tx = await agentFactory.connect(creator).createAgent(agentName, agentSymbol, deposit);
      const receipt = await tx.wait();

      // Check AgentCreated event
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = agentFactory.interface.parseLog(log);
          return parsed?.name === "AgentCreated";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
      
      if (event) {
        const parsed = agentFactory.interface.parseLog(event);
        expect(parsed!.args[1]).to.equal(creator.address); // creator
        expect(parsed!.args[2]).to.equal(agentName); // name
        expect(parsed!.args[3]).to.equal(agentSymbol); // symbol
      }

      // Check agent count increased
      expect(await agentFactory.agentCount()).to.equal(1);
      
      // Check agents array
      const agents = await agentFactory.allAgents();
      expect(agents.length).to.equal(1);
    });

    it("Should reject deposit below minimum", async function () {
      const lowDeposit = ethers.parseEther("5000"); // Below 6000 minimum
      
      await expect(
        agentFactory.connect(creator).createAgent("Test", "TEST", lowDeposit)
      ).to.be.revertedWith("dep<min");
    });

    it("Should reject empty name", async function () {
      await expect(
        agentFactory.connect(creator).createAgent("", "TEST", MIN_DEPOSIT)
      ).to.be.revertedWith("empty name");
    });

    it("Should reject empty symbol", async function () {
      await expect(
        agentFactory.connect(creator).createAgent("Test", "", MIN_DEPOSIT)
      ).to.be.revertedWith("empty symbol");
    });

    it("Should reject if implementation not set", async function () {
      // Deploy new factory without setting implementation
      const newFactory = await ethers.getContractFactory("AgentFactory");
      const factoryWithoutImpl = await newFactory.deploy(await easyV.getAddress());
      await factoryWithoutImpl.waitForDeployment();

      await easyV.connect(creator).approve(await factoryWithoutImpl.getAddress(), MIN_DEPOSIT);

      await expect(
        factoryWithoutImpl.connect(creator).createAgent("Test", "TEST", MIN_DEPOSIT)
      ).to.be.revertedWith("impl not set");
    });

    it("Should reject insufficient allowance", async function () {
      // Don't approve enough tokens
      await easyV.connect(creator).approve(await agentFactory.getAddress(), ethers.parseEther("1000"));

      await expect(
        agentFactory.connect(creator).createAgent("Test", "TEST", MIN_DEPOSIT)
      ).to.be.revertedWithCustomError(easyV, "ERC20InsufficientAllowance");
    });

    it("Should reject insufficient balance", async function () {
      // Transfer away most tokens
      await easyV.connect(creator).transfer(user.address, ethers.parseEther("49000"));
      
      await expect(
        agentFactory.connect(creator).createAgent("Test", "TEST", MIN_DEPOSIT)
      ).to.be.revertedWithCustomError(easyV, "ERC20InsufficientBalance");
    });

    it("Should create multiple agents", async function () {
      // Create first agent
      await agentFactory.connect(creator).createAgent("Agent 1", "AG1", MIN_DEPOSIT);
      
      // Create second agent
      await agentFactory.connect(creator).createAgent("Agent 2", "AG2", MIN_DEPOSIT);

      expect(await agentFactory.agentCount()).to.equal(2);
      
      const agents = await agentFactory.allAgents();
      expect(agents.length).to.equal(2);
      expect(agents[0]).to.not.equal(agents[1]); // Different addresses
    });

    it("Should properly initialize bonding curve", async function () {
      const agentName = "Test Agent";
      const agentSymbol = "TEST";
      
      const tx = await agentFactory.connect(creator).createAgent(agentName, agentSymbol, MIN_DEPOSIT);
      const receipt = await tx.wait();

      // Get the created agent address
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = agentFactory.interface.parseLog(log);
          return parsed?.name === "AgentCreated";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
      
      if (event) {
        const parsed = agentFactory.interface.parseLog(event);
        const bondingCurveAddress = parsed!.args[0];

        // Get bonding curve instance
        const bondingCurve = await ethers.getContractAt("BondingCurve", bondingCurveAddress);

        // Check initialization
        expect(await bondingCurve.initialized()).to.be.true;
        expect(await bondingCurve.creator()).to.equal(creator.address);
        expect(await bondingCurve.GRADUATION_THRESHOLD()).to.equal(GRAD_THRESHOLD);
        expect(await bondingCurve.virtualRaised()).to.equal(MIN_DEPOSIT);
        expect(await bondingCurve.tokensSold()).to.be.gt(0); // Should have bought some tokens

        // Check internal token
        const iTokenAddress = await bondingCurve.iToken();
        const iToken = await ethers.getContractAt("AgentTokenInternal", iTokenAddress);
        
        expect(await iToken.name()).to.equal(`fun ${agentName}`);
        expect(await iToken.symbol()).to.equal(`f${agentSymbol}`);
      }
    });
  });

  describe("View functions", function () {
    beforeEach(async function () {
      await easyV.connect(creator).approve(await agentFactory.getAddress(), ethers.parseEther("50000"));
      
      // Create a few agents
      await agentFactory.connect(creator).createAgent("Agent 1", "AG1", MIN_DEPOSIT);
      await agentFactory.connect(creator).createAgent("Agent 2", "AG2", MIN_DEPOSIT);
    });

    it("Should return correct agent count", async function () {
      expect(await agentFactory.agentCount()).to.equal(2);
    });

    it("Should return all agents", async function () {
      const agents = await agentFactory.allAgents();
      expect(agents.length).to.equal(2);
      
      // Verify they are valid addresses
      for (const agent of agents) {
        expect(ethers.isAddress(agent)).to.be.true;
      }
    });

    it("Should return agents by index", async function () {
      const agent0 = await agentFactory.agents(0);
      const agent1 = await agentFactory.agents(1);
      
      expect(ethers.isAddress(agent0)).to.be.true;
      expect(ethers.isAddress(agent1)).to.be.true;
      expect(agent0).to.not.equal(agent1);
    });
  });
}); 