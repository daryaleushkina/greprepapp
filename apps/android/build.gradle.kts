plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.openapi.generator) apply false
    alias(libs.plugins.roborazzi) apply false
    alias(libs.plugins.kover) apply false
    alias(libs.plugins.ktlint) apply false
}

// Стиль кода — ktlint во всех модулях; сгенерированный клиент договора не проверяется (его пишет генератор).
val ktlintVersion = libs.versions.ktlint.cli.get()
subprojects {
    apply(plugin = "org.jlleitschuh.gradle.ktlint")
    extensions.configure<org.jlleitschuh.gradle.ktlint.KtlintExtension> {
        version.set(ktlintVersion)
        filter {
            exclude { it.file.path.contains("/generated/") }
        }
    }
}
