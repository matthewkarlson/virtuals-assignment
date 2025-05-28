import { ethers } from "hardhat";

async function main() {
  console.log("🤖 Creating a new agent...");

  // Deployed contract addresses from the successful deployment
  const EASYV_ADDRESS = "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6";
  const AGENT_FACTORY_ADDRESS = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318";

  const [deployer] = await ethers.getSigners();
  console.log("Creating agent with account:", deployer.address);

  // Get contract instances
  const easyV = await ethers.getContractAt("EasyV", EASYV_ADDRESS);
  const agentFactory = await ethers.getContractAt("AgentFactory", AGENT_FACTORY_ADDRESS);

  // Check EasyV balance
  const balance = await easyV.balanceOf(deployer.address);
  console.log("EasyV balance:", ethers.formatEther(balance));

  const minDeposit = await agentFactory.MIN_INITIAL_DEPOSIT();
  console.log("Minimum deposit required:", ethers.formatEther(minDeposit), "EasyV");

  if (balance < minDeposit) {
    console.error("❌ Insufficient EasyV balance to create agent");
    return;
  }

  // Approve AgentFactory to spend EasyV
  console.log("📝 Approving EasyV spend...");
  const approveTx = await easyV.approve(AGENT_FACTORY_ADDRESS, minDeposit);
  await approveTx.wait();
  console.log("✅ Approval confirmed");

  // Create agent
  console.log("🚀 Creating agent...");
  const createTx = await agentFactory.createAgent(
    "My AI Agent",
    "MYAI",
    minDeposit
  );
  
  const receipt = await createTx.wait();
  console.log("✅ Agent created!");
  
  // Find the AgentCreated event
  const agentCreatedEvent = receipt?.logs.find(
    (log: any) => {
      try {
        const parsed = agentFactory.interface.parseLog(log);
        return parsed?.name === "AgentCreated";
      } catch {
        return false;
      }
    }
  );
  
  if (agentCreatedEvent) {
    const parsed = agentFactory.interface.parseLog(agentCreatedEvent);
    const [curveAddress, creator, name, symbol] = parsed!.args;
    console.log("📊 Agent Details:");
    console.log("- Bonding Curve Address:", curveAddress);
    console.log("- Creator:", creator);
    console.log("- Name:", name);
    console.log("- Symbol:", symbol);
    
    // Get bonding curve instance
    const bondingCurve = await ethers.getContractAt("BondingCurve", curveAddress);
    const tokensSold = await bondingCurve.tokensSold();
    const virtualRaised = await bondingCurve.virtualRaised();
    const graduated = await bondingCurve.graduated();
    
    console.log("- Tokens Sold:", ethers.formatEther(tokensSold));
    console.log("- Virtual Raised:", ethers.formatEther(virtualRaised));
    console.log("- Graduated:", graduated);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 