export interface PaginationParams {
  page: number; // >= 1, default 1
  pageSize: number; // 1-200, default 25
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
