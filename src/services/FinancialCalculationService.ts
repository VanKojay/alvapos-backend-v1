// ALVA POS MVP - Financial Calculation Service
// TASK-B010: Server-side financial calculations with Decimal.js precision

import Decimal from 'decimal.js';
import { 
  CartData, 
  CartItem, 
  LaborItem, 
  Discount, 
  CartTotals,
  ValidationError 
} from '@/types/api';
import { Logger } from '@/utils/logger';

// Configure Decimal.js for currency calculations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN, // Banker's rounding
  toExpNeg: -7,
  toExpPos: 21
});

export interface FinancialValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

export interface DiscountValidationOptions {
  maxPercentage?: number;
  maxNominalAmount?: number;
  allowNegativeResults?: boolean;
}

export interface TaxConfiguration {
  rate: number;
  inclusive?: boolean;
  roundingMethod?: 'round' | 'floor' | 'ceil';
}

export class FinancialCalculationService {
  private static instance: FinancialCalculationService;
  
  // Constants for validation
  private readonly MAX_PERCENTAGE = 100;
  private readonly MAX_NOMINAL_DISCOUNT = 1000000; // $1M max nominal discount
  private readonly MIN_ITEM_PRICE = 0.01;
  private readonly DEFAULT_TAX_RATE = 0.10; // 10%

  constructor() {
    Logger.info('FinancialCalculationService initialized with precision settings', {
      precision: Decimal.precision,
      rounding: Decimal.rounding
    });
  }

  public static getInstance(): FinancialCalculationService {
    if (!FinancialCalculationService.instance) {
      FinancialCalculationService.instance = new FinancialCalculationService();
    }
    return FinancialCalculationService.instance;
  }

  // ===========================================
  // ITEM-LEVEL DISCOUNT CALCULATIONS
  // ===========================================

  /**
   * Calculate discount amount for a single cart item
   */
  public calculateItemDiscount(
    price: number,
    quantity: number,
    discount?: Discount
  ): { discountAmount: Decimal; finalAmount: Decimal; isValid: boolean; error?: string } {
    try {
      const priceDecimal = new Decimal(price);
      const quantityDecimal = new Decimal(quantity);
      const itemSubtotal = priceDecimal.times(quantityDecimal);

      if (!discount) {
        return {
          discountAmount: new Decimal(0),
          finalAmount: itemSubtotal,
          isValid: true
        };
      }

      let discountAmount: Decimal;

      if (discount.type === 'percentage') {
        if (discount.value < 0 || discount.value > this.MAX_PERCENTAGE) {
          return {
            discountAmount: new Decimal(0),
            finalAmount: itemSubtotal,
            isValid: false,
            error: `Percentage discount must be between 0 and ${this.MAX_PERCENTAGE}`
          };
        }

        const discountRate = new Decimal(discount.value).dividedBy(100);
        discountAmount = itemSubtotal.times(discountRate);
      } else {
        // Nominal discount
        discountAmount = new Decimal(discount.value);
        
        if (discountAmount.isNegative()) {
          return {
            discountAmount: new Decimal(0),
            finalAmount: itemSubtotal,
            isValid: false,
            error: 'Nominal discount cannot be negative'
          };
        }

        if (discountAmount.greaterThan(itemSubtotal)) {
          return {
            discountAmount: itemSubtotal,
            finalAmount: new Decimal(0),
            isValid: true
          };
        }
      }

      const finalAmount = itemSubtotal.minus(discountAmount);

      return {
        discountAmount: discountAmount.toDecimalPlaces(2),
        finalAmount: finalAmount.toDecimalPlaces(2),
        isValid: true
      };

    } catch (error) {
      Logger.error('Item discount calculation failed', { error, price, quantity, discount });
      return {
        discountAmount: new Decimal(0),
        finalAmount: new Decimal(price * quantity),
        isValid: false,
        error: 'Calculation error occurred'
      };
    }
  }

