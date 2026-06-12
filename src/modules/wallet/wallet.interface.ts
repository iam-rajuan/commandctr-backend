export type WalletActivityType = 'ORDER_PAID' | 'ORDER_PENDING' | 'ORDER_REFUNDED' | 'ORDER_CREATED';

export type WalletPlatformBalance = {
  platform: 'shopify' | 'amazon' | 'ebay' | 'tiktok' | 'etsy';
  label: string;
  amount: number;
  currency: string;
  status: string;
  isConnected: boolean;
};

export type WalletActivityItem = {
  id: string;
  type: WalletActivityType;
  title: string;
  subtitle: string;
  amount: number;
  currency: string;
  status: string;
  occurredAt: string | null;
};

export type WalletOverview = {
  currency: string;
  totalRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  refundedRevenue: number;
  orderCount: number;
  paidOrderCount: number;
  pendingOrderCount: number;
  platformBalances: WalletPlatformBalance[];
  recentActivity: WalletActivityItem[];
  notice: string;
};
