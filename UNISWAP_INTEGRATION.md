# Uniswap V2 Integration

This document describes the Uniswap V2 integration added to the bonding curve system.

## Overview

When a bonding curve graduates (reaches the `GRADUATION_THRESHOLD`), the system now:

1. **Creates an external ERC-20 token** - This is the final tradeable token
2. **Creates a Uniswap V2 pair** - Between the external token and VIRTUAL (EasyV)
3. **Adds initial liquidity** - Using 50% of total token supply and all raised VIRTUAL
4. **Gives LP tokens to creator** - The agent creator receives the liquidity provider tokens

## Key Components

### Interfaces
- `IUniswapV2Factory.sol` - Factory interface for creating pairs
- `IUniswapV2Router02.sol` - Router interface for adding liquidity
- `IUniswapV2Pair.sol` - Pair interface for liquidity pools

### Modified Contracts

#### BondingCurve.sol
- Added Uniswap router and factory references
- Modified `_graduate()` function to create pair and add liquidity
- Added `setUniswapRouter()` function for configuration
- Updated `Graduate` event to include pair address and liquidity tokens

#### AgentFactory.sol
- Added `uniswapRouter` state variable
- Added `setUniswapRouter()` function for owner configuration
- Modified `createAgent()` to set router on new bonding curves

## Graduation Process

When `virtualRaised >= GRADUATION_THRESHOLD`:

1. **Deploy External Token**: Create `AgentTokenExternal` with full supply
2. **Create Uniswap Pair**: Call `factory.createPair(externalToken, VIRTUAL)`
3. **Calculate Liquidity**: 
   - Token liquidity: 50% of total supply (500M tokens)
   - VIRTUAL liquidity: All raised VIRTUAL (42,000 VIRTUAL)
4. **Add Liquidity**: Call `router.addLiquidity()` with calculated amounts
5. **Transfer LP Tokens**: Send LP tokens to the agent creator

## Configuration

### Deployment
1. Deploy contracts using `FullDeploymentWithUniswap.ts`
2. Set Uniswap router address via `agentFactory.setUniswapRouter(routerAddress)`

### Router Addresses
- **Mainnet**: `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`
- **Goerli**: `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`
- **Sepolia**: `0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008`

## Events

### Graduate Event
```solidity
event Graduate(address externalToken, address uniswapPair, uint256 liquidityTokens);
```

Emitted when a bonding curve graduates, providing:
- `externalToken`: Address of the created ERC-20 token
- `uniswapPair`: Address of the created Uniswap V2 pair
- `liquidityTokens`: Amount of LP tokens minted

## Testing

The system includes comprehensive tests in `test/BondingCurveUniswap.test.ts`:

1. **Router Configuration**: Verifies router is set correctly on new curves
2. **Graduation Process**: Tests the full graduation flow with Uniswap integration
3. **Token Redemption**: Ensures users can redeem internal tokens for external tokens

### Mock Contracts
For testing, `MockUniswapRouter.sol` provides a simplified implementation that:
- Creates mock pairs
- Simulates liquidity addition
- Returns mock liquidity tokens

## Usage Example

```typescript
// Deploy with Uniswap integration
const deployment = await ignition.deploy(FullDeploymentWithUniswap, {
  parameters: {
    FullDeploymentWithUniswap: {
      uniswapRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" // Mainnet router
    }
  }
});

// Create an agent
const tx = await agentFactory.createAgent("My Agent", "AGENT", ethers.parseEther("6000"));

// Buy tokens to trigger graduation
const bondingCurve = await ethers.getContractAt("BondingCurve", agentAddress);
await easyv.approve(agentAddress, ethers.parseEther("36000"));
await bondingCurve.buy(ethers.parseEther("36000"), 0);

// After graduation, tokens are tradeable on Uniswap
const pairAddress = await bondingCurve.uniswapPair();
console.log("Uniswap pair created at:", pairAddress);
```

## Security Considerations

1. **Router Validation**: Only owner can set the Uniswap router address
2. **Graduation Lock**: Router cannot be changed after graduation
3. **Slippage Protection**: Liquidity addition uses 0 slippage (accepts any amount)
4. **LP Token Ownership**: Creator receives LP tokens, giving them control over liquidity

## Future Enhancements

Potential improvements for future versions:
1. **Configurable Liquidity Ratio**: Allow different token/VIRTUAL ratios
2. **LP Token Distribution**: Split LP tokens between creator and protocol
3. **Fee Integration**: Add protocol fees on Uniswap trades
4. **Multi-DEX Support**: Support for other DEXs beyond Uniswap V2 