  /**
   * Calculate and update all cart items with their discounts
   */
  public calculateCartItemTotals(items: CartItem[]): CartItem[] {
    return items.map(item => {
      const calculation = this.calculateItemDiscount(item.price, item.quantity, item.discount);
      
      const subtotal = new Decimal(item.price).times(item.quantity).toNumber();
      const discountAmount = calculation.discountAmount.toNumber();
      const total = calculation.finalAmount.toNumber();

      // Update discount with calculated amount
      let updatedDiscount: Discount | undefined = item.discount;
      if (updatedDiscount) {
        updatedDiscount = {
          ...updatedDiscount,
          appliedAmount: discountAmount
        };
      }

      return {
        ...item,
        subtotal,
        total,
        discount: updatedDiscount
      };
    });
  }

  /**
   * Calculate and update all labor items with their discounts
   */
  public calculateLaborItemTotals(laborItems: LaborItem[]): LaborItem[] {
    return laborItems.map(item => {
      const calculation = this.calculateItemDiscount(item.rate, item.quantity, item.discount);
      
      const subtotal = new Decimal(item.rate).times(item.quantity).toNumber();
      const discountAmount = calculation.discountAmount.toNumber();
      const total = calculation.finalAmount.toNumber();

      // Update discount with calculated amount
      let updatedDiscount: Discount | undefined = item.discount;
      if (updatedDiscount) {
        updatedDiscount = {
          ...updatedDiscount,
          appliedAmount: discountAmount
        };
      }

      return {
        ...item,
        subtotal,
        total,
        discount: updatedDiscount
      };
    });
  }

  // ===========================================
  // TOTAL-LEVEL DISCOUNT CALCULATIONS
  // ===========================================

  /**
   * Calculate total-level discount on combined subtotal
   */
  public calculateTotalDiscount(
    subtotal: number,
    totalDiscount?: Discount
  ): { discountAmount: Decimal; finalAmount: Decimal; isValid: boolean; error?: string } {
    try {
      const subtotalDecimal = new Decimal(subtotal);

      if (!totalDiscount) {
        return {
          discountAmount: new Decimal(0),
          finalAmount: subtotalDecimal,
          isValid: true
        };
      }

      let discountAmount: Decimal;

      if (totalDiscount.type === 'percentage') {
        if (totalDiscount.value < 0 || totalDiscount.value > this.MAX_PERCENTAGE) {
          return {
            discountAmount: new Decimal(0),
            finalAmount: subtotalDecimal,
            isValid: false,
            error: `Percentage discount must be between 0 and ${this.MAX_PERCENTAGE}`
          };
        }

        const discountRate = new Decimal(totalDiscount.value).dividedBy(100);
        discountAmount = subtotalDecimal.times(discountRate);
      } else {
        // Nominal discount
        discountAmount = new Decimal(totalDiscount.value);
        
        if (discountAmount.isNegative()) {
          return {
            discountAmount: new Decimal(0),
            finalAmount: subtotalDecimal,
            isValid: false,
            error: 'Nominal discount cannot be negative'
          };
        }

        if (discountAmount.greaterThan(subtotalDecimal)) {
          discountAmount = subtotalDecimal; // Cap at subtotal
        }
      }

      const finalAmount = subtotalDecimal.minus(discountAmount);

      return {
        discountAmount: discountAmount.toDecimalPlaces(2),
        finalAmount: finalAmount.toDecimalPlaces(2),
        isValid: true
      };

    } catch (error) {
      Logger.error('Total discount calculation failed', { error, subtotal, totalDiscount });
      return {
        discountAmount: new Decimal(0),
        finalAmount: new Decimal(subtotal),
        isValid: false,
        error: 'Calculation error occurred'
      };
    }
  }

  // ===========================================
  // TAX CALCULATIONS
  // ===========================================

