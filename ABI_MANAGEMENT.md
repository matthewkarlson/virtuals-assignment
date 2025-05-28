# Modern ABI Management with TypeChain

This project uses **TypeChain** for automatic ABI generation and type-safe smart contract interactions. This approach eliminates the need to manually write ABIs and provides full TypeScript support.

## How It Works

1. **Automatic Generation**: When you compile contracts with `npm run compile`, TypeChain automatically generates TypeScript types from your contract ABIs.

2. **ABI Copying**: A script automatically copies ABIs from Hardhat artifacts to the Next.js project for easy importing.

3. **Type Safety**: All contract interactions are fully typed, providing autocomplete and compile-time error checking.

4. **Always Up-to-Date**: ABIs are automatically extracted from compiled artifacts, so they're always in sync with your contracts.

## Benefits Over Manual ABIs

### ❌ Old Approach (Manual ABIs)
```typescript
// Error-prone manual ABI definitions
const ABIS = {
  AgentFactory: [
    "function createAgent(string name, string symbol, uint256 deposit) returns (address)",
    // Easy to make typos, miss functions, or get types wrong
    // Prone to getting out of sync with actual contracts
    // No compile-time type checking
  ]
}

// No type safety
const contract = new ethers.Contract(address, ABIS.AgentFactory, provider);
const result = await contract.createAgent("name", "symbol", 1000); // No autocomplete or type checking
```

### ✅ New Approach (TypeChain + Auto-Copy)
```typescript
// Automatically generated, always accurate
import { getAgentFactoryContract } from './lib/contractHelpers';

// Full type safety and autocomplete
const agentFactory = getAgentFactoryContract(provider);
const tx = await agentFactory.createAgent("MyAgent", "MA", minDeposit);
//                            ^^^^^^^^^ ^^^^ ^^^^^^^^^^
//                            All parameters are type-checked!
```

## Workflow

### 1. Compile Contracts and Generate Types
```bash
npm run compile
```
This command:
- Compiles Solidity contracts with Hardhat
- Generates TypeScript types with TypeChain
- Copies ABIs to the Next.js project

### 2. Import and Use Contracts
```typescript
import { getAgentFactoryContract, getBondingCurveContract } from './lib/contractHelpers';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider("http://localhost:8545");

// Get typed contract instances
const agentFactory = getAgentFactoryContract(provider);
const bondingCurve = getBondingCurveContract(curveAddress, provider);

// All methods are typed and provide autocomplete
const minDeposit = await agentFactory.MIN_INITIAL_DEPOSIT();
const agentCount = await agentFactory.agentCount();

// Function parameters are type-checked
const tx = await agentFactory.createAgent("MyAgent", "MA", minDeposit);

// Events are also typed
agentFactory.on("AgentCreated", (curve, creator, name, symbol) => {
  console.log(`Agent ${name} (${symbol}) created at ${curve}`);
});
```

### 3. Available Contract Helpers

- `getEasyVContract(signerOrProvider)` - ERC20 token contract
- `getAgentFactoryContract(signerOrProvider)` - Factory for creating agents
- `getBondingCurveContract(address, signerOrProvider)` - Individual bonding curve
- `getAgentTokenExternalContract(address, signerOrProvider)` - External agent token
- `getAgentTokenInternalContract(address, signerOrProvider)` - Internal agent token

## File Structure

```
├── typechain-types/           # Generated TypeScript types (auto-generated)
│   ├── contracts/
│   │   ├── AgentFactory.ts
│   │   ├── BondingCurve.ts
│   │   └── ...
│   └── factories/             # Contract factory classes
├── artifacts/                 # Compiled contract artifacts (auto-generated)
├── scripts/
│   └── copy-abis.js          # Script to copy ABIs to frontend
├── virtuals-ui/src/lib/
│   ├── abis/                 # Copied ABIs for Next.js (auto-generated)
│   ├── contracts.ts          # Contract addresses and ABI exports
│   └── contractHelpers.ts    # Type-safe contract factory functions
```

## Development Workflow

1. **Modify Contracts**: Make changes to your Solidity contracts
2. **Compile**: Run `npm run compile` to regenerate types and copy ABIs
3. **Use**: Import and use the updated typed contracts in your frontend

## Scripts

- `npm run compile` - Compile contracts, generate types, and copy ABIs
- `npm run typechain` - Same as compile (alias)
- `npm run copy-abis` - Only copy ABIs (useful if contracts haven't changed)
- `npm run clean` - Clean compiled artifacts

## Contract Address Management

### ⚠️ Important: Keep Addresses Consistent

Make sure contract addresses are consistent across all files:

**Frontend (`virtuals-ui/src/lib/contracts.ts`)**:
```typescript
export const CONTRACTS = {
  EASYV: "0x43F48c3DC6df4674219923F2d4f8880d5E3CCC4c",
  AGENT_FACTORY: "0x512F94E0a875516da53e2e59aC1995d6B2fbF781",
  BONDING_CURVE_IMPL: "0x292E27B2b439Bb485265aBA27c131247B13593c1",
} as const;
```

**Scripts (`scripts/createAgent.ts`, etc.)**:
```typescript
const EASYV_ADDRESS = "0x43F48c3DC6df4674219923F2d4f8880d5E3CCC4c";
const AGENT_FACTORY_ADDRESS = "0x512F94E0a875516da53e2e59aC1995d6B2fbF781";
```

### Getting Deployed Addresses

After deployment, you can find addresses in:
1. Hardhat Ignition deployment artifacts
2. Console output during deployment
3. Hardhat console: `npx hardhat console --network localhost`

## Alternative Approaches

### 1. ABIType + Viem (Modern Alternative)
If you prefer a more modern approach without code generation:

```typescript
import { createPublicClient, http } from 'viem';
import type { Abi } from 'abitype';

// ABIType provides compile-time ABI parsing
const abi = [...] as const; // Your ABI
const client = createPublicClient({ transport: http() });

// Viem provides type inference from the ABI
const result = await client.readContract({
  address: '0x...',
  abi,
  functionName: 'balanceOf', // Autocompleted and type-checked
  args: ['0x...']
});
```

### 2. Etherscan/Sourcify Integration
For external contracts, you can use tools like `eth-sdk` that automatically fetch ABIs:

```bash
npx eth-sdk init
# Configure contracts in eth-sdk.config.ts
npx eth-sdk
```

## Best Practices

1. **Never commit generated files**: Add `typechain-types/`, `artifacts/`, and `virtuals-ui/src/lib/abis/` to `.gitignore`
2. **Regenerate after contract changes**: Always run `npm run compile` after modifying contracts
3. **Use the helper functions**: Import from `contractHelpers.ts` for consistent typing
4. **Keep addresses consistent**: Update all files when contract addresses change
5. **Type your components**: Use the generated types in your React components for full type safety

## Troubleshooting

### "Unrecognized selector" errors?
This usually means contract addresses are inconsistent. Check:
1. Frontend contract addresses in `virtuals-ui/src/lib/contracts.ts`
2. Script addresses in `scripts/*.ts`
3. Actual deployed addresses from Hardhat

### Types not updating?
```bash
npm run clean && npm run compile
```

### Import errors?
Make sure the relative paths in imports match your project structure.

### Missing contracts?
Ensure your contracts are in the `contracts/` directory and compile successfully.

### Next.js can't find ABIs?
The ABI copying script should handle this automatically. If issues persist:
```bash
npm run copy-abis
``` 