import type { PaginationQueryDto } from './pagination.dto.js';

export type Paginated<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function pageParams(query: PaginationQueryDto): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function toPaginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): Paginated<T> {
  return { data, page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
}