export interface ShopifyGraphQLError {
  message: string;
}

export interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: ShopifyGraphQLError[];
}
