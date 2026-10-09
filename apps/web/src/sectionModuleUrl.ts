// В разработке — модуль Vite; сборка подставляет URL своего пакета через retryable-sections.
export const sectionsModuleUrl = new URL('./sections.lazy.tsx', import.meta.url).href;
