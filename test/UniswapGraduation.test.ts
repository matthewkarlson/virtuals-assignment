import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { AgentFactory, EasyV, Bonding, FFactory, FRouter, FERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Uniswap Graduation Test", function () {
  let agentFactory: AgentFactory;
  let virtual: EasyV;
  let bonding: Bonding;
  let fFactory: FFactory;
  let fRouter: FRouter;
  let deployer: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let buyer: HardhatEthersSigner;

  // Uniswap V2 addresses on mainnet
  const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
  const UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

  const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10M VIRTUAL
  const GRADUATION_THRESHOLD = ethers.parseEther("1000"); // 1000 ether threshold for testing

  before(async function () {
    [deployer, creator, treasury, buyer] = await ethers.getSigners();

    // Deploy VIRTUAL token
    const EasyVFactory = await ethers.getContractFactory("EasyV");
    virtual = await EasyVFactory.deploy(INITIAL_SUPPLY);
    await virtual.waitForDeployment();

    // Deploy AgentFactory
    const AgentFactoryFactory = await ethers.getContractFactory("AgentFactory");
    agentFactory = await AgentFactoryFactory.deploy(await virtual.getAddress());
    await agentFactory.waitForDeployment();

    // Deploy FFactory (upgradeable)
    const FFactoryFactory = await ethers.getContractFactory("FFactory");
    fFactory = await upgrades.deployProxy(FFactoryFactory, [
      treasury.address, // feeTo
      0, // fee
      0  // feeToSetter
    ]) as FFactory;
    await fFactory.waitForDeployment();
    await fFactory.grantRole(await fFactory.ADMIN_ROLE(), deployer.address);

    // Deploy FRouter (upgradeable)
    const FRouterFactory = await ethers.getContractFactory("FRouter");
    fRouter = await upgrades.deployProxy(FRouterFactory, [
      await fFactory.getAddress(),
      await virtual.getAddress()
    ]) as FRouter;
    await fRouter.waitForDeployment();
    await fFactory.setRouter(await fRouter.getAddress());

    // Deploy Bonding (upgradeable)
    const BondingFactory = await ethers.getContractFactory("Bonding");
    bonding = await upgrades.deployProxy(BondingFactory, [
      await fFactory.getAddress(),
      await fRouter.getAddress(),
      treasury.address,
      100000, // 100000 fee (same as original)
      "1000000000", // initialSupply - 1 billion wei (same as original)
      10000,  // assetRate (same as original)
      100, // maxTx (same as original)
      await agentFactory.getAddress(),
      ethers.parseEther("85000000"), // gradThreshold - use original value for proper testing
    ]) as Bonding;
    await bonding.waitForDeployment();

    // Set bonding deployment parameters (same format as original test)
    await bonding.setDeployParams({
      tbaSalt: "0xa7647ac9429fdce477ebd9a95510385b756c757c26149e740abbab0ad1be2f16",
      tbaImplementation: deployer.address,
      daoVotingPeriod: 600,
      daoThreshold: 1000000000000000000000n
    });

    // Grant roles
    await fFactory.grantRole(await fFactory.CREATOR_ROLE(), await bonding.getAddress());
    await fRouter.grantRole(await fRouter.EXECUTOR_ROLE(), await bonding.getAddress());

    // Set bonding contract in AgentFactory
    await agentFactory.setBondingContract(await bonding.getAddress());

    // Transfer tokens to users
    const userAmount = ethers.parseEther("100000"); // 100k VIRTUAL each
    await virtual.transfer(creator.address, userAmount);
    await virtual.transfer(buyer.address, userAmount);
  });

  describe("Token Graduation to Uniswap", function () {
    let tokenAddress: string;
    let bondingPairAddress: string;

    it("Should launch a token successfully", async function () {
      const launchAmount = ethers.parseEther("200"); // 200 VIRTUAL (same as original test)

      // Approve bonding contract
      await virtual.connect(creator).approve(await bonding.getAddress(), launchAmount);

      // Launch token
      const tx = await bonding.connect(creator).launch(
        "Test Token",
        "TEST",
        [0, 1, 2], // cores
        "A test token for graduation",
        "https://example.com/test.png",
        ["@test", "t.me/test", "", "test.com"],
        launchAmount
      );

      const receipt = await tx.wait();
      
      // Get token address from Launched event
      const launchedEvent = receipt?.logs.find(log => {
        try {
          const parsed = bonding.interface.parseLog(log);
          return parsed?.name === "Launched";
        } catch {
          return false;
        }
      });

      expect(launchedEvent).to.not.be.undefined;
      const parsedEvent = bonding.interface.parseLog(launchedEvent!);
      tokenAddress = parsedEvent?.args[0];
      bondingPairAddress = parsedEvent?.args[1];

      // Verify initial state
      const tokenInfo = await bonding.tokenInfo(tokenAddress);
      expect(tokenInfo.creator).to.equal(creator.address);
      expect(tokenInfo.trading).to.be.true;
      expect(tokenInfo.tradingOnUniswap).to.be.false;
      expect(tokenInfo.uniswapPair).to.equal(ethers.ZeroAddress);
      expect(tokenInfo.pair).to.equal(bondingPairAddress);

      console.log("✅ Token launched successfully");
      console.log(`📋 Token address: ${tokenAddress}`);
      console.log(`🔗 Bonding pair: ${bondingPairAddress}`);
    });

    it("Should graduate token to Uniswap when threshold is reached", async function () {
      // Make purchases to reach graduation threshold
      // We need to buy enough to reduce the reserve below the threshold
      const buyAmount = ethers.parseEther("35000"); // Use amount from original test
      
      // Transfer more tokens to buyer
      await virtual.transfer(buyer.address, buyAmount);
      await virtual.connect(buyer).approve(await bonding.getAddress(), buyAmount);

      // Get initial bonding pair state
      const bondingPair = await ethers.getContractAt("IFPair", bondingPairAddress);
      const [initialReserveA, initialReserveB] = await bondingPair.getReserves();
      const initialAssetBalance = await bondingPair.assetBalance();
      const initialTokenBalance = await bondingPair.balance();

      console.log("=== PRE-GRADUATION STATE ===");
      console.log(`Initial Asset Balance: ${ethers.formatEther(initialAssetBalance)}`);
      console.log(`Initial Token Balance: ${ethers.formatEther(initialTokenBalance)}`);
      console.log(`Reserve A: ${ethers.formatEther(initialReserveA)}`);
      console.log(`Reserve B: ${ethers.formatEther(initialReserveB)}`);

      // Make the purchase that should trigger graduation
      const deadline = Math.floor(Date.now() / 1000) + 300;
      const tx = await bonding.connect(buyer).buy(buyAmount, tokenAddress, 0, deadline);
      const receipt = await tx.wait();

      // Check for Graduated event
      const graduatedEvent = receipt?.logs.find(log => {
        try {
          const parsed = bonding.interface.parseLog(log);
          return parsed?.name === "Graduated";
        } catch {
          return false;
        }
      });

      expect(graduatedEvent).to.not.be.undefined;
      console.log("✅ Graduated event emitted");

      // Verify token state after graduation
      const tokenInfo = await bonding.tokenInfo(tokenAddress);
      expect(tokenInfo.trading).to.be.false;
      expect(tokenInfo.tradingOnUniswap).to.be.true;
      expect(tokenInfo.uniswapPair).to.not.equal(ethers.ZeroAddress);

      console.log("=== POST-GRADUATION STATE ===");
      console.log(`Trading on bonding curve: ${tokenInfo.trading}`);
      console.log(`Trading on Uniswap: ${tokenInfo.tradingOnUniswap}`);
      console.log(`Uniswap pair: ${tokenInfo.uniswapPair}`);
    });

    it("Should verify Uniswap pair was created correctly", async function () {
      const tokenInfo = await bonding.tokenInfo(tokenAddress);
      const uniswapPairAddress = tokenInfo.uniswapPair;

      // Verify the pair exists in Uniswap factory
      const uniswapFactory = await ethers.getContractAt("IUniswapV2Factory", UNISWAP_V2_FACTORY);
      const expectedPairAddress = await uniswapFactory.getPair(tokenAddress, await virtual.getAddress());
      
      expect(uniswapPairAddress).to.equal(expectedPairAddress);
      expect(uniswapPairAddress).to.not.equal(ethers.ZeroAddress);

      console.log("✅ Uniswap pair creation verified");
      console.log(`🦄 Uniswap pair address: ${uniswapPairAddress}`);
    });

    it("Should verify liquidity was added to Uniswap pair", async function () {
      const tokenInfo = await bonding.tokenInfo(tokenAddress);
      const uniswapPairAddress = tokenInfo.uniswapPair;

      // Get Uniswap pair contract
      const uniswapPair = await ethers.getContractAt("IUniswapV2Pair", uniswapPairAddress);
      
      // Check reserves
      const reserves = await uniswapPair.getReserves();
      const token0 = await uniswapPair.token0();
      const token1 = await uniswapPair.token1();
      
      console.log("=== UNISWAP PAIR STATE ===");
      console.log(`Token0: ${token0}`);
      console.log(`Token1: ${token1}`);
      console.log(`Reserve0: ${ethers.formatEther(reserves.reserve0)}`);
      console.log(`Reserve1: ${ethers.formatEther(reserves.reserve1)}`);

      // Verify both reserves are non-zero
      expect(reserves.reserve0).to.be.greaterThan(0);
      expect(reserves.reserve1).to.be.greaterThan(0);

      // Check total supply (LP tokens)
      const totalSupply = await uniswapPair.totalSupply();
      expect(totalSupply).to.be.greaterThan(0);

      console.log(`LP Token Supply: ${ethers.formatEther(totalSupply)}`);
      console.log("✅ Liquidity successfully added to Uniswap");
    });

    it("Should verify bonding contract received LP tokens", async function () {
      const tokenInfo = await bonding.tokenInfo(tokenAddress);
      const uniswapPairAddress = tokenInfo.uniswapPair;

      // Check bonding contract's LP token balance
      const uniswapPair = await ethers.getContractAt("IUniswapV2Pair", uniswapPairAddress);
      const lpBalance = await uniswapPair.balanceOf(await bonding.getAddress());

      expect(lpBalance).to.be.greaterThan(0);
      console.log(`💰 Bonding contract LP balance: ${ethers.formatEther(lpBalance)}`);
      console.log("✅ LP tokens correctly held by bonding contract");
    });

    it("Should verify tokens can be traded on Uniswap", async function () {
      const tokenInfo = await bonding.tokenInfo(tokenAddress);
      const uniswapPairAddress = tokenInfo.uniswapPair;

      // Get Uniswap router
      const uniswapRouter = await ethers.getContractAt("IUniswapV2Router02", UNISWAP_V2_ROUTER);
      
      // Approve router to spend VIRTUAL tokens
      const tradeAmount = ethers.parseEther("10");
      await virtual.connect(buyer).approve(UNISWAP_V2_ROUTER, tradeAmount);

      // Get expected amount out
      const path = [await virtual.getAddress(), tokenAddress];
      const amountsOut = await uniswapRouter.getAmountsOut(tradeAmount, path);
      
      console.log("=== UNISWAP TRADE TEST ===");
      console.log(`Trade amount: ${ethers.formatEther(tradeAmount)} VIRTUAL`);
      console.log(`Expected tokens out: ${ethers.formatEther(amountsOut[1])}`);

      // Execute trade
      const deadline = Math.floor(Date.now() / 1000) + 300;
      const tx = await uniswapRouter.connect(buyer).swapExactTokensForTokens(
        tradeAmount,
        0, // Accept any amount
        path,
        buyer.address,
        deadline
      );

      await tx.wait();
      
      // Check buyer received tokens
      const token = await ethers.getContractAt("FERC20", tokenAddress);
      const tokenBalance = await token.balanceOf(buyer.address);
      
      expect(tokenBalance).to.be.greaterThan(0);
      console.log(`🎯 Tokens received: ${ethers.formatEther(tokenBalance)}`);
      console.log("✅ Uniswap trading verified successfully");
    });

    it("Should fail to trade on bonding curve after graduation", async function () {
      // Try to buy from bonding contract after graduation
      const buyAmount = ethers.parseEther("10");
      await virtual.connect(buyer).approve(await bonding.getAddress(), buyAmount);

      const deadline = Math.floor(Date.now() / 1000) + 300;
      
      await expect(
        bonding.connect(buyer).buy(buyAmount, tokenAddress, 0, deadline)
      ).to.be.revertedWithCustomError(bonding, "InvalidTokenStatus");

      console.log("✅ Bonding curve trading correctly disabled after graduation");
    });

    it("Should track graduated tokens correctly", async function () {
      // Check if token is in graduatedTokens array
      const graduatedTokens = await bonding.graduatedTokens(0);
      expect(graduatedTokens).to.equal(tokenAddress);

      console.log("✅ Graduated token correctly tracked");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle graduation when Uniswap pair already exists", async function () {
      // Launch another token
      const launchAmount = ethers.parseEther("200");
      await virtual.connect(creator).approve(await bonding.getAddress(), launchAmount);

      const tx = await bonding.connect(creator).launch(
        "Second Token",
        "TEST2",
        [0, 1],
        "Second test token",
        "",
        ["", "", "", ""],
        launchAmount
      );

      const receipt = await tx.wait();
      const launchedEvent = receipt?.logs.find(log => {
        try {
          const parsed = bonding.interface.parseLog(log);
          return parsed?.name === "Launched";
        } catch {
          return false;
        }
      });

      const parsedEvent = bonding.interface.parseLog(launchedEvent!);
      const newTokenAddress = parsedEvent?.args[0];

      // Pre-create a Uniswap pair for this token
      const uniswapFactory = await ethers.getContractAt("IUniswapV2Factory", UNISWAP_V2_FACTORY);
      await uniswapFactory.createPair(newTokenAddress, await virtual.getAddress());

      // Now trigger graduation
      const buyAmount = ethers.parseEther("35000");
      await virtual.transfer(buyer.address, buyAmount);
      await virtual.connect(buyer).approve(await bonding.getAddress(), buyAmount);

      const deadline = Math.floor(Date.now() / 1000) + 300;
      await bonding.connect(buyer).buy(buyAmount, newTokenAddress, 0, deadline);

      // Verify graduation still works
      const tokenInfo = await bonding.tokenInfo(newTokenAddress);
      expect(tokenInfo.tradingOnUniswap).to.be.true;
      expect(tokenInfo.uniswapPair).to.not.equal(ethers.ZeroAddress);

      console.log("✅ Graduation with pre-existing pair handled correctly");
    });

    it("Should not graduate if already graduated", async function () {
      // Get the graduated token from the graduated tokens array
      const graduatedToken = await bonding.graduatedTokens(0);
      
      // Try to manually call graduation on already graduated token
      const tokenInfo = await bonding.tokenInfo(graduatedToken);
      expect(tokenInfo.tradingOnUniswap).to.be.true;

      // This should not be callable externally, but let's verify the logic
      // by attempting another large buy (which should fail due to InvalidTokenStatus)
      const buyAmount = ethers.parseEther("100");
      await virtual.connect(buyer).approve(await bonding.getAddress(), buyAmount);

      const deadline = Math.floor(Date.now() / 1000) + 300;
      
      await expect(
        bonding.connect(buyer).buy(buyAmount, graduatedToken, 0, deadline)
      ).to.be.revertedWithCustomError(bonding, "InvalidTokenStatus");

      console.log("✅ Double graduation protection verified");
    });
  });
}); 