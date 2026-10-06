// Уход со страницы на чужой сайт (страница входа провайдера) — отдельной функцией, чтобы тест мог её подменить.
export function leaveTo(url: string): void {
  location.assign(url);
}
