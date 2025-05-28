import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentFactory, EasyV, BondingCurve, AgentTokenInternal, AgentTokenExternal } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Integration Tests", function () {
  let agentFactory: AgentFactory;
  let easyV: EasyV;
  let bondingCurveImplementation: BondingCurve;
  let owner: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let buyer1: HardhatEthersSigner;
  let buyer2: HardhatEthersSigner;
  let buyer3: HardhatEthersSigner;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const MIN_DEPOSIT = ethers.parseEther("6000");
  const GRAD_THRESHOLD = ethers.parseEther("42000");

  beforeEach(async function () {
    [owner, creator, buyer1, buyer2, buyer3] = await ethers.getSigners();

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

    // Distribute EasyV tokens
    await easyV.transfer(creator.address, ethers.parseEther("100000"));
    await easyV.transfer(buyer1.address, ethers.parseEther("100000"));
    await easyV.transfer(buyer2.address, ethers.parseEther("100000"));
    await easyV.transfer(buyer3.address, ethers.parseEther("100000"));
  });

  describe("Complete Agent Lifecycle", function () {
    it("Should complete full agent lifecycle: create -> buy -> graduate -> redeem", async function () {
      // Step 1: Create Agent
      console.log("Step 1: Creating agent...");
      
      const agentName = "AI Trading Bot";
      const agentSymbol = "AITB";
      
      await easyV.connect(creator).approve(await agentFactory.getAddress(), MIN_DEPOSIT);
      const createTx = await agentFactory.connect(creator).createAgent(agentName, agentSymbol, MIN_DEPOSIT);
      const createReceipt = await createTx.wait();

      // Get the created agent address
      const createEvent = createReceipt?.logs.find((log: any) => {
        try {
          const parsed = agentFactory.interface.parseLog(log);
          return parsed?.name === "AgentCreated";
        } catch {
          return false;
        }
      });

      expect(createEvent).to.not.be.undefined;
      const bondingCurveAddress = agentFactory.interface.parseLog(createEvent!)!.args[0];
      
      const bondingCurve = await ethers.getContractAt("BondingCurve", bondingCurveAddress);
      
      // Verify initial state
      expect(await bondingCurve.creator()).to.equal(creator.address);
      expect(await bondingCurve.virtualRaised()).to.equal(MIN_DEPOSIT);
      expect(await bondingCurve.graduated()).to.be.false;

      console.log("✅ Agent created successfully");

      // Step 2: Multiple buyers purchase tokens
      console.log("Step 2: Buyers purchasing tokens...");
      
      const buyAmount1 = ethers.parseEther("10000");
      const buyAmount2 = ethers.parseEther("15000");
      const buyAmount3 = ethers.parseEther("12000"); // This should trigger graduation

      // Buyer 1 purchases
      await easyV.connect(buyer1).approve(bondingCurveAddress, buyAmount1);
      await bondingCurve.connect(buyer1).buy(buyAmount1, 0);

      // Buyer 2 purchases
      await easyV.connect(buyer2).approve(bondingCurveAddress, buyAmount2);
      await bondingCurve.connect(buyer2).buy(buyAmount2, 0);

      // Check state before graduation
      let virtualRaised = await bondingCurve.virtualRaised();
      expect(virtualRaised).to.equal(MIN_DEPOSIT + buyAmount1 + buyAmount2);
      expect(await bondingCurve.graduated()).to.be.false;

      console.log("✅ Pre-graduation purchases completed");

      // Step 3: Final purchase triggers graduation
      console.log("Step 3: Triggering graduation...");
      
      await easyV.connect(buyer3).approve(bondingCurveAddress, buyAmount3);
      const graduationTx = await bondingCurve.connect(buyer3).buy(buyAmount3, 0);
      const graduationReceipt = await graduationTx.wait();

      // Check for Graduate event
      const graduateEvent = graduationReceipt?.logs.find((log: any) => {
        try {
          const parsed = bondingCurve.interface.parseLog(log);
          return parsed?.name === "Graduate";
        } catch {
          return false;
        }
      });

      expect(graduateEvent).to.not.be.undefined;
      expect(await bondingCurve.graduated()).to.be.true;

      virtualRaised = await bondingCurve.virtualRaised();
      expect(virtualRaised).to.be.gte(GRAD_THRESHOLD);

      console.log("✅ Agent graduated successfully");

      // Step 4: Get token contracts
      const iTokenAddress = await bondingCurve.iToken();
      const eTokenAddress = await bondingCurve.eToken();
      
      const iToken = await ethers.getContractAt("AgentTokenInternal", iTokenAddress);
      const eToken = await ethers.getContractAt("AgentTokenExternal", eTokenAddress);

      expect(eTokenAddress).to.not.equal(ethers.ZeroAddress);

      // Step 5: Test redemption for all buyers
      console.log("Step 4: Testing redemption...");
      
      // Buyer 1 redeems all tokens
      const buyer1InternalBalance = await iToken.balanceOf(buyer1.address);
      expect(buyer1InternalBalance).to.be.gt(0);

      await iToken.connect(buyer1).approve(bondingCurveAddress, buyer1InternalBalance);
      await bondingCurve.connect(buyer1).redeem(buyer1InternalBalance);

      const buyer1ExternalBalance = await eToken.balanceOf(buyer1.address);
      expect(buyer1ExternalBalance).to.equal(buyer1InternalBalance);
      expect(await iToken.balanceOf(buyer1.address)).to.equal(0);

      // Buyer 2 redeems half tokens
      const buyer2InternalBalance = await iToken.balanceOf(buyer2.address);
      const redeemAmount = buyer2InternalBalance / 2n;

      await iToken.connect(buyer2).approve(bondingCurveAddress, redeemAmount);
      await bondingCurve.connect(buyer2).redeem(redeemAmount);

      expect(await eToken.balanceOf(buyer2.address)).to.equal(redeemAmount);
      expect(await iToken.balanceOf(buyer2.address)).to.equal(buyer2InternalBalance - redeemAmount);

      console.log("✅ Redemption completed successfully");

      // Step 6: Verify final state
      console.log("Step 5: Verifying final state...");
      
      // Check that external tokens are freely transferable
      const buyer1ExternalBalanceForTransfer = await eToken.balanceOf(buyer1.address);
      const transferAmount = buyer1ExternalBalanceForTransfer > ethers.parseEther("100") 
        ? ethers.parseEther("100") 
        : buyer1ExternalBalanceForTransfer / 2n;
      
      if (transferAmount > 0) {
        await eToken.connect(buyer1).transfer(buyer3.address, transferAmount);
        expect(await eToken.balanceOf(buyer3.address)).to.be.gte(transferAmount);
      }

      // Verify total supplies
      const totalInternalSupply = await iToken.totalSupply();
      const totalExternalSupply = await eToken.totalSupply();
      expect(totalExternalSupply).to.equal(ethers.parseEther("1000000000")); // 1B tokens

      // Bonding curve should have fewer external tokens
      const bondingCurveExternalBalance = await eToken.balanceOf(await bondingCurve.getAddress());
      // After graduation, bonding curve starts with 50% of supply, then loses redeemed tokens
      // Total redeemed = buyer1's full balance + buyer2's half balance
      const totalRedeemed = buyer1InternalBalance + redeemAmount;
      const expectedBondingCurveBalance = (totalExternalSupply / 2n) - totalRedeemed;
      expect(bondingCurveExternalBalance).to.equal(expectedBondingCurveBalance);

      console.log("✅ Complete lifecycle test passed!");
    });
  });

  describe("Multiple Agents Scenario", function () {
    it("Should handle multiple agents created by different creators", async function () {
      // Create first agent
      await easyV.connect(creator).approve(await agentFactory.getAddress(), MIN_DEPOSIT);
      await agentFactory.connect(creator).createAgent("Agent 1", "AG1", MIN_DEPOSIT);

      // Create second agent with different creator
      await easyV.connect(buyer1).approve(await agentFactory.getAddress(), MIN_DEPOSIT);
      await agentFactory.connect(buyer1).createAgent("Agent 2", "AG2", MIN_DEPOSIT);

      // Verify both agents exist
      expect(await agentFactory.agentCount()).to.equal(2);
      const agents = await agentFactory.allAgents();
      expect(agents.length).to.equal(2);

      // Get both bonding curves
      const bondingCurve1 = await ethers.getContractAt("BondingCurve", agents[0]);
      const bondingCurve2 = await ethers.getContractAt("BondingCurve", agents[1]);

      // Verify different creators
      expect(await bondingCurve1.creator()).to.equal(creator.address);
      expect(await bondingCurve2.creator()).to.equal(buyer1.address);

      // Both should have initial deposits
      expect(await bondingCurve1.virtualRaised()).to.equal(MIN_DEPOSIT);
      expect(await bondingCurve2.virtualRaised()).to.equal(MIN_DEPOSIT);

      // Test buying from both agents
      const buyAmount = ethers.parseEther("5000");
      
      await easyV.connect(buyer2).approve(agents[0], buyAmount);
      await bondingCurve1.connect(buyer2).buy(buyAmount, 0);

      await easyV.connect(buyer3).approve(agents[1], buyAmount);
      await bondingCurve2.connect(buyer3).buy(buyAmount, 0);

      // Verify independent state
      expect(await bondingCurve1.virtualRaised()).to.equal(MIN_DEPOSIT + buyAmount);
      expect(await bondingCurve2.virtualRaised()).to.equal(MIN_DEPOSIT + buyAmount);

      // Get internal tokens
      const iToken1Address = await bondingCurve1.iToken();
      const iToken2Address = await bondingCurve2.iToken();
      
      const iToken1 = await ethers.getContractAt("AgentTokenInternal", iToken1Address);
      const iToken2 = await ethers.getContractAt("AgentTokenInternal", iToken2Address);

      // Verify different token names/symbols
      expect(await iToken1.name()).to.equal("fun Agent 1");
      expect(await iToken1.symbol()).to.equal("fAG1");
      expect(await iToken2.name()).to.equal("fun Agent 2");
      expect(await iToken2.symbol()).to.equal("fAG2");

      // Verify buyers have tokens from correct agents
      expect(await iToken1.balanceOf(buyer2.address)).to.be.gt(0);
      expect(await iToken1.balanceOf(buyer3.address)).to.equal(0);
      expect(await iToken2.balanceOf(buyer3.address)).to.be.gt(0);
      expect(await iToken2.balanceOf(buyer2.address)).to.equal(0);
    });
  });

  describe("Economic Mechanics", function () {
    let bondingCurve: BondingCurve;

    beforeEach(async function () {
      // Create an agent for testing
      await easyV.connect(creator).approve(await agentFactory.getAddress(), MIN_DEPOSIT);
      const tx = await agentFactory.connect(creator).createAgent("Test Agent", "TEST", MIN_DEPOSIT);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = agentFactory.interface.parseLog(log);
          return parsed?.name === "AgentCreated";
        } catch {
          return false;
        }
      });

      const bondingCurveAddress = agentFactory.interface.parseLog(event!)!.args[0];
      bondingCurve = await ethers.getContractAt("BondingCurve", bondingCurveAddress);
    });

    it("Should demonstrate increasing token prices along the curve", async function () {
      const buyAmount = ethers.parseEther("1000");
      const purchases = [];

      // Make several purchases and track token amounts received
      for (let i = 0; i < 5; i++) {
        const buyer = [buyer1, buyer2, buyer3, creator, owner][i];
        
        await easyV.connect(buyer).approve(await bondingCurve.getAddress(), buyAmount);
        const tx = await bondingCurve.connect(buyer).buy(buyAmount, 0);
        const receipt = await tx.wait();

        const event = receipt?.logs.find((log: any) => {
          try {
            const parsed = bondingCurve.interface.parseLog(log);
            return parsed?.name === "Buy";
          } catch {
            return false;
          }
        });

        if (event) {
          const parsed = bondingCurve.interface.parseLog(event);
          const tokensOut = parsed!.args[2];
          purchases.push(tokensOut);
        }
      }

      // Verify that each subsequent purchase gives fewer tokens (increasing price)
      for (let i = 1; i < purchases.length; i++) {
        expect(purchases[i]).to.be.lt(purchases[i - 1]);
      }

      console.log("Token amounts received for equal EasyV purchases:");
      purchases.forEach((amount, i) => {
        console.log(`Purchase ${i + 1}: ${ethers.formatEther(amount)} tokens`);
      });
    });

    it("Should handle graduation threshold precisely", async function () {
      // Calculate exact amount needed to reach graduation
      const currentRaised = await bondingCurve.virtualRaised(); // Should be MIN_DEPOSIT
      const remainingToGrad = GRAD_THRESHOLD - currentRaised;

      // Buy exactly the remaining amount
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), remainingToGrad);
      const tx = await bondingCurve.connect(buyer1).buy(remainingToGrad, 0);
      const receipt = await tx.wait();

      // Should graduate exactly at threshold
      expect(await bondingCurve.graduated()).to.be.true;
      expect(await bondingCurve.virtualRaised()).to.equal(GRAD_THRESHOLD);

      // Check Graduate event was emitted
      const graduateEvent = receipt?.logs.find((log: any) => {
        try {
          const parsed = bondingCurve.interface.parseLog(log);
          return parsed?.name === "Graduate";
        } catch {
          return false;
        }
      });

      expect(graduateEvent).to.not.be.undefined;
    });

    it("Should maintain token conservation during redemption", async function () {
      // Graduate the agent first
      const graduationAmount = GRAD_THRESHOLD;
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), graduationAmount);
      await bondingCurve.connect(buyer1).buy(graduationAmount, 0);

      expect(await bondingCurve.graduated()).to.be.true;

      // Get token contracts
      const iTokenAddress = await bondingCurve.iToken();
      const eTokenAddress = await bondingCurve.eToken();
      
      const iToken = await ethers.getContractAt("AgentTokenInternal", iTokenAddress);
      const eToken = await ethers.getContractAt("AgentTokenExternal", eTokenAddress);

      // Record initial balances
      const initialInternalSupply = await iToken.totalSupply();
      const initialExternalSupply = await eToken.totalSupply();
      const buyer1InitialInternal = await iToken.balanceOf(buyer1.address);

      // Redeem half of buyer1's tokens
      const redeemAmount = buyer1InitialInternal / 2n;
      await iToken.connect(buyer1).approve(await bondingCurve.getAddress(), redeemAmount);
      await bondingCurve.connect(buyer1).redeem(redeemAmount);

      // Check token conservation
      const finalInternalSupply = await iToken.totalSupply();
      const finalExternalSupply = await eToken.totalSupply();
      const buyer1FinalInternal = await iToken.balanceOf(buyer1.address);
      const buyer1ExternalBalance = await eToken.balanceOf(buyer1.address);

      // Internal tokens should be burned
      expect(finalInternalSupply).to.equal(initialInternalSupply - redeemAmount);
      expect(buyer1FinalInternal).to.equal(buyer1InitialInternal - redeemAmount);

      // External tokens should be transferred 1:1
      expect(buyer1ExternalBalance).to.equal(redeemAmount);
      expect(finalExternalSupply).to.equal(initialExternalSupply); // Total supply unchanged

      // Bonding curve should have fewer external tokens
      const bondingCurveExternalBalance = await eToken.balanceOf(await bondingCurve.getAddress());
      // After graduation, bonding curve starts with 50% of supply, then loses redeemed tokens
      const expectedBondingCurveBalance = (initialExternalSupply / 2n) - redeemAmount;
      expect(bondingCurveExternalBalance).to.equal(expectedBondingCurveBalance);
    });
  });

  describe("Error Handling and Edge Cases", function () {
    it("Should handle factory with no implementation set", async function () {
      // Deploy new factory without setting implementation
      const newFactory = await ethers.getContractFactory("AgentFactory");
      const factoryWithoutImpl = await newFactory.deploy(await easyV.getAddress());
      await factoryWithoutImpl.waitForDeployment();

      await easyV.connect(creator).approve(await factoryWithoutImpl.getAddress(), MIN_DEPOSIT);

      await expect(
        factoryWithoutImpl.connect(creator).createAgent("Test", "TEST", MIN_DEPOSIT)
      ).to.be.revertedWith("impl not set");
    });

    it("Should handle insufficient EasyV balance across multiple operations", async function () {
      // Transfer away existing balance first
      const existingBalance = await easyV.balanceOf(buyer1.address);
      if (existingBalance > 0) {
        await easyV.connect(buyer1).transfer(owner.address, existingBalance);
      }
      
      // Give buyer1 just enough for one operation
      const limitedAmount = ethers.parseEther("7000");
      await easyV.transfer(buyer1.address, limitedAmount);
      
      // Create agent should work
      await easyV.connect(buyer1).approve(await agentFactory.getAddress(), MIN_DEPOSIT);
      await agentFactory.connect(buyer1).createAgent("Limited Agent", "LIM", MIN_DEPOSIT);

      // But buying more should fail due to insufficient balance
      const agents = await agentFactory.allAgents();
      const bondingCurve = await ethers.getContractAt("BondingCurve", agents[0]);

      await easyV.connect(buyer1).approve(agents[0], ethers.parseEther("5000"));
      await expect(
        bondingCurve.connect(buyer1).buy(ethers.parseEther("5000"), 0)
      ).to.be.revertedWithCustomError(easyV, "ERC20InsufficientBalance");
    });

    it("Should handle graduation with multiple simultaneous buyers", async function () {
      // Create agent
      await easyV.connect(creator).approve(await agentFactory.getAddress(), MIN_DEPOSIT);
      const tx = await agentFactory.connect(creator).createAgent("Concurrent Agent", "CONC", MIN_DEPOSIT);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = agentFactory.interface.parseLog(log);
          return parsed?.name === "AgentCreated";
        } catch {
          return false;
        }
      });

      const bondingCurveAddress = agentFactory.interface.parseLog(event!)!.args[0];
      const bondingCurve = await ethers.getContractAt("BondingCurve", bondingCurveAddress);

      // Calculate amount to get close to graduation
      const currentRaised = await bondingCurve.virtualRaised();
      const nearGraduation = GRAD_THRESHOLD - currentRaised - ethers.parseEther("1000");

      // Buy up to near graduation
      await easyV.connect(buyer1).approve(bondingCurveAddress, nearGraduation);
      await bondingCurve.connect(buyer1).buy(nearGraduation, 0);

      // Now have multiple buyers try to trigger graduation
      const finalAmount = ethers.parseEther("2000");
      
      await easyV.connect(buyer2).approve(bondingCurveAddress, finalAmount);
      await easyV.connect(buyer3).approve(bondingCurveAddress, finalAmount);

      // First one should succeed and graduate
      await bondingCurve.connect(buyer2).buy(finalAmount, 0);
      expect(await bondingCurve.graduated()).to.be.true;

      // Second one should fail because already graduated
      await expect(
        bondingCurve.connect(buyer3).buy(finalAmount, 0)
      ).to.be.revertedWith("graduated");
    });
  });
}); 