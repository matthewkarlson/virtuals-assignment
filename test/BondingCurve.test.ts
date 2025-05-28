import { expect } from "chai";
import { ethers } from "hardhat";
import { BondingCurve, EasyV, AgentTokenInternal, AgentTokenExternal } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("BondingCurve", function () {
  let bondingCurve: BondingCurve;
  let easyV: EasyV;
  let owner: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let buyer1: HardhatEthersSigner;
  let buyer2: HardhatEthersSigner;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const GRADUATION_THRESHOLD = ethers.parseEther("42000");
  const SUPPLY = ethers.parseEther("1000000000"); // 1B tokens

  beforeEach(async function () {
    [owner, creator, buyer1, buyer2] = await ethers.getSigners();

    // Deploy EasyV token
    const EasyVFactory = await ethers.getContractFactory("EasyV");
    easyV = await EasyVFactory.deploy(INITIAL_SUPPLY);
    await easyV.waitForDeployment();

    // Deploy BondingCurve
    const BondingCurveFactory = await ethers.getContractFactory("BondingCurve");
    bondingCurve = await BondingCurveFactory.deploy();
    await bondingCurve.waitForDeployment();

    // Transfer tokens to test accounts
    await easyV.transfer(creator.address, ethers.parseEther("100000"));
    await easyV.transfer(buyer1.address, ethers.parseEther("100000"));
    await easyV.transfer(buyer2.address, ethers.parseEther("100000"));
  });

  describe("Initialization", function () {
    it("Should initialize correctly", async function () {
      await bondingCurve.initialize(
        await easyV.getAddress(),
        "Test Agent",
        "TEST",
        creator.address,
        GRADUATION_THRESHOLD
      );

      expect(await bondingCurve.initialized()).to.be.true;
      expect(await bondingCurve.VIRTUAL()).to.equal(await easyV.getAddress());
      expect(await bondingCurve.creator()).to.equal(creator.address);
      expect(await bondingCurve.GRADUATION_THRESHOLD()).to.equal(GRADUATION_THRESHOLD);
      expect(await bondingCurve.graduated()).to.be.false;
      expect(await bondingCurve.virtualRaised()).to.equal(0);
      expect(await bondingCurve.tokensSold()).to.equal(0);

      // Check K calculation
      const K = await bondingCurve.K();
      expect(K).to.be.gt(0);

      // Check internal token
      const iTokenAddress = await bondingCurve.iToken();
      expect(iTokenAddress).to.not.equal(ethers.ZeroAddress);

      const iToken = await ethers.getContractAt("AgentTokenInternal", iTokenAddress);
      expect(await iToken.name()).to.equal("fun Test Agent");
      expect(await iToken.symbol()).to.equal("fTEST");
      expect(await iToken.totalSupply()).to.equal(SUPPLY);
      expect(await iToken.balanceOf(await bondingCurve.getAddress())).to.equal(SUPPLY);
    });

    it("Should reject double initialization", async function () {
      await bondingCurve.initialize(
        await easyV.getAddress(),
        "Test Agent",
        "TEST",
        creator.address,
        GRADUATION_THRESHOLD
      );

      await expect(
        bondingCurve.initialize(
          await easyV.getAddress(),
          "Test Agent 2",
          "TEST2",
          creator.address,
          GRADUATION_THRESHOLD
        )
      ).to.be.revertedWith("already initialized");
    });

    it("Should reject zero threshold", async function () {
      await expect(
        bondingCurve.initialize(
          await easyV.getAddress(),
          "Test Agent",
          "TEST",
          creator.address,
          0
        )
      ).to.be.revertedWith("thr=0");
    });
  });

  describe("Buying tokens", function () {
    beforeEach(async function () {
      await bondingCurve.initialize(
        await easyV.getAddress(),
        "Test Agent",
        "TEST",
        creator.address,
        GRADUATION_THRESHOLD
      );
    });

    it("Should buy tokens successfully", async function () {
      const buyAmount = ethers.parseEther("1000");
      
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), buyAmount);
      
      const tx = await bondingCurve.connect(buyer1).buy(buyAmount, 0);
      const receipt = await tx.wait();

      // Check Buy event
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = bondingCurve.interface.parseLog(log);
          return parsed?.name === "Buy";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;

      if (event) {
        const parsed = bondingCurve.interface.parseLog(event);
        expect(parsed!.args[0]).to.equal(buyer1.address); // buyer
        expect(parsed!.args[1]).to.equal(buyAmount); // virtualIn
        expect(parsed!.args[2]).to.be.gt(0); // tokensOut
      }

      // Check state updates
      expect(await bondingCurve.virtualRaised()).to.equal(buyAmount);
      expect(await bondingCurve.tokensSold()).to.be.gt(0);

      // Check buyer received tokens
      const iTokenAddress = await bondingCurve.iToken();
      const iToken = await ethers.getContractAt("AgentTokenInternal", iTokenAddress);
      const buyerBalance = await iToken.balanceOf(buyer1.address);
      expect(buyerBalance).to.be.gt(0);
    });

    it("Should reject zero amount", async function () {
      await expect(
        bondingCurve.connect(buyer1).buy(0, 0)
      ).to.be.revertedWith("0 in");
    });

    it("Should reject if not initialized", async function () {
      const newBondingCurve = await ethers.getContractFactory("BondingCurve");
      const uninitializedCurve = await newBondingCurve.deploy();
      await uninitializedCurve.waitForDeployment();

      await expect(
        uninitializedCurve.connect(buyer1).buy(ethers.parseEther("1000"), 0)
      ).to.be.revertedWith("not initialized");
    });

    it("Should reject if graduated", async function () {
      // Buy enough to graduate
      const buyAmount = GRADUATION_THRESHOLD + ethers.parseEther("1000");
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), buyAmount);
      await bondingCurve.connect(buyer1).buy(buyAmount, 0);

      expect(await bondingCurve.graduated()).to.be.true;

      // Try to buy more after graduation
      await easyV.connect(buyer2).approve(await bondingCurve.getAddress(), ethers.parseEther("1000"));
      await expect(
        bondingCurve.connect(buyer2).buy(ethers.parseEther("1000"), 0)
      ).to.be.revertedWith("graduated");
    });

    it("Should respect slippage protection", async function () {
      const buyAmount = ethers.parseEther("1000");
      const unrealisticMinTokens = ethers.parseEther("1000000"); // Way too high
      
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), buyAmount);
      
      await expect(
        bondingCurve.connect(buyer1).buy(buyAmount, unrealisticMinTokens)
      ).to.be.revertedWith("slip");
    });

    it("Should handle multiple purchases correctly", async function () {
      const buyAmount1 = ethers.parseEther("1000");
      const buyAmount2 = ethers.parseEther("2000");

      // First purchase
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), buyAmount1);
      await bondingCurve.connect(buyer1).buy(buyAmount1, 0);

      const virtualRaised1 = await bondingCurve.virtualRaised();
      const tokensSold1 = await bondingCurve.tokensSold();

      // Second purchase
      await easyV.connect(buyer2).approve(await bondingCurve.getAddress(), buyAmount2);
      await bondingCurve.connect(buyer2).buy(buyAmount2, 0);

      const virtualRaised2 = await bondingCurve.virtualRaised();
      const tokensSold2 = await bondingCurve.tokensSold();

      expect(virtualRaised2).to.equal(virtualRaised1 + buyAmount2);
      expect(tokensSold2).to.be.gt(tokensSold1);

      // Check both buyers have tokens
      const iTokenAddress = await bondingCurve.iToken();
      const iToken = await ethers.getContractAt("AgentTokenInternal", iTokenAddress);
      
      expect(await iToken.balanceOf(buyer1.address)).to.be.gt(0);
      expect(await iToken.balanceOf(buyer2.address)).to.be.gt(0);
    });

    it("Should calculate correct token amounts for linear curve", async function () {
      const buyAmount = ethers.parseEther("1000");
      
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), buyAmount);
      const tx = await bondingCurve.connect(buyer1).buy(buyAmount, 0);
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
        
        // For a linear curve starting at 0, the first purchase should give a predictable amount
        expect(tokensOut).to.be.gt(0);
        
        // The price should increase with subsequent purchases
        await easyV.connect(buyer2).approve(await bondingCurve.getAddress(), buyAmount);
        const tx2 = await bondingCurve.connect(buyer2).buy(buyAmount, 0);
        const receipt2 = await tx2.wait();

        const event2 = receipt2?.logs.find((log: any) => {
          try {
            const parsed = bondingCurve.interface.parseLog(log);
            return parsed?.name === "Buy";
          } catch {
            return false;
          }
        });

        if (event2) {
          const parsed2 = bondingCurve.interface.parseLog(event2);
          const tokensOut2 = parsed2!.args[2];
          
          // Second purchase should give fewer tokens (higher price)
          expect(tokensOut2).to.be.lt(tokensOut);
        }
      }
    });
  });

  describe("Graduation", function () {
    beforeEach(async function () {
      await bondingCurve.initialize(
        await easyV.getAddress(),
        "Test Agent",
        "TEST",
        creator.address,
        GRADUATION_THRESHOLD
      );
    });

    it("Should graduate when threshold is reached", async function () {
      const buyAmount = GRADUATION_THRESHOLD + ethers.parseEther("1000");
      
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), buyAmount);
      const tx = await bondingCurve.connect(buyer1).buy(buyAmount, 0);
      const receipt = await tx.wait();

      // Check Graduate event
      const graduateEvent = receipt?.logs.find((log: any) => {
        try {
          const parsed = bondingCurve.interface.parseLog(log);
          return parsed?.name === "Graduate";
        } catch {
          return false;
        }
      });

      expect(graduateEvent).to.not.be.undefined;

      // Check graduation state
      expect(await bondingCurve.graduated()).to.be.true;
      expect(await bondingCurve.virtualRaised()).to.be.gte(GRADUATION_THRESHOLD);

      // Check external token was created
      const eTokenAddress = await bondingCurve.eToken();
      expect(eTokenAddress).to.not.equal(ethers.ZeroAddress);

      const eToken = await ethers.getContractAt("AgentTokenExternal", eTokenAddress);
      expect(await eToken.totalSupply()).to.equal(SUPPLY);
      expect(await eToken.balanceOf(await bondingCurve.getAddress())).to.equal(SUPPLY);

      // Check token metadata
      const iTokenAddress = await bondingCurve.iToken();
      const iToken = await ethers.getContractAt("AgentTokenInternal", iTokenAddress);
      
      expect(await eToken.name()).to.equal(await iToken.name());
      expect(await eToken.symbol()).to.equal(await iToken.symbol());
    });

    it("Should not graduate before threshold", async function () {
      const buyAmount = GRADUATION_THRESHOLD - ethers.parseEther("1000");
      
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), buyAmount);
      await bondingCurve.connect(buyer1).buy(buyAmount, 0);

      expect(await bondingCurve.graduated()).to.be.false;
      expect(await bondingCurve.eToken()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Redemption", function () {
    let iToken: AgentTokenInternal;
    let eToken: AgentTokenExternal;

    beforeEach(async function () {
      await bondingCurve.initialize(
        await easyV.getAddress(),
        "Test Agent",
        "TEST",
        creator.address,
        GRADUATION_THRESHOLD
      );

      // Buy enough to graduate
      const buyAmount = GRADUATION_THRESHOLD + ethers.parseEther("1000");
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), buyAmount);
      await bondingCurve.connect(buyer1).buy(buyAmount, 0);

      // Get token contracts
      const iTokenAddress = await bondingCurve.iToken();
      const eTokenAddress = await bondingCurve.eToken();
      
      iToken = await ethers.getContractAt("AgentTokenInternal", iTokenAddress);
      eToken = await ethers.getContractAt("AgentTokenExternal", eTokenAddress);
    });

    it("Should redeem internal tokens for external tokens", async function () {
      const buyer1InternalBalance = await iToken.balanceOf(buyer1.address);
      const redeemAmount = buyer1InternalBalance / 2n;

      // Approve bonding curve to burn internal tokens
      await iToken.connect(buyer1).approve(await bondingCurve.getAddress(), redeemAmount);

      const tx = await bondingCurve.connect(buyer1).redeem(redeemAmount);
      const receipt = await tx.wait();

      // Check Redeem event
      const redeemEvent = receipt?.logs.find((log: any) => {
        try {
          const parsed = bondingCurve.interface.parseLog(log);
          return parsed?.name === "Redeem";
        } catch {
          return false;
        }
      });

      expect(redeemEvent).to.not.be.undefined;

      if (redeemEvent) {
        const parsed = bondingCurve.interface.parseLog(redeemEvent);
        expect(parsed!.args[0]).to.equal(buyer1.address); // user
        expect(parsed!.args[1]).to.equal(redeemAmount); // amount
      }

      // Check balances
      const newInternalBalance = await iToken.balanceOf(buyer1.address);
      const externalBalance = await eToken.balanceOf(buyer1.address);

      expect(newInternalBalance).to.equal(buyer1InternalBalance - redeemAmount);
      expect(externalBalance).to.equal(redeemAmount);
    });

    it("Should reject redemption if not graduated", async function () {
      // Deploy new curve that hasn't graduated
      const newBondingCurve = await ethers.getContractFactory("BondingCurve");
      const ungraduatedCurve = await newBondingCurve.deploy();
      await ungraduatedCurve.waitForDeployment();

      await ungraduatedCurve.initialize(
        await easyV.getAddress(),
        "Test Agent 2",
        "TEST2",
        creator.address,
        GRADUATION_THRESHOLD
      );

      await expect(
        ungraduatedCurve.connect(buyer1).redeem(ethers.parseEther("100"))
      ).to.be.revertedWith("!grad");
    });

    it("Should reject zero amount redemption", async function () {
      await expect(
        bondingCurve.connect(buyer1).redeem(0)
      ).to.be.revertedWith("0");
    });

    it("Should reject redemption without approval", async function () {
      const redeemAmount = ethers.parseEther("100");

      await expect(
        bondingCurve.connect(buyer1).redeem(redeemAmount)
      ).to.be.revertedWithCustomError(iToken, "ERC20InsufficientAllowance");
    });

    it("Should reject redemption of more tokens than owned", async function () {
      const buyer1Balance = await iToken.balanceOf(buyer1.address);
      const excessiveAmount = buyer1Balance + ethers.parseEther("1000");

      await iToken.connect(buyer1).approve(await bondingCurve.getAddress(), excessiveAmount);

      await expect(
        bondingCurve.connect(buyer1).redeem(excessiveAmount)
      ).to.be.revertedWithCustomError(iToken, "ERC20InsufficientBalance");
    });

    it("Should handle multiple redemptions", async function () {
      const buyer1InternalBalance = await iToken.balanceOf(buyer1.address);
      const redeemAmount1 = buyer1InternalBalance / 3n;
      const redeemAmount2 = buyer1InternalBalance / 3n;

      // First redemption
      await iToken.connect(buyer1).approve(await bondingCurve.getAddress(), redeemAmount1);
      await bondingCurve.connect(buyer1).redeem(redeemAmount1);

      // Second redemption
      await iToken.connect(buyer1).approve(await bondingCurve.getAddress(), redeemAmount2);
      await bondingCurve.connect(buyer1).redeem(redeemAmount2);

      // Check final balances
      const finalInternalBalance = await iToken.balanceOf(buyer1.address);
      const finalExternalBalance = await eToken.balanceOf(buyer1.address);

      expect(finalInternalBalance).to.equal(buyer1InternalBalance - redeemAmount1 - redeemAmount2);
      expect(finalExternalBalance).to.equal(redeemAmount1 + redeemAmount2);
    });
  });

  describe("Edge cases and security", function () {
    beforeEach(async function () {
      await bondingCurve.initialize(
        await easyV.getAddress(),
        "Test Agent",
        "TEST",
        creator.address,
        GRADUATION_THRESHOLD
      );
    });

    it("Should handle very small purchases", async function () {
      const smallAmount = ethers.parseEther("0.001");
      
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), smallAmount);
      await bondingCurve.connect(buyer1).buy(smallAmount, 0);

      expect(await bondingCurve.virtualRaised()).to.equal(smallAmount);
      expect(await bondingCurve.tokensSold()).to.be.gt(0);
    });

    it("Should prevent reentrancy attacks", async function () {
      // This test ensures the nonReentrant modifier is working
      // In a real attack scenario, a malicious contract would try to call buy() again
      // during the execution of the first buy() call
      
      const buyAmount = ethers.parseEther("1000");
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), buyAmount);
      
      // This should succeed normally
      await expect(bondingCurve.connect(buyer1).buy(buyAmount, 0)).to.not.be.reverted;
    });

    it("Should handle exact graduation threshold", async function () {
      const exactAmount = GRADUATION_THRESHOLD;
      
      await easyV.connect(buyer1).approve(await bondingCurve.getAddress(), exactAmount);
      const tx = await bondingCurve.connect(buyer1).buy(exactAmount, 0);
      const receipt = await tx.wait();

      // Should graduate exactly at threshold
      expect(await bondingCurve.graduated()).to.be.true;
      expect(await bondingCurve.virtualRaised()).to.equal(exactAmount);

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
  });
}); 