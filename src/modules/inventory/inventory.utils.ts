type InventoryAvailabilityStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

const coerceNonNegativeNumber = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
};

export const inventoryUtils = {
  coerceNonNegativeNumber,

  calculateInventoryAvailability(shopifyQuantity: unknown, safetyBuffer: unknown, lowStockThreshold: unknown) {
    const normalizedShopifyQuantity = coerceNonNegativeNumber(shopifyQuantity);
    const normalizedSafetyBuffer = coerceNonNegativeNumber(safetyBuffer);
    const normalizedLowStockThreshold = coerceNonNegativeNumber(lowStockThreshold);
    const availableQuantity = Math.max(normalizedShopifyQuantity - normalizedSafetyBuffer, 0);

    let status: InventoryAvailabilityStatus = 'OUT_OF_STOCK';
    if (availableQuantity > normalizedLowStockThreshold) {
      status = 'IN_STOCK';
    } else if (availableQuantity > 0) {
      status = 'LOW_STOCK';
    }

    return {
      shopifyQuantity: normalizedShopifyQuantity,
      safetyBuffer: normalizedSafetyBuffer,
      lowStockThreshold: normalizedLowStockThreshold,
      availableQuantity,
      status
    };
  }
};
