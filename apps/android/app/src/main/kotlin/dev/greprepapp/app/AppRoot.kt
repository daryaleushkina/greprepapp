package dev.greprepapp.app

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import dev.greprepapp.app.core.AppConfig
import dev.greprepapp.app.core.session.SessionManager
import dev.greprepapp.app.core.session.SessionState
import dev.greprepapp.app.feature.shell.MainScreen
import dev.greprepapp.app.feature.shell.RootKey
import dev.greprepapp.app.feature.signin.SignInScreen
import dev.greprepapp.design.Gp
import greprep.design.GpMotion

/**
 * Вход или разделы. Смена корня — сквозное растворение (Material fade through): это не переход «вглубь», а
 * другое место. Модели экранов живут в своём ключе корня и уходят вместе с ним.
 */
@Composable
fun AppRoot(
    session: SessionManager,
    config: AppConfig,
    modifier: Modifier = Modifier,
) {
    val state by session.state.collectAsStateWithLifecycle()
    val key =
        when (val current = state) {
            // Держится заставка запуска (MainActivity), под ней — только фон.
            SessionState.Restoring -> null

            is SessionState.SignedOut -> RootKey.SignIn(current.reason)

            is SessionState.SignedIn -> RootKey.Main(current.id)
        }
    if (key == null) {
        Box(modifier.fillMaxSize().background(Gp.colors.bg))
        return
    }
    val fade = fadeIn(GpMotionSpec) togetherWith fadeOut(GpMotionSpec)
    NavDisplay(
        backStack = listOf(key),
        modifier = modifier,
        onBack = {},
        entryDecorators =
            listOf(
                rememberSaveableStateHolderNavEntryDecorator(),
                rememberViewModelStoreNavEntryDecorator(),
            ),
        transitionSpec = { fade },
        popTransitionSpec = { fade },
        predictivePopTransitionSpec = { fade },
        entryProvider =
            entryProvider {
                entry<RootKey.SignIn> { root ->
                    SignInScreen(reason = root.reason, showsDevelopmentSignIn = config.devSignInAvailable)
                }
                entry<RootKey.Main> {
                    MainScreen(appVersion = config.appVersion, onSignOut = session::signOut)
                }
            },
    )
}

private val GpMotionSpec = tween<Float>(GpMotion.REVEAL, easing = GpMotion.EaseOut)
