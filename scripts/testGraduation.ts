import { ethers } from "hardhat";

async function main() {
  console.log("🎓 Testing agent graduation...");

  // Deployed contract addresses from the successful deployment
  const EASYV_ADDRESS = "0x43F48c3DC6df4674219923F2d4f8880d5E3CCC4c";
  const AGENT_FACTORY_ADDRESS = "0x512F94E0a875516da53e2e59aC1995d6B2fbF781";

  const [deployer] = await ethers.getSigners();
  console.log("Testing with account:", deployer.address);

  // Get contract instances
  const easyV = await ethers.getContractAt("EasyV", EASYV_ADDRESS);
  const agentFactory = await ethers.getContractAt("AgentFactory", AGENT_FACTORY_ADDRESS);

  // Check if there are any agents
  const agentCount = await agentFactory.agentCount();
  console.log("Total agents:", agentCount.toString());

  if (agentCount === 0n) {
    console.log("No agents found. Creating one first...");
    
    const minDeposit = await agentFactory.MIN_INITIAL_DEPOSIT();
    const balance = await easyV.balanceOf(deployer.address);
    
    if (balance < minDeposit) {
      console.error("❌ Insufficient EasyV balance to create agent");
      return;
    }

    // Approve and create agent
    await easyV.approve(AGENT_FACTORY_ADDRESS, minDeposit);
    const createTx = await agentFactory.createAgent("Test Agent", "TEST", minDeposit);
    await createTx.wait();
    console.log("✅ Agent created");
  }

  // Get the first agent
  const bondingCurveAddress = await agentFactory.agents(0);
  console.log("Testing with bonding curve:", bondingCurveAddress);

  const bondingCurve = await ethers.getContractAt("BondingCurve", bondingCurveAddress);

  // Check current state
  const virtualRaised = await bondingCurve.virtualRaised();
  const graduationThreshold = await bondingCurve.GRADUATION_THRESHOLD();
  const graduated = await bondingCurve.graduated();

  console.log("Current virtual raised:", ethers.formatEther(virtualRaised));
  console.log("Graduation threshold:", ethers.formatEther(graduationThreshold));
  console.log("Already graduated:", graduated);

  if (graduated) {
    console.log("✅ Agent already graduated!");
    return;
  }

  // Calculate how much more we need to buy
  const needed = graduationThreshold - virtualRaised;
  console.log("Need to buy:", ethers.formatEther(needed), "more EasyV worth of tokens");

  // Check if we have enough balance
  const balance = await easyV.balanceOf(deployer.address);
  console.log("Available balance:", ethers.formatEther(balance));

  if (balance < needed) {
    console.error("❌ Insufficient balance to trigger graduation");
    console.log("Need:", ethers.formatEther(needed));
    console.log("Have:", ethers.formatEther(balance));
    return;
  }

  // Approve bonding curve to spend our tokens
  console.log("📝 Approving EasyV spend...");
  await easyV.approve(bondingCurveAddress, needed);

  // Buy tokens to trigger graduation
  console.log("🚀 Buying tokens to trigger graduation...");
  const buyTx = await bondingCurve.buy(needed, 0); // 0 min tokens out
  const receipt = await buyTx.wait();

  console.log("✅ Purchase completed!");

  // Check if graduated
  const newGraduated = await bondingCurve.graduated();
  if (newGraduated) {
    console.log("🎓 Agent graduated!");
    
    // Get external token address
    const externalTokenAddress = await bondingCurve.eToken();
    console.log("External token address:", externalTokenAddress);
    
    // Get Uniswap pair address
    const uniswapPair = await bondingCurve.uniswapPair();
    console.log("Uniswap pair address:", uniswapPair);
  } else {
    console.log("❌ Graduation not triggered yet");
    const newVirtualRaised = await bondingCurve.virtualRaised();
    console.log("New virtual raised:", ethers.formatEther(newVirtualRaised));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 