  /**
   * Calculate tax amount on given amount
   */
  public calculateTax(
    amount: number,
    taxConfig: TaxConfiguration = { rate: this.DEFAULT_TAX_RATE }
  ): { taxAmount: Decimal; afterTaxAmount: Decimal; isValid: boolean; error?: string } {
    try {
      const amountDecimal = new Decimal(amount);
      const taxRate = new Decimal(taxConfig.rate);

      if (taxRate.isNegative() || taxRate.greaterThan(1)) {
        return {
          taxAmount: new Decimal(0),
          afterTaxAmount: amountDecimal,
          isValid: false,
          error: 'Tax rate must be between 0 and 1'
        };
      }

      let taxAmount = amountDecimal.times(taxRate);
      
      // Apply rounding method
      switch (taxConfig.roundingMethod) {
        case 'floor':
          taxAmount = taxAmount.toDecimalPlaces(2, Decimal.ROUND_DOWN);
          break;
        case 'ceil':
          taxAmount = taxAmount.toDecimalPlaces(2, Decimal.ROUND_UP);
          break;
        default:
          taxAmount = taxAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
      }

      const afterTaxAmount = taxConfig.inclusive ? amountDecimal : amountDecimal.plus(taxAmount);

      return {
        taxAmount: taxAmount,
        afterTaxAmount: afterTaxAmount.toDecimalPlaces(2),
        isValid: true
      };

    } catch (error) {
      Logger.error('Tax calculation failed', { error, amount, taxConfig });
      return {
        taxAmount: new Decimal(0),
        afterTaxAmount: new Decimal(amount),
        isValid: false,
        error: 'Tax calculation error occurred'
      };
    }
  }

  // ===========================================
  // COMPREHENSIVE CART CALCULATIONS
  // ===========================================

  /**
   * Calculate complete cart totals with all discounts and tax
   */
  public calculateComprehensiveCartTotals(
    cartData: CartData,
    taxRate: number = this.DEFAULT_TAX_RATE
  ): { totals: CartTotals; updatedCartData: CartData; isValid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    const startTime = Date.now();

    try {
      // Calculate individual item totals with discounts
      const updatedItems = this.calculateCartItemTotals(cartData.items);
      const updatedLaborItems = this.calculateLaborItemTotals(cartData.laborItems);

      // Calculate subtotals
      const itemsSubtotal = updatedItems.reduce((sum, item) => 
        sum.plus(new Decimal(item.price).times(item.quantity)), new Decimal(0)
      );

      const laborSubtotal = updatedLaborItems.reduce((sum, item) => 
        sum.plus(new Decimal(item.rate).times(item.quantity)), new Decimal(0)
      );

      // Calculate individual discounts
      const itemDiscounts = updatedItems.reduce((sum, item) => 
        sum.plus(new Decimal(item.discount?.appliedAmount || 0)), new Decimal(0)
      );

      const laborDiscounts = updatedLaborItems.reduce((sum, item) => 
        sum.plus(new Decimal(item.discount?.appliedAmount || 0)), new Decimal(0)
      );

      // Calculate items after individual discounts
      const itemsAfterDiscounts = itemsSubtotal.minus(itemDiscounts);
      const laborAfterDiscounts = laborSubtotal.minus(laborDiscounts);
      
      // Calculate grand subtotal
      const grandSubtotal = itemsAfterDiscounts.plus(laborAfterDiscounts);

      // Apply total-level discount
      const totalDiscountCalc = this.calculateTotalDiscount(
        grandSubtotal.toNumber(), 
        cartData.totalDiscount
      );

      if (!totalDiscountCalc.isValid) {
        errors.push({
          field: 'totalDiscount',
          message: totalDiscountCalc.error || 'Total discount calculation failed'
        });
      }

      const afterTotalDiscount = totalDiscountCalc.finalAmount;

      // Calculate tax
      const taxCalc = this.calculateTax(afterTotalDiscount.toNumber(), { rate: taxRate });
      
      if (!taxCalc.isValid) {
        errors.push({
          field: 'tax',
          message: taxCalc.error || 'Tax calculation failed'
        });
      }

      const finalTotal = taxCalc.afterTaxAmount;

      // Update total discount with calculated amount
      let updatedTotalDiscount: Discount | undefined = cartData.totalDiscount;
      if (updatedTotalDiscount) {
        updatedTotalDiscount = {
          ...updatedTotalDiscount,
          appliedAmount: totalDiscountCalc.discountAmount.toNumber()
        };
      }

      // Build comprehensive totals
      const totals: CartTotals = {
        subtotal: grandSubtotal.toNumber(),
        itemsSubtotal: itemsSubtotal.toNumber(),
        laborSubtotal: laborSubtotal.toNumber(),
        itemDiscounts: itemDiscounts.toNumber(),
        laborDiscounts: laborDiscounts.toNumber(),
        totalDiscount: updatedTotalDiscount,
        taxRate: taxRate,
        taxAmount: taxCalc.taxAmount.toNumber(),
        finalTotal: finalTotal.toNumber()
      };

      const updatedCartData: CartData = {
        items: updatedItems,
        laborItems: updatedLaborItems,
        totals: totals,
        totalDiscount: updatedTotalDiscount,
        metadata: {
          ...cartData.metadata,
          calculationTime: Date.now() - startTime,
          calculatedAt: new Date().toISOString()
        }
      };

      Logger.info('Comprehensive cart calculation completed', {
        itemCount: updatedItems.length,
        laborCount: updatedLaborItems.length,
        finalTotal: finalTotal.toNumber(),
        calculationTime: Date.now() - startTime
      });

      return {
        totals,
        updatedCartData,
        isValid: errors.length === 0,
        errors
      };

    } catch (error) {
      Logger.error('Comprehensive cart calculation failed', { 
        error: error instanceof Error ? error.message : String(error),
        calculationTime: Date.now() - startTime
      });

      errors.push({
        field: 'calculation',
        message: 'Comprehensive calculation failed'
      });

      // Return safe fallback
      return {
        totals: this.getFallbackTotals(cartData, taxRate),
        updatedCartData: cartData,
        isValid: false,
        errors
      };
    }
  }

