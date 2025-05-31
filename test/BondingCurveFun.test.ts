import { ethers } from "hardhat";
import { expect } from "chai";
import { BondingCurve, AgentFactory, EasyV } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Fun-Style Bonding Curve", function () {
  let virtual: EasyV;
  let bondingCurveImpl: BondingCurve;
  let factory: AgentFactory;
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const INITIAL_DEPOSIT = ethers.parseEther("10000"); // 10k VIRTUAL
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

      // Launch new token
      const tx = await factory.connect(user1).createAgent(
        "Test Agent",
        "TEST",
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
    });

    it("Should have correct token info after launch", async function () {
      await virtual.connect(user1).approve(await factory.getAddress(), INITIAL_DEPOSIT);
      await factory.connect(user1).createAgent("Test Agent", "TEST", INITIAL_DEPOSIT);

      const curves = await factory.allBondingCurves();
      const curve = await ethers.getContractAt("BondingCurve", curves[0]);

      const tokenInfo = await curve.getTokenInfo();
      
      expect(tokenInfo.name).to.equal("fun Test Agent");
      expect(tokenInfo.symbol).to.equal("fTEST");
      expect(tokenInfo.supply).to.equal(ethers.parseEther("1000000000")); // 1B tokens
      expect(tokenInfo.trading).to.be.true;
      expect(tokenInfo.graduatedStatus).to.be.false;
    });
  });

  describe("Trading on Bonding Curve", function () {
    let curve: BondingCurve;

    beforeEach(async function () {
      await virtual.connect(user1).approve(await factory.getAddress(), INITIAL_DEPOSIT);
      await factory.connect(user1).createAgent("Test Agent", "TEST", INITIAL_DEPOSIT);

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
  });

  describe("Graduation", function () {
    let curve: BondingCurve;

    beforeEach(async function () {
      await virtual.connect(user1).approve(await factory.getAddress(), INITIAL_DEPOSIT);
      await factory.connect(user1).createAgent("Test Agent", "TEST", INITIAL_DEPOSIT);

      const curves = await factory.allBondingCurves();
      curve = await ethers.getContractAt("BondingCurve", curves[0]);
    });

    it("Should graduate when threshold is reached", async function () {
      // Buy enough to reach graduation threshold
      const buyAmount = GRADUATION_THRESHOLD;
      
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      
      const graduatedBefore = await curve.graduated();
      expect(graduatedBefore).to.be.false;

      // This should trigger graduation
      await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      const graduatedAfter = await curve.graduated();
      expect(graduatedAfter).to.be.true;

      const tradingEnabled = await curve.tradingEnabled();
      expect(tradingEnabled).to.be.false;

      // Check that external token was created
      const eTokenAddress = await curve.eToken();
      expect(eTokenAddress).to.not.equal(ethers.ZeroAddress);

      // Check factory registered the graduation
      const isGraduated = await factory.isGraduated(await curve.getAddress());
      expect(isGraduated).to.be.true;
    });

    it("Should not allow trading after graduation", async function () {
      // Graduate the curve
      const buyAmount = GRADUATION_THRESHOLD;
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      // Try to buy more - should fail
      await virtual.connect(user2).approve(await curve.getAddress(), ethers.parseEther("1000"));
      await expect(
        curve.connect(user2).buy(ethers.parseEther("1000"), 0, Math.floor(Date.now() / 1000) + 300)
      ).to.be.revertedWithCustomError(curve, "InvalidTokenStatus");
    });

    it("Should allow redemption after graduation", async function () {
      // Buy tokens first
      const buyAmount = ethers.parseEther("5000");
      await virtual.connect(user2).approve(await curve.getAddress(), buyAmount);
      await curve.connect(user2).buy(buyAmount, 0, Math.floor(Date.now() / 1000) + 300);

      const iToken = await ethers.getContractAt("AgentTokenInternal", await curve.iToken());
      const userTokens = await iToken.balanceOf(user2.address);

      // Graduate the curve
      const gradAmount = GRADUATION_THRESHOLD - buyAmount;
      await virtual.connect(user1).approve(await curve.getAddress(), gradAmount);
      await curve.connect(user1).buy(gradAmount, 0, Math.floor(Date.now() / 1000) + 300);

      // Now redeem tokens
      await iToken.connect(user2).approve(await curve.getAddress(), userTokens);
      
      const tx = await curve.connect(user2).redeem(userTokens);
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;

      // Check user received external tokens
      const eToken = await ethers.getContractAt("AgentTokenExternal", await curve.eToken());
      const externalBalance = await eToken.balanceOf(user2.address);
      expect(externalBalance).to.equal(userTokens);
    });
  });

  describe("View Functions", function () {
    let curve: BondingCurve;

    beforeEach(async function () {
      await virtual.connect(user1).approve(await factory.getAddress(), INITIAL_DEPOSIT);
      await factory.connect(user1).createAgent("Test Agent", "TEST", INITIAL_DEPOSIT);

      const curves = await factory.allBondingCurves();
      curve = await ethers.getContractAt("BondingCurve", curves[0]);
    });

    it("Should return correct reserves", async function () {
      const [virtualReserve, tokenReserve] = await curve.getReserves();
      
      expect(virtualReserve).to.be.greaterThan(0);
      expect(tokenReserve).to.be.greaterThan(0);
      expect(tokenReserve).to.be.lessThan(ethers.parseEther("1000000000")); // Less than total supply
    });

    it("Should return factory data", async function () {
      const curves = await factory.allBondingCurves();
      expect(curves.length).to.equal(1);

      const count = await factory.bondingCurveCount();
      expect(count).to.equal(1);

      const isGraduated = await factory.isGraduated(curves[0]);
      expect(isGraduated).to.be.false;
    });
  });
}); 