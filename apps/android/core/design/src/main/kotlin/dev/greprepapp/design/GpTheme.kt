package dev.greprepapp.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import greprep.design.GpColors
import greprep.design.GpDarkColors
import greprep.design.GpLayout
import greprep.design.GpLightColors
import greprep.design.GpRadius
import greprep.design.GpTypography

/** Onest — один шрифт на всё (DESIGN.md, «Typography»): переменный файл, веса 400–600 из одной оси. */
val OnestFamily: FontFamily =
    FontFamily(
        onest(FontWeight.W400),
        onest(FontWeight.W500),
        onest(FontWeight.W600),
    )

private fun onest(weight: FontWeight) =
    Font(
        resId = R.font.onest_variable,
        weight = weight,
        variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
    )

private val LocalGpColors = staticCompositionLocalOf { GpLightColors }
private val LocalGpType = staticCompositionLocalOf { GpTypography(OnestFamily) }
private val LocalGpDark = staticCompositionLocalOf { false }

/** Доступ к токенам внутри темы: `Gp.colors.text`, `Gp.type.body`. */
object Gp {
    val colors: GpColors
        @Composable @ReadOnlyComposable
        get() = LocalGpColors.current

    val type: GpTypography
        @Composable @ReadOnlyComposable
        get() = LocalGpType.current

    val isDark: Boolean
        @Composable @ReadOnlyComposable
        get() = LocalGpDark.current

    /** Окно шире GpLayout.breakpointWide: заголовки крупнее (варианты *Wide токенов). */
    val isWide: Boolean
        @Composable @ReadOnlyComposable
        get() = LocalGpWide.current

    /** Заголовок карточки-шага по ширине окна. */
    val title3: TextStyle
        @Composable @ReadOnlyComposable
        get() = if (isWide) type.title3Wide else type.title3
}

private val LocalGpWide = staticCompositionLocalOf { false }

/**
 * Тема «Шагов» поверх Material 3. Цвета — свои, а не Material You с обоев (решение Даши, задача #2): цвета
 * разделов — метки, по которым человек узнаёт Verbal, Quant, слова и эссе на всех платформах. Компоненты
 * Material (вкладки, кнопки, панели) получают те же роли цвета, шрифт Onest и скругления токенов.
 *
 * largeText — настройка «Крупнее»: множитель поверх системного масштаба шрифта, а не замена ему.
 */
@Composable
fun GpTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    largeText: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) GpDarkColors else GpLightColors
    val type = LocalGpType.current
    val density = LocalDensity.current
    val scaled =
        if (largeText) Density(density.density, density.fontScale * GpTypography.TEXT_SCALE_LARGE) else density
    val wide =
        with(density) {
            LocalWindowInfo.current.containerSize.width
                .toDp()
        } >= GpLayout.breakpointWide
    CompositionLocalProvider(
        LocalGpColors provides colors,
        LocalGpDark provides darkTheme,
        LocalGpWide provides wide,
        LocalDensity provides scaled,
    ) {
        MaterialTheme(
            colorScheme = colors.toMaterial(darkTheme),
            typography = type.toMaterial(wide),
            shapes = gpShapes,
        ) {
            CompositionLocalProvider(
                LocalContentColor provides colors.text,
                LocalTextStyle provides type.body,
                content = content,
            )
        }
    }
}

private val gpShapes =
    Shapes(
        extraSmall = RoundedCornerShape(GpRadius.xs),
        small = RoundedCornerShape(GpRadius.md),
        medium = RoundedCornerShape(GpRadius.lg),
        large = RoundedCornerShape(GpRadius.xxl),
        extraLarge = RoundedCornerShape(GpRadius.xxl),
    )

/** Роли Material из смысловых токенов: акцент — графит, поверхность — белая (тёмная — #1A1C23). */
internal fun GpColors.toMaterial(dark: Boolean): ColorScheme {
    val base = if (dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = accent,
        onPrimary = onAccent,
        primaryContainer = tabSelected,
        onPrimaryContainer = text,
        secondary = accent,
        onSecondary = onAccent,
        // Подложка выбранной вкладки (индикатор навигации) — та же, что у капсулы вкладок в макете.
        secondaryContainer = tabSelected,
        onSecondaryContainer = text,
        tertiary = verbal,
        onTertiary = onAccent,
        background = bg,
        onBackground = text,
        surface = bg,
        onSurface = text,
        surfaceVariant = fill,
        onSurfaceVariant = textSecondary,
        surfaceContainerLowest = surface,
        surfaceContainerLow = surface,
        surfaceContainer = surface,
        surfaceContainerHigh = surface,
        surfaceContainerHighest = surface,
        surfaceBright = surface,
        surfaceDim = bg,
        inverseSurface = text,
        inverseOnSurface = bg,
        outline = line,
        outlineVariant = line,
        // Красного в интерфейсе нет (DESIGN.md, «Правило двух цветов ошибки»): ошибка — оранжевый.
        error = wrong,
        onError = onAccent,
        errorContainer = wrongTint,
        onErrorContainer = wrong,
        scrim = Color.Black,
        surfaceTint = Color.Transparent,
    )
}

/**
 * Шкала Material из ролей текста: компоненты Material (панели, вкладки, кнопки) пишут нашим шрифтом. На
 * широком окне заголовки — варианты *Wide (DESIGN.md, «Hierarchy»).
 */
internal fun GpTypography.toMaterial(wide: Boolean): Typography =
    Typography(
        displayLarge = if (wide) displayWide else display,
        displayMedium = score,
        displaySmall = if (wide) headwordWide else headword,
        headlineLarge = if (wide) title1Wide else title1,
        headlineMedium = if (wide) title1Wide else title1,
        headlineSmall = if (wide) title2Wide else title2,
        titleLarge = if (wide) title3Wide else title3,
        titleMedium = headline,
        titleSmall = callout,
        bodyLarge = body,
        bodyMedium = subhead,
        bodySmall = caption,
        labelLarge = callout,
        labelMedium = tabLabel,
        labelSmall = key,
    )