  // ===========================================
  // VALIDATION METHODS
  // ===========================================

  /**
   * Validate cart data for financial calculations
   */
  public validateCartData(cartData: CartData): FinancialValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    if (!cartData || typeof cartData !== 'object') {
      errors.push({
        field: 'cartData',
        message: 'Cart data is required and must be an object'
      });
      return { isValid: false, errors, warnings };
    }

    // Validate items array
    if (!Array.isArray(cartData.items)) {
      errors.push({
        field: 'items',
        message: 'Items must be an array'
      });
    } else {
      cartData.items.forEach((item, index) => {
        this.validateCartItem(item, `items[${index}]`, errors, warnings);
      });
    }

    // Validate labor items array
    if (!Array.isArray(cartData.laborItems)) {
      errors.push({
        field: 'laborItems',
        message: 'Labor items must be an array'
      });
    } else {
      cartData.laborItems.forEach((item, index) => {
        this.validateLaborItem(item, `laborItems[${index}]`, errors, warnings);
      });
    }

    // Validate total discount
    if (cartData.totalDiscount) {
      this.validateDiscount(cartData.totalDiscount, 'totalDiscount', errors, warnings);
    }

    const result: FinancialValidationResult = {
      isValid: errors.length === 0,
      errors
    };
    
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    
    return result;
  }

  /**
   * Validate individual cart item
   */
  private validateCartItem(item: CartItem, fieldPrefix: string, errors: ValidationError[], warnings: string[]): void {
    if (!item.productId || typeof item.productId !== 'string') {
      errors.push({
        field: `${fieldPrefix}.productId`,
        message: 'Product ID is required and must be a string'
      });
    }

    if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
      errors.push({
        field: `${fieldPrefix}.name`,
        message: 'Item name is required and cannot be empty'
      });
    }

    if (typeof item.price !== 'number' || item.price < this.MIN_ITEM_PRICE) {
      errors.push({
        field: `${fieldPrefix}.price`,
        message: `Price must be a number >= ${this.MIN_ITEM_PRICE}`
      });
    }

    if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      errors.push({
        field: `${fieldPrefix}.quantity`,
        message: 'Quantity must be a positive integer'
      });
    }

    if (item.discount) {
      this.validateDiscount(item.discount, `${fieldPrefix}.discount`, errors, warnings);
    }

    // Warnings for high values
    if (item.price > 50000) {
      warnings.push(`High item price detected: $${item.price} for ${item.name}`);
    }

    if (item.quantity > 1000) {
      warnings.push(`High quantity detected: ${item.quantity} for ${item.name}`);
    }
  }

  /**
   * Validate individual labor item
   */
  private validateLaborItem(item: LaborItem, fieldPrefix: string, errors: ValidationError[], warnings: string[]): void {
    if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
      errors.push({
        field: `${fieldPrefix}.name`,
        message: 'Labor item name is required and cannot be empty'
      });
    }

    if (!['hourly', 'fixed', 'per_unit'].includes(item.rateType)) {
      errors.push({
        field: `${fieldPrefix}.rateType`,
        message: 'Rate type must be one of: hourly, fixed, per_unit'
      });
    }

    if (typeof item.rate !== 'number' || item.rate < 0) {
      errors.push({
        field: `${fieldPrefix}.rate`,
        message: 'Rate must be a non-negative number'
      });
    }

    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      errors.push({
        field: `${fieldPrefix}.quantity`,
        message: 'Quantity must be a positive number'
      });
    }

    if (item.discount) {
      this.validateDiscount(item.discount, `${fieldPrefix}.discount`, errors, warnings);
    }

    // Warnings for high values
    if (item.rate > 1000) {
      warnings.push(`High labor rate detected: $${item.rate}/hr for ${item.name}`);
    }
  }

  /**
   * Validate discount object
   */
  private validateDiscount(discount: Discount, fieldPrefix: string, errors: ValidationError[], warnings: string[]): void {
    if (!['percentage', 'nominal'].includes(discount.type)) {
      errors.push({
        field: `${fieldPrefix}.type`,
        message: 'Discount type must be "percentage" or "nominal"'
      });
    }

    if (typeof discount.value !== 'number' || discount.value < 0) {
      errors.push({
        field: `${fieldPrefix}.value`,
        message: 'Discount value must be a non-negative number'
      });
    }

    if (discount.type === 'percentage' && discount.value > this.MAX_PERCENTAGE) {
      errors.push({
        field: `${fieldPrefix}.value`,
        message: `Percentage discount cannot exceed ${this.MAX_PERCENTAGE}%`
      });
    }

    if (discount.type === 'nominal' && discount.value > this.MAX_NOMINAL_DISCOUNT) {
      warnings.push(`Very high nominal discount detected: $${discount.value}`);
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  /**
   * Format currency value for display
   */
  public formatCurrency(amount: number, locale: string = 'en-US', currency: string = 'USD'): string {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (error) {
      Logger.warn('Currency formatting failed, using fallback', { amount, locale, currency, error });
      return `$${amount.toFixed(2)}`;
    }
  }

  /**
   * Get fallback totals in case of calculation failure
   */
  private getFallbackTotals(cartData: CartData, taxRate: number): CartTotals {
    const itemsSubtotal = cartData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const laborSubtotal = cartData.laborItems.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
    const subtotal = itemsSubtotal + laborSubtotal;
    const taxAmount = subtotal * taxRate;
    const finalTotal = subtotal + taxAmount;

    return {
      subtotal: Number(subtotal.toFixed(2)),
      itemsSubtotal: Number(itemsSubtotal.toFixed(2)),
      laborSubtotal: Number(laborSubtotal.toFixed(2)),
      itemDiscounts: 0,
      laborDiscounts: 0,
      taxRate,
      taxAmount: Number(taxAmount.toFixed(2)),
      finalTotal: Number(finalTotal.toFixed(2))
    };
  }

  /**
   * Round monetary value using banker's rounding
   */
  public roundCurrency(amount: number): number {
    return new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber();
  }

  /**
   * Convert cart data for safe JSON serialization
   */
  public serializeCartData(cartData: CartData): any {
    return {
      ...cartData,
      totals: {
        ...cartData.totals,
        // Ensure all monetary values are properly rounded
        subtotal: this.roundCurrency(cartData.totals.subtotal),
        itemsSubtotal: this.roundCurrency(cartData.totals.itemsSubtotal),
        laborSubtotal: this.roundCurrency(cartData.totals.laborSubtotal),
        itemDiscounts: this.roundCurrency(cartData.totals.itemDiscounts),
        laborDiscounts: this.roundCurrency(cartData.totals.laborDiscounts),
        taxAmount: this.roundCurrency(cartData.totals.taxAmount),
        finalTotal: this.roundCurrency(cartData.totals.finalTotal)
      }
    };
  }
}

// Export singleton instance
export const financialCalculationService = FinancialCalculationService.getInstance();