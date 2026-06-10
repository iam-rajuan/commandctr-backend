import { marketplaceConnectionService } from '@/modules/marketplace-connections/marketplace-connection.service';
import { OrderModel } from '@/modules/orders/order.model';

import { WalletActivityItem, WalletActivityType, WalletOverview, WalletPlatformBalance } from './wallet.interface';

const DEFAULT_CURRENCY = 'USD';
const WALLET_NOTICE =
  'Wallet totals are based on imported Shopify orders. Shopify payouts, fees, refunds, and bank balance are not included yet.';

const PAID_STATUSES = new Set(['PAID']);
const PENDING_STATUSES = new Set(['PENDING', 'PAYMENT_PENDING', 'PARTIALLY_PAID', 'AUTHORIZED']);
const REFUNDED_STATUSES = new Set(['REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED', 'CANCELLED']);

const normalizeFinancialStatus = (value: unknown) => String(value ?? '').trim().toUpperCase();

const parseAmount = (value: unknown) => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return numericValue;
};

const roundCurrency = (value: number) => Number(value.toFixed(2));

const getPlatformBalances = (
  currency: string,
  shopifyAmount: number,
  isShopifyConnected: boolean,
  amazonAmount: number,
  ebayAmount: number,
  tiktokAmount: number
): WalletPlatformBalance[] => [
  {
    platform: 'shopify',
    label: 'Shopify Revenue',
    amount: roundCurrency(shopifyAmount),
    currency,
    status: isShopifyConnected ? 'Connected' : 'Not Connected',
    isConnected: isShopifyConnected
  },
  {
    platform: 'amazon',
    label: 'Amazon Seller',
    amount: roundCurrency(amazonAmount),
    currency,
    status: amazonAmount > 0 ? 'Connected' : 'Coming Soon',
    isConnected: amazonAmount > 0
  },
  {
    platform: 'ebay',
    label: 'eBay Payout',
    amount: roundCurrency(ebayAmount),
    currency,
    status: ebayAmount > 0 ? 'Connected' : 'Coming Soon',
    isConnected: ebayAmount > 0
  },
  {
    platform: 'tiktok',
    label: 'TikTok Shop',
    amount: roundCurrency(tiktokAmount),
    currency,
    status: tiktokAmount > 0 ? 'Connected' : 'Coming Soon',
    isConnected: tiktokAmount > 0
  }
];

const buildActivityType = (financialStatus: string): WalletActivityType => {
  if (PAID_STATUSES.has(financialStatus)) {
    return 'ORDER_PAID';
  }

  if (PENDING_STATUSES.has(financialStatus)) {
    return 'ORDER_PENDING';
  }

  if (REFUNDED_STATUSES.has(financialStatus)) {
    return 'ORDER_REFUNDED';
  }

  return 'ORDER_CREATED';
};

const buildActivityTitle = (type: WalletActivityType) => {
  if (type === 'ORDER_PAID') {
    return 'Shopify order paid';
  }

  if (type === 'ORDER_PENDING') {
    return 'Shopify order pending';
  }

  if (type === 'ORDER_REFUNDED') {
    return 'Shopify order refunded';
  }

  return 'Shopify order created';
};

