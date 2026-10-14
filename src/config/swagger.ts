import { Express } from 'express';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import { APP_NAME, APP_VERSION } from '@/constants/app.constant';

const bearerSecurity = [{ bearerAuth: [] }];

const spec = swaggerJSDoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: `${APP_NAME} API`,
      version: APP_VERSION,
      description: 'Twinstr marketplace backend APIs.'
    },
    servers: [{ url: 'http://localhost:5000' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    paths: {
      '/api/v1/health': { get: { tags: ['Health'], summary: 'Health check', responses: { '200': { description: 'OK' } } } },
      '/api/v1/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register user',
          requestBody: {
            required: true,
            content: { 'application/json': { example: { firstName: 'John', lastName: 'Doe', email: 'john@example.com', password: 'Password@123' } } }
          },
          responses: { '201': { description: 'Created' } }
        }
      },
      '/api/v1/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login user',
          requestBody: {
            required: true,
            content: { 'application/json': { example: { email: 'john@example.com', password: 'Password@123' } } }
          },
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/auth/refresh-token': {
        post: {
          tags: ['Auth'],
          summary: 'Refresh access token',
          requestBody: {
            required: true,
            content: { 'application/json': { example: { refreshToken: 'jwt_refresh_token' } } }
          },
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/auth/logout': { post: { tags: ['Auth'], summary: 'Logout', responses: { '200': { description: 'OK' } } } },
      '/api/v1/auth/me': { get: { tags: ['Auth'], summary: 'Current user', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/users/profile': {
        get: { tags: ['Users'], summary: 'Get profile', security: bearerSecurity, responses: { '200': { description: 'OK' } } },
        patch: {
          tags: ['Users'],
          summary: 'Update profile',
          security: bearerSecurity,
          requestBody: { content: { 'application/json': { example: { firstName: 'John', phone: '+123456789' } } } },
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/users/change-password': {
        patch: {
          tags: ['Users'],
          summary: 'Change password',
          security: bearerSecurity,
          requestBody: { content: { 'application/json': { example: { currentPassword: 'Password@123', newPassword: 'NewPassword@123' } } } },
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/admin/users': { get: { tags: ['Admin'], summary: 'List users', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/admin/users/{id}': {
        get: { tags: ['Admin'], summary: 'Get user', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
        delete: { tags: ['Admin'], summary: 'Delete user', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
      },
      '/api/v1/admin/users/{id}/block': { patch: { tags: ['Admin'], summary: 'Block user', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/v1/admin/users/{id}/unblock': { patch: { tags: ['Admin'], summary: 'Unblock user', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/v1/dashboard/overview': { get: { tags: ['Dashboard'], summary: 'Dashboard overview', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/wallet/overview': {
        get: {
          tags: ['Wallet'],
          summary: 'Read-only wallet overview based on imported Shopify orders',
          description:
            'Returns Shopify revenue metrics from local imported orders. This is not a payout balance, bank balance, or Shopify Payments ledger.',
          security: bearerSecurity,
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    message: 'Wallet overview retrieved successfully',
                    data: {
                      currency: 'GBP',
                      totalRevenue: 469,
                      paidRevenue: 469,
                      pendingRevenue: 199.91,
                      refundedRevenue: 0,
                      orderCount: 4,
                      paidOrderCount: 3,
                      pendingOrderCount: 1,
                      platformBalances: [
                        {
                          platform: 'shopify',
                          label: 'Shopify Revenue',
                          amount: 469,
                          currency: 'GBP',
                          status: 'Connected',
                          isConnected: true
                        }
                      ],
                      recentActivity: [
                        {
                          id: 'order-id',
                          type: 'ORDER_PAID',
                          title: 'Shopify order paid',
                          subtitle: '#1004',
                          amount: 115.14,
                          currency: 'GBP',
                          status: 'paid',
                          occurredAt: '2026-06-09T10:00:00.000Z'
                        }
                      ],
                      notice:
                        'Wallet totals are based on imported Shopify orders. Shopify payouts, fees, refunds, and bank balance are not included yet.'
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/shopify/connect': {
        get: {
          tags: ['Shopify'],
          summary: 'Start Shopify OAuth connection',
          description: 'Frontend should open this endpoint after user login to begin the Shopify OAuth flow.',
          security: bearerSecurity,
          responses: { '302': { description: 'Redirects to Shopify OAuth authorize screen' } }
        }
      },
      '/api/v1/shopify/connect-url': {
        get: {
          tags: ['Shopify'],
          summary: 'Generate Shopify OAuth connect URL',
          description: 'Protected endpoint for the frontend. Call this endpoint with Bearer auth, then set window.location.href to the returned connectUrl.',
          security: bearerSecurity,
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    message: 'Shopify connect URL generated successfully',
                    data: {
                      connectUrl: 'https://your-store.myshopify.com/admin/oauth/authorize?...'
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/shopify/callback': {
        get: {
          tags: ['Shopify'],
          summary: 'Handle Shopify OAuth callback',
          description: 'Public callback endpoint used by Shopify after app authorization.',
          parameters: [
            { name: 'shop', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'code', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'hmac', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'state', in: 'query', required: true, schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'Shopify connection established' }, '302': { description: 'Redirects to /integration with success or error query params if FRONTEND_URL is configured' } }
        }
      },
      '/api/v1/shopify/disconnect': { post: { tags: ['Shopify'], summary: 'Disconnect Shopify store', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/shopify/status': { get: { tags: ['Shopify'], summary: 'Shopify status', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/shopify/shop': { get: { tags: ['Shopify'], summary: 'Shopify shop', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/ebay/connect-url': {
        get: {
          tags: ['eBay'],
          summary: 'Generate eBay OAuth connect URL',
          description: 'Protected endpoint for Twinstr merchants. Call this endpoint with Bearer auth, then redirect the browser to the returned connectUrl.',
          security: bearerSecurity,
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    message: 'eBay connect URL generated successfully',
                    data: {
                      connectUrl: 'https://auth.sandbox.ebay.com/oauth2/authorize?...'
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/ebay/callback': {
        get: {
          tags: ['eBay'],
          summary: 'Handle eBay OAuth callback',
          description: 'Public callback endpoint used by eBay seller OAuth. This MVP stores encrypted OAuth tokens only and does not perform listing or order actions yet.',
          parameters: [
            { name: 'code', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'state', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'error', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'error_description', in: 'query', required: false, schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'eBay connection established' },
            '302': { description: 'Redirects to /integration with success or error query params if FRONTEND_URL is configured' }
          }
        }
      },
      '/api/v1/ebay/status': {
        get: {
          tags: ['eBay'],
          summary: 'eBay seller connection status',
          description: 'Returns the stored eBay OAuth connection state only. No eBay product, listing, inventory, or order operations are included in this MVP.',
          security: bearerSecurity,
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/ebay/disconnect': {
        post: {
          tags: ['eBay'],
          summary: 'Disconnect eBay seller account',
          description: 'Marks the local eBay OAuth connection as disconnected and clears stored encrypted token material.',
          security: bearerSecurity,
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/etsy/connect-url': {
        get: {
          tags: ['Etsy'],
          summary: 'Generate Etsy OAuth connect URL',
          description: 'Protected endpoint for Twinstr merchants. Call this endpoint with Bearer auth, then redirect the browser to the returned connectUrl.',
          security: bearerSecurity,
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    message: 'Etsy connect URL generated successfully',
                    data: {
                      connectUrl: 'https://www.etsy.com/oauth/connect?...'
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/etsy/callback': {
        get: {
          tags: ['Etsy'],
          summary: 'Handle Etsy OAuth callback',
          description: 'Public callback endpoint used by Etsy seller OAuth with PKCE. This endpoint exchanges the authorization code for encrypted OAuth tokens and redirects back to the integration page.',
          parameters: [
            { name: 'code', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'state', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'error', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'error_description', in: 'query', required: false, schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'Etsy connection established' },
            '302': { description: 'Redirects to /integration with success or error query params if FRONTEND_URL is configured' }
          }
        }
      },
      '/api/v1/etsy/status': {
        get: {
          tags: ['Etsy'],
          summary: 'Etsy seller connection status',
          description: 'Returns the stored Etsy OAuth connection state only. No Etsy listing, inventory, or order operations are included in this OAuth-only flow.',
          security: bearerSecurity,
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/etsy/disconnect': {
        post: {
          tags: ['Etsy'],
          summary: 'Disconnect Etsy seller account',
          description: 'Marks the local Etsy OAuth connection as disconnected and clears stored encrypted token material.',
          security: bearerSecurity,
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/shopify/import-products': {
        post: {
          tags: ['Shopify'],
          summary: 'Import Shopify products',
          security: bearerSecurity,
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    message: 'Shopify products imported successfully',
                    data: {
                      count: 2,
                      importedCount: 1,
                      updatedCount: 1,
                      staleMarkedInactiveCount: 5,
                      activeCount: 2
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/shopify/products': {
        get: { tags: ['Shopify'], summary: 'Live Shopify products', security: bearerSecurity, responses: { '200': { description: 'OK' } } },
        post: {
          tags: ['Shopify'],
          summary: 'Create Shopify product',
          description: 'Accepts the frontend variants array for convenience. The backend currently creates the Shopify product first, then applies price and SKU to the default Shopify variant using only the first item from variants.',
          security: bearerSecurity,
          requestBody: { content: { 'application/json': { example: { title: 'Demo product', description: '<p>Demo description</p>', vendor: 'Twinstr', productType: 'Apparel', status: 'ACTIVE', tags: ['demo'], variants: [{ title: 'Default Title', price: '29.99', sku: 'DEMO-001' }] } } } },
          responses: { '201': { description: 'Created' } }
        }
      },
      '/api/v1/shopify/products/{shopifyProductId}': {
        patch: {
          tags: ['Shopify'],
          summary: 'Update Shopify product',
          security: bearerSecurity,
          parameters: [{ name: 'shopifyProductId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { example: { title: 'Updated title', description: '<p>Updated</p>', status: 'ACTIVE' } } } },
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/shopify/products/{shopifyProductId}/price': {
        patch: {
          tags: ['Shopify'],
          summary: 'Update Shopify price',
          security: bearerSecurity,
          parameters: [{ name: 'shopifyProductId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { example: { variantId: 'gid://shopify/ProductVariant/123', price: '34.99', compareAtPrice: '39.99' } } } },
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/shopify/orders': { get: { tags: ['Shopify'], summary: 'Live Shopify orders', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/shopify/import-orders': { post: { tags: ['Shopify'], summary: 'Import Shopify orders', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/shopify/import-disputes': {
        post: {
          tags: ['Shopify'],
          summary: 'Import Shopify disputes into the local read-only MVP store',
          description:
            'Attempts to import real Shopify dispute or chargeback data when available. If current Shopify API access or scopes do not expose dispute data, this endpoint succeeds with count 0 and a warning instead of failing.',
          security: bearerSecurity,
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    message: 'Shopify disputes import completed',
                    data: {
                      count: 0,
                      warning: 'No Shopify dispute data available with current API/scopes.'
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/shopify/locations': { get: { tags: ['Shopify'], summary: 'Shopify locations', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/shopify/inventory': { get: { tags: ['Shopify'], summary: 'Shopify inventory', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/shopify/inventory/{inventoryItemId}': {
        patch: {
          tags: ['Shopify'],
          summary: 'Update Shopify inventory',
          security: bearerSecurity,
          parameters: [{ name: 'inventoryItemId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { example: { locationId: 'gid://shopify/Location/123', quantity: 50 } } } },
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/products': { get: { tags: ['Products'], summary: 'Local products', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/products/{id}': {
        get: { tags: ['Products'], summary: 'Local product', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
        patch: { tags: ['Products'], summary: 'Update local product', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
        delete: { tags: ['Products'], summary: 'Delete local product', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
      },
      '/api/v1/orders': { get: { tags: ['Orders'], summary: 'Local orders', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/orders/{id}': { get: { tags: ['Orders'], summary: 'Local order', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/v1/disputes': {
        get: {
          tags: ['Disputes'],
          summary: 'List locally stored Shopify disputes for the read-only MVP',
          description:
            'Returns dispute rows and summary stats for the Shopify-only disputes MVP. This endpoint is read-only and does not support evidence submission or resolution actions.',
          security: bearerSecurity,
          parameters: [
            { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['OPEN', 'SUBMITTED', 'WON', 'LOST', 'UNKNOWN'] } },
            { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'page', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'string' } }
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    message: 'Disputes retrieved successfully',
                    data: {
                      items: [],
                      meta: {
                        page: 1,
                        limit: 25,
                        total: 0,
                        totalPages: 1
                      },
                      stats: {
                        actionRequired: 0,
                        activeDisputes: 0,
                        won: 0,
                        lost: 0,
                        submitted: 0,
                        avgResolutionTimeDays: null
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/disputes/{id}': {
        get: {
          tags: ['Disputes'],
          summary: 'Read one local Shopify dispute for the read-only MVP',
          description:
            'Returns a single locally stored dispute record plus a related local order summary when available. This endpoint is read-only and does not submit evidence or resolve disputes.',
          security: bearerSecurity,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/inventory': {
        get: {
          tags: ['Inventory'],
          summary: 'Local inventory',
          security: bearerSecurity,
          parameters: [{ name: 'includeInactive', in: 'query', required: false, schema: { type: 'boolean' } }],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  example: {
                    success: true,
                    message: 'Inventory fetched successfully',
                    data: [{
                      _id: '68476070cb3f4aa3fe8d8123',
                      inventoryItemId: 'gid://shopify/InventoryItem/123',
                      locationId: 'gid://shopify/Location/456',
                      shopifyProductId: 'gid://shopify/Product/789',
                      shopifyVariantId: 'gid://shopify/ProductVariant/987',
                      shopifyQuantity: 8,
                      safetyBuffer: 2,
                      availableQuantity: 6,
                      lowStockThreshold: 5,
                      isActive: true,
                      sourceStatus: 'active'
                    }]
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/inventory/{id}': {
        get: { tags: ['Inventory'], summary: 'Local inventory item', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
        patch: { tags: ['Inventory'], summary: 'Update local inventory item', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
      },
      '/api/v1/inventory/{id}/safety-buffer': { patch: { tags: ['Inventory'], summary: 'Update safety buffer', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/v1/sync/logs': { get: { tags: ['Sync'], summary: 'Sync logs', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/sync/logs/{id}': { get: { tags: ['Sync'], summary: 'Sync log', security: bearerSecurity, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
      '/api/v1/marketplace-connections': {
        get: {
          tags: ['Marketplace Connections'],
          summary: 'List current user marketplace connections',
          description: 'Returns marketplace connections without exposing encrypted access tokens or secrets.',
          security: bearerSecurity,
          responses: { '200': { description: 'OK' } }
        }
      }
    }
  },
  apis: []
});

export const setupSwagger = (app: Express) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
};
