export const APP_NAME = 'Twinstr Backend';
export const APP_VERSION = '1.0.0';
export const USER_ROLES = ['user', 'admin', 'super_admin'] as const;
export const USER_STATUSES = ['active', 'blocked'] as const;
export const MARKETPLACES = ['shopify', 'ebay', 'etsy'] as const;
export const SYNC_ENTITY_TYPES = ['product', 'order', 'inventory', 'shop', 'auth'] as const;
export const SYNC_STATUSES = ['success', 'failed', 'pending'] as const;