export const walletService = {
  async getOverview(userId: string): Promise<WalletOverview> {
    const [orders, shopifyConnection] = await Promise.all([
      OrderModel.find({ userId })
        .select('shopifyOrderId externalOrderId orderName financialStatus totalPrice currency processedAt createdAt marketplace')
        .sort({ processedAt: -1, createdAt: -1 })
        .lean(),
      marketplaceConnectionService.getShopifyConnection(userId).catch(() => null)
    ]);

    const currencyCounts = new Map<string, number>();
    for (const order of orders) {
      const currency = String(order.currency ?? '').trim() || DEFAULT_CURRENCY;
      currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + 1);
    }

    const primaryCurrency =
      [...currencyCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? DEFAULT_CURRENCY;
    const ordersInPrimaryCurrency = orders.filter((order) => (String(order.currency ?? '').trim() || DEFAULT_CURRENCY) === primaryCurrency);
    const multipleCurrencies = currencyCounts.size > 1;

    let paidRevenue = 0;
    let pendingRevenue = 0;
    let refundedRevenue = 0;
    let paidOrderCount = 0;
    let pendingOrderCount = 0;

    let shopifyAmount = 0;
    let amazonAmount = 0;
    let ebayAmount = 0;
    let tiktokAmount = 0;

    const recentActivity: WalletActivityItem[] = ordersInPrimaryCurrency.slice(0, 10).map((order) => {
      const financialStatus = normalizeFinancialStatus(order.financialStatus);
      const type = buildActivityType(financialStatus);
      const amount = parseAmount(order.totalPrice);
      const platform = String(order.marketplace ?? 'shopify').toLowerCase();

      if (type === 'ORDER_PAID') {
        paidRevenue += amount;
        paidOrderCount += 1;
        if (platform === 'shopify') {
          shopifyAmount += amount;
        } else if (platform === 'amazon') {
          amazonAmount += amount;
        } else if (platform === 'ebay') {
          ebayAmount += amount;
        } else if (platform === 'tiktok') {
          tiktokAmount += amount;
        }
      } else if (type === 'ORDER_PENDING') {
        pendingRevenue += amount;
        pendingOrderCount += 1;
      } else if (type === 'ORDER_REFUNDED') {
        refundedRevenue += 0;
      }

      const getPlatformLabel = (p: string) => {
        if (p === 'amazon') return 'Amazon';
        if (p === 'ebay') return 'eBay';
        if (p === 'tiktok') return 'TikTok';
        return 'Shopify';
      };

      const platLabel = getPlatformLabel(platform);

      return {
        id: String(order._id ?? order.shopifyOrderId ?? order.externalOrderId ?? order.orderName ?? ''),
        type,
        title: type === 'ORDER_PAID'
          ? `${platLabel} order paid`
          : type === 'ORDER_PENDING'
          ? `${platLabel} order pending`
          : type === 'ORDER_REFUNDED'
          ? `${platLabel} order refunded`
          : `${platLabel} order created`,
        subtitle: order.orderName ?? order.shopifyOrderId ?? order.externalOrderId ?? `${platLabel} order`,
        amount: type === 'ORDER_REFUNDED' ? 0 : roundCurrency(amount),
        currency: primaryCurrency,
        status: financialStatus.toLowerCase() || 'created',
        occurredAt: order.processedAt?.toISOString?.() ?? order.createdAt?.toISOString?.() ?? null
      };
    });

    for (const order of ordersInPrimaryCurrency.slice(10)) {
      const financialStatus = normalizeFinancialStatus(order.financialStatus);
      const amount = parseAmount(order.totalPrice);
      const platform = String(order.marketplace ?? 'shopify').toLowerCase();

      if (PAID_STATUSES.has(financialStatus)) {
        paidRevenue += amount;
        paidOrderCount += 1;
        if (platform === 'shopify') {
          shopifyAmount += amount;
        } else if (platform === 'amazon') {
          amazonAmount += amount;
        } else if (platform === 'ebay') {
          ebayAmount += amount;
        } else if (platform === 'tiktok') {
          tiktokAmount += amount;
        }
      } else if (PENDING_STATUSES.has(financialStatus)) {
        pendingRevenue += amount;
        pendingOrderCount += 1;
      }
    }

    const notice = multipleCurrencies
      ? `${WALLET_NOTICE} Multiple order currencies were detected, so totals currently reflect ${primaryCurrency} orders only.`
      : WALLET_NOTICE;

    return {
      currency: primaryCurrency,
      totalRevenue: roundCurrency(paidRevenue),
      paidRevenue: roundCurrency(paidRevenue),
      pendingRevenue: roundCurrency(pendingRevenue),
      refundedRevenue: roundCurrency(refundedRevenue),
      orderCount: orders.length,
      paidOrderCount,
      pendingOrderCount,
      platformBalances: getPlatformBalances(
        primaryCurrency,
        shopifyAmount,
        Boolean(shopifyConnection),
        amazonAmount,
        ebayAmount,
        tiktokAmount
      ),
      recentActivity,
      notice
    };
  }
};
