# Правила R8 для релиза. kotlinx.serialization, Retrofit 3, OkHttp 5 и Hilt приносят свои правила сами
# (consumer rules в библиотеках) — здесь только то, чего они не знают.

# Стек ошибки в отчёте client_errors должен читаться: номера строк сохраняются, имена файлов скрыты.
-keepattributes LineNumberTable
-renamesourcefileattribute SourceFile
