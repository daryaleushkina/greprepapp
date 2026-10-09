import { execSync } from 'node:child_process';
import babel from '@rolldown/plugin-babel';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Одно приложение на мини-апп Telegram (/tg/…) и сайт (всё остальное): оболочка выбирается при запуске
// (src/shell.ts). API — тот же адрес: в разработке запросы /api проксирует Vite, в бою — Caddy.
//   pnpm dev                      — сайт на https://localhost:5190, API — сервер разработки на 8090
//   GP_API_TARGET=… pnpm dev      — другой сервер API (e2e поднимает свой на 8093, playwright.config.ts)

/** Версия сборки для отчётов об ошибках клиента: короткий коммит; без git — dev. */
function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

/** Даём загрузчику URL собранного пакета: браузер кэширует отказ import(), повтору нужен свежий адрес. */
const retryableSections: Plugin = {
  name: 'retryable-sections',
  apply: 'build',
  transform(_code, id) {
    if (!id.endsWith('/src/sectionModuleUrl.ts')) return;
    const reference = this.emitFile({
      type: 'chunk', id: new URL('./src/sections.lazy.tsx', import.meta.url).pathname,
      name: 'sections.lazy', preserveSignature: 'strict',
    });
    return { code: `export const sectionsModuleUrl = import.meta.ROLLUP_FILE_URL_${reference};`, map: { mappings: '' } };
  },
};

const api = { '/api': { target: process.env.GP_API_TARGET ?? 'http://127.0.0.1:8090' } };

export default defineConfig({
  // React Compiler — через Babel: путь стабильный, нативный (oxc) пока экспериментальный (README плагина). Только
  // свой код приложения: сгенерированному клиенту API (packages/api-client) мемоизация не нужна, а его пакет не
  // зависит от react напрямую — импорт react/compiler-runtime оттуда не находится.
  plugins: [
    react(),
    retryableSections,
    babel({ presets: [reactCompilerPreset()], include: [/\/apps\/web\/src\/.*\.tsx?$/] }),
    // Разработка и e2e — по https с самоподписанным сертификатом, как в бою: кука сессии __Host-session — Secure, а
    // WebKit (Safari, iPhone) на http://localhost её не сохраняет, и вход на сайте сразу «заканчивался» бы.
    basicSsl(),
  ],
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.GP_APP_VERSION ?? gitSha()) },
  // Свой порт и strictPort: на этом Маке рядом живут другие стеки, и чужой dev-сервер на 5173 нельзя принять
  // за свой (docs/HANDOFF.md, «Грабли»).
  server: { port: 5190, strictPort: true, proxy: api },
  preview: { port: 5190, strictPort: true, proxy: api },
  build: {
    target: 'es2023', sourcemap: true,
    rolldownOptions: {
      output: {
        // React меняется реже экранов и кэшируется отдельно. SDK Telegram сюда не входит: сайт его не скачивает.
        codeSplitting: { groups: [{ name: 'react', test: /\/node_modules\/(react|react-dom|scheduler)\// }] },
      },
    },
  },
});
