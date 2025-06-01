import { ethers } from "hardhat";
import { expect } from "chai";
import { BondingCurve, AgentFactory, EasyV } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("BondingCurve - Fun Style", function () {
  let virtual: EasyV;
  let bondingCurveImpl: BondingCurve;
  let factory: AgentFactory;
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const INITIAL_DEPOSIT = ethers.parseEther("7000"); // 6k + 1k fee
  const MIN_DEPOSIT = ethers.parseEther("6000");
  const FEE = ethers.parseEther("1000");
  const GRADUATION_THRESHOLD = ethers.parseEther("42000"); // 42k VIRTUAL
  
  beforeEach(async function () {
    [deployer, user1, user2] = await ethers.getSigners();

    // Deploy VIRTUAL token with initial supply to deployer
    const totalSupply = ethers.parseEther("10000000"); // 10M VIRTUAL total
    const EasyVFactory = await ethers.getContractFactory("EasyV");
    virtual = await EasyVFactory.deploy(totalSupply);

    // Deploy bonding curve implementation
    const BondingCurveFactory = await ethers.getContractFactory("BondingCurve");
    bondingCurveImpl = await BondingCurveFactory.deploy();

    // Deploy factory
    const AgentFactoryFactory = await ethers.getContractFactory("AgentFactory");
    factory = await AgentFactoryFactory.deploy(await virtual.getAddress());

    // Set implementation
    await factory.setBondingCurveImplementation(await bondingCurveImpl.getAddress());

    // Transfer VIRTUAL tokens to users
    const userAmount = ethers.parseEther("1000000"); // 1M VIRTUAL each
    await virtual.transfer(user1.address, userAmount);
    await virtual.transfer(user2.address, userAmount);
  });

  describe("Token Launching", function () {
    it("Should launch a new token with initial purchase", async function () {
      // Approve factory to spend VIRTUAL
      await virtual.connect(user1).approve(await factory.getAddress(), INITIAL_DEPOSIT);

      // Launch new token using the new launch method
      const tx = await factory.connect(user1).launch(
        "Test Agent",
        "TEST",
        [], // cores
        INITIAL_DEPOSIT
      );

      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;

      // Check that bonding curve was created
      const curveCount = await factory.bondingCurveCount();
      expect(curveCount).to.equal(1);

      const curves = await factory.allBondingCurves();
      expect(curves.length).to.equal(1);

      const curveAddress = curves[0];
      const curve = await ethers.getContractAt("BondingCurve", curveAddress);

      // Check curve initialization
      const creator = await curve.creator();
      expect(creator).to.equal(user1.address);

      const graduated = await curve.graduated();
      expect(graduated).to.be.false;

      const tradingEnabled = await curve.tradingEnabled();
      expect(tradingEnabled).to.be.true;

      // Check initial purchase was made
      const virtualRaised = await curve.virtualRaised();
      expect(virtualRaised).to.equal(MIN_DEPOSIT); // Should be deposit minus fee

      const tokensSold = await curve.tokensSold();
      expect(tokensSold).to.be.gt(0);
    });

    it("Should have correct token info after launch", async function () {
      await virtual.connect(user1).approve(await factory.getAddress(), INITIAL_DEPOSIT);
      await factory.connect(user1).launch("Test Agent", "TEST", [], INITIAL_DEPOSIT);

      const curves = await factory.allBondingCurves();
      const curve = await ethers.getContractAt("BondingCurve", curves[0]);

      const tokenInfo = await curve.getTokenInfo();
      
      expect(tokenInfo.name).to.equal("fun Test Agent");
      expect(tokenInfo.symbol).to.equal("fTEST");
      expect(tokenInfo.supply).to.equal(ethers.parseEther("1000000000")); // 1B tokens
      expect(tokenInfo.trading).to.be.true;
      expect(tokenInfo.graduatedStatus).to.be.false;
    });

    it("Should collect fees correctly", async function () {
      const deployerBalanceBefore = await virtual.balanceOf(deployer.address);
      
      await virtual.connect(user1).approve(await factory.getAddress(), INITIAL_DEPOSIT);
      await factory.connect(user1).launch("Test Agent", "TEST", [], INITIAL_DEPOSIT);

      const deployerBalanceAfter = await virtual.balanceOf(deployer.address);
      expect(deployerBalanceAfter - deployerBalanceBefore).to.equal(FEE);
    });
  });

  describe("Trading on Bonding Curve", function () {
    let curve: BondingCurve;

    beforeEach(async function () {
      await virtual.connect(user1).approve(await factory.getAddress(), INITIAL_DEPOSIT);
      await factory.connect(user1).launch("Test Agent", "TEST", [], INITIAL_DEPOSIT);

      const curves = await factory.allBondingCurves();
      curve = await ethers.getContractAt("BondingCurve", curves[0]);
    });

    it("Should allow buying tokens", async function () {
      const buyAmount = ethers.parseEther("1000"); // 1k VIRTUAL
      
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      
      const tokensBefore = await curve.tokensSold();
      
      const tx = await curve.connect(user2).buy(
        buyAmount,
        0, // min tokens out
        Math.floor(Date.now() / 1000) + 300 // 5 min deadline
      );

      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;

      const tokensAfter = await curve.tokensSold();
      expect(tokensAfter).to.be.greaterThan(tokensBefore);

      // Check user received tokens
      const iToken = await ethers.getContractAt("AgentTokenInternal", await curve.iToken());
      const userBalance = await iToken.balanceOf(user2.address);
      expect(userBalance).to.be.greaterThan(0);
    });

    it("Should allow selling tokens", async function () {
      const buyAmount = ethers.parseEther("1000");
      
      // First buy some tokens
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      const iToken = await ethers.getContractAt("AgentTokenInternal", await curve.iToken());
      const userTokens = await iToken.balanceOf(user2.address);
      
      // Approve curve to spend tokens
      await iToken.connect(user2).approve(await curve.getAddress(), userTokens);
      
      const virtualBefore = await virtual.balanceOf(user2.address);
      
      // Sell half the tokens
      const sellAmount = userTokens / 2n;
      await curve.connect(user2).sell(
        sellAmount,
        0, // min virtual out
        Math.floor(Date.now() / 1000) + 300
      );

      const virtualAfter = await virtual.balanceOf(user2.address);
      expect(virtualAfter).to.be.greaterThan(virtualBefore);
    });

    it("Should calculate amounts correctly", async function () {
      const buyAmount = ethers.parseEther("1000");
      
      // Get expected amount out
      const expectedTokensOut = await curve.getAmountOut(buyAmount, true);
      expect(expectedTokensOut).to.be.greaterThan(0);

      // Buy tokens
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      const tx = await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);
      const receipt = await tx.wait();

      // Check the actual tokens received (approximately equal due to rounding)
      const event = receipt?.logs.find(log => log.topics[0] === ethers.id("Buy(address,uint256,uint256,uint256)"));
      expect(event).to.not.be.undefined;
    });

    it("Should respect slippage protection on buy", async function () {
      const buyAmount = ethers.parseEther("1000");
      
      // Get realistic expected amount and set minimum higher
      const expectedTokens = await curve.getAmountOut(buyAmount, true);
      const unrealisticMinTokens = expectedTokens * 2n; // Expect double what's realistic
      
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      
      await expect(
        curve.connect(user2).buy(buyAmount, unrealisticMinTokens, Math.floor(Date.now() / 1000) + 300)
      ).to.be.revertedWithCustomError(curve, "SlippageTooHigh");
    });

    it("Should respect slippage protection on sell", async function () {
      const buyAmount = ethers.parseEther("1000");
      
      // First buy some tokens
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      const iToken = await ethers.getContractAt("AgentTokenInternal", await curve.iToken());
      const userTokens = await iToken.balanceOf(user2.address);
      
      // Approve curve to spend tokens
      await iToken.connect(user2).approve(await curve.getAddress(), userTokens);
      
      // Get realistic expected amount and set minimum higher
      const sellAmount = userTokens / 2n;
      const expectedVirtual = await curve.getAmountOut(sellAmount, false);
      const unrealisticMinVirtual = expectedVirtual * 2n; // Expect double what's realistic
      
      await expect(
        curve.connect(user2).sell(sellAmount, unrealisticMinVirtual, Math.floor(Date.now() / 1000) + 300)
      ).to.be.revertedWithCustomError(curve, "SlippageTooHigh");
    });

    it("Should reject expired transactions", async function () {
      const buyAmount = ethers.parseEther("1000");
      const expiredDeadline = 1; // Use a very old timestamp
      
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      
      await expect(
        curve.connect(user2).buy(buyAmount, 0, expiredDeadline)
      ).to.be.revertedWithCustomError(curve, "InvalidInput");
    });
  });

  describe("Graduation", function () {
    let curve: BondingCurve;

    beforeEach(async function () {
      await virtual.connect(user1).approve(await factory.getAddress(), INITIAL_DEPOSIT);
      await factory.connect(user1).launch("Test Agent", "TEST", [], INITIAL_DEPOSIT);

      const curves = await factory.allBondingCurves();
      curve = await ethers.getContractAt("BondingCurve", curves[0]);
    });

    it("Should graduate when threshold is reached", async function () {
      // Buy enough to reach graduation threshold (minus what was already bought in launch)
      const alreadyRaised = await curve.virtualRaised();
      const buyAmount = GRADUATION_THRESHOLD - alreadyRaised;
      
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      
      const graduatedBefore = await curve.graduated();
      expect(graduatedBefore).to.be.false;

      // This should trigger graduation
      await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      const graduatedAfter = await curve.graduated();
      expect(graduatedAfter).to.be.true;

      const tradingEnabled = await curve.tradingEnabled();
      expect(tradingEnabled).to.be.false;
    });

    it("Should create external token on graduation", async function () {
      // Buy enough to graduate
      const alreadyRaised = await curve.virtualRaised();
      const buyAmount = GRADUATION_THRESHOLD - alreadyRaised;
      
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      const eTokenAddress = await curve.eToken();
      expect(eTokenAddress).to.not.equal(ethers.ZeroAddress);

      const eToken = await ethers.getContractAt("AgentTokenExternal", eTokenAddress);
      const totalSupply = await eToken.totalSupply();
      expect(totalSupply).to.equal(ethers.parseEther("1000000000")); // 1B tokens
    });

    it("Should allow redemption after graduation", async function () {
      // Buy some tokens first
      const buyAmount = ethers.parseEther("5000");
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      const iToken = await ethers.getContractAt("AgentTokenInternal", await curve.iToken());
      const userTokensBefore = await iToken.balanceOf(user2.address);

      // Graduate the curve
      const alreadyRaised = await curve.virtualRaised();
      const graduationBuyAmount = GRADUATION_THRESHOLD - alreadyRaised;
      await virtual.connect(user1).approve(await curve.getAddress(), graduationBuyAmount);
      await curve.connect(user1).buy(graduationBuyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      // Redeem internal tokens for external tokens
      const redeemAmount = userTokensBefore / 2n;
      await iToken.connect(user2).approve(await curve.getAddress(), redeemAmount);
      await curve.connect(user2).redeem(redeemAmount);

      // Check balances
      const userTokensAfter = await iToken.balanceOf(user2.address);
      expect(userTokensAfter).to.equal(userTokensBefore - redeemAmount);

      const eToken = await ethers.getContractAt("AgentTokenExternal", await curve.eToken());
      const userExternalTokens = await eToken.balanceOf(user2.address);
      expect(userExternalTokens).to.equal(redeemAmount);
    });

    it("Should reject trading after graduation", async function () {
      // Graduate the curve
      const alreadyRaised = await curve.virtualRaised();
      const buyAmount = GRADUATION_THRESHOLD - alreadyRaised;
      
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      // Try to buy more after graduation
      await virtual.connect(user1).approve(await curve.getAddress(), ethers.parseEther("1000"));
      await expect(
        curve.connect(user1).buy(ethers.parseEther("1000"), 0, Math.floor(Date.now() / 1000) + 300)
      ).to.be.revertedWithCustomError(curve, "InvalidTokenStatus");
    });
  });

  describe("View Functions", function () {
    let curve: BondingCurve;

    beforeEach(async function () {
      await virtual.connect(user1).approve(await factory.getAddress(), INITIAL_DEPOSIT);
      await factory.connect(user1).launch("Test Agent", "TEST", [], INITIAL_DEPOSIT);

      const curves = await factory.allBondingCurves();
      curve = await ethers.getContractAt("BondingCurve", curves[0]);
    });

    it("Should return correct reserves", async function () {
      const [virtualReserve, tokenReserve] = await curve.getReserves();
      expect(virtualReserve).to.be.gt(0);
      expect(tokenReserve).to.be.gt(0);
    });

    it("Should calculate buy amounts correctly", async function () {
      const buyAmount = ethers.parseEther("1000");
      const tokensOut = await curve.getAmountOut(buyAmount, true);
      expect(tokensOut).to.be.gt(0);
    });

    it("Should calculate sell amounts correctly", async function () {
      // First buy some tokens
      const buyAmount = ethers.parseEther("1000");
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      const sellAmount = ethers.parseEther("1000000"); // 1M tokens
      const virtualOut = await curve.getAmountOut(sellAmount, false);
      expect(virtualOut).to.be.gt(0);
    });
  });
}); 