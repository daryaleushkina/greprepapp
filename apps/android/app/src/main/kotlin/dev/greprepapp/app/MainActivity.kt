package dev.greprepapp.app

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import dagger.hilt.android.AndroidEntryPoint
import dev.greprepapp.app.core.AppConfig
import dev.greprepapp.app.core.session.SessionManager
import dev.greprepapp.app.core.session.SessionState
import dev.greprepapp.design.GpTheme
import javax.inject.Inject

/**
 * Одна активность на всё приложение. AppCompat — ради языка приложения на Android 7–12 (переключатель в
 * настройках); на 13+ язык ведёт система.
 */
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    @Inject lateinit var session: SessionManager

    @Inject lateinit var config: AppConfig

    override fun onCreate(savedInstanceState: Bundle?) {
        // Заставка держится, пока читается сохранённый вход: без неё мигнул бы экран входа.
        installSplashScreen().setKeepOnScreenCondition { session.state.value == SessionState.Restoring }
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            GpTheme {
                AppRoot(session = session, config = config)
            }
        }
    }
}
