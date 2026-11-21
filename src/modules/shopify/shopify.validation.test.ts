import { describe, expect, it } from 'vitest';

import { shopifyValidation } from './shopify.validation';

describe('Shopify bulk upload request validation', () => {
  it('accepts a valid CSV-mapped product row', () => {
    const result = shopifyValidation.bulkUpload.safeParse({
      body: {
        publishToOnlineStore: false,
        rows: [{
          title: 'Bulk test product',
          status: 'DRAFT',
          optionName: 'Size',
          optionValue: 'Small',
          price: '9.99',
          tags: ['bulk', 'test']
        }]
      }
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty bulk upload', () => {
    const result = shopifyValidation.bulkUpload.safeParse({ body: { rows: [] } });

    expect(result.success).toBe(false);
  });
});
