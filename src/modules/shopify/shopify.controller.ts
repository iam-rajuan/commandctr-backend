import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { shopifyService } from './shopify.service';

const getParam = (value: unknown): string => {
  if (Array.isArray(value)) {
    const firstValue = value[0];
    return typeof firstValue === 'string' ? firstValue : '';
  }

  return typeof value === 'string' ? value : '';
};

export const shopifyController = {
  connect: asyncHandler(async (req, res) => {
    const url = await shopifyService.createShopifyConnectUrl(req.user!.userId);
    res.redirect(url);
  }),
  connectUrl: asyncHandler(async (req, res) => {
    const connectUrl = await shopifyService.createShopifyConnectUrl(req.user!.userId);
    res.status(httpStatus.OK).json(
      ApiResponse.success('Shopify connect URL generated successfully', { connectUrl })
    );
  }),
  callback: asyncHandler(async (req, res) => {
    await shopifyService.handleOAuthCallback(req, res);
  }),
  productImage: asyncHandler(async (req, res) => {
    const result = await shopifyService.getProductImageProxy(getParam(req.query.path));
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(httpStatus.OK).send(result.payload);
  }),
  disconnect: asyncHandler(async (req, res) => {
    const result = await shopifyService.disconnect(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify store disconnected successfully', result));
  }),
  status: asyncHandler(async (req, res) => {
    const result = await shopifyService.getStatus(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify connection status fetched successfully', result));
  }),
  shop: asyncHandler(async (req, res) => {
    const result = await shopifyService.getShop(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify shop fetched successfully', result));
  }),
  importProducts: asyncHandler(async (req, res) => {
    const result = await shopifyService.importProducts(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify products imported successfully', result));
  }),
  getProducts: asyncHandler(async (req, res) => {
    const result = await shopifyService.getProducts(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify products fetched successfully', result));
  }),
  createProduct: asyncHandler(async (req, res) => {
    const result = await shopifyService.createProduct(req.user!.userId, req.body);
    res.status(httpStatus.CREATED).json(ApiResponse.success('Shopify product created successfully', result));
  }),
  updateProduct: asyncHandler(async (req, res) => {
    const shopifyProductId = getParam(req.params.shopifyProductId) || getParam(req.query.shopifyProductId) || getParam(req.query.id);
    const result = await shopifyService.updateProduct(req.user!.userId, shopifyProductId, req.body);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify product updated successfully', result));
  }),
  updatePrice: asyncHandler(async (req, res) => {
    const shopifyProductId = getParam(req.params.shopifyProductId) || getParam(req.query.shopifyProductId) || getParam(req.query.id);
    const result = await shopifyService.updateProductPrice(req.user!.userId, shopifyProductId, req.body);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify product price updated successfully', result));
  }),
  getOrders: asyncHandler(async (req, res) => {
    const result = await shopifyService.getOrders(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify orders fetched successfully', result));
  }),
  importOrders: asyncHandler(async (req, res) => {
    const result = await shopifyService.importOrders(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify orders imported successfully', result));
  }),
  importDisputes: asyncHandler(async (req, res) => {
    const result = await shopifyService.importDisputes(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify disputes import completed', result));
  }),
  getLocations: asyncHandler(async (req, res) => {
    const result = await shopifyService.getLocations(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify locations fetched successfully', result));
  }),
  getInventory: asyncHandler(async (req, res) => {
    const result = await shopifyService.getInventory(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify inventory fetched successfully', result));
  }),
  updateInventory: asyncHandler(async (req, res) => {
    const inventoryItemId = getParam(req.params.inventoryItemId) || getParam(req.query.inventoryItemId) || getParam(req.query.id);
    const result = await shopifyService.updateInventoryQuantity(req.user!.userId, inventoryItemId, req.body);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify inventory updated successfully', result));
  })
};
