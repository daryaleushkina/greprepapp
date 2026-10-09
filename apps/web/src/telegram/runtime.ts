import type * as SDK from '@tma.js/sdk-react';

export type TelegramRuntime = Pick<typeof SDK, 'backButton' | 'swipeBehavior' | 'mainButton' | 'secondaryButton' | 'miniApp'>;
let runtime: TelegramRuntime | null = null;

/** SDK загружается до React только в мини-аппе; сайт использует кнопки страницы и свою навигацию. */
export function setTelegramRuntime(value: TelegramRuntime | null): void {
  runtime = value;
}

export function telegramRuntime(): TelegramRuntime | null {
  return runtime;
}
