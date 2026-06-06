import { httpStatus } from '@/constants/http.constant';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { shopifyService } from './shopify.service';

const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

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
    const result = await shopifyService.updateProduct(req.user!.userId, getParam(req.params.shopifyProductId), req.body);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify product updated successfully', result));
  }),
  updatePrice: asyncHandler(async (req, res) => {
    const result = await shopifyService.updateProductPrice(req.user!.userId, getParam(req.params.shopifyProductId), req.body);
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
  getLocations: asyncHandler(async (req, res) => {
    const result = await shopifyService.getLocations(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify locations fetched successfully', result));
  }),
  getInventory: asyncHandler(async (req, res) => {
    const result = await shopifyService.getInventory(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify inventory fetched successfully', result));
  }),
  updateInventory: asyncHandler(async (req, res) => {
    const result = await shopifyService.updateInventoryQuantity(req.user!.userId, getParam(req.params.inventoryItemId), req.body);
    res.status(httpStatus.OK).json(ApiResponse.success('Shopify inventory updated successfully', result));
  })
};
