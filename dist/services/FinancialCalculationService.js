"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.financialCalculationService = exports.FinancialCalculationService = void 0;
const decimal_js_1 = __importDefault(require("decimal.js"));
const logger_1 = require("../utils/logger");
decimal_js_1.default.set({
    precision: 20,
    rounding: decimal_js_1.default.ROUND_HALF_EVEN,
    toExpNeg: -7,
    toExpPos: 21
});
class FinancialCalculationService {
    constructor() {
        this.MAX_PERCENTAGE = 100;
        this.MAX_NOMINAL_DISCOUNT = 1000000;
        this.MIN_ITEM_PRICE = 0.01;
        this.DEFAULT_TAX_RATE = 0.10;
        logger_1.Logger.info('FinancialCalculationService initialized with precision settings', {
            precision: decimal_js_1.default.precision,
            rounding: decimal_js_1.default.rounding
        });
    }
    static getInstance() {
        if (!FinancialCalculationService.instance) {
            FinancialCalculationService.instance = new FinancialCalculationService();
        }
        return FinancialCalculationService.instance;
    }
    calculateItemDiscount(price, quantity, discount) {
        try {
            const priceDecimal = new decimal_js_1.default(price);
            const quantityDecimal = new decimal_js_1.default(quantity);
            const itemSubtotal = priceDecimal.times(quantityDecimal);
            if (!discount) {
                return {
                    discountAmount: new decimal_js_1.default(0),
                    finalAmount: itemSubtotal,
                    isValid: true
                };
            }
            let discountAmount;
            if (discount.type === 'percentage') {
                if (discount.value < 0 || discount.value > this.MAX_PERCENTAGE) {
                    return {
                        discountAmount: new decimal_js_1.default(0),
                        finalAmount: itemSubtotal,
                        isValid: false,
                        error: `Percentage discount must be between 0 and ${this.MAX_PERCENTAGE}`
                    };
                }
                const discountRate = new decimal_js_1.default(discount.value).dividedBy(100);
                discountAmount = itemSubtotal.times(discountRate);
            }
            else {
                discountAmount = new decimal_js_1.default(discount.value);
                if (discountAmount.isNegative()) {
                    return {
                        discountAmount: new decimal_js_1.default(0),
                        finalAmount: itemSubtotal,
                        isValid: false,
                        error: 'Nominal discount cannot be negative'
                    };
                }
                if (discountAmount.greaterThan(itemSubtotal)) {
                    return {
                        discountAmount: itemSubtotal,
                        finalAmount: new decimal_js_1.default(0),
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
        }
        catch (error) {
            logger_1.Logger.error('Item discount calculation failed', { error, price, quantity, discount });
            return {
                discountAmount: new decimal_js_1.default(0),
                finalAmount: new decimal_js_1.default(price * quantity),
                isValid: false,
                error: 'Calculation error occurred'
            };
        }
    }
    calculateCartItemTotals(items) {
        return items.map(item => {
            const calculation = this.calculateItemDiscount(item.price, item.quantity, item.discount);
            const subtotal = new decimal_js_1.default(item.price).times(item.quantity).toNumber();
            const discountAmount = calculation.discountAmount.toNumber();
            const total = calculation.finalAmount.toNumber();
            let updatedDiscount = item.discount;
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
    calculateLaborItemTotals(laborItems) {
        return laborItems.map(item => {
            const calculation = this.calculateItemDiscount(item.rate, item.quantity, item.discount);
            const subtotal = new decimal_js_1.default(item.rate).times(item.quantity).toNumber();
            const discountAmount = calculation.discountAmount.toNumber();
            const total = calculation.finalAmount.toNumber();
            let updatedDiscount = item.discount;
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
    calculateTotalDiscount(subtotal, totalDiscount) {
        try {
            const subtotalDecimal = new decimal_js_1.default(subtotal);
            if (!totalDiscount) {
                return {
                    discountAmount: new decimal_js_1.default(0),
                    finalAmount: subtotalDecimal,
                    isValid: true
                };
            }
            let discountAmount;
            if (totalDiscount.type === 'percentage') {
                if (totalDiscount.value < 0 || totalDiscount.value > this.MAX_PERCENTAGE) {
                    return {
                        discountAmount: new decimal_js_1.default(0),
                        finalAmount: subtotalDecimal,
                        isValid: false,
                        error: `Percentage discount must be between 0 and ${this.MAX_PERCENTAGE}`
                    };
                }
                const discountRate = new decimal_js_1.default(totalDiscount.value).dividedBy(100);
                discountAmount = subtotalDecimal.times(discountRate);
            }
            else {
                discountAmount = new decimal_js_1.default(totalDiscount.value);
                if (discountAmount.isNegative()) {
                    return {
                        discountAmount: new decimal_js_1.default(0),
                        finalAmount: subtotalDecimal,
                        isValid: false,
                        error: 'Nominal discount cannot be negative'
                    };
                }
                if (discountAmount.greaterThan(subtotalDecimal)) {
                    discountAmount = subtotalDecimal;
                }
            }
            const finalAmount = subtotalDecimal.minus(discountAmount);
            return {
                discountAmount: discountAmount.toDecimalPlaces(2),
                finalAmount: finalAmount.toDecimalPlaces(2),
                isValid: true
            };
        }
        catch (error) {
            logger_1.Logger.error('Total discount calculation failed', { error, subtotal, totalDiscount });
            return {
                discountAmount: new decimal_js_1.default(0),
                finalAmount: new decimal_js_1.default(subtotal),
                isValid: false,
                error: 'Calculation error occurred'
            };
        }
    }
    calculateTax(amount, taxConfig = { rate: this.DEFAULT_TAX_RATE }) {
        try {
            const amountDecimal = new decimal_js_1.default(amount);
            const taxRate = new decimal_js_1.default(taxConfig.rate);
            if (taxRate.isNegative() || taxRate.greaterThan(1)) {
                return {
                    taxAmount: new decimal_js_1.default(0),
                    afterTaxAmount: amountDecimal,
                    isValid: false,
                    error: 'Tax rate must be between 0 and 1'
                };
            }
            let taxAmount = amountDecimal.times(taxRate);
            switch (taxConfig.roundingMethod) {
                case 'floor':
                    taxAmount = taxAmount.toDecimalPlaces(2, decimal_js_1.default.ROUND_DOWN);
                    break;
                case 'ceil':
                    taxAmount = taxAmount.toDecimalPlaces(2, decimal_js_1.default.ROUND_UP);
                    break;
                default:
                    taxAmount = taxAmount.toDecimalPlaces(2, decimal_js_1.default.ROUND_HALF_EVEN);
            }
            const afterTaxAmount = taxConfig.inclusive ? amountDecimal : amountDecimal.plus(taxAmount);
            return {
                taxAmount: taxAmount,
                afterTaxAmount: afterTaxAmount.toDecimalPlaces(2),
                isValid: true
            };
        }
        catch (error) {
            logger_1.Logger.error('Tax calculation failed', { error, amount, taxConfig });
            return {
                taxAmount: new decimal_js_1.default(0),
                afterTaxAmount: new decimal_js_1.default(amount),
                isValid: false,
                error: 'Tax calculation error occurred'
            };
        }
    }
    calculateComprehensiveCartTotals(cartData, taxRate = this.DEFAULT_TAX_RATE) {
        const errors = [];
        const startTime = Date.now();
        try {
            const updatedItems = this.calculateCartItemTotals(cartData.items);
            const updatedLaborItems = this.calculateLaborItemTotals(cartData.laborItems);
            const itemsSubtotal = updatedItems.reduce((sum, item) => sum.plus(new decimal_js_1.default(item.price).times(item.quantity)), new decimal_js_1.default(0));
            const laborSubtotal = updatedLaborItems.reduce((sum, item) => sum.plus(new decimal_js_1.default(item.rate).times(item.quantity)), new decimal_js_1.default(0));
            const itemDiscounts = updatedItems.reduce((sum, item) => sum.plus(new decimal_js_1.default(item.discount?.appliedAmount || 0)), new decimal_js_1.default(0));
            const laborDiscounts = updatedLaborItems.reduce((sum, item) => sum.plus(new decimal_js_1.default(item.discount?.appliedAmount || 0)), new decimal_js_1.default(0));
            const itemsAfterDiscounts = itemsSubtotal.minus(itemDiscounts);
            const laborAfterDiscounts = laborSubtotal.minus(laborDiscounts);
            const grandSubtotal = itemsAfterDiscounts.plus(laborAfterDiscounts);
            const totalDiscountCalc = this.calculateTotalDiscount(grandSubtotal.toNumber(), cartData.totalDiscount);
            if (!totalDiscountCalc.isValid) {
                errors.push({
                    field: 'totalDiscount',
                    message: totalDiscountCalc.error || 'Total discount calculation failed'
                });
            }
            const afterTotalDiscount = totalDiscountCalc.finalAmount;
            const taxCalc = this.calculateTax(afterTotalDiscount.toNumber(), { rate: taxRate });
            if (!taxCalc.isValid) {
                errors.push({
                    field: 'tax',
                    message: taxCalc.error || 'Tax calculation failed'
                });
            }
            const finalTotal = taxCalc.afterTaxAmount;
            let updatedTotalDiscount = cartData.totalDiscount;
            if (updatedTotalDiscount) {
                updatedTotalDiscount = {
                    ...updatedTotalDiscount,
                    appliedAmount: totalDiscountCalc.discountAmount.toNumber()
                };
            }
            const totals = {
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
            const updatedCartData = {
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
            logger_1.Logger.info('Comprehensive cart calculation completed', {
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
        }
        catch (error) {
            logger_1.Logger.error('Comprehensive cart calculation failed', {
                error: error instanceof Error ? error.message : String(error),
                calculationTime: Date.now() - startTime
            });
            errors.push({
                field: 'calculation',
                message: 'Comprehensive calculation failed'
            });
            return {
                totals: this.getFallbackTotals(cartData, taxRate),
                updatedCartData: cartData,
                isValid: false,
                errors
            };
        }
    }
    validateCartData(cartData) {
        const errors = [];
        const warnings = [];
        if (!cartData || typeof cartData !== 'object') {
            errors.push({
                field: 'cartData',
                message: 'Cart data is required and must be an object'
            });
            return { isValid: false, errors, warnings };
        }
        if (!Array.isArray(cartData.items)) {
            errors.push({
                field: 'items',
                message: 'Items must be an array'
            });
        }
        else {
            cartData.items.forEach((item, index) => {
                this.validateCartItem(item, `items[${index}]`, errors, warnings);
            });
        }
        if (!Array.isArray(cartData.laborItems)) {
            errors.push({
                field: 'laborItems',
                message: 'Labor items must be an array'
            });
        }
        else {
            cartData.laborItems.forEach((item, index) => {
                this.validateLaborItem(item, `laborItems[${index}]`, errors, warnings);
            });
        }
        if (cartData.totalDiscount) {
            this.validateDiscount(cartData.totalDiscount, 'totalDiscount', errors, warnings);
        }
        const result = {
            isValid: errors.length === 0,
            errors
        };
        if (warnings.length > 0) {
            result.warnings = warnings;
        }
        return result;
    }
    validateCartItem(item, fieldPrefix, errors, warnings) {
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
        if (item.price > 50000) {
            warnings.push(`High item price detected: $${item.price} for ${item.name}`);
        }
        if (item.quantity > 1000) {
            warnings.push(`High quantity detected: ${item.quantity} for ${item.name}`);
        }
    }
    validateLaborItem(item, fieldPrefix, errors, warnings) {
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
        if (item.rate > 1000) {
            warnings.push(`High labor rate detected: $${item.rate}/hr for ${item.name}`);
        }
    }
    validateDiscount(discount, fieldPrefix, errors, warnings) {
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
    formatCurrency(amount, locale = 'en-US', currency = 'USD') {
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        }
        catch (error) {
            logger_1.Logger.warn('Currency formatting failed, using fallback', { amount, locale, currency, error });
            return `$${amount.toFixed(2)}`;
        }
    }
    getFallbackTotals(cartData, taxRate) {
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
    roundCurrency(amount) {
        return new decimal_js_1.default(amount).toDecimalPlaces(2, decimal_js_1.default.ROUND_HALF_EVEN).toNumber();
    }
    serializeCartData(cartData) {
        return {
            ...cartData,
            totals: {
                ...cartData.totals,
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
exports.FinancialCalculationService = FinancialCalculationService;
exports.financialCalculationService = FinancialCalculationService.getInstance();
//# sourceMappingURL=FinancialCalculationService.js.map