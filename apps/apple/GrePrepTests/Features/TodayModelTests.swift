import Foundation
import Testing

@testable import GrePrep

@MainActor
@Suite("«Сегодня»: план, кэш и сеть")
struct TodayModelTests {
    let server = StubServer()
    let cache = temporaryCache()
    let events = Events()

    @MainActor final class Events {
        var unauthorized = 0
        var reports: [String] = []
    }

    func model() -> TodayModel {
        let api = API(config: server.config(), session: server.session, tokens: MemoryTokenStore("t"))
        let events = events
        return TodayModel(
            api: api, cache: cache,
            onUnauthorized: { events.unauthorized += 1 },
            report: { message, _ in events.reports.append(message) }
        )
    }

    @Test("свежий план показывается и сохраняется на устройстве")
    func freshPlan() async throws {
        server.on("GET /api/today", .json(200, Fixture.todayJSON))
        let model = model()
        #expect(model.content == .loading)
        await model.refresh()
        #expect(model.content == .plan(Fixture.plan))
        #expect(model.staleReason == nil)
        #expect(!model.needsRefresh)
        #expect(cache.load() == Fixture.todayDTO)
    }

    @Test("прошлый план виден сразу, до ответа сервера")
    func cachedPlanFirst() throws {
        try cache.save(Fixture.todayDTO)
        #expect(model().content == .plan(Fixture.plan))
    }

    @Test("нет сети, но есть прошлый план — он и строка «Нет сети»")
    func offlineWithCache() async throws {
        try cache.save(Fixture.todayDTO)
        server.on("GET /api/today", .failure(.notConnectedToInternet))
        let model = model()
        await model.refresh()
        #expect(model.content == .plan(Fixture.plan))
        #expect(model.staleReason == .offline)
        #expect(model.needsRefresh)
        #expect(events.reports.isEmpty)
    }

    @Test("нет сети и плана нет — экран «Нет сети»; сеть вернулась — план")
    func offlineWithoutCacheThenBack() async throws {
        server.on("GET /api/today", .failure(.notConnectedToInternet), .json(200, Fixture.todayJSON))
        let model = model()
        await model.refresh()
        #expect(model.content == .unavailable(.offline))
        #expect(model.needsRefresh)
        await model.refresh()
        #expect(model.content == .plan(Fixture.plan))
        #expect(model.staleReason == nil)
    }

    @Test("сбой сервера — в журнал, человеку — «не получилось»")
    func serverFailure() async throws {
        server.on("GET /api/today", .json(500, Fixture.error("internal")))
        let model = model()
        await model.refresh()
        #expect(model.content == .unavailable(.failed))
        #expect(events.reports.count == 1)
    }

    @Test("сбой сервера при прошлом плане — план остаётся, строка «не получилось обновить»")
    func serverFailureWithCache() async throws {
        try cache.save(Fixture.todayDTO)
        server.on("GET /api/today", .json(503, Fixture.error("unavailable")))
        let model = model()
        await model.refresh()
        #expect(model.content == .plan(Fixture.plan))
        #expect(model.staleReason == .failed)
    }

    @Test("401 — назад на вход")
    func unauthorized() async throws {
        server.on("GET /api/today", .json(401, Fixture.error("unauthorized")))
        await model().refresh()
        #expect(events.unauthorized == 1)
        #expect(events.reports.isEmpty)
    }

    @Test("старый ответ не затирает свежий")
    func outOfOrderResponses() async throws {
        let gate = StubServer.Gate()
        let older = #"{"date":"2026-10-05","steps":[]}"#
        server.on("GET /api/today", .gated(gate, 200, older), .json(200, Fixture.todayJSON))
        let model = model()
        let first = Task { await model.refresh() }
        // Первый запрос ушёл и ждёт у ворот; второй отвечает сразу.
        await eventually { !server.requests("GET /api/today").isEmpty }
        await model.refresh()
        gate.open()
        await first.value
        #expect(model.content == .plan(Fixture.plan))
        #expect(!model.isRefreshing)
    }

    @Test("испорченный кэш — не ошибка: файл удаляется, план грузится заново")
    func corruptedCache() throws {
        try FileManager.default.createDirectory(
            at: cache.fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("not json".utf8).write(to: cache.fileURL)
        #expect(model().content == .loading)
        #expect(!FileManager.default.fileExists(atPath: cache.fileURL.path(percentEncoded: false)))
    }
}

@Suite("План дня и строка под заголовком")
struct TodayPlanTests {
    func plan(_ states: [TodayPlan.State], minutes: Int = 7) -> TodayPlan {
        TodayPlan(
            date: "2026-10-06",
            steps: states.enumerated().map { i, state in
                .init(id: "s\(i)", section: .verbal, title: "Шаг \(i)", minutes: minutes, state: state)
            })
    }

    @Test("шаг в фокусе, сумма минут и конец дня")
    func derived() {
        let p = plan([.done, .current, .next])
        #expect(p.current?.id == "s1")
        #expect(p.totalMinutes == 21)
        #expect(!p.isComplete)
        #expect(plan([.done, .done]).isComplete)
        #expect(!plan([]).isComplete)
    }

    @Test("по-русски: число шагов словом, минуты с падежом")
    func russian() {
        let ru = Locale(identifier: "ru_RU")
        #expect(TodaySummary.string(for: Fixture.plan, locale: ru) == "Три шага · около 25 минут")
        #expect(
            TodaySummary.string(for: plan([.current, .next, .next], minutes: 7), locale: ru)
                == "Три шага · около 21 минуты")
        #expect(
            TodaySummary.string(for: plan([.current, .next], minutes: 11), locale: ru) == "Два шага · около 22 минут")
        #expect(
            TodaySummary.string(for: plan([.done, .done, .done, .done, .done], minutes: 5), locale: ru)
                == "Пять шагов · 25 минут")
        #expect(TodaySummary.string(for: plan([.done], minutes: 1), locale: ru) == "Один шаг · 1 минута")
        #expect(TodaySummary.stepCount(9, locale: ru) == "9 шагов")
        #expect(TodaySummary.stepCount(22, locale: ru) == "22 шага")
    }

    @Test("по-английски")
    func english() {
        let en = Locale(identifier: "en_US")
        #expect(TodaySummary.string(for: Fixture.plan, locale: en) == "Three steps · about 25 minutes")
        #expect(TodaySummary.string(for: plan([.done], minutes: 1), locale: en) == "One step · 1 minute")
        for n in 1...8 {
            #expect(!TodaySummary.stepCount(n, locale: en).contains("шаг"))
        }
    }

    @Test("все разделы договора узнаются и окрашены")
    func sections() {
        for section in StudySection.allCases {
            #expect(!section.symbol.isEmpty)
        }
        #expect(StudySection(.essay) == .essay)
        #expect(StudySection(.words) == .words)
    }
}
