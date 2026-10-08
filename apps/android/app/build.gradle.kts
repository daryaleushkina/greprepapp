plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.roborazzi)
    alias(libs.plugins.kover)
}

// Адрес сервера по сборке. Отладка — бэкенд на Маке: эмулятор видит его как 10.0.2.2 (docs/HANDOFF.md,
// «Бэкенд», порт 8090). Релиз — свой сервер; пока его нет (ROADMAP §2, часть 7), адрес задаётся свойством
// сборки gp.apiBaseUrl, а без него — заведомо несуществующий, и приложение честно говорит «нет сети».
val releaseApiBaseUrl = providers.gradleProperty("gp.apiBaseUrl").orElse("https://api.greprepapp.invalid/")

android {
    namespace = "dev.greprepapp.app"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        // Рабочий идентификатор (PRODUCT.md, «Открыто»): фиксируется перед публикацией в магазине.
        applicationId = "dev.greprepapp.app"
        minSdk = 26
        // Самый свежий Android (17); Google Play требует не ниже 36. Поведение 17 проверяют тесты Robolectric.
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "API_BASE_URL", "\"${releaseApiBaseUrl.get()}\"")
    }

    androidResources {
        // Список языков для системной настройки «Язык приложения» (Android 13+) — из папок values-*.
        generateLocaleConfig = true
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:8090/\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        warningsAsErrors = true
        abortOnError = true
        checkReleaseBuilds = true
        // Свежие версии сверены руками по первоисточникам; проверка «есть новее» без сети падала бы случайно.
        disable += setOf("GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion")
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all {
                // Robolectric с Android 16 лезет во внутренности JDK (разделяемая память приложения).
                it.jvmArgs("--add-opens=java.base/jdk.internal.access=ALL-UNNAMED")
                it.systemProperty("robolectric.graphicsMode", "NATIVE")
                // Не больше трёх процессов тестов: каждый — отдельная JVM с Robolectric и графикой NATIVE, а память
                // Мака (36 ГБ) общая со всеми сессиями и их эмуляторами; половина ядер давала до семи таких процессов.
                it.maxParallelForks = (Runtime.getRuntime().availableProcessors() / 2).coerceIn(1, 3)
            }
        }
    }
}

kotlin {
    compilerOptions {
        allWarningsAsErrors.set(true)
    }
}

// Эталоны снимков лежат рядом с тестами и коммитятся; сверяет их гейт (verifyRoborazziDebug).
roborazzi {
    outputDir.set(file("src/test/snapshots"))
}

// Покрытие ручного кода: сгенерированное (клиент договора, Hilt, токены дизайна) не считается. Порог — в
// гейте (scripts/hooks/gate-android), а не здесь: правка гейта — только с согласия Даши.
kover {
    reports {
        filters {
            excludes {
                packages(
                    "dev.greprepapp.api.apis",
                    "dev.greprepapp.api.models",
                    "dev.greprepapp.api.infrastructure",
                    "greprep.design",
                    "hilt_aggregated_deps",
                    "dagger.hilt.internal.aggregatedroot.codegen",
                )
                classes(
                    "*_Factory",
                    "*_Factory\$*",
                    "*Module_*Factory",
                    "*_MembersInjector",
                    "*_HiltModules*",
                    "*Hilt_*",
                    "*_GeneratedInjector",
                    "*_ComponentTreeDeps",
                    "*_Provide*Factory*",
                    "*ComposableSingletons*",
                    "*.BuildConfig",
                    "*.R",
                    "*.R\$*",
                )
            }
        }
    }
}

dependencies {
    implementation(project(":core:api"))
    implementation(project(":core:design"))

    implementation(libs.androidx.core)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.viewmodel.navigation3)
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.navigation3.ui)
    implementation(libs.compose.material3.adaptive.navigation.suite)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.lifecycle.viewmodel.compose)

    lintChecks(libs.compose.lint.checks)
    debugImplementation(libs.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.roborazzi.junit.rule)
    testImplementation(libs.compose.ui.test.junit4)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)
    // Espresso 3.5 из Compose UI-test не работает на Android 17 (нет InputManager.getInstance).
    testImplementation(libs.androidx.test.espresso)
    testImplementation(libs.hilt.android.testing)
    kspTest(libs.hilt.compiler)

    kover(project(":core:api"))
    kover(project(":core:design"))
}
