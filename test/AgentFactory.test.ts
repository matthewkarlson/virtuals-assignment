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
  const FEE = ethers.parseEther("1000");

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

    // Transfer some EasyV to creator
    await easyV.transfer(creator.address, ethers.parseEther("100000"));
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
      expect(await agentFactory.FEE()).to.equal(FEE);
    });

    it("Should start with empty bonding curves array", async function () {
      expect(await agentFactory.bondingCurveCount()).to.equal(0);
      const curves = await agentFactory.allBondingCurves();
      expect(curves.length).to.equal(0);
    });

    it("Should set feeTo to deployer by default", async function () {
      expect(await agentFactory.feeTo()).to.equal(owner.address);
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

  describe("launch", function () {
    beforeEach(async function () {
      // Approve factory to spend creator's tokens
      await easyV.connect(creator).approve(await agentFactory.getAddress(), ethers.parseEther("50000"));
    });

    it("Should launch bonding curve successfully", async function () {
      const agentName = "Test Agent";
      const agentSymbol = "TEST";
      const deposit = MIN_DEPOSIT + FEE; // Total including fee
      const cores: number[] = [];

      const tx = await agentFactory.connect(creator).launch(agentName, agentSymbol, cores, deposit);
      const receipt = await tx.wait();

      // Check AgentLaunched event
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = agentFactory.interface.parseLog(log);
          return parsed?.name === "AgentLaunched";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
      
      if (event) {
        const parsed = agentFactory.interface.parseLog(event);
        expect(parsed!.args[1]).to.equal(creator.address); // creator
        expect(parsed!.args[2]).to.equal(MIN_DEPOSIT); // initial purchase amount after fee
      }

      // Check bonding curve count increased
      expect(await agentFactory.bondingCurveCount()).to.equal(1);
      
      // Check bonding curves array
      const curves = await agentFactory.allBondingCurves();
      expect(curves.length).to.equal(1);

      // Check fee was collected
      expect(await easyV.balanceOf(owner.address)).to.be.gte(FEE);
    });

    it("Should reject deposit below minimum", async function () {
      const lowDeposit = ethers.parseEther("5000"); // Below 6000 minimum
      
      await expect(
        agentFactory.connect(creator).launch("Test", "TEST", [], lowDeposit)
      ).to.be.revertedWith("insufficient deposit");
    });

    it("Should reject empty name", async function () {
      await expect(
        agentFactory.connect(creator).launch("", "TEST", [], MIN_DEPOSIT + FEE)
      ).to.be.revertedWith("empty name");
    });

    it("Should reject empty symbol", async function () {
      await expect(
        agentFactory.connect(creator).launch("Test", "", [], MIN_DEPOSIT + FEE)
      ).to.be.revertedWith("empty symbol");
    });

    it("Should reject if implementation not set", async function () {
      // Deploy new factory without setting implementation
      const newFactory = await ethers.getContractFactory("AgentFactory");
      const factoryWithoutImpl = await newFactory.deploy(await easyV.getAddress());
      await factoryWithoutImpl.waitForDeployment();

      await easyV.connect(creator).approve(await factoryWithoutImpl.getAddress(), MIN_DEPOSIT + FEE);

      await expect(
        factoryWithoutImpl.connect(creator).launch("Test", "TEST", [], MIN_DEPOSIT + FEE)
      ).to.be.revertedWith("impl not set");
    });

    it("Should reject insufficient allowance", async function () {
      // Don't approve enough tokens
      await easyV.connect(creator).approve(await agentFactory.getAddress(), ethers.parseEther("1000"));

      await expect(
        agentFactory.connect(creator).launch("Test", "TEST", [], MIN_DEPOSIT + FEE)
      ).to.be.revertedWithCustomError(easyV, "ERC20InsufficientAllowance");
    });

    it("Should reject deposit equal to fee", async function () {
      await expect(
        agentFactory.connect(creator).launch("Test", "TEST", [], FEE)
      ).to.be.revertedWith("insufficient deposit");
    });

    it("Should launch multiple bonding curves", async function () {
      // Launch first curve
      await agentFactory.connect(creator).launch("Agent 1", "AG1", [], MIN_DEPOSIT + FEE);
      
      // Launch second curve
      await agentFactory.connect(creator).launch("Agent 2", "AG2", [], MIN_DEPOSIT + FEE);

      expect(await agentFactory.bondingCurveCount()).to.equal(2);
      
      const curves = await agentFactory.allBondingCurves();
      expect(curves.length).to.equal(2);
      expect(curves[0]).to.not.equal(curves[1]); // Different addresses
    });

    it("Should properly initialize bonding curve", async function () {
      const agentName = "Test Agent";
      const agentSymbol = "TEST";
      
      const tx = await agentFactory.connect(creator).launch(agentName, agentSymbol, [], MIN_DEPOSIT + FEE);
      const receipt = await tx.wait();

      // Get the created curve address
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = agentFactory.interface.parseLog(log);
          return parsed?.name === "AgentLaunched";
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
        expect(await bondingCurve.graduationThreshold()).to.equal(GRAD_THRESHOLD);
        expect(await bondingCurve.virtualRaised()).to.equal(MIN_DEPOSIT);
        expect(await bondingCurve.tokensSold()).to.be.gt(0); // Should have bought some tokens
        expect(await bondingCurve.tradingEnabled()).to.be.true;

        // Check internal token
        const iTokenAddress = await bondingCurve.iToken();
        const iToken = await ethers.getContractAt("AgentTokenInternal", iTokenAddress);
        
        expect(await iToken.name()).to.equal(`fun ${agentName}`);
        expect(await iToken.symbol()).to.equal(`f${agentSymbol}`);
      }
    });

    it("Should return tokens out amount", async function () {
      const [curveAddress, tokensOut] = await agentFactory.connect(creator).launch.staticCall("Test", "TEST", [], MIN_DEPOSIT + FEE);
      
      expect(curveAddress).to.not.equal(ethers.ZeroAddress);
      expect(tokensOut).to.be.gt(0);
    });
  });

  describe("Legacy createAgent function", function () {
    beforeEach(async function () {
      // Approve factory to spend creator's tokens
      await easyV.connect(creator).approve(await agentFactory.getAddress(), ethers.parseEther("50000"));
    });

    it("Should create agent using legacy interface", async function () {
      const agentName = "Legacy Agent";
      const agentSymbol = "LEGACY";
      const deposit = MIN_DEPOSIT + FEE;

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

      expect(await agentFactory.bondingCurveCount()).to.equal(1);
    });
  });

  describe("View functions", function () {
    beforeEach(async function () {
      await easyV.connect(creator).approve(await agentFactory.getAddress(), ethers.parseEther("50000"));
      
      // Launch a few curves
      await agentFactory.connect(creator).launch("Agent 1", "AG1", [], MIN_DEPOSIT + FEE);
      await agentFactory.connect(creator).launch("Agent 2", "AG2", [], MIN_DEPOSIT + FEE);
    });

    it("Should return correct bonding curve count", async function () {
      expect(await agentFactory.bondingCurveCount()).to.equal(2);
    });

    it("Should return all bonding curves", async function () {
      const curves = await agentFactory.allBondingCurves();
      expect(curves.length).to.equal(2);
      
      // Verify they are valid addresses
      for (const curve of curves) {
        expect(ethers.isAddress(curve)).to.be.true;
      }
    });

    it("Should return bonding curves by index", async function () {
      const curve0 = await agentFactory.bondingCurves(0);
      const curve1 = await agentFactory.bondingCurves(1);
      
      expect(ethers.isAddress(curve0)).to.be.true;
      expect(ethers.isAddress(curve1)).to.be.true;
      expect(curve0).to.not.equal(curve1);
    });

    it("Should check authorization status", async function () {
      const curves = await agentFactory.allBondingCurves();
      
      expect(await agentFactory.authorizedCurves(curves[0])).to.be.true;
      expect(await agentFactory.authorizedCurves(curves[1])).to.be.true;
      expect(await agentFactory.authorizedCurves(ethers.ZeroAddress)).to.be.false;
    });

    it("Should check graduation status", async function () {
      const curves = await agentFactory.allBondingCurves();
      
      // Should not be graduated initially
      expect(await agentFactory.isGraduated(curves[0])).to.be.false;
      expect(await agentFactory.isGraduated(curves[1])).to.be.false;
    });
  });
}); 