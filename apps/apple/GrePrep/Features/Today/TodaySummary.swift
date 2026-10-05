import Foundation

/// Строка под заголовком: «Три шага · около 22 минут». Число шагов — словом, как в макете: при трёх-четырёх
/// шагах слово читается быстрее цифры; минуты — числом, с русскими падежами из каталога строк.
enum TodaySummary {
    static func string(for plan: TodayPlan, locale: Locale = .current) -> String {
        // Договор допускает пустой план; «0 шагов · около 0 минут» — бессмыслица.
        if plan.steps.isEmpty { return localized("На сегодня шагов нет", locale) }
        let count = stepCount(plan.steps.count, locale: locale)
        let minutes: LocalizedStringResource =
            plan.isComplete
            ? "\(plan.totalMinutes) минут"
            : "около \(plan.totalMinutes) минут"
        return "\(count) · \(localized(minutes, locale))"
    }

    /// Шагов в плане не больше восьми (договор, Today.steps.maxItems).
    static func stepCount(_ count: Int, locale: Locale = .current) -> String {
        let resource: LocalizedStringResource =
            switch count {
            case 1: "Один шаг"
            case 2: "Два шага"
            case 3: "Три шага"
            case 4: "Четыре шага"
            case 5: "Пять шагов"
            case 6: "Шесть шагов"
            case 7: "Семь шагов"
            case 8: "Восемь шагов"
            default: "\(count) шагов"
            }
        return localized(resource, locale)
    }

    /// Строка на языке locale: язык берётся из самого ресурса, а не из системы — так его можно проверить тестом.
    private static func localized(_ resource: LocalizedStringResource, _ locale: Locale) -> String {
        var resource = resource
        resource.locale = locale
        return String(localized: resource)
    }
}
