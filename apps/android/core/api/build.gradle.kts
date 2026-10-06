import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Клиент договора api/openapi.yaml. Сгенерированное лежит в src/main/generated и коммитится: так видно, что
// поменялось в договоре, а гейт проверяет, что оно свежее (`./gradlew :core:api:generateApi` и git status).
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.openapi.generator)
    alias(libs.plugins.kover)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
        allWarningsAsErrors.set(true)
    }
}

sourceSets {
    main {
        kotlin.srcDir("src/main/generated")
    }
}

dependencies {
    api(libs.retrofit)
    api(libs.okhttp)
    api(libs.kotlinx.serialization.json)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.retrofit.scalars)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
}

val contract = rootProject.layout.projectDirectory.file("../../api/openapi.yaml")
val rawOutput = layout.buildDirectory.dir("openapi")

openApiGenerate {
    generatorName.set("kotlin")
    inputSpec.set(contract)
    outputDir.set(rawOutput)
    cleanupOutput.set(true)
    packageName.set("dev.greprepapp.api")
    library.set("jvm-retrofit2")
    validateSpec.set(true)
    configOptions.set(
        mapOf(
            "serializationLibrary" to "kotlinx_serialization",
            "useCoroutines" to "true",
            "dateLibrary" to "string",
            "enumPropertyNaming" to "UPPERCASE",
            "omitGradleWrapper" to "true",
            "omitGradlePluginVersions" to "true",
            "sourceFolder" to "src/main/kotlin",
        ),
    )
    // id и даты приходят строками: приложению не нужно их разбирать, а UUID и OffsetDateTime потребовали бы
    // своих сериализаторов в разборе JSON.
    typeMappings.set(mapOf("UUID" to "kotlin.String", "java.util.UUID" to "kotlin.String"))
    // Только интерфейсы и модели: Retrofit и разбор JSON собираются руками (ApiFactory) — с терпимым чтением
    // ответов и токеном в заголовке. CollectionFormats — на него ссылаются интерфейсы.
    globalProperties.set(mapOf("apis" to "", "models" to "", "supportingFiles" to "CollectionFormats.kt"))
}

tasks.register<Sync>("generateApi") {
    group = "build setup"
    description = "Клиент из api/openapi.yaml → src/main/generated (закоммитить результат)"
    dependsOn(tasks.named("openApiGenerate"))
    from(rawOutput.map { it.dir("src/main/kotlin") })
    into(layout.projectDirectory.dir("src/main/generated"))
}
