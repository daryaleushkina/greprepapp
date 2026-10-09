package dev.greprepapp.app.feature.signin

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import dev.greprepapp.api.models.Locale
import javax.inject.Inject

/** Ресурсы учитывают язык приложения Android 13+, который может отличаться от языка системы. */
class SignInLocale
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
    ) {
        fun current(): Locale =
            if (context.resources.configuration.locales[0]
                    .language == "en"
            ) {
                Locale.EN
            } else {
                Locale.RU
            }
    }
