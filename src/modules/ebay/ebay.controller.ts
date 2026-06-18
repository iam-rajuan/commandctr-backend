import { httpStatus } from '@/constants/http.constant';
import { ebaySyncService } from '@/modules/ebay/ebay.sync.service';
import { ebayListingService } from '@/modules/ebay/ebay.listing.service';
import { ApiResponse } from '@/shared/api-response';
import { asyncHandler } from '@/shared/async-handler';

import { ebayService } from './ebay.service';

const getParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

export const ebayController = {
  connectUrl: asyncHandler(async (req, res) => {
    const connectUrl = await ebayService.createConnectUrl(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('eBay connect URL generated successfully', { connectUrl }));
  }),
  callback: asyncHandler(async (req, res) => {
    await ebayService.handleOAuthCallback(req, res);
  }),
  status: asyncHandler(async (req, res) => {
    const result = await ebayService.getStatus(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('eBay connection status fetched successfully', result));
  }),
  disconnect: asyncHandler(async (req, res) => {
    const result = await ebayService.disconnect(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('eBay seller account disconnected successfully', result));
  }),
  getInventory: asyncHandler(async (req, res) => {
    const inventory = await ebayListingService.getInventory(req.user!.userId);
    res.status(httpStatus.OK).json(ApiResponse.success('eBay inventory fetched successfully', inventory));
  }),
  updateInventory: asyncHandler(async (req, res) => {
    const inventory = await ebayListingService.updateInventoryQuantity(
      req.user!.userId,
      getParam(req.params.productId),
      req.body.quantity
    );
    res.status(httpStatus.OK).json(ApiResponse.success('eBay inventory updated successfully', inventory));
  }),
  queueProductSync: asyncHandler(async (req, res) => {
    const job = await ebaySyncService.syncProductToEbay(req.user!.userId, getParam(req.params.productId));
    res.status(httpStatus.ACCEPTED).json(ApiResponse.success('eBay product sync queued successfully', job));
  }),
  queueInventorySync: asyncHandler(async (req, res) => {
    const job = await ebaySyncService.syncInventory(req.user!.userId, getParam(req.params.productId));
    res.status(httpStatus.ACCEPTED).json(ApiResponse.success('eBay inventory sync queued successfully', job));
  }),
  queuePriceSync: asyncHandler(async (req, res) => {
    const job = await ebaySyncService.syncPrice(req.user!.userId, getParam(req.params.productId));
    res.status(httpStatus.ACCEPTED).json(ApiResponse.success('eBay price sync queued successfully', job));
  }),
  queuePublish: asyncHandler(async (req, res) => {
    const job = await ebaySyncService.publishListing(req.user!.userId, getParam(req.params.productId));
    res.status(httpStatus.ACCEPTED).json(ApiResponse.success('eBay publish job queued successfully', job));
  }),
  queueEndListing: asyncHandler(async (req, res) => {
    const job = await ebaySyncService.endListing(req.user!.userId, getParam(req.params.productId));
    res.status(httpStatus.ACCEPTED).json(ApiResponse.success('eBay end listing job queued successfully', job));
  }),
  getListingStatus: asyncHandler(async (req, res) => {
    const result = await ebayListingService.getListingStatus(req.user!.userId, getParam(req.params.productId));
    res.status(httpStatus.OK).json(ApiResponse.success('eBay listing status fetched successfully', result));
  }),
  queuePullListings: asyncHandler(async (req, res) => {
    const job = await ebaySyncService.pullEbayListings(req.user!.userId, req.body);
    res.status(httpStatus.ACCEPTED).json(ApiResponse.success('eBay listing pull job queued successfully', job));
  }),
  getJob: asyncHandler(async (req, res) => {
    const job = await ebaySyncService.getJob(req.user!.userId, getParam(req.params.jobId));
    res.status(httpStatus.OK).json(ApiResponse.success('eBay sync job fetched successfully', job));
  })
};
