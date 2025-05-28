# Virtuals Protocol Frontend

A modern, clean, and minimal UI for the Virtuals Protocol POC built with Next.js and shadcn/ui.

## Features

- 🔗 **Wallet Connection** - Connect with MetaMask
- 🤖 **Agent Creation** - Deploy new AI agents with bonding curves
- 📊 **Agent Dashboard** - View all active agents and their stats
- 💰 **Token Trading** - Buy tokens on bonding curves
- 🎓 **Graduation Tracking** - See when agents graduate from bonding to AMM
- 🎨 **Modern UI** - Clean, responsive design with shadcn/ui components

## Prerequisites

1. **Hardhat Network Running** - Make sure your Hardhat local network is running with deployed contracts
2. **MetaMask** - Browser extension installed and configured
3. **EasyV Tokens** - You need EasyV tokens to create agents and buy tokens

## Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Configure Contract Addresses**
Update the contract addresses in `src/lib/contracts.ts` with your deployed contract addresses:
```typescript
export const CONTRACTS = {
  EASYV: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
  AGENT_FACTORY: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
  BONDING_CURVE_IMPL: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
} as const;
```

3. **Start Development Server**
```bash
npm run dev
```

4. **Open Browser**
Navigate to [http://localhost:3000](http://localhost:3000)

## MetaMask Configuration

1. **Add Hardhat Network**
   - Network Name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency Symbol: `ETH`

2. **Import Test Account**
   Import one of the Hardhat test accounts using the private key:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```

## Usage

### 1. Connect Wallet
- Click "Connect Wallet" button
- Approve MetaMask connection
- Switch to Hardhat network if prompted

### 2. Create an Agent
- Enter agent name (e.g., "My AI Agent")
- Enter symbol (e.g., "MYAI")
- Set initial deposit (minimum 6,000 EasyV)
- Click "Create Agent"
- Approve transactions in MetaMask

### 3. Buy Tokens
- Find an agent in the "Active Agents" section
- Enter amount of EasyV to spend
- Click "Buy Tokens"
- Approve transactions in MetaMask

### 4. Monitor Progress
- Watch "Virtual Raised" to see progress toward graduation (42,000 EasyV)
- See "Graduated" badge when agent reaches threshold
- Track tokens sold and other metrics

## Project Structure

```
src/
├── app/
│   ├── page.tsx          # Main application page
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── components/ui/        # shadcn/ui components
├── lib/
│   ├── contracts.ts      # Contract addresses and ABIs
│   ├── web3.ts          # Web3 service for blockchain interaction
│   └── utils.ts         # Utility functions
```

## Key Components

### Web3Service (`src/lib/web3.ts`)
- Handles MetaMask connection
- Provides contract interaction methods
- Manages network switching

### Contract Configuration (`src/lib/contracts.ts`)
- Contract addresses
- Simplified ABIs for frontend use
- Network configuration

### Main Page (`src/app/page.tsx`)
- Wallet connection UI
- Agent creation form
- Agent dashboard with trading interface

## Troubleshooting

### "MetaMask not found"
- Install MetaMask browser extension
- Refresh the page

### "Failed to connect wallet"
- Make sure MetaMask is unlocked
- Check that you're on the correct network (Hardhat Local)
- Try refreshing the page

### "Insufficient EasyV balance"
- Make sure you have enough EasyV tokens
- Check that you're using the correct account
- Verify contract addresses are correct

### "Transaction failed"
- Check that Hardhat network is running
- Verify contract addresses in `contracts.ts`
- Check browser console for detailed error messages

## Development

### Adding New Features
1. Update contract ABIs in `src/lib/contracts.ts`
2. Add new methods to `Web3Service` in `src/lib/web3.ts`
3. Update UI components in `src/app/page.tsx`

### Styling
- Uses Tailwind CSS for styling
- shadcn/ui components for consistent design
- Dark mode support included

## Production Deployment

1. **Update Contract Addresses**
   Replace hardcoded addresses with production contract addresses

2. **Configure Network**
   Update `NETWORK_CONFIG` in `contracts.ts` for mainnet/testnet

3. **Build and Deploy**
   ```bash
   npm run build
   npm start
   ```

## Tech Stack

- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **ethers.js** - Ethereum interaction
- **MetaMask** - Wallet connection

## License

MIT License - see LICENSE file for details
