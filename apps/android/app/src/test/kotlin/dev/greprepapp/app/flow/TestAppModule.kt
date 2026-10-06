package dev.greprepapp.app.flow

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.hilt.testing.TestInstallIn
import dagger.multibindings.IntoSet
import dev.greprepapp.app.core.AppConfig
import dev.greprepapp.app.core.AppForeground
import dev.greprepapp.app.core.AppScope
import dev.greprepapp.app.core.IoDispatcher
import dev.greprepapp.app.core.NetworkStatus
import dev.greprepapp.app.core.Ticker
import dev.greprepapp.app.core.session.PersonalData
import dev.greprepapp.app.core.session.TokenStore
import dev.greprepapp.app.di.AppModule
import dev.greprepapp.app.feature.today.TodayCache
import dev.greprepapp.app.feature.training.TrainingStore
import dev.greprepapp.app.testing.FakeForeground
import dev.greprepapp.app.testing.FakeNetwork
import dev.greprepapp.app.testing.ManualTicker
import dev.greprepapp.app.testing.MemoryTokenStore
import dev.greprepapp.app.testing.MutableClock
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.io.File
import java.time.Clock
import javax.inject.Singleton

/**
 * Устройство для сценариев: подменный сервер вместо настоящего, токен в памяти (Keystore в Robolectric нет),
 * сеть и возврат в приложение — управляемые из теста. Сеть и разбор ответов — настоящие (NetworkModule).
 */
@Module
@TestInstallIn(components = [SingletonComponent::class], replaces = [AppModule::class])
object TestAppModule {
    @Provides
    @Singleton
    fun server(): FakeServer = FakeServer()

    @Provides
    @Singleton
    fun config(server: FakeServer): AppConfig = AppConfig(server.url, "0.1.0 (1)", devSignInAvailable = true)

    @Provides
    @Singleton
    @AppScope
    fun appScope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Provides
    @IoDispatcher
    fun io(): CoroutineDispatcher = Dispatchers.IO

    // Часы и таймер «Проверки» двигает тест: «время вышло» проверяется без ожидания.
    @Provides
    @Singleton
    fun mutableClock(): MutableClock = MutableClock(java.time.Instant.now())

    @Provides
    fun clock(clock: MutableClock): Clock = clock

    @Provides
    @Singleton
    fun manualTicker(): ManualTicker = ManualTicker()

    @Provides
    fun ticker(ticker: ManualTicker): Ticker = ticker

    @Provides
    @Singleton
    fun memoryTokens(): MemoryTokenStore = MemoryTokenStore()

    @Provides
    fun tokenStore(tokens: MemoryTokenStore): TokenStore = tokens

    @Provides
    @Singleton
    fun todayCache(
        @ApplicationContext context: Context,
    ): TodayCache = TodayCache(File(context.cacheDir, "flow").apply { mkdirs() })

    @Provides
    @IntoSet
    fun todayIsPersonal(cache: TodayCache): PersonalData = cache

    @Provides
    @Singleton
    fun trainingStore(
        @ApplicationContext context: Context,
    ): TrainingStore = TrainingStore(File(context.cacheDir, "flow").apply { mkdirs() })

    @Provides
    @IntoSet
    fun trainingsArePersonal(store: TrainingStore): PersonalData = store

    @Provides
    @Singleton
    fun fakeNetwork(): FakeNetwork = FakeNetwork()

    @Provides
    fun networkStatus(network: FakeNetwork): NetworkStatus = network

    @Provides
    @Singleton
    fun fakeForeground(): FakeForeground = FakeForeground()

    @Provides
    fun foreground(foreground: FakeForeground): AppForeground = foreground
}
