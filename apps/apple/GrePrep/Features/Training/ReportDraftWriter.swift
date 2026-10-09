import Foundation

struct ReportDraftKey: Hashable, Sendable {
    let id: String
    let position: Int
}

struct ReportDraftWrite: Sendable {
    let key: ReportDraftKey
    let ownerID: String
    let epoch: Int
    let version: UUID
    let draft: QuestionReportDraft?
}

/// Отдельный executor: одна запись в полёте, диск и общий замок никогда не задерживают набор текста.
actor ReportDraftWriter {
    let store: TrainingStore
    let access: TrainingAccess
    let report: TrainingRepository.Report
    init(store: TrainingStore, access: TrainingAccess, report: @escaping TrainingRepository.Report) {
        self.store = store
        self.access = access
        self.report = report
    }
    func write(_ changes: [ReportDraftWrite]) -> [ReportDraftKey: APIFailure] {
        var failures: [ReportDraftKey: APIFailure] = [:]
        for change in changes {
            do {
                let saved = try access.withCurrent(change.epoch) {
                    try store.saveReportDraft(
                        change.key.id, position: change.key.position, draft: change.draft, ownerID: change.ownerID)
                    return true
                }
                if saved != true { failures[change.key] = .cancelled }
            } catch {
                if (error as? TrainingStorageError) == .missingTraining {
                    failures[change.key] = .cancelled
                } else {
                    report("question report draft storage failed: \(TrainingStore.reason(error))", nil)
                    failures[change.key] = .unexpected("question report draft storage failed")
                }
            }
        }
        return failures
    }
}
