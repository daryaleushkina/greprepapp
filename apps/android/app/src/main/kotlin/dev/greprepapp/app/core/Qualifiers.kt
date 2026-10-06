package dev.greprepapp.app.core

import javax.inject.Qualifier

/** Область жизни приложения: фоновые отправки (выход на сервере, отчёт об ошибке), которые переживают экран. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class AppScope

/** Поток для файлов и Keystore; в тестах — тестовый диспетчер. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher
