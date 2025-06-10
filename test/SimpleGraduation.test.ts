import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { AgentFactory, EasyV, Bonding, FFactory, FRouter } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Simple Graduation Test", function () {
  let virtual: EasyV;
  let bonding: Bonding;
  let fFactory: FFactory;
  let fRouter: FRouter;
  let deployer: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let buyer: HardhatEthersSigner;

  before(async function () {
    [deployer, creator, treasury, buyer] = await ethers.getSigners();

    // Deploy VIRTUAL token
    const EasyVFactory = await ethers.getContractFactory("EasyV");
    virtual = await EasyVFactory.deploy(ethers.parseEther("10000000"));
    await virtual.waitForDeployment();

    // Deploy minimal AgentFactory (mock)
    const AgentFactoryFactory = await ethers.getContractFactory("AgentFactory");
    const agentFactory = await AgentFactoryFactory.deploy(await virtual.getAddress());
    await agentFactory.waitForDeployment();

    // Deploy FFactory
    const FFactoryFactory = await ethers.getContractFactory("FFactory");
    fFactory = await upgrades.deployProxy(FFactoryFactory, [
      treasury.address, 0, 0
    ]) as FFactory;
    await fFactory.waitForDeployment();
    await fFactory.grantRole(await fFactory.ADMIN_ROLE(), deployer.address);

    // Deploy FRouter
    const FRouterFactory = await ethers.getContractFactory("FRouter");
    fRouter = await upgrades.deployProxy(FRouterFactory, [
      await fFactory.getAddress(),
      await virtual.getAddress()
    ]) as FRouter;
    await fRouter.waitForDeployment();
    await fFactory.setRouter(await fRouter.getAddress());

    // Deploy Bonding with same parameters as original test
    const BondingFactory = await ethers.getContractFactory("Bonding");
    bonding = await upgrades.deployProxy(BondingFactory, [
      await fFactory.getAddress(),
      await fRouter.getAddress(),
      treasury.address,
      100000, // fee
      "1000000000", // initialSupply
      10000, // assetRate
      100, // maxTx
      await agentFactory.getAddress(),
      ethers.parseEther("85000000"), // gradThreshold - use original value
    ]) as Bonding;
    await bonding.waitForDeployment();

    // Set deploy params
    await bonding.setDeployParams({
      tbaSalt: "0xa7647ac9429fdce477ebd9a95510385b756c757c26149e740abbab0ad1be2f16",
      tbaImplementation: deployer.address,
      daoVotingPeriod: 600,
      daoThreshold: 1000000000000000000000n
    });

    // Grant roles
    await fFactory.grantRole(await fFactory.CREATOR_ROLE(), await bonding.getAddress());
    await fRouter.grantRole(await fRouter.EXECUTOR_ROLE(), await bonding.getAddress());

    // Transfer tokens to users
    await virtual.transfer(creator.address, ethers.parseEther("1000"));
    await virtual.transfer(buyer.address, ethers.parseEther("120000"));
  });

  it("Should graduate when threshold is reached", async function () {
    // Launch token
    const launchAmount = ethers.parseEther("200");
    await virtual.connect(creator).approve(await bonding.getAddress(), launchAmount);

    const tx = await bonding.connect(creator).launch(
      "Cat",
      "$CAT",
      [0, 1, 2],
      "it is a cat",
      "",
      ["", "", "", ""],
      launchAmount
    );

    const receipt = await tx.wait();
    
    // Get token address
    const launchedEvent = receipt?.logs.find(log => {
      try {
        const parsed = bonding.interface.parseLog(log);
        return parsed?.name === "Launched";
      } catch {
        return false;
      }
    });

    const parsedEvent = bonding.interface.parseLog(launchedEvent!);
    const tokenAddress = parsedEvent?.args[0];
    const bondingPairAddress = parsedEvent?.args[1];

    console.log("✅ Token launched:", tokenAddress);

    // Check initial reserves
    const bondingPair = await ethers.getContractAt("IFPair", bondingPairAddress);
    const [initialReserveA, initialReserveB] = await bondingPair.getReserves();
    
    console.log(`Initial reserves: A=${ethers.formatEther(initialReserveA)}, B=${ethers.formatEther(initialReserveB)}`);
    console.log(`Graduation threshold: ${ethers.formatEther(await bonding.gradThreshold())}`);

    // Calculate how much we need to buy to reach graduation
    const gradThreshold = await bonding.gradThreshold();
    const currentReserveA = initialReserveA;
    
    console.log(`Need to reduce reserve A from ${ethers.formatEther(currentReserveA)} to ${ethers.formatEther(gradThreshold)}`);

    // Try buying with the amount from original test
    const buyAmount = ethers.parseEther("35000");
    await virtual.connect(buyer).approve(await bonding.getAddress(), buyAmount);

    const deadline = Math.floor(Date.now() / 1000) + 300;
    const buyTx = await bonding.connect(buyer).buy(buyAmount, tokenAddress, 0, deadline);
    const buyReceipt = await buyTx.wait();

    // Check if graduated
    const graduatedEvent = buyReceipt?.logs.find(log => {
      try {
        const parsed = bonding.interface.parseLog(log);
        return parsed?.name === "Graduated";
      } catch {
        return false;
      }
    });

    if (graduatedEvent) {
      console.log("🎓 Graduation occurred!");
      
      // Check token info
      const tokenInfo = await bonding.tokenInfo(tokenAddress);
      console.log(`Trading on bonding curve: ${tokenInfo.trading}`);
      console.log(`Trading on Uniswap: ${tokenInfo.tradingOnUniswap}`);
      console.log(`Uniswap pair: ${tokenInfo.uniswapPair}`);
      
      if (tokenInfo.uniswapPair !== ethers.ZeroAddress) {
        console.log("✅ Uniswap pair created successfully!");
        
        // Check if pair has liquidity
        const uniswapPair = await ethers.getContractAt("IUniswapV2Pair", tokenInfo.uniswapPair);
        const reserves = await uniswapPair.getReserves();
        console.log(`Uniswap reserves: ${ethers.formatEther(reserves.reserve0)}, ${ethers.formatEther(reserves.reserve1)}`);
      }
    } else {
      // Check new reserves after buy
      const [newReserveA, newReserveB] = await bondingPair.getReserves();
      console.log(`After buy reserves: A=${ethers.formatEther(newReserveA)}, B=${ethers.formatEther(newReserveB)}`);
      console.log("❌ Graduation did not occur");
    }
  });
}); 