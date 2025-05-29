import random
import numpy as np
from dataclasses import dataclass
from typing import List, Tuple
from copy import deepcopy
from bonding_curves import BondingCurve


@dataclass
class Trade:
    """Represents a single trade in the simulation"""
    trade_type: str  # 'buy' or 'sell'
    virtual_amount: float
    token_amount: float
    price: float
    slippage: float
    total_supply: float
    virtual_raised: float
    timestamp: int


@dataclass
class SimulationResult:
    """Results from a single simulation run"""
    trades: List[Trade]
    graduated: bool
    final_price: float
    final_tokens_sold: float
    final_virtual_raised: float
    total_volume: float
    tax_collected: float


class SimulationEngine:
    """Monte Carlo simulation engine for bonding curves"""
    
    def __init__(self, curve: BondingCurve, tax_rate: float = 0.0):
        self.base_curve = curve
        self.tax_rate = tax_rate
        
    def run_simulation(
        self,
        num_trades: int,
        avg_trade_size: float,
        trade_size_std: float,
        sell_probability: float = 0.0,
        whale_probability: float = 0.05,
        whale_multiplier: float = 10.0
    ) -> SimulationResult:
        """
        Run a single simulation with specified parameters
        
        Args:
            num_trades: Number of trades to simulate
            avg_trade_size: Average trade size in VIRTUAL
            trade_size_std: Standard deviation of trade sizes
            sell_probability: Probability of a sell order
            whale_probability: Probability of a whale trade
            whale_multiplier: Multiplier for whale trade sizes
        """
        # Create a fresh copy of the curve for this simulation
        curve = deepcopy(self.base_curve)
        curve.tokens_sold = 0
        curve.virtual_raised = 0
        curve.graduated = False
        
        trades = []
        total_volume = 0
        tax_collected = 0
        
        for i in range(num_trades):
            if curve.graduated:
                break
            
            # Decide if this is a buy or sell
            is_sell = random.random() < sell_probability and curve.tokens_sold > 0
            
            # Determine trade size
            is_whale = random.random() < whale_probability
            
            if is_whale:
                # Whale trade - larger size
                trade_size = abs(np.random.normal(
                    avg_trade_size * whale_multiplier,
                    trade_size_std * whale_multiplier
                ))
            else:
                # Normal trade
                trade_size = abs(np.random.normal(avg_trade_size, trade_size_std))
            
            # Ensure minimum trade size
            trade_size = max(0.1, trade_size)
            
            if is_sell:
                # For sells, we need to convert virtual amount to token amount
                # Use current price as approximation
                current_price = curve.get_price(curve.tokens_sold)
                if current_price > 0:
                    token_amount = trade_size / current_price
                    # Make sure we don't sell more than available
                    token_amount = min(token_amount, curve.tokens_sold * 0.1)  # Max 10% of supply in one trade
                    
                    if token_amount > 0:
                        try:
                            # Get expected price before trade
                            expected_price = curve.get_price(curve.tokens_sold)
                            
                            # Execute sell
                            virtual_out, actual_price = curve.sell(token_amount)
                            
                            # Apply tax on the virtual amount received
                            tax_amount = virtual_out * self.tax_rate
                            net_virtual_out = virtual_out - tax_amount
                            tax_collected += tax_amount
                            
                            # Calculate slippage (for sells, negative slippage is good)
                            if expected_price > 0:
                                slippage = (expected_price - actual_price) / expected_price
                            else:
                                slippage = 0
                            
                            # Record trade
                            trade = Trade(
                                trade_type='sell',
                                virtual_amount=net_virtual_out,
                                token_amount=token_amount,
                                price=actual_price,
                                slippage=slippage,
                                total_supply=curve.tokens_sold,
                                virtual_raised=curve.virtual_raised,
                                timestamp=i
                            )
                            
                            trades.append(trade)
                            total_volume += virtual_out
                            
                        except Exception as e:
                            # Handle any errors in trading
                            continue
            else:
                # Buy logic (existing code)
                # Apply tax
                tax_amount = trade_size * self.tax_rate
                net_trade_size = trade_size - tax_amount
                tax_collected += tax_amount
                
                # Get expected price before trade
                expected_price = curve.get_price(curve.tokens_sold)
                
                try:
                    # Execute trade
                    tokens_out, actual_price = curve.buy(net_trade_size)
                    
                    # Calculate slippage
                    if expected_price > 0:
                        slippage = (actual_price - expected_price) / expected_price
                    else:
                        slippage = 0
                    
                    # Record trade
                    trade = Trade(
                        trade_type='buy',
                        virtual_amount=trade_size,
                        token_amount=tokens_out,
                        price=actual_price,
                        slippage=slippage,
                        total_supply=curve.tokens_sold,
                        virtual_raised=curve.virtual_raised,
                        timestamp=i
                    )
                    
                    trades.append(trade)
                    total_volume += trade_size
                    
                except Exception as e:
                    # Handle any errors in trading (e.g., exceeding supply)
                    continue
        
        # Get final state
        final_price = curve.get_price(curve.tokens_sold)
        
        return SimulationResult(
            trades=trades,
            graduated=curve.graduated,
            final_price=final_price,
            final_tokens_sold=curve.tokens_sold,
            final_virtual_raised=curve.virtual_raised,
            total_volume=total_volume,
            tax_collected=tax_collected
        )
    
    def run_batch_simulations(
        self,
        num_simulations: int,
        **kwargs
    ) -> List[SimulationResult]:
        """Run multiple simulations with the same parameters"""
        results = []
        
        for _ in range(num_simulations):
            result = self.run_simulation(**kwargs)
            results.append(result)
            
        return results
    
    def analyze_graduation_probability(
        self,
        num_simulations: int,
        trade_params: dict
    ) -> dict:
        """Analyze the probability of graduation under given conditions"""
        results = self.run_batch_simulations(num_simulations, **trade_params)
        
        graduated_count = sum(1 for r in results if r.graduated)
        graduation_rate = graduated_count / num_simulations
        
        # Calculate average metrics
        avg_trades_to_graduation = np.mean([
            len(r.trades) for r in results if r.graduated
        ]) if graduated_count > 0 else 0
        
        avg_final_price = np.mean([r.final_price for r in results])
        avg_volume = np.mean([r.total_volume for r in results])
        
        return {
            'graduation_rate': graduation_rate,
            'graduated_count': graduated_count,
            'avg_trades_to_graduation': avg_trades_to_graduation,
            'avg_final_price': avg_final_price,
            'avg_volume': avg_volume
        }
    
    def simulate_market_scenarios(self) -> dict:
        """Simulate different market scenarios"""
        scenarios = {
            'bear_market': {
                'num_trades': 500,
                'avg_trade_size': 20,
                'trade_size_std': 10,
                'whale_probability': 0.02
            },
            'normal_market': {
                'num_trades': 1000,
                'avg_trade_size': 50,
                'trade_size_std': 20,
                'whale_probability': 0.05
            },
            'bull_market': {
                'num_trades': 2000,
                'avg_trade_size': 100,
                'trade_size_std': 50,
                'whale_probability': 0.1
            },
            'whale_dominated': {
                'num_trades': 500,
                'avg_trade_size': 50,
                'trade_size_std': 30,
                'whale_probability': 0.3,
                'whale_multiplier': 20.0
            }
        }
        
        results = {}
        for scenario_name, params in scenarios.items():
            result = self.run_simulation(**params)
            results[scenario_name] = {
                'graduated': result.graduated,
                'final_price': result.final_price,
                'total_volume': result.total_volume,
                'num_trades': len(result.trades),
                'avg_trade_size': np.mean([t.virtual_amount for t in result.trades]),
                'max_slippage': max([t.slippage for t in result.trades]) if result.trades else 0
            }
            
        return results 