import { defineConfig } from 'orval';

// Клиент API для веба и админки — из договора api/openapi.yaml (docs/HANDOFF.md, «Договор API»).
//   • Схемы — Zod: каждый ответ сервера проверяется по договору до того, как попадёт в экран (CLAUDE.md,
//     «Всё снаружи — проверяется»). Схема ответа передаётся в src/http.ts, он и проверяет.
//   • Запросы — функции и хуки TanStack Query поверх своего fetch (src/http.ts): токен, куки, id запроса,
//     ошибки по коду из договора.
// Сгенерированное коммитится; гейт пересобирает и падает, если вышло не то, что в коммите.
export default defineConfig({
  api: {
    input: { target: '../../api/openapi.yaml' },
    output: {
      mode: 'single',
      target: 'src/generated/api.ts',
      schemas: { path: 'src/generated/model', type: 'zod', mode: 'single' },
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        mutator: { path: 'src/http.ts', name: 'http' },
        includeZodSchemaInArguments: true,
        // Ответ-ошибка договора (components/responses/Error) — то же тело, что схема Error. Без суффикса Orval ссылается
        // на тип Error, который есть среди схем Zod; с суффиксом по умолчанию — на ErrorResponse, которого в режиме
        // Zod он не создаёт (Orval 8.40).
        components: { responses: { suffix: '' } },
        fetch: { runtimeValidation: true, includeHttpResponseReturnType: false },
        query: { signal: true, version: 5 },
      },
    },
  },
});
