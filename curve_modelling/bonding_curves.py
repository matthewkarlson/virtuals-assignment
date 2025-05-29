import numpy as np
from abc import ABC, abstractmethod
from typing import Tuple
import math

class BondingCurve(ABC):
    """Abstract base class for bonding curves"""
    
    def __init__(self, total_supply: float, graduation_threshold: float):
        self.total_supply = total_supply
        self.graduation_threshold = graduation_threshold
        self.tokens_sold = 0
        self.virtual_raised = 0
        self.graduated = False
        
    @abstractmethod
    def get_price(self, supply: float) -> float:
        """Get the instantaneous price at a given supply level"""
        pass
    
    @abstractmethod
    def calculate_cost(self, from_supply: float, to_supply: float) -> float:
        """Calculate the cost to purchase tokens from one supply level to another"""
        pass
    
    def buy(self, virtual_amount: float) -> Tuple[float, float]:
        """
        Buy tokens with virtual currency
        Returns: (tokens_out, actual_price)
        """
        if self.graduated:
            raise ValueError("Curve has graduated")
            
        # Find how many tokens we can buy with virtual_amount
        tokens_out = self._calculate_tokens_out(virtual_amount)
        
        if self.tokens_sold + tokens_out > self.total_supply:
            # Adjust to not exceed supply
            tokens_out = self.total_supply - self.tokens_sold
            virtual_amount = self.calculate_cost(self.tokens_sold, self.total_supply)
        
        # Calculate actual price
        actual_price = virtual_amount / tokens_out if tokens_out > 0 else 0
        
        # Update state
        self.tokens_sold += tokens_out
        self.virtual_raised += virtual_amount
        
        # Check graduation
        if self.virtual_raised >= self.graduation_threshold:
            self.graduated = True
            
        return tokens_out, actual_price
    
    def sell(self, token_amount: float) -> Tuple[float, float]:
        """
        Sell tokens to get virtual currency back
        Returns: (virtual_out, actual_price)
        """
        if self.graduated:
            raise ValueError("Curve has graduated")
        
        if token_amount <= 0:
            raise ValueError("Token amount must be positive")
            
        if token_amount > self.tokens_sold:
            raise ValueError("Cannot sell more tokens than have been sold")
        
        # Calculate virtual amount returned
        new_tokens_sold = self.tokens_sold - token_amount
        virtual_out = self.calculate_cost(new_tokens_sold, self.tokens_sold)
        
        # Calculate actual price
        actual_price = virtual_out / token_amount if token_amount > 0 else 0
        
        # Update state
        self.tokens_sold = new_tokens_sold
        self.virtual_raised -= virtual_out
        
        return virtual_out, actual_price
    
    @abstractmethod
    def _calculate_tokens_out(self, virtual_amount: float) -> float:
        """Calculate how many tokens can be bought with given virtual amount"""
        pass


class LinearBondingCurve(BondingCurve):
    """
    Linear bonding curve: P(s) = K * s
    Based on the Solidity implementation
    """
    
    def __init__(self, total_supply: float, graduation_threshold: float, k: float = 2.0, multiplier: float = 10000000):
        super().__init__(total_supply, graduation_threshold)
        self.k = k
        self.multiplier = multiplier
        
    def get_price(self, supply: float) -> float:
        """Price = K * supply / multiplier"""
        if supply == 0:
            # Return a small but non-zero initial price
            return 0.0001  # Starting price
        return (self.k * supply) / self.multiplier
    
    def calculate_cost(self, from_supply: float, to_supply: float) -> float:
        """
        Cost = integral of K*s/multiplier from from_supply to to_supply
        = K/(2*multiplier) * (to_supply^2 - from_supply^2)
        """
        cost = (self.k / (2 * self.multiplier)) * (to_supply**2 - from_supply**2)
        return max(0, cost)
    
    def _calculate_tokens_out(self, virtual_amount: float) -> float:
        """
        Solve for delta_s given virtual_amount using quadratic formula
        virtual_amount = K/(2*multiplier) * ((s + delta_s)^2 - s^2)
        """
        s = self.tokens_sold
        # Rearranging: (s + delta_s)^2 = 2 * virtual_amount * multiplier / K + s^2
        # s + delta_s = sqrt(2 * virtual_amount * multiplier / K + s^2)
        # delta_s = sqrt(2 * virtual_amount * multiplier / K + s^2) - s
        radicand = (2 * virtual_amount * self.multiplier) / self.k + s**2
        new_s = math.sqrt(radicand)
        return new_s - s


