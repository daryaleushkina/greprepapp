import Foundation
import Testing

@testable import GrePrep

@MainActor
@Suite("Владелец тренировок и истёкший вход")
struct TrainingAccountTests {
    let server = StubServer()
    let cache = temporaryCache()
    private var store: TrainingStore {
        .init(directory: cache.fileURL.deletingLastPathComponent().appending(path: "trainings"))
    }
    private func app() -> AppModel {
        AppModel(
            config: server.config(), tokens: MemoryTokenStore("expired"), cache: cache,
            network: NetworkMonitor(), session: server.session)
    }

    @Test func unreadableStorageDoesNotBlockSignInTodayOrSignOut() async throws {
        try cache.save(Fixture.todayDTO)
        try Data("private damaged storage".utf8).write(to: store.directory)
        server.on("GET /api/today", .json(200, Fixture.todayJSON))
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        server.on("POST /api/client-errors", .status(204))
        server.on("POST /api/auth/logout", .status(204))
        let app = app()
        try app.didSignIn(.init(token: "new", user: Fixture.user))
        #expect(app.phase == .signedIn)
        let today = try #require(app.today)
        await today.refresh()
        if case .loading = today.content { Issue.record("план не загрузился") }
        do {
            _ = try await app.trainings.options()
            Issue.record("тренировки доступны при сбое хранилища")
        } catch { #expect(error.isReportable) }
        await eventually { !server.requests("POST /api/client-errors").isEmpty }
        let messages = try server.requests("POST /api/client-errors").map { try $0.json()["message"] as? String ?? "" }
        #expect(messages.allSatisfy { !$0.contains(store.directory.path) && !$0.contains("private damaged storage") })
        app.signOut()
        #expect(app.phase == .signedOut(nil) && app.trainings.trainings.isEmpty)
    }

    @Test func expiredSameUserSendsAfterLoginAndRelaunch() async throws {
        let t = TrainingFixture.stored(owner: Fixture.user.id, pending: true)
        try store.saveOwner(t.ownerID, credentialID: TrainingStore.credentialID("expired"))
        try store.save(t)
        server.on("POST /api/trainings/\(t.id)/answers", .json(401, Fixture.error("unauthorized")))
        let app = app()
        await eventually { app.phase == .signedOut(.sessionExpired) }
        #expect(try store.load { _ in }[t.id]?.unsent == [0])
        #expect(app.trainings.trainings.isEmpty)
        server.on("POST /api/trainings/\(t.id)/answers", .status(204))
        try app.didSignIn(.init(token: "new", user: Fixture.user))
        await eventually { app.trainings.trainings[t.id]?.unsent.isEmpty == true }
        #expect(server.requests("POST /api/trainings/\(t.id)/answers").last?.authorization == "Bearer new")
        #expect(try store.load { _ in }[t.id]?.unsent.isEmpty == true)
    }

    @Test func differentUserClearsAndReports() async throws {
        let t = TrainingFixture.stored(owner: "other", pending: true)
        try store.saveOwner(t.ownerID, credentialID: TrainingStore.credentialID("expired"))
        try store.save(t)
        server.on("POST /api/trainings/\(t.id)/answers", .failure(.notConnectedToInternet))
        server.on("POST /api/client-errors", .status(204))
        let app = app()
        await eventually { app.trainings.trainings[t.id] != nil }
        app.handleUnauthorized()
        try app.didSignIn(.init(token: "new", user: Fixture.user))
        await eventually { !server.requests("POST /api/client-errors").isEmpty }
        #expect(try store.load { _ in }.isEmpty)
        let messages = try server.requests("POST /api/client-errors").map { try $0.json()["message"] as? String ?? "" }
        #expect(messages.contains { $0.contains("lost 1 unsent answers") })
    }

    @Test func explicitSignOutDeletesPendingAndBrokenFiles() async throws {
        let t = TrainingFixture.stored(owner: Fixture.user.id, pending: true)
        try store.saveOwner(t.ownerID, credentialID: TrainingStore.credentialID("expired"))
        try store.save(t)
        try Data("broken".utf8).write(to: store.directory.appending(path: "old.broken"))
        server.on("POST /api/trainings/\(t.id)/answers", .failure(.notConnectedToInternet))
        server.on("POST /api/auth/logout", .status(204))
        let app = app()
        await eventually { app.trainings.trainings[t.id] != nil }
        app.signOut()
        await eventually { !FileManager.default.fileExists(atPath: store.directory.path) }
        #expect(app.trainings.trainings.isEmpty)
    }

    @Test func changedTokenAfterInterruptedLoginCannotSendPreviousOwner() async throws {
        let t = TrainingFixture.stored(owner: "other", pending: true)
        try store.saveOwner(t.ownerID, credentialID: TrainingStore.credentialID("previous-token"))
        try store.save(t)
        server.on("GET /api/me", .json(200, TrainingFixture.json(Fixture.user)))
        let app = app()
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        _ = try await app.trainings.options()
        #expect(server.requests("POST /api/trainings/\(t.id)/answers").isEmpty)
        #expect(try store.load { _ in }.isEmpty)
    }

    @Test func immediateSignOutAndSameUserSignInStillErasesUnsent() async throws {
        let t = TrainingFixture.stored(owner: Fixture.user.id, pending: true)
        try store.saveOwner(t.ownerID, credentialID: TrainingStore.credentialID("expired"))
        try store.save(t)
        server.on("POST /api/trainings/\(t.id)/answers", .failure(.notConnectedToInternet))
        server.on("POST /api/auth/logout", .status(204))
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        let app = app()
        _ = try await app.trainings.options()
        app.signOut()
        try app.didSignIn(.init(token: "new", user: Fixture.user))
        _ = try await app.trainings.options()
        #expect(try store.load { _ in }.isEmpty)
    }

    @Test func interruptedLoginVerificationRetriesWhenNetworkReturns() async throws {
        let t = TrainingFixture.stored(owner: Fixture.user.id, pending: true)
        try store.saveOwner(t.ownerID, credentialID: TrainingStore.credentialID("previous"))
        try store.save(t)
        server.on("GET /api/me", .failure(.notConnectedToInternet))
        server.on("GET /api/trainings/options", .json(200, TrainingFixture.json(TrainingFixture.options)))
        let app = app()
        _ = try await app.trainings.options()
        #expect(app.trainings.trainings.isEmpty)
        #expect(server.requests("POST /api/trainings/\(t.id)/answers").isEmpty)
        server.on("GET /api/me", .json(200, TrainingFixture.json(Fixture.user)))
        server.on("POST /api/trainings/\(t.id)/answers", .status(204))
        app.trainings.sync()
        await eventually { app.trainings.trainings[t.id]?.unsent.isEmpty == true }
    }
}
