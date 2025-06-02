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
    
    # Generate x values (token reserves) from 10% to 150% of initial supply
    x_min = token_supply * 0.1
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
    min_value=100, 
    max_value=5000, 
    value=DEFAULT_ASSET_RATE, 
    step=50,
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
    
    # Show how asset rate affects the curve
    st.subheader("📊 Asset Rate Impact")
    st.write(f"**Current k-value:** {k_value:.2e}")
    
    # Calculate k for different asset rates for comparison
    if asset_rate != DEFAULT_ASSET_RATE:
        default_liquidity = calculate_initial_liquidity(initial_supply, DEFAULT_ASSET_RATE)
        default_k = initial_supply * default_liquidity
        k_ratio = k_value / default_k
        st.write(f"**vs Default k:** {k_ratio:.2f}x")
    
    st.markdown("""
    **Key Insights:**
    - Lower asset rate → Higher k → Curve further from origin
    - Higher asset rate → Lower k → Curve closer to origin
    - All points on the curve satisfy x × y = k
    - Moving right on curve = selling tokens
    - Moving up on curve = buying tokens
    """)

# Create columns for main content
col1, col2 = st.columns([2, 1])

with col1:
    st.subheader("📈 Bonding Curve Visualization")
    
    # Generate curve data
    tokens_sold, prices, market_caps, virtuals_reserves, token_reserves, virtuals_raised = generate_price_curve_data(
        initial_supply, initial_virtuals_liquidity, graduation_token_threshold
    )
    
    # Create subplots
    fig = make_subplots(
        rows=3, cols=1,
        subplot_titles=('Price vs Tokens Sold', 'Virtuals Raised vs Tokens Sold', 'Reserve Levels vs Tokens Sold'),
        vertical_spacing=0.12
    )
    
    # Price curve
    fig.add_trace(
        go.Scatter(
            x=tokens_sold, 
            y=prices, 
            mode='lines',
            name='Token Price',
            line=dict(color='#1f77b4', width=3)
        ),
        row=1, col=1
    )
    
    # Virtuals raised curve
    fig.add_trace(
        go.Scatter(
            x=tokens_sold, 
            y=virtuals_raised, 
            mode='lines',
            name='Virtuals Raised',
            line=dict(color='#ff7f0e', width=3),
            showlegend=False
        ),
        row=2, col=1
    )
    
    # Add graduation threshold line for Virtuals raised
    fig.add_hline(
        y=grad_threshold_virtuals, 
        line_dash="dash", 
        line_color="red",
        annotation_text="Graduation Threshold",
        row=2, col=1
    )
    
    # Reserve levels
    fig.add_trace(
        go.Scatter(
            x=tokens_sold, 
            y=virtuals_reserves,
            mode='lines',
            name='Virtuals Reserve',
            line=dict(color='#2ca02c', width=2)
        ),
        row=3, col=1
    )
    
    fig.add_trace(
        go.Scatter(
            x=tokens_sold, 
            y=token_reserves / 1000000,  # Scale to millions for visibility
            mode='lines',
            name='Token Reserve (M)',
            line=dict(color='#d62728', width=2)
        ),
        row=3, col=1
    )
    
    # Add graduation threshold line for token reserves
    fig.add_hline(
        y=graduation_token_threshold / 1000000, 
        line_dash="dash", 
        line_color="red",
        annotation_text="Token Reserve at Graduation",
        row=3, col=1
    )
    
    fig.update_layout(height=800, showlegend=True)
    fig.update_xaxes(title_text="Tokens Sold", row=1, col=1)
    fig.update_xaxes(title_text="Tokens Sold", row=2, col=1) 
    fig.update_xaxes(title_text="Tokens Sold", row=3, col=1)
    fig.update_yaxes(title_text="Price (Virtuals/Token)", row=1, col=1)
    fig.update_yaxes(title_text="Virtuals Raised", row=2, col=1)
    fig.update_yaxes(title_text="Reserves", row=3, col=1)
    
    st.plotly_chart(fig, use_container_width=True)

