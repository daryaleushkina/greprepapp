---
name: react-native-skills
description:
  Правила производительности React Native и Expo: списки, анимации Reanimated,
  жесты, нативные компоненты, состояние. Применять при работе с кодом
  мобильного приложения — вёрстка экранов, анимации, прокрутка, изображения,
  навигация.
license: MIT
metadata:
  author: vercel
  source: https://github.com/vercel-labs/agent-skills
  version: '1.0.0'
---

# React Native Skills

Правила производительности для React Native и Expo: как писать так, чтобы не
терять кадры. Каждое правило лежит отдельным файлом в `rules/` и содержит
объяснение, неверный пример и верный.

**Происхождение.** Копия скилла `react-native-skills` из
[vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills),
лицензия MIT, автор Vercel. Правила в `rules/` — без изменений; переведён и
дополнен только этот файл. Обновляется вручную — это снимок, а не зависимость.

## Чего здесь нет

Это правила о том, **чтобы анимации не тормозили**, а не о том, **какими они
должны быть**. Длительности, кривые, характер движения и правила их применения
живут в документе дизайна и токенах проекта. Одно не заменяет другое.

## С оглядкой

Скилл писан для обобщённого приложения на Expo. Там, где он спорит с правилами
проекта или с уже принятым решением, побеждает проектное.

| Правило скилла     | Что говорит                                  | Почему не вслепую                                                                                                      |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ui-native-modals` | не брать JS-шторки, только нативные модалки  | нативная модалка не раскрывается на промежуточные высоты и не пропускает жесты под себя; для шторки над картой или списком нужна JS-шторка (`@gorhom/bottom-sheet`) |
| `ui-menus`         | ставить `zeego` для нативных меню            | новая зависимость — только когда меню действительно появилось                                                          |
| `ui-image-gallery` | ставить `@nandorojo/galeria` для лайтбокса   | то же: нет галереи — нет пакета                                                                                        |
| `ui-styling`       | `experimental_backgroundImage` для градиентов | префикс `experimental_` в бой не идёт; градиенты — через `expo-linear-gradient`                                        |
| `ui-styling`       | цвета и отступы прямо в стилях примеров      | в коде — только токены дизайн-системы, а не `#FF6B35` и `padding: 13`                                                  |

Полезное из `ui-styling` при этом остаётся в силе: `borderCurve: 'continuous'`
рядом с каждым `borderRadius`, `gap` на родителе вместо марджинов у детей,
`boxShadow` строкой вместо legacy-объектов теней и `elevation`.

## Правила по разделам

### 1. Списки — CRITICAL

- `list-performance-virtualize` — большие списки только на FlashList или LegendList
- `list-performance-item-memo` — передавать в элемент примитивы, а не объекты
- `list-performance-callbacks` — колбэки поднимать в корень списка
- `list-performance-function-references` — стабильные ссылки на функции
- `list-performance-inline-objects` — никаких инлайновых объектов в `renderItem`
- `list-performance-item-expensive` — тяжёлое выносить из элемента
- `list-performance-images` — в списки только сжатые изображения нужного размера
- `list-performance-item-types` — типы элементов для разнородных списков

### 2. Анимации — HIGH

- `animation-gpu-properties` — анимировать только `transform` и `opacity`
- `animation-derived-value` — `useDerivedValue` для производных значений
- `animation-gesture-detector-press` — нажатия через `Gesture.Tap()`, не через `onPressIn`

### 3. Прокрутка — HIGH

- `scroll-position-no-state` — позиция прокрутки в shared value или ref, не в `useState`

### 4. Навигация — HIGH

- `navigation-native-navigators` — нативные стек и вкладки вместо JS-навигаторов

### 5. Интерфейс — HIGH

- `ui-expo-image` — все изображения через `expo-image`
- `ui-pressable` — `Pressable` вместо `TouchableOpacity`
- `ui-safe-area-scroll` — безопасные зоны в прокрутках
- `ui-scrollview-content-inset` — `contentInset` для шапок
- `ui-measure-views` — `onLayout` вместо `measure()`
- `ui-styling` — `borderCurve`, `gap`, `boxShadow` (с оговорками выше)
- `ui-menus` — нативные меню (см. расхождения)
- `ui-native-modals` — нативные модалки (см. расхождения)
- `ui-image-gallery` — лайтбокс (см. расхождения)

### 6. Состояние — MEDIUM

- `state-ground-truth` — в состоянии живёт факт (`pressed`, `progress`), а не производная от него картинка (`scale`, `opacity`)
- `react-state-minimize` — меньше подписок на состояние
- `react-state-dispatcher` — диспетчер вместо россыпи колбэков
- `react-state-fallback` — запасной вид на первом кадре
- `react-compiler-destructure-functions` — деструктуризация для React Compiler
- `react-compiler-reanimated-shared-values` — shared values под React Compiler

### 7. Рендеринг — MEDIUM

- `rendering-text-in-text-component` — строки только внутри `Text`
- `rendering-no-falsy-and` — не рендерить через `&&` с потенциально ложным значением

### 8. Дизайн-система — MEDIUM

- `design-system-compound-components` — составные компоненты вместо полиморфных детей
- `imports-design-system-folder` — импорт из папки дизайн-системы, не из пакетов напрямую

### 9. Монорепозиторий — MEDIUM

- `monorepo-native-deps-in-app` — нативные зависимости держать в пакете приложения
- `monorepo-single-dependency-versions` — одна версия зависимости на весь репозиторий

### 10. Прочее — LOW

- `fonts-config-plugin` — шрифты через config plugin
- `js-hoist-intl` — создание объектов `Intl` выносить из рендера

## Как пользоваться

Читать отдельный файл правила, когда задача его касается:

```
rules/animation-gpu-properties.md
rules/list-performance-item-memo.md
```

Разделы и их приоритеты описаны в `rules/_sections.md`.
