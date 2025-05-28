import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("BondingCurve Uniswap Integration", function () {
  async function deployFixture() {
    const [owner, creator, buyer] = await ethers.getSigners();

    // Deploy EasyV token
    const EasyV = await ethers.getContractFactory("EasyV");
    const easyv = await EasyV.deploy(ethers.parseEther("1000000"));

    // Deploy AgentFactory
    const AgentFactory = await ethers.getContractFactory("AgentFactory");
    const agentFactory = await AgentFactory.deploy(await easyv.getAddress());

    // Deploy BondingCurve implementation
    const BondingCurve = await ethers.getContractFactory("BondingCurve");
    const bondingCurveImpl = await BondingCurve.deploy();

    // Set implementation in factory
    await agentFactory.setBondingCurveImplementation(await bondingCurveImpl.getAddress());

    // Mock Uniswap Router (for testing purposes)
    // In real deployment, you'd use the actual Uniswap V2 Router
    const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
    const mockRouter = await MockUniswapRouter.deploy();
    
    await agentFactory.setUniswapRouter(await mockRouter.getAddress());

    // Give tokens to creator and buyer
    await easyv.transfer(creator.address, ethers.parseEther("100000"));
    await easyv.transfer(buyer.address, ethers.parseEther("100000"));

    return {
      easyv,
      agentFactory,
      bondingCurveImpl,
      mockRouter,
      owner,
      creator,
      buyer
    };
  }

  it("Should create agent with Uniswap router set", async function () {
    const { easyv, agentFactory, creator, mockRouter } = await loadFixture(deployFixture);

    const deposit = ethers.parseEther("6000");
    await easyv.connect(creator).approve(await agentFactory.getAddress(), deposit);

    const tx = await agentFactory.connect(creator).createAgent("Test Agent", "TEST", deposit);
    const receipt = await tx.wait();

    // Get the created agent address from events
    const event = receipt?.logs.find(log => {
      try {
        return agentFactory.interface.parseLog(log)?.name === "AgentCreated";
      } catch {
        return false;
      }
    });

    expect(event).to.not.be.undefined;
    
    if (event) {
      const parsedEvent = agentFactory.interface.parseLog(event);
      const agentAddress = parsedEvent?.args[0];

      // Check that the bonding curve has the router set
      const bondingCurve = await ethers.getContractAt("BondingCurve", agentAddress);
      expect(await bondingCurve.uniswapRouter()).to.equal(await mockRouter.getAddress());
    }
  });

  it("Should graduate and emit Graduate event with Uniswap pair info", async function () {
    const { easyv, agentFactory, creator, buyer } = await loadFixture(deployFixture);

    // Create agent
    const deposit = ethers.parseEther("6000");
    await easyv.connect(creator).approve(await agentFactory.getAddress(), deposit);
    
    const tx = await agentFactory.connect(creator).createAgent("Test Agent", "TEST", deposit);
    const receipt = await tx.wait();
    
    const event = receipt?.logs.find(log => {
      try {
        return agentFactory.interface.parseLog(log)?.name === "AgentCreated";
      } catch {
        return false;
      }
    });

    const parsedEvent = agentFactory.interface.parseLog(event!);
    const agentAddress = parsedEvent?.args[0];
    const bondingCurve = await ethers.getContractAt("BondingCurve", agentAddress);

    // Buy enough to trigger graduation
    const graduationThreshold = await bondingCurve.GRADUATION_THRESHOLD();
    const remainingToGraduate = graduationThreshold - deposit;
    
    await easyv.connect(buyer).approve(agentAddress, remainingToGraduate);
    
    // This should trigger graduation
    const buyTx = await bondingCurve.connect(buyer).buy(remainingToGraduate, 0);
    const buyReceipt = await buyTx.wait();

    // Check for Graduate event
    const graduateEvent = buyReceipt?.logs.find(log => {
      try {
        return bondingCurve.interface.parseLog(log)?.name === "Graduate";
      } catch {
        return false;
      }
    });

    expect(graduateEvent).to.not.be.undefined;
    
    if (graduateEvent) {
      const parsedGraduateEvent = bondingCurve.interface.parseLog(graduateEvent);
      expect(parsedGraduateEvent?.args.length).to.equal(3); // externalToken, uniswapPair, liquidityTokens
    }

    // Verify graduation state
    expect(await bondingCurve.graduated()).to.be.true;
    expect(await bondingCurve.eToken()).to.not.equal(ethers.ZeroAddress);
    expect(await bondingCurve.uniswapPair()).to.not.equal(ethers.ZeroAddress);
  });

  it("Should allow redemption after graduation", async function () {
    const { easyv, agentFactory, creator, buyer } = await loadFixture(deployFixture);

    // Create and graduate agent (similar to previous test)
    const deposit = ethers.parseEther("6000");
    await easyv.connect(creator).approve(await agentFactory.getAddress(), deposit);
    
    const tx = await agentFactory.connect(creator).createAgent("Test Agent", "TEST", deposit);
    const receipt = await tx.wait();
    
    const event = receipt?.logs.find(log => {
      try {
        return agentFactory.interface.parseLog(log)?.name === "AgentCreated";
      } catch {
        return false;
      }
    });

    const parsedEvent = agentFactory.interface.parseLog(event!);
    const agentAddress = parsedEvent?.args[0];
    const bondingCurve = await ethers.getContractAt("BondingCurve", agentAddress);

    const graduationThreshold = await bondingCurve.GRADUATION_THRESHOLD();
    const remainingToGraduate = graduationThreshold - deposit;
    
    await easyv.connect(buyer).approve(agentAddress, remainingToGraduate);
    await bondingCurve.connect(buyer).buy(remainingToGraduate, 0);

    // Now test redemption
    const iTokenAddress = await bondingCurve.iToken();
    const iToken = await ethers.getContractAt("AgentTokenInternal", iTokenAddress);
    
    const buyerBalance = await iToken.balanceOf(buyer.address);
    expect(buyerBalance).to.be.gt(0);

    // Approve bonding curve to burn tokens
    await iToken.connect(buyer).approve(agentAddress, buyerBalance);
    
    // Redeem internal tokens for external tokens
    await expect(bondingCurve.connect(buyer).redeem(buyerBalance))
      .to.emit(bondingCurve, "Redeem")
      .withArgs(buyer.address, buyerBalance);

    // Check that buyer now has external tokens
    const eTokenAddress = await bondingCurve.eToken();
    const eToken = await ethers.getContractAt("AgentTokenExternal", eTokenAddress);
    
    expect(await eToken.balanceOf(buyer.address)).to.equal(buyerBalance);
    expect(await iToken.balanceOf(buyer.address)).to.equal(0);
  });
}); 