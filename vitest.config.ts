import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Тесты, которые не нуждаются в сервере (сквозные — e2e/, Playwright):
//   unit — чистые функции веба и клиента API, хуки Claude Code и git (node);
//   dom  — компоненты в настоящем Chromium со стилями приложения: состояния экранов, которые в e2e не воспроизвести
//          честно (провайдер не подключён, разбор ответа и т. п.).
// pnpm test — всё; pnpm coverage — то же с порогом покрытия (его запускает гейт, scripts/hooks/gate).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['apps/web/src/**/*.test.ts', 'packages/api-client/src/**/*.test.ts', '.claude/hooks/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'dom',
          include: ['apps/web/src/**/*.test.tsx'],
          setupFiles: ['apps/web/src/test/setup.ts'],
          expect: { poll: { timeout: 4000 } },
          browser: {
            enabled: true,
            headless: true,
            // Язык и пояс прибиты: тексты экранов проверяются по-русски, как у аудитории (английский — locale.test.ts).
            provider: playwright({ contextOptions: { locale: 'ru-RU', timezoneId: 'Europe/Moscow' } }),
            viewport: { width: 390, height: 844 },
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/web/src/**/*.{ts,tsx}', 'packages/api-client/src/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'apps/web/src/test/**',
        // Точка входа, подмена Telegram и уход на страницу провайдера — проверяются сквозными тестами (e2e/miniapp,
        // e2e/site): в модульных их не запустить честно.
        'apps/web/src/main.tsx',
        'apps/web/src/telegram/mockEnv.ts',
        'apps/web/src/leave.ts',
        'apps/web/src/env.d.ts',
        // Сгенерировано Orval из договора.
        'packages/api-client/src/generated/**',
      ],
      reporter: ['text-summary', 'json-summary', 'html'],
      // Порог — достигнутый уровень с запасом в несколько десятых (замер 07.10.2026, каркас веба после второго круга
      // ревью: строки 99,12 %, операторы 97,88 %, функции 95,97 %, ветвления 95,04 %). Порог не опускать; подняли
      // покрытие — поднять и порог (AGENTS.md, «Тесты»).
      thresholds: { lines: 98.9, statements: 97.6, functions: 95.7, branches: 94.8 },
    },
  },
});