with col2:
    st.subheader("💰 Current State")
    
    # Display current metrics
    st.metric("Initial Price", f"{initial_price:.8f} Virtuals/Token")
    st.metric("Initial Virtuals Liquidity", f"{initial_virtuals_liquidity:,.0f} Virtuals")
    st.metric("Token Supply", f"{initial_supply:,.0f}")
    st.metric("Constant Product (k)", f"{(initial_supply * initial_virtuals_liquidity):,.0f}")
    
    # Show graduation info
    st.subheader("🎓 Graduation Info")
    tokens_to_sell_for_grad = initial_supply - graduation_token_threshold
    st.metric("Tokens to Sell for Graduation", f"{tokens_to_sell_for_grad:,.0f}")
    st.metric("% of Supply to Sell", f"{(tokens_to_sell_for_grad/initial_supply)*100:.1f}%")
    st.metric("Virtuals Needed", f"{grad_threshold_virtuals:,}")
    
    # Show key contract parameters
    st.subheader("🔧 Contract Parameters")
    st.metric("K Constant", f"{K_CONSTANT:,}")
    st.metric("Asset Rate", asset_rate)

# Trading Simulator Section
st.subheader("🔄 Trading Simulator")

col3, col4 = st.columns(2)

with col3:
    st.write("**Buy Tokens**")
    virtuals_to_spend = st.number_input(
        "Virtuals to spend", 
        min_value=1.0, 
        max_value=float(initial_virtuals_liquidity * 0.5), 
        value=1000.0, 
        step=1.0
    )
    
    if virtuals_to_spend > 0:
        tokens_received = calculate_buy_amount_out(
            virtuals_to_spend, initial_supply, initial_virtuals_liquidity
        )
        
        # Calculate new state
        new_virtuals_reserve = initial_virtuals_liquidity + virtuals_to_spend
        new_token_reserve = initial_supply - tokens_received
        new_price = calculate_price_from_reserves(new_token_reserve, new_virtuals_reserve)
        
        price_impact = ((new_price / initial_price - 1) * 100) if initial_price > 0 else 0
        
        st.write(f"**Tokens received:** {tokens_received:,.0f}")
        st.write(f"**New price:** {new_price:.8f} Virtuals/Token")
        st.write(f"**Price impact:** {price_impact:.2f}%")
        st.write(f"**New token reserve:** {new_token_reserve:,.0f}")
        
        # Check if this would trigger graduation
        if new_token_reserve <= graduation_token_threshold:
            st.success("🎓 This trade would trigger graduation to Uniswap!")

with col4:
    st.write("**Sell Tokens**")
    tokens_to_sell = st.number_input(
        "Tokens to sell", 
        min_value=1.0, 
        max_value=float(initial_supply * 0.1), 
        value=10000.0, 
        step=1.0
    )
    
    if tokens_to_sell > 0:
        virtuals_received = calculate_sell_amount_out(
            tokens_to_sell, initial_supply, initial_virtuals_liquidity
        )
        
        # Calculate new state
        new_virtuals_reserve = initial_virtuals_liquidity - virtuals_received
        new_token_reserve = initial_supply + tokens_to_sell
        new_price = calculate_price_from_reserves(new_token_reserve, new_virtuals_reserve)
        
        price_impact = ((new_price / initial_price - 1) * 100) if initial_price > 0 else 0
        
        st.write(f"**Virtuals received:** {virtuals_received:,.2f}")
        st.write(f"**New price:** {new_price:.8f} Virtuals/Token")
        st.write(f"**Price impact:** {price_impact:.2f}%")
        st.write(f"**New token reserve:** {new_token_reserve:,.0f}")

# Mathematical explanation
st.subheader("📝 Mathematical Model")
st.markdown("""
This bonding curve uses the **constant product formula** (x × y = k):

**Key Formulas:**
- Initial Liquidity: `k = ((K × 10000) / assetRate)`, then `liquidity = (k × 10000) / supply / 10000`
- Price: `price = virtuals_reserve / token_reserve`
- Buy: `tokens_out = (virtuals_in × token_reserve) / (virtuals_reserve + virtuals_in)`
- Sell: `virtuals_out = (tokens_in × virtuals_reserve) / (token_reserve + tokens_in)`

**Graduation Mechanism:**
- Graduation occurs when enough tokens are sold to raise the target amount of Virtuals
- Token reserve drops to: `k / (initial_virtuals + graduation_threshold)`
- This ensures the bonding curve has raised exactly the graduation threshold in Virtuals

**Features:**
- ✅ Constant product AMM (like Uniswap V2)
- ✅ 0.3% trading fee included
- ✅ Graduation based on token reserves (reserveA)
- ✅ Real-time price impact calculation
""")
