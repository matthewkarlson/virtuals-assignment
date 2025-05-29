import numpy as np
from typing import List, Dict, TYPE_CHECKING

if TYPE_CHECKING:
    from simulation import SimulationResult, Trade


def calculate_metrics(result: 'SimulationResult') -> Dict[str, float]:
    """
    Calculate various metrics from a simulation result
    
    Returns a dictionary containing:
    - volatility: Price volatility (standard deviation of returns)
    - avg_slippage: Average slippage across all trades
    - max_slippage: Maximum slippage observed
    - liquidity_depth: Measure of how much liquidity is available
    - price_impact: Average price impact per unit of volume
    - market_efficiency: How closely prices follow the theoretical curve
    - graduation_efficiency: How efficiently the curve reached graduation
    """
    
    if not result.trades:
        return {
            'volatility': 0,
            'avg_slippage': 0,
            'max_slippage': 0,
            'liquidity_depth': 0,
            'price_impact': 0,
            'market_efficiency': 0,
            'graduation_efficiency': 0
        }
    
    # Extract price series
    prices = [trade.price for trade in result.trades]
    
    # Calculate volatility (standard deviation of log returns)
    if len(prices) > 1:
        log_returns = np.diff(np.log(prices))
        volatility = np.std(log_returns) if len(log_returns) > 0 else 0
    else:
        volatility = 0
    
    # Calculate slippage metrics
    slippages = [trade.slippage for trade in result.trades]
    avg_slippage = np.mean(slippages)
    max_slippage = max(slippages)
    
    # Calculate liquidity depth score
    # Based on how much volume can be traded with minimal slippage
    low_slippage_trades = [t for t in result.trades if abs(t.slippage) < 0.01]
    liquidity_depth = len(low_slippage_trades) / len(result.trades) * 100 if result.trades else 0
    
    # Calculate price impact
    # Average price change per unit of volume
    if result.total_volume > 0 and len(prices) > 1:
        total_price_change = prices[-1] - prices[0]
        price_impact = total_price_change / result.total_volume
    else:
        price_impact = 0
    
    # Calculate market efficiency
    # How well the market follows the theoretical curve (lower is better)
    price_deviations = []
    for trade in result.trades:
        if trade.virtual_amount > 0:
            expected_impact = trade.slippage
            actual_impact = (trade.price - prices[0]) / prices[0] if prices[0] > 0 else 0
            deviation = abs(actual_impact - expected_impact)
            price_deviations.append(deviation)
    
    market_efficiency = 1 - np.mean(price_deviations) if price_deviations else 1
    
    # Calculate graduation efficiency
    # How close to the threshold the curve got
    if result.graduated:
        graduation_efficiency = 1.0
    else:
        # Fixed: Check if we have trades and avoid divide by zero
        if result.trades and len(result.trades) > 0:
            # Use the simulation's final virtual raised vs initial trade's virtual raised
            # to measure efficiency
            graduation_efficiency = min(1.0, result.final_virtual_raised / (result.trades[0].virtual_raised * len(result.trades)))
        else:
            graduation_efficiency = 0
    
    return {
        'volatility': volatility,
        'avg_slippage': avg_slippage,
        'max_slippage': max_slippage,
        'liquidity_depth': liquidity_depth,
        'price_impact': price_impact,
        'market_efficiency': market_efficiency,
        'graduation_efficiency': graduation_efficiency
    }


def calculate_aggregate_metrics(results: List['SimulationResult']) -> Dict[str, Dict[str, float]]:
    """
    Calculate aggregate metrics across multiple simulation runs
    
    Returns statistics for each metric including mean, std, min, max
    """
    all_metrics = [calculate_metrics(result) for result in results]
    
    aggregate = {}
    metric_names = ['volatility', 'avg_slippage', 'max_slippage', 'liquidity_depth', 
                    'price_impact', 'market_efficiency', 'graduation_efficiency']
    
    for metric in metric_names:
        values = [m[metric] for m in all_metrics]
        aggregate[metric] = {
            'mean': np.mean(values),
            'std': np.std(values),
            'min': np.min(values),
            'max': np.max(values),
            'median': np.median(values)
        }
    
    return aggregate


def analyze_trade_distribution(result: 'SimulationResult') -> Dict[str, float]:
    """Analyze the distribution of trade sizes and patterns"""
    
    if not result.trades:
        return {
            'avg_trade_size': 0,
            'std_trade_size': 0,
            'skewness': 0,
            'kurtosis': 0,
            'whale_trade_ratio': 0
        }
    
    trade_sizes = [trade.virtual_amount for trade in result.trades]
    
    avg_size = np.mean(trade_sizes)
    std_size = np.std(trade_sizes)
    
    # Calculate skewness and kurtosis
    if len(trade_sizes) > 3 and std_size > 0:
        normalized_sizes = (trade_sizes - avg_size) / std_size
        skewness = np.mean(normalized_sizes**3)
        kurtosis = np.mean(normalized_sizes**4) - 3
    else:
        skewness = 0
        kurtosis = 0
    
    # Identify whale trades (> 3 standard deviations from mean)
    if std_size > 0:
        whale_threshold = avg_size + 3 * std_size
        whale_trades = [t for t in trade_sizes if t > whale_threshold]
        whale_trade_ratio = len(whale_trades) / len(trade_sizes)
    else:
        whale_trade_ratio = 0
    
    return {
        'avg_trade_size': avg_size,
        'std_trade_size': std_size,
        'skewness': skewness,
        'kurtosis': kurtosis,
        'whale_trade_ratio': whale_trade_ratio
    }


def calculate_graduation_metrics(results: List['SimulationResult']) -> Dict[str, float]:
    """Calculate metrics specifically related to graduation"""
    
    graduated_results = [r for r in results if r.graduated]
    
    if not graduated_results:
        return {
            'graduation_rate': 0,
            'avg_trades_to_graduation': 0,
            'avg_volume_to_graduation': 0,
            'avg_final_price_graduated': 0,
            'price_multiplier_at_graduation': 0
        }
    
    graduation_rate = len(graduated_results) / len(results)
    avg_trades = np.mean([len(r.trades) for r in graduated_results])
    avg_volume = np.mean([r.total_volume for r in graduated_results])
    avg_final_price = np.mean([r.final_price for r in graduated_results])
    
    # Calculate average price multiplier at graduation
    initial_prices = [r.trades[0].price for r in graduated_results if r.trades]
    final_prices = [r.final_price for r in graduated_results]
    
    if initial_prices:
        price_multipliers = [f/i for f, i in zip(final_prices, initial_prices) if i > 0]
        avg_multiplier = np.mean(price_multipliers) if price_multipliers else 0
    else:
        avg_multiplier = 0
    
    return {
        'graduation_rate': graduation_rate,
        'avg_trades_to_graduation': avg_trades,
        'avg_volume_to_graduation': avg_volume,
        'avg_final_price_graduated': avg_final_price,
        'price_multiplier_at_graduation': avg_multiplier
    } 