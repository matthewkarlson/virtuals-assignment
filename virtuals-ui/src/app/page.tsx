'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { web3Service } from '@/lib/web3';
import { ABIS } from '@/lib/contracts';
import Link from 'next/link';

interface Token {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  trading: boolean;
  tradingOnUniswap: boolean;
  description: string;
  image: string;
  userBalance: string;
}

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [virtualBalance, setVirtualBalance] = useState('0');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [graduatedTokens, setGraduatedTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<{ chainId: number; name: string; isCorrect: boolean } | null>(null);
  
  // Create token form
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [deposit, setDeposit] = useState('6000');
  const [buyAmount, setBuyAmount] = useState('');

  const checkConnection = useCallback(async () => {
    try {
      if (web3Service.isConnected()) {
        const addr = await web3Service.getAddress();
        setAddress(addr);
        setIsConnected(true);
        await loadData();
      }
    } catch (error) {
      console.error('Connection check failed:', error);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const connectWallet = async () => {
    try {
      setLoading(true);
      console.log('🔗 loading set to true: connectWallet')
      
      console.log('🔗 Calling web3Service.connect()...');
      const addr = await web3Service.connect();
      console.log('✅ web3Service.connect() completed, address:', addr);
      
      setAddress(addr);
      setIsConnected(true);
      
      console.log('📊 Calling loadData()...');
      await loadData();
      console.log('✅ loadData() completed');
      
      setLoading(false);
      console.log('🔄 loading set to false: connectWallet')
    } catch (error) {
      console.error('❌ Failed to connect wallet:', error);
      alert('Failed to connect wallet. Make sure MetaMask is installed and connected to Hardhat network.');
    } finally {
      setLoading(false);
      console.log('🔄 loading set to false in finally block')
    }
  };

  const loadData = async () => {
    try {
      console.log('📊 loadData: Getting current address...');
      // Get current address
      const currentAddress = await web3Service.getAddress();
      console.log('✅ loadData: Got address:', currentAddress);
      
      console.log('🌐 loadData: Checking network status...');
      // Check network status
      const network = await web3Service.getCurrentNetwork();
      console.log('✅ loadData: Network status:', network);
      setNetworkStatus(network);
      
      if (!network.isCorrect) {
        console.warn(`⚠️ Wrong network detected. Expected Chain ID: 31337, Current: ${network.chainId}`);
        return; // Don't try to load contract data on wrong network
      }
      
      console.log('💰 loadData: Loading VIRTUAL balance...');
      // Load VIRTUAL balance - try read-only provider
      try {
        const { ethers } = await import('ethers');
        
        console.log('💰 Creating read-only provider...');
        // Use read-only JSON-RPC provider instead of browser provider
        const provider = new ethers.JsonRpcProvider('http://localhost:8545');
        
        // Simple ERC20 ABI for balanceOf
        const erc20ABI = [
          "function balanceOf(address owner) view returns (uint256)"
        ];
        
        const contract = new ethers.Contract(
          "0x292E27B2b439Bb485265aBA27c131247B13593c1", 
          erc20ABI, 
          provider
        );
        
        console.log('💰 Calling balanceOf with read-only provider...');
        const balance = await contract.balanceOf(currentAddress);
        console.log('✅ loadData: Got balance:', ethers.formatEther(balance));
        setVirtualBalance(ethers.formatEther(balance));
      } catch (error) {
        console.error('❌ Read-only balance call failed:', error);
        // Fallback to showing 0 balance
        setVirtualBalance('0');
      }

      console.log('🎯 loadData: Loading tokens...');
      // Load tokens
      await loadTokens();
      console.log('✅ loadData: Tokens loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load data:', error);
    }
  };

  const loadTokens = async () => {
    try {
      console.log('🎯 loadTokens: Starting...');
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        console.warn('⚠️ No wallet address available, skipping balance checks');
        return;
      }
      console.log('✅ loadTokens: Current address:', currentAddress);
      
      // Use read-only provider for all contract reads
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider('http://localhost:8545');
      
      console.log('🏭 loadTokens: Getting bonding contract...');
      const bondingContract = new ethers.Contract(
        "0x0454a4798602babb16529F49920E8B2f4a747Bb2",
        ABIS.Bonding,
        provider
      );
      
      console.log('🏭 loadTokens: Getting factory address...');
      // Get factory contract to access pairs list
      const factoryAddress = await bondingContract.factory();
      console.log('✅ loadTokens: Factory address:', factoryAddress);
      
      console.log('🏭 loadTokens: Getting factory contract...');
      const factoryContract = new ethers.Contract(factoryAddress, ABIS.FFactory, provider);
      
      console.log('📊 loadTokens: Getting pair count...');
      // Get total number of pairs (each pair corresponds to a launched token)
      const pairCount = await factoryContract.allPairsLength();
      console.log('✅ loadTokens: Found', pairCount.toString(), 'pairs');
      
      const allTokenData: Token[] = [];
      for (let i = 0; i < pairCount; i++) {
        try {
          // Get the pair address
          const pairAddress = await factoryContract.pairs(i);
          
          // Get the pair contract to find out what tokens it contains
          const pairContract = new ethers.Contract(pairAddress, ABIS.FPair, provider);
          const [tokenA, tokenB] = await Promise.all([
            pairContract.tokenA(),
            pairContract.tokenB()
          ]);
          
          // The VIRTUAL token (EasyV) is one of them, the other is our launched token
          const virtualAddress = "0x292E27B2b439Bb485265aBA27c131247B13593c1"; // EasyV address
          const tokenAddress = tokenA.toLowerCase() === virtualAddress.toLowerCase() ? tokenB : tokenA;
          
          // Get token info from bonding contract
          const tokenInfo = await bondingContract.tokenInfo(tokenAddress);
          
          // Get the FERC20 token contract
          const tokenContract = new ethers.Contract(tokenAddress, ABIS.FERC20, provider);
          const [name, symbol] = await Promise.all([
            tokenContract.name(),
            tokenContract.symbol(),
          ]);

          // Get user's token balance
          const userBalance = await tokenContract.balanceOf(currentAddress);

          allTokenData.push({
            address: tokenAddress,
            name: name.replace('fun ', ''), // Remove "fun " prefix
            symbol: symbol,
            creator: tokenInfo.creator,
            trading: tokenInfo.trading,
            tradingOnUniswap: tokenInfo.tradingOnUniswap,
            description: tokenInfo.description,
            image: tokenInfo.image,
            userBalance: ethers.formatEther(userBalance),
          });
        } catch (error) {
          console.error(`Failed to load token from pair ${i}:`, error);
        }
      }
      
      // Filter tokens: only show tokens that are still trading on bonding curve
      const activeTokens = allTokenData.filter(token => token.trading && !token.tradingOnUniswap);
      const graduatedTokens = allTokenData.filter(token => token.tradingOnUniswap);
      
      console.log(`📊 Token Summary: ${activeTokens.length} active on bonding curve, ${graduatedTokens.length} graduated to Uniswap`);
      
      setTokens(activeTokens);
      setGraduatedTokens(graduatedTokens);
    } catch (error) {
      console.error('Failed to load tokens:', error);
    }
  };

  const createToken = async () => {
    if (!tokenName || !tokenSymbol) {
      alert('Please enter token name and symbol');
      return;
    }

    try {
      setLoading(true);
      console.log('🚀 createToken: Starting token creation...');
      
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        alert('Wallet not connected');
        return;
      }
      
      const depositAmount = web3Service.parseEther(deposit);
      console.log('💰 createToken: Deposit amount:', depositAmount.toString());

      // Check balance using read-only provider
      console.log('💰 createToken: Checking VIRTUAL balance...');
      const { ethers } = await import('ethers');
      const readProvider = new ethers.JsonRpcProvider('http://localhost:8545');
      const erc20ABI = ["function balanceOf(address owner) view returns (uint256)"];
      const virtualReadContract = new ethers.Contract(
        "0x292E27B2b439Bb485265aBA27c131247B13593c1",
        erc20ABI,
        readProvider
      );
      
      const balance = await virtualReadContract.balanceOf(currentAddress);
      console.log('✅ createToken: Current balance:', ethers.formatEther(balance));
      
      if (balance < depositAmount) {
        alert(`Insufficient VIRTUAL balance. You have ${ethers.formatEther(balance)} but need ${ethers.formatEther(depositAmount)}`);
        return;
      }

      // Now use MetaMask contracts for transactions
      console.log('🔗 createToken: Getting MetaMask contracts for transactions...');
      const virtualContract = web3Service.getEasyVContract();
      const bondingContract = web3Service.getBondingContract();

      // Approve bonding contract to spend VIRTUAL
      console.log('✅ createToken: Approving VIRTUAL spend...');
      const approveTx = await virtualContract.approve(bondingContract.target, depositAmount);
      console.log('📝 createToken: Approval transaction sent, waiting for confirmation...');
      await approveTx.wait();
      console.log('✅ createToken: Approval confirmed');

      // Launch token directly through bonding contract
      console.log('🚀 createToken: Launching token...');
      const launchTx = await bondingContract.launch(
        tokenName,
        tokenSymbol,
        [1], // Default cores array
        '', // Description
        '', // Image
        ['', '', '', ''], // URLs array
        depositAmount
      );
      console.log('📝 createToken: Launch transaction sent, waiting for confirmation...');
      await launchTx.wait();
      console.log('🎉 createToken: Token launched successfully!');

      alert('Token launched successfully!');
      
      // Clear form and reload data
      setTokenName('');
      setTokenSymbol('');
      setDeposit('6000');
      console.log('🔄 createToken: Reloading data...');
      await loadData();
      console.log('✅ createToken: Data reloaded');
    } catch (error) {
      console.error('❌ createToken: Failed to create token:', error);
      alert('Failed to create token: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
      console.log('🔄 createToken: Loading set to false')
    }
  };

  const buyTokens = async (tokenAddress: string, amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      console.log('loading set to true')
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        alert('Wallet not connected');
        return;
      }
      
      const virtualContract = web3Service.getEasyVContract();
      const bondingContract = web3Service.getBondingContract();
      const buyAmount = web3Service.parseEther(amount);

      // Check balance
      const balance = await virtualContract.balanceOf(currentAddress);
      if (balance < buyAmount) {
        alert('Insufficient VIRTUAL balance');
        return;
      }

      // Approve bonding contract to spend VIRTUAL
      console.log('Approving VIRTUAL spend...');
      const approveTx = await virtualContract.approve(bondingContract.target, buyAmount);
      await approveTx.wait();

      // Buy tokens
      console.log('Buying tokens...');
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
      const buyTx = await bondingContract.buy(buyAmount, tokenAddress, 0, deadline);
      await buyTx.wait();

      alert('Tokens purchased successfully!');
      await loadData();
    } catch (error) {
      console.error('Failed to buy tokens:', error);
      alert('Failed to buy tokens: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
      console.log('loading set to false')
    }
  };

  const sellTokens = async (tokenAddress: string, amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      console.log('loading set to true')
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        alert('Wallet not connected');
        return;
      }
      
      const bondingContract = web3Service.getBondingContract();
      const tokenContract = web3Service.getFERC20Contract(tokenAddress);
      const sellAmount = web3Service.parseEther(amount);

      // Check token balance
      const tokenBalance = await tokenContract.balanceOf(currentAddress);
      if (tokenBalance < sellAmount) {
        alert('Insufficient token balance');
        return;
      }

      // Approve bonding contract to spend tokens
      console.log('Approving token spend...');
      const approveTx = await tokenContract.approve(bondingContract.target, sellAmount);
      await approveTx.wait();

      // Sell tokens
      console.log('Selling tokens...');
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
      const sellTx = await bondingContract.sell(sellAmount, tokenAddress, 0, deadline);
      await sellTx.wait();

      alert('Tokens sold successfully!');
      await loadData();
    } catch (error) {
      console.error('Failed to sell tokens:', error);
      alert('Failed to sell tokens: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
      console.log('loading set to false')
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">EasyV Agent Launcher</CardTitle>
            <CardDescription>
              Launch and trade tokens on the fun system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={connectWallet} className="w-full" disabled={loading}>
              {loading ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">EasyV</h1>
          <p className="text-lg text-gray-600">Launch and trade tokens on the fun system</p>
        </div>

        {/* Network Status */}
        {networkStatus && (
          <div className="mb-6 text-center">
            <Badge variant={networkStatus.isCorrect ? "default" : "destructive"}>
              {networkStatus.name} (Chain ID: {networkStatus.chainId})
            </Badge>
          </div>
        )}

        {/* User Info */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Wallet Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Address</Label>
                <p className="text-sm font-mono bg-gray-100 p-2 rounded">{address}</p>
              </div>
              <div>
                <Label>EasyV Balance</Label>
                <p className="text-lg font-bold">{virtualBalance} EASYV</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Create Token */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Launch New Token</CardTitle>
            <CardDescription>
              Create a new token on the fun system (Minimum: 6,000 EASYV)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label htmlFor="tokenName">Token Name</Label>
                <Input
                  id="tokenName"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="My Token"
                />
              </div>
              <div>
                <Label htmlFor="tokenSymbol">Symbol</Label>
                <Input
                  id="tokenSymbol"
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value)}
                  placeholder="MTK"
                />
              </div>
              <div>
                <Label htmlFor="deposit">Initial Purchase (EASYV)</Label>
                <Input
                  id="deposit"
                  type="number"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="6000"
                  min="6000"
                />
              </div>
            </div>
            <Button onClick={createToken} disabled={loading || !tokenName || !tokenSymbol}>
              {loading ? 'Creating...' : 'Launch Token'}
            </Button>
          </CardContent>
        </Card>

        {/* Tokens List */}
        <Card>
          <CardHeader>
            <CardTitle>Active Bonding Curve Tokens</CardTitle>
            <CardDescription>
              Buy and sell tokens on the bonding curve. Tokens graduate to Uniswap when they reach the threshold.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tokens.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No active tokens on bonding curve</p>
            ) : (
              <div className="space-y-4">
                {tokens.map((token) => (
                  <div key={token.address} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold">{token.name} ({token.symbol})</h3>
                        <p className="text-sm text-gray-600 font-mono">{token.address}</p>
                        <p className="text-sm text-gray-600">Creator: {token.creator}</p>
                        {token.description && (
                          <p className="text-sm text-gray-600 mt-1">{token.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={token.trading ? "default" : "secondary"}>
                          {token.trading ? "Trading" : "Not Trading"}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <Label>Your Balance: {token.userBalance} {token.symbol}</Label>
                    </div>

                    {token.trading && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Buy Tokens (EASYV)</Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder="Amount"
                              value={buyAmount}
                              onChange={(e) => setBuyAmount(e.target.value)}
                            />
                            <Button 
                              onClick={() => buyTokens(token.address, buyAmount)}
                              disabled={loading || !buyAmount}
                            >
                              Buy
                            </Button>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Sell Tokens</Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder="Amount"
                              value={buyAmount}
                              onChange={(e) => setBuyAmount(e.target.value)}
                            />
                            <Button 
                              onClick={() => sellTokens(token.address, buyAmount)}
                              disabled={loading || !buyAmount}
                              variant="outline"
                            >
                              Sell
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Graduated Tokens Summary */}
        {graduatedTokens.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Graduated Tokens</CardTitle>
              <CardDescription>
                These tokens have graduated from the bonding curve and now trade on Uniswap
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-lg font-semibold">🎉 {graduatedTokens.length} token{graduatedTokens.length !== 1 ? 's' : ''} graduated to Uniswap!</p>
                {graduatedTokens.map((token) => (
                  <div key={token.address} className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                    <div>
                      <span className="font-bold">{token.name} ({token.symbol})</span>
                      <span className="text-sm text-gray-600 ml-2">Balance: {token.userBalance}</span>
                    </div>
                    <Badge variant="outline" className="bg-green-100">
                      Trading on Uniswap
                    </Badge>
                  </div>
                ))}
                <div className="mt-4">
                  <Link href="/graduated" className="text-blue-600 hover:underline">
                    View all graduated tokens →
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
