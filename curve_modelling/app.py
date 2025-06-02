import time
import streamlit as st
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import math

st.set_page_config(
    page_title="Constant Product Bonding Curve Explorer",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Constants from Bonding.sol
K_CONSTANT = 3_000_000_000_000
DEFAULT_ASSET_RATE = 1000
DEFAULT_INITIAL_SUPPLY = 1_000_000_000  # 1B tokens
DEFAULT_GRAD_THRESHOLD_VIRTUALS = 42000  # Virtuals needed to graduate

def calculate_initial_liquidity(token_supply, asset_rate, k_constant=K_CONSTANT):
    """
    Calculate initial Virtuals liquidity based on Bonding.sol formula:
    k = ((K * 10000) / assetRate)
    liquidity = (((k * 10000) / supply)) / 10000
    """
    k = (k_constant * 10000) / asset_rate
    liquidity = (k * 10000) / token_supply / 10000
    return liquidity

def calculate_price_from_reserves(token_reserve, virtuals_reserve):
    """Calculate price as Virtuals per token from reserves"""
    if token_reserve == 0:
        return 0
    return virtuals_reserve / token_reserve

def calculate_buy_amount_out(amount_virtuals_in, token_reserve, virtuals_reserve):
    """
    Calculate tokens received for Virtuals input using constant product formula
    amount_out = (amount_in * reserve_out) / (reserve_in + amount_in)
    """
    if amount_virtuals_in <= 0:
        return 0
    
    # Add 0.3% fee (like Uniswap)
    amount_virtuals_in_after_fee = amount_virtuals_in * 0.997
    
    amount_token_out = (amount_virtuals_in_after_fee * token_reserve) / (virtuals_reserve + amount_virtuals_in_after_fee)
    return amount_token_out

def calculate_sell_amount_out(amount_token_in, token_reserve, virtuals_reserve):
    """
    Calculate Virtuals received for token input using constant product formula
    """
    if amount_token_in <= 0:
        return 0
    
    # Add 0.3% fee
    amount_token_in_after_fee = amount_token_in * 0.997
    
    amount_virtuals_out = (amount_token_in_after_fee * virtuals_reserve) / (token_reserve + amount_token_in_after_fee)
    return amount_virtuals_out

def calculate_graduation_token_threshold(initial_token_supply, graduation_virtuals_needed, initial_virtuals_liquidity):
    """
    Calculate how many tokens need to be sold to raise the graduation threshold in Virtuals.
    This is when token_reserve drops to a level where we've raised enough Virtuals.
    """
    # We need to find the token reserve level where:
    # virtuals_reserve = initial_virtuals_liquidity + graduation_virtuals_needed
    target_virtuals_reserve = initial_virtuals_liquidity + graduation_virtuals_needed
    
    # Using constant product: token_reserve * virtuals_reserve = k
    k = initial_token_supply * initial_virtuals_liquidity
    target_token_reserve = k / target_virtuals_reserve
    
    return target_token_reserve

def generate_price_curve_data(initial_token_supply, initial_virtuals_liquidity, graduation_token_threshold):
    """Generate price curve data by simulating purchases"""
    # Start with initial reserves
    token_reserve = initial_token_supply
    virtuals_reserve = initial_virtuals_liquidity
    
    # Calculate how many tokens we can sell before graduation
    max_tokens_to_sell = initial_token_supply - graduation_token_threshold
    
    # Simulate different amounts of tokens sold
    tokens_sold_amounts = np.linspace(0, max_tokens_to_sell * 0.99, 100)
    
    prices = []
    market_caps = []
    virtuals_reserves = []
    token_reserves = []
    virtuals_raised = []
    
    for tokens_sold in tokens_sold_amounts:
        # Calculate current reserves after selling this many tokens
        current_token_reserve = initial_token_supply - tokens_sold
        
        # Using constant product to find current virtuals reserve
        k = initial_token_supply * initial_virtuals_liquidity
        current_virtuals_reserve = k / current_token_reserve
        
        # Calculate current price
        price = calculate_price_from_reserves(current_token_reserve, current_virtuals_reserve)
        
        # Market cap is circulating supply * price
        circulating_supply = tokens_sold
        market_cap = circulating_supply * price
        
        # Virtuals raised is the difference from initial
        virtuals_raised_amount = current_virtuals_reserve - initial_virtuals_liquidity
        
        prices.append(price)
        market_caps.append(market_cap)
        virtuals_reserves.append(current_virtuals_reserve)
        token_reserves.append(current_token_reserve)
        virtuals_raised.append(virtuals_raised_amount)
    
    return tokens_sold_amounts, np.array(prices), np.array(market_caps), np.array(virtuals_reserves), np.array(token_reserves), np.array(virtuals_raised)

def generate_hyperbola_data(token_supply, virtuals_liquidity, num_points=200):
    """
    Generate hyperbola data for constant product curve visualization
    x * y = k where x = token_reserve, y = virtuals_reserve
    """
    k = token_supply * virtuals_liquidity
    
    x_min = token_supply * 0.05 * 5000/asset_rate
    x_max = token_supply * 1.5
    x_values = np.linspace(x_min, x_max, num_points)
    
    # Calculate corresponding y values using x * y = k
    y_values = k / x_values
    
    return x_values, y_values, k

# Main App
st.title("🔗 Constant Product Bonding Curve Explorer")
st.markdown("""
Explore the constant product bonding curve mechanism used in the Bonding.sol contract.
This model uses the same mathematical formulas as Uniswap V2 with x * y = k.
""")

# Sidebar for parameters
st.sidebar.header("📊 Curve Parameters")

# Asset Rate with slider
asset_rate = st.sidebar.slider(
    "Asset Rate", 
    min_value=1000, 
    max_value=20000, 
    value=DEFAULT_ASSET_RATE, 
    step=1000,
    help="Lower values create higher initial prices and steeper curves (from Bonding.sol)"
)

# Initial Token Supply
initial_supply_billions = st.sidebar.number_input(
    "Initial Token Supply (Billions)", 
    min_value=0.1, 
    max_value=10.0, 
    value=1.0, 
    step=0.1
)
initial_supply = initial_supply_billions * 1_000_000_000

# Graduation threshold in Virtuals
grad_threshold_virtuals = st.sidebar.number_input(
    "Graduation Threshold (Virtuals to Raise)", 
    min_value=1000, 
    max_value=100000, 
    value=DEFAULT_GRAD_THRESHOLD_VIRTUALS, 
    step=1000,
    help="Amount of Virtuals that need to be raised for graduation to Uniswap"
)

# Calculate initial liquidity using contract formula
initial_virtuals_liquidity = calculate_initial_liquidity(initial_supply, asset_rate)

# Calculate graduation token threshold
graduation_token_threshold = calculate_graduation_token_threshold(
    initial_supply, grad_threshold_virtuals, initial_virtuals_liquidity
)

# Display converted values
initial_price = calculate_price_from_reserves(initial_supply, initial_virtuals_liquidity)

# Add Hyperbola Visualization Section
st.subheader("📐 Constant Product Hyperbola (x × y = k)")
st.markdown("""
This shows the fundamental constant product relationship where **x** = token reserves and **y** = virtuals reserves.
The curve shifts based on the asset rate parameter.
""")

# Create hyperbola plot
hyperbola_col1, hyperbola_col2 = st.columns([3, 1])

with hyperbola_col1:
    # Generate hyperbola data
    x_values, y_values, k_value = generate_hyperbola_data(initial_supply, initial_virtuals_liquidity)
    
    # Create the hyperbola plot
    fig_hyperbola = go.Figure()
    
    # Add the hyperbola curve
    fig_hyperbola.add_trace(
        go.Scatter(
            x=x_values / 1_000_000,  # Convert to millions for readability
            y=y_values,
            mode='lines',
            name=f'x × y = {k_value:.2e}',
            line=dict(color='#1f77b4', width=3)
        )
    )
    
    # Mark the initial point
    fig_hyperbola.add_trace(
        go.Scatter(
            x=[initial_supply / 1_000_000],
            y=[initial_virtuals_liquidity],
            mode='markers',
            name='Initial State',
            marker=dict(color='red', size=12, symbol='circle')
        )
    )
    
    # Mark the graduation point
    fig_hyperbola.add_trace(
        go.Scatter(
            x=[graduation_token_threshold / 1_000_000],
            y=[k_value / graduation_token_threshold],
            mode='markers',
            name='Graduation Point',
            marker=dict(color='green', size=12, symbol='star')
        )
    )
    
    # Add annotation for the graduation region
    grad_virtuals_at_graduation = k_value / graduation_token_threshold
    fig_hyperbola.add_annotation(
        x=graduation_token_threshold / 1_000_000,
        y=grad_virtuals_at_graduation,
        text=f"Graduation<br>({graduation_token_threshold/1_000_000:.0f}M tokens, {grad_virtuals_at_graduation:.0f} virtuals)",
        showarrow=True,
        arrowhead=2,
        arrowcolor="green",
        arrowwidth=2
    )
    
    fig_hyperbola.update_layout(
        title=f"Constant Product Curve (Asset Rate: {asset_rate})",
        xaxis_title="Token Reserves (Millions)",
        yaxis_title="Virtuals Reserves",
        height=500,
        showlegend=True,
        hovermode='closest'
    )
    
    # Add grid for better readability
    fig_hyperbola.update_xaxes(showgrid=True, gridwidth=1, gridcolor='lightgray')
    fig_hyperbola.update_yaxes(showgrid=True, gridwidth=1, gridcolor='lightgray')
    
    st.plotly_chart(fig_hyperbola, use_container_width=True)

with hyperbola_col2:
    st.subheader("🔢 Hyperbola Metrics")
    st.metric("Constant Product (k)", f"{k_value:.2e}")
    st.metric("Initial Point", f"({initial_supply/1_000_000:.0f}M, {initial_virtuals_liquidity:.0f})")
    st.metric("Graduation Point", f"({graduation_token_threshold/1_000_000:.0f}M, {grad_virtuals_at_graduation:.0f})")

# Trading Simulator Section
st.subheader("🔄 Interactive Trading Simulator")
st.markdown("**Make real trades and watch how they affect the curve and reserves in real-time!**")

# Initialize session state for tracking current reserves and transaction history
if 'current_token_reserve' not in st.session_state:
    st.session_state.current_token_reserve = initial_supply
if 'current_virtuals_reserve' not in st.session_state:
    st.session_state.current_virtuals_reserve = initial_virtuals_liquidity
if 'transaction_history' not in st.session_state:
    st.session_state.transaction_history = []
if 'total_tokens_sold' not in st.session_state:
    st.session_state.total_tokens_sold = 0
if 'auto_trading' not in st.session_state:
    st.session_state.auto_trading = False
if 'auto_trade_count' not in st.session_state:
    st.session_state.auto_trade_count = 0

# Auto-trading logic (executes one trade per rerun)
if st.session_state.auto_trading:
    max_trades = 500  # Safety limit
    
    # Check if we should stop auto-trading
    if (st.session_state.current_token_reserve <= graduation_token_threshold or 
        st.session_state.auto_trade_count >= max_trades):
        
        st.session_state.auto_trading = False
        if st.session_state.current_token_reserve <= graduation_token_threshold:
            st.success(f"🎓 Auto-trading completed! Graduated after {st.session_state.auto_trade_count} trades!")
        else:
            st.warning(f"⚠️ Auto-trading stopped after {max_trades} trades (safety limit)")
    else:
        # Execute one trade
        # 75% chance of buying, 25% chance of selling (bias towards graduation)
        is_buy = np.random.random() < 0.60
        
        trade_executed = False
        
        if is_buy:
            # Generate random buy amount using normal distribution
            mean_virtuals = 1000
            std_virtuals = 300
            min_virtuals = 500
            max_virtuals = min(st.session_state.current_virtuals_reserve * 0.2, 20000)
            
            virtuals_to_spend = max(min_virtuals, 
                                  min(max_virtuals, 
                                      np.random.normal(mean_virtuals, std_virtuals)))
            
            # Execute buy trade
            tokens_received = calculate_buy_amount_out(
                virtuals_to_spend, 
                st.session_state.current_token_reserve, 
                st.session_state.current_virtuals_reserve
            )
            
            if tokens_received > 0:
                new_virtuals_reserve = st.session_state.current_virtuals_reserve + virtuals_to_spend
                new_token_reserve = st.session_state.current_token_reserve - tokens_received
                new_price = calculate_price_from_reserves(new_token_reserve, new_virtuals_reserve)
                
                # Update state
                st.session_state.current_virtuals_reserve = new_virtuals_reserve
                st.session_state.current_token_reserve = new_token_reserve
                st.session_state.total_tokens_sold += tokens_received
                
                # Add to history
                st.session_state.transaction_history.append({
                    'type': 'buy',
                    'virtuals_in': virtuals_to_spend,
                    'tokens_out': tokens_received,
                    'price': new_price,
                    'timestamp': len(st.session_state.transaction_history) + 1
                })
                
                trade_executed = True
                st.success(f"🤖 Auto-Buy #{st.session_state.auto_trade_count + 1}: {tokens_received:,.0f} tokens for {virtuals_to_spend:,.0f} Virtuals")
        
        else:
            # Only sell if we have tokens to sell
            if st.session_state.total_tokens_sold > 1000:
                # Generate random sell amount
                max_sellable = st.session_state.total_tokens_sold * 0.3
                mean_tokens = min(1000000, max_sellable * 0.5)
                std_tokens = mean_tokens * 0.4
                min_tokens = 500
                
                tokens_to_sell = max(min_tokens, 
                                   min(max_sellable, 
                                       np.random.normal(mean_tokens, std_tokens)))
                
                # Execute sell trade
                virtuals_received = calculate_sell_amount_out(
                    tokens_to_sell, 
                    st.session_state.current_token_reserve, 
                    st.session_state.current_virtuals_reserve
                )
                
                if virtuals_received > 0:
                    new_virtuals_reserve = st.session_state.current_virtuals_reserve - virtuals_received
                    new_token_reserve = st.session_state.current_token_reserve + tokens_to_sell
                    new_price = calculate_price_from_reserves(new_token_reserve, new_virtuals_reserve)
                    
                    # Update state
                    st.session_state.current_virtuals_reserve = new_virtuals_reserve
                    st.session_state.current_token_reserve = new_token_reserve
                    st.session_state.total_tokens_sold = max(0, st.session_state.total_tokens_sold - tokens_to_sell)
                    
                    # Add to history
                    st.session_state.transaction_history.append({
                        'type': 'sell',
                        'tokens_in': tokens_to_sell,
                        'virtuals_out': virtuals_received,
                        'price': new_price,
                        'timestamp': len(st.session_state.transaction_history) + 1
                    })
                    
                    trade_executed = True
                    st.info(f"🤖 Auto-Sell #{st.session_state.auto_trade_count + 1}: {tokens_to_sell:,.0f} tokens for {virtuals_received:,.2f} Virtuals")
        
        if trade_executed:
            st.session_state.auto_trade_count += 1
            
            # Show updated chart immediately after trade
            st.subheader("📐 Live Trading Updates")
            
            # Create a quick update chart
            fig_update = go.Figure()
            
            # Add the hyperbola curve
            x_values, y_values, k_value = generate_hyperbola_data(initial_supply, initial_virtuals_liquidity)
            fig_update.add_trace(
                go.Scatter(
                    x=x_values / 1_000_000,
                    y=y_values,
                    mode='lines',
                    name='Bonding Curve',
                    line=dict(color='lightblue', width=2)
                )
            )
            
            # Add transaction path
            if len(st.session_state.transaction_history) > 0:
                history_x = [initial_supply / 1_000_000]
                history_y = [initial_virtuals_liquidity]
                
                temp_token_reserve = initial_supply
                temp_virtuals_reserve = initial_virtuals_liquidity
                
                for tx in st.session_state.transaction_history:
                    if tx['type'] == 'buy':
                        temp_virtuals_reserve += tx['virtuals_in']
                        temp_token_reserve -= tx['tokens_out']
                    else:
                        temp_virtuals_reserve -= tx['virtuals_out']
                        temp_token_reserve += tx['tokens_in']
                    
                    history_x.append(temp_token_reserve / 1_000_000)
                    history_y.append(temp_virtuals_reserve)
                
                fig_update.add_trace(
                    go.Scatter(
                        x=history_x,
                        y=history_y,
                        mode='lines+markers',
                        name='Trading Path',
                        line=dict(color='orange', width=4),
                        marker=dict(size=8, color='orange')
                    )
                )
                
                # Highlight current position
                fig_update.add_trace(
                    go.Scatter(
                        x=[st.session_state.current_token_reserve / 1_000_000],
                        y=[st.session_state.current_virtuals_reserve],
                        mode='markers',
                        name='Current Position',
                        marker=dict(color='red', size=20, symbol='circle')
                    )
                )
            
            # Add graduation point
            fig_update.add_trace(
                go.Scatter(
                    x=[graduation_token_threshold / 1_000_000],
                    y=[k_value / graduation_token_threshold],
                    mode='markers',
                    name='Graduation',
                    marker=dict(color='green', size=15, symbol='star')
                )
            )
            
            fig_update.update_layout(
                title=f"🤖 Auto-Trade #{st.session_state.auto_trade_count} - Live Update",
                xaxis_title="Token Reserves (Millions)",
                yaxis_title="Virtuals Reserves",
                height=400,
                showlegend=True
            )
            
            st.plotly_chart(fig_update, use_container_width=True, key=f"auto_trade_{st.session_state.auto_trade_count}")
        
        # Continue auto-trading by triggering a rerun
        time.sleep(0.1)  # Small delay to make it visible
        st.rerun()

# Reset button
col_reset, col_auto, col_status = st.columns([1, 1, 2])
with col_reset:
    if st.button("🔄 Reset to Initial State"):
        st.session_state.current_token_reserve = initial_supply
        st.session_state.current_virtuals_reserve = initial_virtuals_liquidity
        st.session_state.transaction_history = []
        st.session_state.total_tokens_sold = 0
        st.session_state.auto_trading = False
        st.session_state.auto_trade_count = 0
        st.rerun()

with col_auto:
    if not st.session_state.auto_trading:
        if st.button("🎲 Start Auto Trading"):
            st.session_state.auto_trading = True
            st.session_state.auto_trade_count = 0
            st.rerun()
    else:
        # Show stop button and progress during auto-trading
        col_stop, col_progress = st.columns([1, 1])
        with col_stop:
            if st.button("⏹️ Stop Auto Trading"):
                st.session_state.auto_trading = False
                st.rerun()
        with col_progress:
            st.write(f"🤖 Trade #{st.session_state.auto_trade_count}")

with col_status:
    # Check if graduated
    has_graduated = st.session_state.current_token_reserve <= graduation_token_threshold
    if has_graduated:
        st.success("🎓 **GRADUATED TO UNISWAP!** No more trading on bonding curve.")
        if st.session_state.auto_trading:
            st.session_state.auto_trading = False
    else:
        tokens_left_to_grad = st.session_state.current_token_reserve - graduation_token_threshold
        st.info(f"📊 **{tokens_left_to_grad:,.0f}** more tokens need to be sold to graduate")

# Current state display
current_price = calculate_price_from_reserves(st.session_state.current_token_reserve, st.session_state.current_virtuals_reserve)
virtuals_raised_so_far = st.session_state.current_virtuals_reserve - initial_virtuals_liquidity

col_state1, col_state2, col_state3, col_state4 = st.columns(4)
with col_state1:
    st.metric("Current Price", f"{current_price:.8f}", delta=f"{((current_price/initial_price - 1)*100):+.2f}%" if current_price != initial_price else None)
with col_state2:
    st.metric("Token Reserve", f"{st.session_state.current_token_reserve:,.0f}")
with col_state3:
    st.metric("Virtuals Reserve", f"{st.session_state.current_virtuals_reserve:,.0f}")
with col_state4:
    st.metric("Virtuals Raised", f"{virtuals_raised_so_far:,.0f}", delta=f"{(virtuals_raised_so_far/grad_threshold_virtuals*100):.1f}% to grad")

# Updated hyperbola with current position
st.subheader("📐 Live Curve Position")
fig_live = go.Figure()

# Add the hyperbola curve
x_values, y_values, k_value = generate_hyperbola_data(initial_supply, initial_virtuals_liquidity)
fig_live.add_trace(
    go.Scatter(
        x=x_values / 1_000_000,
        y=y_values,
        mode='lines',
        name=f'Bonding Curve (k = {k_value:.2e})',
        line=dict(color='lightblue', width=2, dash='dot')
    )
)

# Mark the initial point
fig_live.add_trace(
    go.Scatter(
        x=[initial_supply / 1_000_000],
        y=[initial_virtuals_liquidity],
        mode='markers',
        name='Initial State',
        marker=dict(color='gray', size=12, symbol='circle')
    )
)

# Mark the graduation point
fig_live.add_trace(
    go.Scatter(
        x=[graduation_token_threshold / 1_000_000],
        y=[k_value / graduation_token_threshold],
        mode='markers',
        name='Graduation Point',
        marker=dict(color='green', size=15, symbol='star')
    )
)

# Add transaction history as a path
if len(st.session_state.transaction_history) > 0:
    history_x = [initial_supply / 1_000_000]
    history_y = [initial_virtuals_liquidity]
    
    temp_token_reserve = initial_supply
    temp_virtuals_reserve = initial_virtuals_liquidity
    
    for tx in st.session_state.transaction_history:
        if tx['type'] == 'buy':
            temp_virtuals_reserve += tx['virtuals_in']
            temp_token_reserve -= tx['tokens_out']
        else:  # sell
            temp_virtuals_reserve -= tx['virtuals_out']
            temp_token_reserve += tx['tokens_in']
        
        history_x.append(temp_token_reserve / 1_000_000)
        history_y.append(temp_virtuals_reserve)
    
    # Add the full transaction path
    fig_live.add_trace(
        go.Scatter(
            x=history_x,
            y=history_y,
            mode='lines+markers',
            name='Trading Path',
            line=dict(color='orange', width=4),
            marker=dict(size=8, color='orange', opacity=0.7)
        )
    )
    
    # Highlight the last few trades with different colors
    if len(history_x) >= 2:
        # Last trade (most recent)
        fig_live.add_trace(
            go.Scatter(
                x=[history_x[-1]],
                y=[history_y[-1]],
                mode='markers',
                name='Latest Trade',
                marker=dict(color='red', size=20, symbol='diamond', 
                          line=dict(width=3, color='white'))
            )
        )
        
        # Second to last trade for direction arrow
        if len(history_x) >= 3:
            fig_live.add_annotation(
                x=history_x[-1],
                y=history_y[-1],
                ax=history_x[-2],
                ay=history_y[-2],
                xref='x',
                yref='y',
                axref='x',
                ayref='y',
                showarrow=True,
                arrowhead=2,
                arrowsize=2,
                arrowwidth=3,
                arrowcolor='red',
                opacity=0.8
            )

# Mark the current position with extra prominence
fig_live.add_trace(
    go.Scatter(
        x=[st.session_state.current_token_reserve / 1_000_000],
        y=[st.session_state.current_virtuals_reserve],
        mode='markers',
        name='Current Position',
        marker=dict(color='red', size=25, symbol='circle', 
                  line=dict(width=4, color='white'),
                  opacity=0.9)
    )
)

# Add auto-trading status indicator
if st.session_state.auto_trading:
    # Add pulsing effect annotation for auto-trading
    fig_live.add_annotation(
        x=st.session_state.current_token_reserve / 1_000_000,
        y=st.session_state.current_virtuals_reserve,
        text="🤖 AUTO TRADING",
        showarrow=False,
        font=dict(size=12, color="red"),
        bgcolor="yellow",
        bordercolor="red",
        borderwidth=2,
        xshift=0,
        yshift=30
    )

# Add graduation progress indicator
graduation_progress = ((initial_supply - st.session_state.current_token_reserve) / 
                      (initial_supply - graduation_token_threshold)) * 100
graduation_progress = min(100, max(0, graduation_progress))

fig_live.add_annotation(
    x=0.02,
    y=0.98,
    xref='paper',
    yref='paper',
    text=f"Graduation Progress: {graduation_progress:.1f}%",
    showarrow=False,
    font=dict(size=14, color="blue"),
    bgcolor="lightblue",
    bordercolor="blue",
    borderwidth=1
)

# Add live metrics overlay
current_price = calculate_price_from_reserves(st.session_state.current_token_reserve, st.session_state.current_virtuals_reserve)
price_change = ((current_price / initial_price - 1) * 100) if initial_price > 0 else 0

fig_live.add_annotation(
    x=0.98,
    y=0.98,
    xref='paper',
    yref='paper',
    text=f"Current Price: {current_price:.6f}<br>Change: {price_change:+.1f}%<br>Trades: {len(st.session_state.transaction_history)}",
    showarrow=False,
    font=dict(size=12, color="darkblue"),
    bgcolor="lightgray",
    bordercolor="gray",
    borderwidth=1,
    align="right"
)

fig_live.update_layout(
    title="Real-time Position on Bonding Curve",
    xaxis_title="Token Reserves (Millions)",
    yaxis_title="Virtuals Reserves",
    height=500,
    showlegend=True
)

# Add grid and improve styling
fig_live.update_xaxes(showgrid=True, gridwidth=1, gridcolor='lightgray', zeroline=True)
fig_live.update_yaxes(showgrid=True, gridwidth=1, gridcolor='lightgray', zeroline=True)

st.plotly_chart(fig_live, use_container_width=True)

# Trading interface
if not has_graduated:
    st.subheader("💰 Manual Trading")
    col3, col4 = st.columns(2)

    with col3:
        st.write("**🟢 Buy Tokens**")
        virtuals_to_spend = st.number_input(
            "Virtuals to spend", 
            min_value=1.0, 
            max_value=float(st.session_state.current_virtuals_reserve * 0.9), 
            value=1000.0, 
            step=1.0,
            key="buy_input"
        )
        
        if virtuals_to_spend > 0:
            tokens_received = calculate_buy_amount_out(
                virtuals_to_spend, 
                st.session_state.current_token_reserve, 
                st.session_state.current_virtuals_reserve
            )
            
            # Calculate new state
            new_virtuals_reserve = st.session_state.current_virtuals_reserve + virtuals_to_spend
            new_token_reserve = st.session_state.current_token_reserve - tokens_received
            new_price = calculate_price_from_reserves(new_token_reserve, new_virtuals_reserve)
            
            price_impact = ((new_price / current_price - 1) * 100) if current_price > 0 else 0
            
            st.write(f"**Tokens received:** {tokens_received:,.0f}")
            st.write(f"**New price:** {new_price:.8f} Virtuals/Token")
            st.write(f"**Price impact:** {price_impact:.2f}%")
            
            # Check if this would trigger graduation
            will_graduate = new_token_reserve <= graduation_token_threshold
            if will_graduate:
                st.warning("⚠️ This trade will trigger graduation!")
            
            if st.button("Execute Buy Trade", key="execute_buy"):
                # Execute the trade
                st.session_state.current_virtuals_reserve = new_virtuals_reserve
                st.session_state.current_token_reserve = new_token_reserve
                st.session_state.total_tokens_sold += tokens_received
                
                # Add to transaction history
                st.session_state.transaction_history.append({
                    'type': 'buy',
                    'virtuals_in': virtuals_to_spend,
                    'tokens_out': tokens_received,
                    'price': new_price,
                    'timestamp': len(st.session_state.transaction_history) + 1
                })
                
                st.success(f"✅ Bought {tokens_received:,.0f} tokens for {virtuals_to_spend:,.0f} Virtuals!")
                st.rerun()

    with col4:
        st.write("**🔴 Sell Tokens**")
        max_sellable = st.session_state.total_tokens_sold * 0.99  # Can't sell more than 90% of what you bought
        
        if max_sellable > 0:
            tokens_to_sell = st.number_input(
                "Tokens to sell", 
                min_value=1.0, 
                max_value=float(max_sellable), 
                value=min(10000.0, max_sellable), 
                step=1.0,
                key="sell_input"
            )
            
            if tokens_to_sell > 0:
                virtuals_received = calculate_sell_amount_out(
                    tokens_to_sell, 
                    st.session_state.current_token_reserve, 
                    st.session_state.current_virtuals_reserve
                )
                
                # Calculate new state
                new_virtuals_reserve = st.session_state.current_virtuals_reserve - virtuals_received
                new_token_reserve = st.session_state.current_token_reserve + tokens_to_sell
                new_price = calculate_price_from_reserves(new_token_reserve, new_virtuals_reserve)
                
                price_impact = ((new_price / current_price - 1) * 100) if current_price > 0 else 0
                
                st.write(f"**Virtuals received:** {virtuals_received:,.2f}")
                st.write(f"**New price:** {new_price:.8f} Virtuals/Token")
                st.write(f"**Price impact:** {price_impact:.2f}%")
                
                if st.button("Execute Sell Trade", key="execute_sell"):
                    # Execute the trade
                    st.session_state.current_virtuals_reserve = new_virtuals_reserve
                    st.session_state.current_token_reserve = new_token_reserve
                    st.session_state.total_tokens_sold = max(0, st.session_state.total_tokens_sold - tokens_to_sell)
                    
                    # Add to transaction history
                    st.session_state.transaction_history.append({
                        'type': 'sell',
                        'tokens_in': tokens_to_sell,
                        'virtuals_out': virtuals_received,
                        'price': new_price,
                        'timestamp': len(st.session_state.transaction_history) + 1
                    })
                    
                    st.success(f"✅ Sold {tokens_to_sell:,.0f} tokens for {virtuals_received:,.2f} Virtuals!")
                    st.rerun()
        else:
            st.info("💡 Buy some tokens first to enable selling!")

# Transaction History
if len(st.session_state.transaction_history) > 0:
    st.subheader("📜 Transaction History")
    
    # Create transaction dataframe
    tx_data = []
    for i, tx in enumerate(st.session_state.transaction_history):
        if tx['type'] == 'buy':
            tx_data.append({
                'Trade #': i + 1,
                'Type': '🟢 BUY',
                'Virtuals In': f"{tx['virtuals_in']:,.0f}",
                'Tokens Out': f"{tx['tokens_out']:,.0f}",
                'Price': f"{tx['price']:.8f}",
                'Action': f"Spent {tx['virtuals_in']:,.0f} Virtuals → Got {tx['tokens_out']:,.0f} tokens"
            })
        else:
            tx_data.append({
                'Trade #': i + 1,
                'Type': '🔴 SELL',
                'Tokens In': f"{tx['tokens_in']:,.0f}",
                'Virtuals Out': f"{tx['virtuals_out']:,.2f}",
                'Price': f"{tx['price']:.8f}",
                'Action': f"Sold {tx['tokens_in']:,.0f} tokens → Got {tx['virtuals_out']:,.2f} Virtuals"
            })
    
    df = pd.DataFrame(tx_data)
    st.dataframe(df, use_container_width=True, hide_index=True)
    
    # Summary stats
    buy_trades = [tx for tx in st.session_state.transaction_history if tx['type'] == 'buy']
    sell_trades = [tx for tx in st.session_state.transaction_history if tx['type'] == 'sell']
    
    summary_col1, summary_col2, summary_col3 = st.columns(3)
    with summary_col1:
        st.metric("Total Trades", len(st.session_state.transaction_history))
    with summary_col2:
        total_virtuals_spent = sum(tx['virtuals_in'] for tx in buy_trades)
        st.metric("Total Virtuals Spent", f"{total_virtuals_spent:,.0f}")
    with summary_col3:
        total_tokens_bought = sum(tx['tokens_out'] for tx in buy_trades)
        st.metric("Total Tokens Bought", f"{total_tokens_bought:,.0f}")

else:
    st.info("💡 Make your first trade to see the transaction history!")
