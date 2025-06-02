import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { AgentFactory, EasyV } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Bonding Integration Test", function () {
  let agentFactory: AgentFactory;
  let virtual: EasyV;
  let bonding: any;
  let fFactory: any;
  let fRouter: any;
  let deployer: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;

  const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10M VIRTUAL
  const PROPOSAL_THRESHOLD = ethers.parseEther("50000"); // 50k

  before(async function () {
    [deployer, creator, treasury] = await ethers.getSigners();

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
    ]);
    await fFactory.waitForDeployment();
    await fFactory.grantRole(await fFactory.ADMIN_ROLE(), deployer.address);

    // Deploy FRouter (upgradeable)
    const FRouterFactory = await ethers.getContractFactory("FRouter");
    fRouter = await upgrades.deployProxy(FRouterFactory, [
      await fFactory.getAddress(),
      await virtual.getAddress()
    ]);
    await fRouter.waitForDeployment();
    await fFactory.setRouter(await fRouter.getAddress());

    // Deploy Bonding (upgradeable)
    const BondingFactory = await ethers.getContractFactory("Bonding");
    bonding = await upgrades.deployProxy(BondingFactory, [
      await fFactory.getAddress(),
      await fRouter.getAddress(),
      treasury.address,
      100000, // 100 fee
      ethers.parseEther("1000000000"), // initialSupply - 1 billion tokens
      10000,  // assetRate
      100,    // maxTx
      await agentFactory.getAddress(),
      ethers.parseEther("85000000"), // gradThreshold
    ]);
    await bonding.waitForDeployment();

    // Set bonding deployment parameters
    await bonding.setDeployParams([
      "0xa7647ac9429fdce477ebd9a95510385b756c757c26149e740abbab0ad1be2f16", // tbaSalt
      deployer.address, // tbaImplementation (mock)
      600, // daoVotingPeriod
      ethers.parseEther("1000"), // daoThreshold
    ]);

    // Grant roles
    await fFactory.grantRole(await fFactory.CREATOR_ROLE(), await bonding.getAddress());
    await fRouter.grantRole(await fRouter.EXECUTOR_ROLE(), await bonding.getAddress());

    // Set bonding contract in AgentFactory
    await agentFactory.setBondingContract(await bonding.getAddress());

    // Transfer tokens to creator
    const userAmount = ethers.parseEther("1000000"); // 1M VIRTUAL
    await virtual.transfer(creator.address, userAmount);
  });

  describe("End-to-End Integration", function () {
    it("Should directly call bonding.launch to isolate the issue", async function () {
      const launchAmount = ethers.parseEther("200"); // 200 VIRTUAL (like working test)

      // Approve Bonding contract directly
      await virtual.connect(creator).approve(await bonding.getAddress(), launchAmount);

      // Launch token directly through Bonding contract (bypassing AgentFactory)
      const tx = await bonding.connect(creator).launch(
        "Direct Cat",
        "DCAT",
        [0, 1, 2], // cores
        "A direct cat token",
        "https://example.com/cat.png",
        ["@directcat", "t.me/directcat", "", "directcat.com"],
        launchAmount
      );

      const receipt = await tx.wait();
      console.log("✅ Direct bonding launch successful!");
    });

    it("Should successfully launch a token through AgentFactory -> Bonding flow", async function () {
      const launchAmount = ethers.parseEther("200"); // 200 VIRTUAL (like working test)
      const bondingAmount = launchAmount - await agentFactory.FEE(); // Should be 200 ether

      // Approve AgentFactory to spend tokens
      await virtual.connect(creator).approve(await agentFactory.getAddress(), launchAmount);

      // Launch token through AgentFactory
      const tx = await agentFactory.connect(creator).launchWithParams(
        "Test Cat",
        "TCAT",
        [0, 1, 2], // cores
        "A test cat token",
        "https://example.com/cat.png",
        ["@testcat", "t.me/testcat", "", "testcat.com"],
        launchAmount
      );

      const receipt = await tx.wait();
      
      // Check that AgentLaunched event was emitted
      const events = receipt?.logs || [];
      const agentLaunchedEvents = events.filter((log: any) => {
        try {
          const parsed = agentFactory.interface.parseLog(log);
          return parsed?.name === "AgentLaunched";
        } catch {
          return false;
        }
      });

      expect(agentLaunchedEvents.length).to.be.greaterThan(0);

      // Verify token was tracked in AgentFactory
      expect(await agentFactory.bondingCurveCount()).to.equal(1);
      const tokenAddress = (await agentFactory.allBondingCurves())[0];
      expect(await agentFactory.authorizedTokens(tokenAddress)).to.be.true;

      // Verify token info in bonding contract
      const tokenInfo = await bonding.tokenInfo(tokenAddress);
      expect(tokenInfo.creator).to.equal(creator.address);
      expect(tokenInfo.trading).to.be.true;
      expect(tokenInfo.tradingOnUniswap).to.be.false;
      expect(tokenInfo.data.ticker).to.equal("TCAT");

      // Verify fee was collected
      const feeAmount = await agentFactory.FEE();
      expect(await virtual.balanceOf(await agentFactory.feeTo())).to.equal(feeAmount);

      console.log("✅ Token successfully launched through AgentFactory -> Bonding flow");
      console.log(`📋 Token address: ${tokenAddress}`);
      console.log(`💰 Fee collected: ${ethers.formatEther(feeAmount)} VIRTUAL`);
    });

    it("Should handle token graduation when threshold is reached", async function () {
      // First, launch a token
      const launchAmount = ethers.parseEther("200");
      await virtual.connect(creator).approve(await agentFactory.getAddress(), launchAmount);

      await agentFactory.connect(creator).launchWithParams(
        "Graduation Cat",
        "GCAT",
        [0, 1, 2],
        "A cat that will graduate",
        "",
        ["", "", "", ""],
        launchAmount
      );

      const tokenAddress = (await agentFactory.allBondingCurves())[1];
      
      // Verify initial state
      let tokenInfo = await bonding.tokenInfo(tokenAddress);
      expect(tokenInfo.trading).to.be.true;
      expect(tokenInfo.tradingOnUniswap).to.be.false;
      expect(tokenInfo.agentToken).to.equal(ethers.ZeroAddress);

      // Make a large purchase to trigger graduation
      const buyAmount = ethers.parseEther("85100000"); // Just over graduation threshold
      await virtual.transfer(creator.address, buyAmount);
      await virtual.connect(creator).approve(await fRouter.getAddress(), buyAmount);

      // Buy tokens to trigger graduation
      const deadline = Math.floor(Date.now() / 1000) + 300;
      await bonding.connect(creator).buy(buyAmount, tokenAddress, 0, deadline);

      // Verify graduation occurred
      tokenInfo = await bonding.tokenInfo(tokenAddress);
      expect(tokenInfo.trading).to.be.false;
      expect(tokenInfo.tradingOnUniswap).to.be.true;
      expect(tokenInfo.agentToken).to.not.equal(ethers.ZeroAddress);

      // Verify AgentFactory was notified
      expect(await agentFactory.isGraduated(tokenAddress)).to.be.true;

      console.log("✅ Token graduation flow completed successfully");
      console.log(`📋 Graduated token: ${tokenAddress}`);
      console.log(`🎓 Agent token: ${tokenInfo.agentToken}`);
    });

    it("Should debug the reserves and k values to understand the overflow", async function () {
      const launchAmount = ethers.parseEther("200"); // 200 VIRTUAL

      // Approve Bonding contract directly
      await virtual.connect(creator).approve(await bonding.getAddress(), launchAmount);

      // Launch token directly through Bonding contract (bypassing AgentFactory)
      try {
        const tx = await bonding.connect(creator).launch(
          "Debug Cat",
          "DCAT",
          [0, 1, 2], // cores
          "A debug cat token",
          "",
          ["", "", "", ""],
          launchAmount
        );
        await tx.wait();
      } catch (error) {
        // Let's check what the state looks like just before the overflow
        console.log("Launch failed, checking intermediate state...");
        
        // Get the last created token info to examine the pair
        const tokenCount = await bonding.tokenInfos.length || 0;
        if (tokenCount > 0) {
          const lastTokenAddress = await bonding.tokenInfos(tokenCount - 1);
          const tokenInfo = await bonding.tokenInfo(lastTokenAddress);
          
          // Get pair address and check its state
          const pairAddress = tokenInfo.pair;
          const pair = await ethers.getContractAt("FPair", pairAddress);
          
          const [reserveA, reserveB] = await pair.getReserves();
          const k = await pair.kLast();
          const tokenBalance = await pair.balance();
          const assetBalance = await pair.assetBalance();
          
          console.log("=== PAIR STATE DEBUG ===");
          console.log(`Pair address: ${pairAddress}`);
          console.log(`Reserve A (tokens): ${ethers.formatEther(reserveA)}`);
          console.log(`Reserve B (assets): ${ethers.formatEther(reserveB)}`);
          console.log(`K constant: ${k.toString()}`);
          console.log(`Actual token balance: ${ethers.formatEther(tokenBalance)}`);
          console.log(`Actual asset balance: ${ethers.formatEther(assetBalance)}`);
          
          // Check what getAmountsOut would calculate
          const initialPurchase = launchAmount - await bonding.fee();
          try {
            const amountOut = await fRouter.getAmountsOut(lastTokenAddress, await virtual.getAddress(), initialPurchase);
            console.log(`Expected amount out: ${ethers.formatEther(amountOut)}`);
          } catch (calcError: any) {
            console.log(`getAmountsOut calculation failed: ${calcError.message}`);
          }
        }
        
        throw error;
      }
    });

    it("Should calculate bonding curve values manually to debug", async function () {
      // Get the bonding contract parameters
      const K = 3_000_000_000_000n; // From bonding contract
      const initialSupply = await bonding.initialSupply(); // Should be 1000000000
      const assetRate = await bonding.assetRate(); // Should be 10000
      const fee = await bonding.fee(); // Should be 100 * 1e18 / 1000
      
      console.log("=== BONDING PARAMETERS ===");
      console.log(`K: ${K}`);
      console.log(`Initial Supply: ${initialSupply}`);
      console.log(`Asset Rate: ${assetRate}`);
      console.log(`Fee: ${ethers.formatEther(fee)}`);
      
      // Calculate what the liquidity would be
      const launchAmount = ethers.parseEther("200");
      const initialPurchase = launchAmount - fee;
      
      // Calculate k and liquidity like the bonding contract does
      const k = (K * 10000n) / assetRate;
      const supply = initialSupply; // This should be 1 billion
      
      // Break down the liquidity calculation step by step
      console.log("=== LIQUIDITY CALCULATION BREAKDOWN ===");
      const step1 = k * 10000n * ethers.parseEther("1");
      console.log(`Step 1: k * 10000 * 1e18 = ${step1}`);
      
      const step2 = step1 / supply;
      console.log(`Step 2: step1 / supply = ${step2}`);
      
      const step3 = step2 * ethers.parseEther("1");
      console.log(`Step 3: step2 * 1e18 = ${step3}`);
      
      const liquidity = step3 / 10000n;
      console.log(`Step 4: step3 / 10000 = ${ethers.formatEther(liquidity)}`);
      
      if (liquidity === 0n) {
        console.log("❌ PROBLEM: Liquidity calculated to 0!");
        console.log("This will cause division by zero in price calculation");
      }
      
      // Check what reserves would be set
      console.log("=== WOULD SET RESERVES ===");
      console.log(`Token Reserve (A): ${ethers.formatEther(supply)}`);
      console.log(`Asset Reserve (B): ${ethers.formatEther(liquidity)}`);
      console.log(`K constant: ${supply * liquidity}`);
      
      // Check what the buy calculation would be
      console.log("=== BUY CALCULATION ===");
      const reserveA = supply;
      const reserveB = liquidity;
      const kConstant = reserveA * reserveB;
      
      console.log(`Buying with: ${ethers.formatEther(initialPurchase)}`);
      
      // Simulate getAmountsOut calculation
      const newReserveB = reserveB + initialPurchase;
      const newReserveA = kConstant / newReserveB;
      
      console.log(`New Reserve B: ${ethers.formatEther(newReserveB)}`);
      console.log(`New Reserve A: ${ethers.formatEther(newReserveA)}`);
      console.log(`Reserve A >= New Reserve A: ${reserveA >= newReserveA}`);
      
      if (reserveA >= newReserveA) {
        const amountOut = reserveA - newReserveA;
        console.log(`Amount Out: ${ethers.formatEther(amountOut)}`);
      } else {
        console.log(`❌ OVERFLOW: New Reserve A (${ethers.formatEther(newReserveA)}) > Reserve A (${ethers.formatEther(reserveA)})`);
      }
    });
  });
}); 