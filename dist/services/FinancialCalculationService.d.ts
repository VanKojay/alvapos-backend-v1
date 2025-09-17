import Decimal from 'decimal.js';
import { CartData, CartItem, LaborItem, Discount, CartTotals, ValidationError } from '../types/api';
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
export declare class FinancialCalculationService {
    private static instance;
    private readonly MAX_PERCENTAGE;
    private readonly MAX_NOMINAL_DISCOUNT;
    private readonly MIN_ITEM_PRICE;
    private readonly DEFAULT_TAX_RATE;
    constructor();
    static getInstance(): FinancialCalculationService;
    calculateItemDiscount(price: number, quantity: number, discount?: Discount): {
        discountAmount: Decimal;
        finalAmount: Decimal;
        isValid: boolean;
        error?: string;
    };
    calculateCartItemTotals(items: CartItem[]): CartItem[];
    calculateLaborItemTotals(laborItems: LaborItem[]): LaborItem[];
    calculateTotalDiscount(subtotal: number, totalDiscount?: Discount): {
        discountAmount: Decimal;
        finalAmount: Decimal;
        isValid: boolean;
        error?: string;
    };
    calculateTax(amount: number, taxConfig?: TaxConfiguration): {
        taxAmount: Decimal;
        afterTaxAmount: Decimal;
        isValid: boolean;
        error?: string;
    };
    calculateComprehensiveCartTotals(cartData: CartData, taxRate?: number): {
        totals: CartTotals;
        updatedCartData: CartData;
        isValid: boolean;
        errors: ValidationError[];
    };
    validateCartData(cartData: CartData): FinancialValidationResult;
    private validateCartItem;
    private validateLaborItem;
    private validateDiscount;
    formatCurrency(amount: number, locale?: string, currency?: string): string;
    private getFallbackTotals;
    roundCurrency(amount: number): number;
    serializeCartData(cartData: CartData): any;
}
export declare const financialCalculationService: FinancialCalculationService;
//# sourceMappingURL=FinancialCalculationService.d.ts.map