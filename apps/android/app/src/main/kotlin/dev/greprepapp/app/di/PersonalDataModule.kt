package dev.greprepapp.app.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import dev.greprepapp.app.core.session.PersonalData
import dev.greprepapp.app.feature.today.TodayCache
import dev.greprepapp.app.feature.training.TrainingStore

/**
 * Что стирается при выходе. Отдельно от AppModule, который сценарные тесты подменяют целиком: так сценарии
 * проверяют тот же список, что работает в бою, — забытая здесь строка оставила бы данные прошлого человека.
 */
@Module
@InstallIn(SingletonComponent::class)
interface PersonalDataModule {
    @Binds
    @IntoSet
    fun todayIsPersonal(cache: TodayCache): PersonalData

    @Binds
    @IntoSet
    fun trainingsArePersonal(store: TrainingStore): PersonalData
}
