package dev.greprepapp.app.feature.signin

import dev.greprepapp.api.apis.AuthApi
import dev.greprepapp.api.models.AuthorizationCodeSignIn
import dev.greprepapp.api.models.DevSignIn
import dev.greprepapp.api.models.IdTokenSignIn

/** Один язык для всех способов входа: будущая интеграция провайдера тоже получает locale (#19). */
class LocalizedAuthApi(
    private val delegate: AuthApi,
    private val locale: SignInLocale,
) : AuthApi by delegate {
    override suspend fun signInForDevelopment(devSignIn: DevSignIn) =
        delegate.signInForDevelopment(devSignIn.copy(locale = locale.current()))

    override suspend fun signInWithIdToken(idTokenSignIn: IdTokenSignIn) =
        delegate.signInWithIdToken(idTokenSignIn.copy(locale = locale.current()))

    override suspend fun signInWithAuthorizationCode(authorizationCodeSignIn: AuthorizationCodeSignIn) =
        delegate.signInWithAuthorizationCode(authorizationCodeSignIn.copy(locale = locale.current()))
}
