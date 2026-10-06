// Клиент API: сгенерированные запросы и хуки TanStack Query, схемы договора (Zod) и их типы, свой fetch.
export * from './generated/api';
export * as schemas from './generated/model/index.zod';
export type * from './generated/model/index.zod';
export { ApiError, configureHttp, isApiError, lastSeenRequestId, type ApiErrorKind } from './http';
