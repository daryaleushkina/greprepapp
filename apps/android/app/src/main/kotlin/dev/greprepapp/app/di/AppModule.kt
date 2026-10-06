package dev.greprepapp.app.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import dev.greprepapp.app.BuildConfig
import dev.greprepapp.app.core.AppConfig
import dev.greprepapp.app.core.AppForeground
import dev.greprepapp.app.core.AppScope
import dev.greprepapp.app.core.ConnectivityNetworkStatus
import dev.greprepapp.app.core.IoDispatcher
import dev.greprepapp.app.core.NetworkStatus
import dev.greprepapp.app.core.ProcessForeground
import dev.greprepapp.app.core.SecondTicker
import dev.greprepapp.app.core.Ticker
import dev.greprepapp.app.core.session.KeystoreTokenStore
import dev.greprepapp.app.core.session.PersonalData
import dev.greprepapp.app.core.session.TokenStore
import dev.greprepapp.app.feature.today.TodayCache
import dev.greprepapp.app.feature.training.TrainingStore
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.time.Clock
import javax.inject.Singleton

/** Устройство: сборка, области корутин, хранилища, сеть по системе. Сценарные тесты подменяют этот модуль. */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun config(): AppConfig =
        AppConfig(
            apiBaseUrl = BuildConfig.API_BASE_URL.toHttpUrl(),
            appVersion = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
            devSignInAvailable = BuildConfig.DEBUG,
        )

    @Provides
    @Singleton
    @AppScope
    fun appScope(): CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Provides
    @IoDispatcher
    fun io(): CoroutineDispatcher = Dispatchers.IO

    @Provides
    fun clock(): Clock = Clock.systemUTC()

    @Provides
    fun ticker(): Ticker = SecondTicker

    @Provides
    @Singleton
    fun tokenStore(
        @ApplicationContext context: Context,
    ): TokenStore = KeystoreTokenStore(context.noBackupFilesDir)

    @Provides
    @Singleton
    fun todayCache(
        @ApplicationContext context: Context,
    ): TodayCache = TodayCache(context.noBackupFilesDir)

    @Provides
    @IntoSet
    fun todayIsPersonal(cache: TodayCache): PersonalData = cache

    @Provides
    @Singleton
    fun trainingStore(
        @ApplicationContext context: Context,
    ): TrainingStore = TrainingStore(context.noBackupFilesDir)

    @Provides
    @IntoSet
    fun trainingsArePersonal(store: TrainingStore): PersonalData = store

    @Provides
    @Singleton
    fun networkStatus(
        @ApplicationContext context: Context,
    ): NetworkStatus = ConnectivityNetworkStatus(context)

    @Provides
    @Singleton
    fun foreground(): AppForeground = ProcessForeground()
}
