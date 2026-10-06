// Приложение для Android (docs/HANDOFF.md, «Приложение Android»). Модули:
//   :app          — экраны, навигация, хранилища, вход;
//   :core:api     — клиент договора api/openapi.yaml (сгенерирован, коммитится);
//   :core:design  — токены design/tokens (как есть, без копии), тема Compose, общие элементы.
pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "greprep-android"

include(":app", ":core:api", ":core:design")
