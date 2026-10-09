import GameController
import SwiftUI

private struct HardwareKeyboardKey: EnvironmentKey {
    static let defaultValue = false
}
extension EnvironmentValues {
    var hasHardwareKeyboard: Bool {
        get { self[HardwareKeyboardKey.self] }
        set { self[HardwareKeyboardKey.self] = newValue }
    }
}

private struct HardwareKeyboardModifier: ViewModifier {
    let override: Bool?
    @State private var connected = GCKeyboard.coalesced != nil
    private var available: Bool {
        if let override { return override }
        #if os(macOS)
            return true
        #else
            return connected && UIDevice.current.userInterfaceIdiom == .pad
        #endif
    }
    func body(content: Content) -> some View {
        content.environment(\.hasHardwareKeyboard, available)
            .onReceive(NotificationCenter.default.publisher(for: .GCKeyboardDidConnect)) { _ in connected = true }
            .onReceive(NotificationCenter.default.publisher(for: .GCKeyboardDidDisconnect)) { _ in connected = false }
    }
}
extension View {
    func hardwareKeyboard(override: Bool? = nil) -> some View { modifier(HardwareKeyboardModifier(override: override)) }
}