class ExponentialBondingCurve(BondingCurve):
    """Exponential bonding curve: P(s) = a * e^(b*s)"""
    
    def __init__(self, total_supply: float, graduation_threshold: float, a: float = 0.1, b: float = 0.001):
        super().__init__(total_supply, graduation_threshold)
        self.a = a
        self.b = b
        
    def get_price(self, supply: float) -> float:
        return self.a * np.exp(self.b * supply)
    
    def calculate_cost(self, from_supply: float, to_supply: float) -> float:
        """Integral of a*e^(b*s) = a/b * (e^(b*to) - e^(b*from))"""
        if self.b == 0:
            return self.a * (to_supply - from_supply)
        return (self.a / self.b) * (np.exp(self.b * to_supply) - np.exp(self.b * from_supply))
    
    def _calculate_tokens_out(self, virtual_amount: float) -> float:
        """Solve a/b * (e^(b*(s+delta)) - e^(b*s)) = virtual_amount for delta"""
        s = self.tokens_sold
        if self.b == 0:
            return virtual_amount / self.a
        
        # e^(b*(s+delta)) = virtual_amount * b/a + e^(b*s)
        # b*(s+delta) = ln(virtual_amount * b/a + e^(b*s))
        # delta = ln(virtual_amount * b/a + e^(b*s))/b - s
        exp_bs = np.exp(self.b * s)
        return (np.log(virtual_amount * self.b / self.a + exp_bs) / self.b) - s


class PolynomialBondingCurve(BondingCurve):
    """Polynomial bonding curve: P(s) = sum(c_i * s^i)"""
    
    def __init__(self, total_supply: float, graduation_threshold: float, coefficients: list = None):
        super().__init__(total_supply, graduation_threshold)
        self.coefficients = coefficients or [1.0, 0.1]  # Default: 1 + 0.1*s
        
    def get_price(self, supply: float) -> float:
        price = 0
        for i, coef in enumerate(self.coefficients):
            price += coef * (supply ** i)
        return max(0.0001, price)  # Ensure minimum price
    
    def calculate_cost(self, from_supply: float, to_supply: float) -> float:
        """Integral of polynomial"""
        cost = 0
        for i, coef in enumerate(self.coefficients):
            # Integral of c*s^i = c/(i+1) * s^(i+1)
            cost += coef / (i + 1) * (to_supply**(i + 1) - from_supply**(i + 1))
        return max(0, cost)
    
    def _calculate_tokens_out(self, virtual_amount: float) -> float:
        """Numerically solve for tokens out"""
        # Use binary search for simplicity
        low, high = 0, self.total_supply - self.tokens_sold
        epsilon = 0.001
        
        while high - low > epsilon:
            mid = (low + high) / 2
            cost = self.calculate_cost(self.tokens_sold, self.tokens_sold + mid)
            
            if cost < virtual_amount:
                low = mid
            else:
                high = mid
                
        return low


class LogarithmicBondingCurve(BondingCurve):
    """Logarithmic bonding curve: P(s) = a * ln(s + b)"""
    
    def __init__(self, total_supply: float, graduation_threshold: float, a: float = 1.0, b: float = 10.0):
        super().__init__(total_supply, graduation_threshold)
        self.a = a
        self.b = b
        
    def get_price(self, supply: float) -> float:
        return self.a * np.log(supply + self.b)
    
    def calculate_cost(self, from_supply: float, to_supply: float) -> float:
        """
        Integral of a*ln(s+b) = a*[(s+b)*ln(s+b) - (s+b)]
        Using integration by parts
        """
        def integral(s):
            return self.a * ((s + self.b) * np.log(s + self.b) - (s + self.b))
        
        return integral(to_supply) - integral(from_supply)
    
    def _calculate_tokens_out(self, virtual_amount: float) -> float:
        """Numerically solve for tokens out"""
        # Use binary search
        low, high = 0, self.total_supply - self.tokens_sold
        epsilon = 0.001
        
        while high - low > epsilon:
            mid = (low + high) / 2
            cost = self.calculate_cost(self.tokens_sold, self.tokens_sold + mid)
            
            if cost < virtual_amount:
                low = mid
            else:
                high = mid
                
        return low 