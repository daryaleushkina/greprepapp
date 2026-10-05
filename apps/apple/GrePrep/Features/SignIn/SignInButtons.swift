import AuthenticationServices
import SwiftUI

/// Кнопки входа — официального вида каждой компании, свои стили к ним не применяются (DESIGN.md, «Правило
/// официальных кнопок»). Цвета — токены signIn*, логотипы — фигуры из файлов компаний (Design/SignInLogos.swift).

/// Размеры из правил самих компаний, а не из нашей системы: они меняются вместе с правилами, не с токенами.
private enum OfficialSpec {
    /// Новая кнопка входа Telegram: логотип 22, текст 16 полужирный (как в макете T4-SignIn).
    static let telegramLogo: CGFloat = 22
    static let telegramText: CGFloat = 16
    /// Google Identity: «G» 18, текст 14 Medium с трекингом 0,25.
    static let googleLogo: CGFloat = 18
    static let googleText: CGFloat = 14
    static let googleTracking: CGFloat = 0.25
}

/// Новая кнопка Telegram: синяя капсула, логотип и системный шрифт.
struct TelegramSignInButton: View {
    let isBusy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: GPSpace.s4) {
                if isBusy {
                    ProgressView().tint(Color(.signInTelegramText))
                } else {
                    TelegramLogoShape()
                        .frame(width: OfficialSpec.telegramLogo, height: OfficialSpec.telegramLogo)
                        .accessibilityHidden(true)
                }
                Text("Войти через Telegram")
                    .font(.system(size: OfficialSpec.telegramText, weight: .semibold))
            }
            .foregroundStyle(Color(.signInTelegramText))
            .frame(maxWidth: .infinity, minHeight: GPSize.buttonCompact)
            .background(Color(.signInTelegramBg), in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityIdentifier("signin.telegram")
    }
}

/// «Вход с Apple» — родная кнопка Apple: чёрная в светлой теме, белая в тёмной.
struct AppleSignInButton: View {
    let model: SignInModel
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        #if os(macOS)
            // На Mac обёртка SwiftUI держит свой размер и не растягивается до соседних кнопок, поэтому — сама
            // кнопка Apple (ASAuthorizationAppleIDButton) с высотой и скруглением как у остальных.
            MacAppleIDButton(model: model, style: colorScheme == .dark ? .white : .black)
                .frame(maxWidth: .infinity, minHeight: GPSize.buttonCompact, maxHeight: GPSize.buttonCompact)
                .accessibilityIdentifier("signin.apple")
        #else
            SignInWithAppleButton(.signIn) { request in
                model.prepareAppleRequest(request)
            } onCompletion: { result in
                Task { await model.completeApple(result) }
            }
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(height: GPSize.buttonCompact)
            .clipShape(Capsule())
            .accessibilityIdentifier("signin.apple")
        #endif
    }
}

#if os(macOS)
    import AppKit

    private struct MacAppleIDButton: NSViewRepresentable {
        let model: SignInModel
        let style: ASAuthorizationAppleIDButton.Style

        func makeCoordinator() -> AppleAuthorization { AppleAuthorization(model: model) }

        func makeNSView(context: Context) -> ASAuthorizationAppleIDButton {
            let button = ASAuthorizationAppleIDButton(authorizationButtonType: .signIn, authorizationButtonStyle: style)
            button.cornerRadius = GPSize.buttonCompact / 2
            button.target = context.coordinator
            button.action = #selector(AppleAuthorization.start)
            return button
        }

        func updateNSView(_ button: ASAuthorizationAppleIDButton, context: Context) {
            context.coordinator.model = model
        }

        /// Своего размера кнопка не навязывает: берёт ширину колонки и высоту соседних кнопок входа.
        func sizeThatFits(_ proposal: ProposedViewSize, nsView: ASAuthorizationAppleIDButton, context: Context)
            -> CGSize?
        {
            CGSize(width: proposal.width ?? GPLayout.authColumnMax, height: GPSize.buttonCompact)
        }
    }

    /// Окно входа Apple без обёртки SwiftUI: запрос — от модели (nonce), ответ — в модель.
    @MainActor
    private final class AppleAuthorization: NSObject, ASAuthorizationControllerDelegate,
        ASAuthorizationControllerPresentationContextProviding
    {
        var model: SignInModel

        init(model: SignInModel) {
            self.model = model
        }

        @objc func start() {
            let request = ASAuthorizationAppleIDProvider().createRequest()
            model.prepareAppleRequest(request)
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }

        nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
            MainActor.assumeIsolated { NSApp.keyWindow ?? NSWindow() }
        }

        nonisolated func authorizationController(
            controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization
        ) {
            MainActor.assumeIsolated {
                let model = model
                Task { await model.completeApple(.success(authorization)) }
            }
        }

        nonisolated func authorizationController(
            controller: ASAuthorizationController, didCompleteWithError error: any Error
        ) {
            MainActor.assumeIsolated {
                let model = model
                Task { await model.completeApple(.failure(error)) }
            }
        }
    }
#endif

/// Кнопка Google: белая с рамкой, цветная «G» (правила Google Identity).
struct GoogleSignInButton: View {
    let isBusy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: GPSpace.s10) {
                if isBusy {
                    ProgressView()
                } else {
                    GoogleGLogo()
                        .frame(width: OfficialSpec.googleLogo, height: OfficialSpec.googleLogo)
                        .accessibilityHidden(true)
                }
                Text("Войти с аккаунтом Google")
                    .font(.system(size: OfficialSpec.googleText, weight: .medium))
                    .tracking(OfficialSpec.googleTracking)
            }
            .foregroundStyle(Color(.signInGoogleText))
            .frame(maxWidth: .infinity, minHeight: GPSize.buttonCompact)
            .padding(.horizontal, GPSpace.s12)
            .background(Color(.signInGoogleBg), in: Capsule())
            .overlay(Capsule().strokeBorder(Color(.signInGoogleStroke), lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityIdentifier("signin.google")
    }
}
