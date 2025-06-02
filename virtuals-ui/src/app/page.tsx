'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { web3Service } from '@/lib/web3';
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
      const addr = await web3Service.connect();
      setAddress(addr);
      setIsConnected(true);
      await loadData();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      alert('Failed to connect wallet. Make sure MetaMask is installed and connected to Hardhat network.');
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      // Get current address
      const currentAddress = await web3Service.getAddress();
      
      // Check network status
      const network = await web3Service.getCurrentNetwork();
      setNetworkStatus(network);
      
      if (!network.isCorrect) {
        console.warn(`Wrong network detected. Expected Chain ID: 31337, Current: ${network.chainId}`);
        return; // Don't try to load contract data on wrong network
      }
      
      // Load VIRTUAL balance
      const virtualContract = web3Service.getEasyVContract();
      const balance = await virtualContract.balanceOf(currentAddress);
      setVirtualBalance(web3Service.formatEther(balance));

      // Load tokens
      await loadTokens();
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const loadTokens = async () => {
    try {
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        console.warn('No wallet address available, skipping balance checks');
        return;
      }
      
      const factoryContract = web3Service.getAgentFactoryContract();
      const bondingContract = web3Service.getBondingContract();
      
      // Get all created tokens from the factory
      const tokenAddresses = await factoryContract.allBondingCurves();
      
      const tokenData: Token[] = [];
      for (const tokenAddress of tokenAddresses) {
        try {
          // Get token info from bonding contract
          const tokenInfo = await bondingContract.tokenInfo(tokenAddress);
          
          // Get the FERC20 token contract
          const tokenContract = web3Service.getFERC20Contract(tokenAddress);
          const [name, symbol] = await Promise.all([
            tokenContract.name(),
            tokenContract.symbol(),
          ]);

          // Get user's token balance
          const userBalance = await tokenContract.balanceOf(currentAddress);

          tokenData.push({
            address: tokenAddress,
            name: name.replace('fun ', ''), // Remove "fun " prefix
            symbol: symbol,
            creator: tokenInfo.creator,
            trading: tokenInfo.trading,
            tradingOnUniswap: tokenInfo.tradingOnUniswap,
            description: tokenInfo.description,
            image: tokenInfo.image,
            userBalance: web3Service.formatEther(userBalance),
          });
        } catch (error) {
          console.error(`Failed to load token ${tokenAddress}:`, error);
        }
      }
      
      setTokens(tokenData);
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
      
      const currentAddress = await web3Service.getAddress();
      if (!currentAddress) {
        alert('Wallet not connected');
        return;
      }
      
      const virtualContract = web3Service.getEasyVContract();
      const factoryContract = web3Service.getAgentFactoryContract();
      const depositAmount = web3Service.parseEther(deposit);

      // Check balance
      const balance = await virtualContract.balanceOf(currentAddress);
      if (balance < depositAmount) {
        alert('Insufficient VIRTUAL balance');
        return;
      }

      // Approve factory to spend VIRTUAL
      console.log('Approving VIRTUAL spend...');
      const approveTx = await virtualContract.approve(factoryContract.target, depositAmount);
      await approveTx.wait();

      // Launch token
      console.log('Launching token...');
      const launchTx = await factoryContract.launch(tokenName, tokenSymbol, depositAmount);
      await launchTx.wait();

      alert('Token launched successfully!');
      
      // Clear form and reload data
      setTokenName('');
      setTokenSymbol('');
      setDeposit('6000');
      await loadData();
    } catch (error) {
      console.error('Failed to create token:', error);
      alert('Failed to create token: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const buyTokens = async (tokenAddress: string, amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      
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
    }
  };

  const sellTokens = async (tokenAddress: string, amount: string) => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      
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
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Virtuals Fun</CardTitle>
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Virtuals Fun</h1>
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
                <Label>VIRTUAL Balance</Label>
                <p className="text-lg font-bold">{virtualBalance} VIRTUAL</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Create Token */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Launch New Token</CardTitle>
            <CardDescription>
              Create a new token on the fun system (Minimum: 6,000 VIRTUAL)
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
                <Label htmlFor="deposit">Initial Purchase (VIRTUAL)</Label>
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
            <CardTitle>Available Tokens</CardTitle>
            <CardDescription>
              Buy and sell tokens on the bonding curve
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tokens.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No tokens available</p>
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
                        {token.tradingOnUniswap && (
                          <Badge variant="outline">Graduated</Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <Label>Your Balance: {token.userBalance} {token.symbol}</Label>
                    </div>

                    {token.trading && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Buy Tokens (VIRTUAL)</Label>
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

                    {token.tradingOnUniswap && (
                      <div className="mt-4 p-3 bg-green-50 rounded">
                        <p className="text-sm text-green-700">
                          🎉 This token has graduated and is now trading on Uniswap!
                        </p>
                        <Link href="/graduated" className="text-sm text-blue-600 hover:underline">
                          View graduated tokens →
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
