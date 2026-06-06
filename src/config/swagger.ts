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
      description: 'CommandCtr Shopify MVP backend APIs.'
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
      '/api/v1/shopify/connect': {
        get: {
          tags: ['Shopify'],
          summary: 'Start Shopify OAuth connection',
          description: 'Frontend should open this endpoint after user login to begin the Shopify OAuth flow.',
          security: bearerSecurity,
          responses: { '302': { description: 'Redirects to Shopify OAuth authorize screen' } }
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
          responses: { '200': { description: 'Shopify connection established' }, '302': { description: 'Redirects to frontend success URL if configured' } }
        }
      },
      '/api/v1/shopify/disconnect': { post: { tags: ['Shopify'], summary: 'Disconnect Shopify store', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/shopify/status': { get: { tags: ['Shopify'], summary: 'Shopify status', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/shopify/shop': { get: { tags: ['Shopify'], summary: 'Shopify shop', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/shopify/import-products': { post: { tags: ['Shopify'], summary: 'Import Shopify products', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
      '/api/v1/shopify/products': {
        get: { tags: ['Shopify'], summary: 'Live Shopify products', security: bearerSecurity, responses: { '200': { description: 'OK' } } },
        post: {
          tags: ['Shopify'],
          summary: 'Create Shopify product',
          security: bearerSecurity,
          requestBody: { content: { 'application/json': { example: { title: 'Demo product', description: '<p>Demo description</p>', vendor: 'CommandCtr', productType: 'Apparel', status: 'ACTIVE', tags: ['demo'], variants: [{ title: 'Default Title', price: '29.99', sku: 'DEMO-001' }] } } } },
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
      '/api/v1/inventory': { get: { tags: ['Inventory'], summary: 'Local inventory', security: bearerSecurity, responses: { '200': { description: 'OK' } } } },
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
