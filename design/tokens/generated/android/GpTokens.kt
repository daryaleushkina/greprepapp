// Сгенерировано design/tokens/build.mjs из design/tokens/src — руками не править.
// Стекло и тени не генерируются: на Android поверхности Material (PRODUCT.md, «Platform»).
package greprep.design

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/** Смысловые цвета. Тема выбирает набор: GpLightColors или GpDarkColors. */
@Immutable
class GpColors(
    val bg: Color,
    val surface: Color,
    val text: Color,
    val textSecondary: Color,
    val line: Color,
    val fill: Color,
    val accent: Color,
    val onAccent: Color,
    val focus: Color,
    val tabSelected: Color,
    val wrong: Color,
    val wrongTint: Color,
    val verbal: Color,
    val verbalTint: Color,
    val quant: Color,
    val quantTint: Color,
    val words: Color,
    val wordsTint: Color,
    val essay: Color,
    val essayTint: Color,
    val exam: Color,
    val glowVerbalStrong: Color,
    val glowVerbalSoft: Color,
    val glowQuantStrong: Color,
    val glowQuantSoft: Color,
    val glowWordsStrong: Color,
    val glowWordsSoft: Color,
    val glowEssayStrong: Color,
    val glowEssaySoft: Color,
    val glowExamStrong: Color,
    val glowExamSoft: Color,
    val glassEdge: Color,
    val glassRim: Color,
    val signInTelegramBg: Color,
    val signInTelegramText: Color,
    val signInAppleBg: Color,
    val signInAppleText: Color,
    val signInGoogleBg: Color,
    val signInGoogleStroke: Color,
    val signInGoogleText: Color,
)

val GpLightColors = GpColors(
    bg = Color(0xFFF5F6F9),
    surface = Color(0xFFFFFFFF),
    text = Color(0xFF1B1E28),
    textSecondary = Color(0xFF5A6070),
    line = Color(0x1F1B1E28),
    fill = Color(0x0F1B1E28),
    accent = Color(0xFF1B1E28),
    onAccent = Color(0xFFFFFFFF),
    focus = Color(0xFF5B4BC4),
    tabSelected = Color(0x121B1E28),
    wrong = Color(0xFFBE400C),
    wrongTint = Color(0x1ABE400C),
    verbal = Color(0xFF5B4BC4),
    verbalTint = Color(0x1F5B4BC4),
    quant = Color(0xFF11735F),
    quantTint = Color(0x1F11735F),
    words = Color(0xFFB0436A),
    wordsTint = Color(0x1FB0436A),
    essay = Color(0xFF9A5B00),
    essayTint = Color(0x1F9A5B00),
    exam = Color(0xFF1B1E28),
    glowVerbalStrong = Color(0x385B4BC4),
    glowVerbalSoft = Color(0x125B4BC4),
    glowQuantStrong = Color(0x3311735F),
    glowQuantSoft = Color(0x0F11735F),
    glowWordsStrong = Color(0x33B4446C),
    glowWordsSoft = Color(0x0FB4446C),
    glowEssayStrong = Color(0x2E9A5B00),
    glowEssaySoft = Color(0x0D9A5B00),
    glowExamStrong = Color(0x171B1E28),
    glowExamSoft = Color(0x081B1E28),
    glassEdge = Color(0x0F000000),
    glassRim = Color(0x99FFFFFF),
    signInTelegramBg = Color(0xFF119AF5),
    signInTelegramText = Color(0xFFFFFFFF),
    signInAppleBg = Color(0xFF000000),
    signInAppleText = Color(0xFFFFFFFF),
    signInGoogleBg = Color(0xFFFFFFFF),
    signInGoogleStroke = Color(0xFF747775),
    signInGoogleText = Color(0xFF1F1F1F),
)

val GpDarkColors = GpColors(
    bg = Color(0xFF0E0F14),
    surface = Color(0xFF1A1C23),
    text = Color(0xFFF2F3F7),
    textSecondary = Color(0xFFA3A8B5),
    line = Color(0x1FFFFFFF),
    fill = Color(0x14FFFFFF),
    accent = Color(0xFFF2F3F7),
    onAccent = Color(0xFF111318),
    focus = Color(0xFFA898FF),
    tabSelected = Color(0x1AFFFFFF),
    wrong = Color(0xFFFF8A4C),
    wrongTint = Color(0x24FF8A4C),
    verbal = Color(0xFFA898FF),
    verbalTint = Color(0x29A898FF),
    quant = Color(0xFF4FC4A7),
    quantTint = Color(0x294FC4A7),
    words = Color(0xFFF28AB0),
    wordsTint = Color(0x29F28AB0),
    essay = Color(0xFFF0B45A),
    essayTint = Color(0x29F0B45A),
    exam = Color(0xFFF2F3F7),
    glowVerbalStrong = Color(0x4D826EFF),
    glowVerbalSoft = Color(0x14826EFF),
    glowQuantStrong = Color(0x4D2E9E82),
    glowQuantSoft = Color(0x142E9E82),
    glowWordsStrong = Color(0x4DD9628F),
    glowWordsSoft = Color(0x14D9628F),
    glowEssayStrong = Color(0x4DC98A2A),
    glowEssaySoft = Color(0x14C98A2A),
    glowExamStrong = Color(0x298A90A6),
    glowExamSoft = Color(0x0D8A90A6),
    glassEdge = Color(0x59000000),
    glassRim = Color(0x1FFFFFFF),
    signInTelegramBg = Color(0xFF119AF5),
    signInTelegramText = Color(0xFFFFFFFF),
    signInAppleBg = Color(0xFFFFFFFF),
    signInAppleText = Color(0xFF000000),
    signInGoogleBg = Color(0xFF131314),
    signInGoogleStroke = Color(0xFF8E918F),
    signInGoogleText = Color(0xFFE3E3E3),
)

/** Отступы и промежутки. */
object GpSpace {
    val s2 = 2.dp
    val s4 = 4.dp
    val s6 = 6.dp
    val s8 = 8.dp
    val s10 = 10.dp
    val s12 = 12.dp
    val s14 = 14.dp
    val s16 = 16.dp
    val s20 = 20.dp
    val s24 = 24.dp
    val s28 = 28.dp
    val s32 = 32.dp
    val s40 = 40.dp
    val s48 = 48.dp
    val s56 = 56.dp
    val s64 = 64.dp
    val s72 = 72.dp
}

/** Радиусы скругления. full — капсула: используйте CircleShape или RoundedCornerShape(50). */
object GpRadius {
    /** Клавиши-подсказки, мелкие метки */
    val xs = 6.dp
    /** Бейджи, маркеры */
    val sm = 8.dp
    /** MainButton Telegram, поля ввода */
    val md = 12.dp
    /** Варианты ответа, строки-кнопки */
    val lg = 16.dp
    /** Крупные плитки, подложка сегментов */
    val xl = 20.dp
    /** Карточки и сгруппированные списки */
    val xxl = 26.dp
    /** Капсулы: кнопки 44–48 px, чипы, вкладки, круги */
    val full = 9999.dp
}

/** Размеры элементов. */
object GpSize {
    /** Минимум для нажатия (Apple HIG, WCAG 2.5.8 с запасом) */
    val tapTarget = 44.dp
    /** Капсула главного действия внутри экрана */
    val button = 48.dp
    val buttonCompact = 44.dp
    /** MainButton Telegram и её двойник вне Telegram */
    val mainButton = 50.dp
    /** Строка списка */
    val row = 52.dp
    /** Строка настроек, вариант ответа */
    val rowTall = 56.dp
    /** Узел ленты шагов */
    val stepNode = 28.dp
    /** Текущий узел ленты шагов */
    val stepNodeCurrent = 36.dp
    /** Нить ленты шагов */
    val stepLine = 1.5.dp
    /** Кольцо текущего узла ленты (цвет раздела *-tint) */
    val stepRing = 5.dp
    /** Точка конца ленты: «На сегодня всё.» */
    val stepEnd = 9.dp
    val tabBarHeight = 64.dp
    val tabBarWidth = 340.dp
    val tabBarBottom = 22.dp
    /** Стеклянные круги шапки Telegram */
    val headerButton = 44.dp
    /** Растушёвка над нижней панелью */
    val fade = 28.dp
    /** Стеклянная плитка знака на экране входа */
    val brandMark = 64.dp
    /** Знак-лента внутри плитки */
    val brandGlyph = 30.dp
    /** Тонкая рамка: край стекла, контур узла ленты, рамка кнопки Google */
    val hairline = 1.dp
}

/** Раскладка. breakpointWide — граница компактной и широкой раскладки. */
object GpLayout {
    /** Боковые поля экрана на телефоне */
    val gutter = 20.dp
    /** Поля нижней панели с кнопками */
    val gutterBar = 16.dp
    /** Отступ сверху под шапку Telegram */
    val topInset = 72.dp
    val sidebarMin = 248.dp
    val sidebarMax = 280.dp
    /** Ширина колонки содержимого на компьютере */
    val contentMax = 720.dp
    /** С этой ширины — боковая панель и крупная типографика */
    val breakpointWide = 900.dp
    /** Сайт уже этой ширины — как телефон: капсула вкладок снизу; от неё до breakpoint-wide — строка разделов сверху (решение Даши 06.10.2026) */
    val breakpointNarrow = 600.dp
    /** Колонка экрана входа на широком экране (iPad, Mac, сайт) */
    val authColumnMax = 420.dp
    /** Строка о продукте под именем на экране входа */
    val taglineMax = 320.dp
}

/** Роли текста; family — Onest из ресурсов приложения. sp растут с системным масштабом шрифта. */
@Immutable
class GpTypography(family: FontFamily) {
    /** Крупное число итога: балл, «12 из 12» */
    val display = TextStyle(fontFamily = family, fontSize = 56.sp, lineHeight = 60.sp, fontWeight = FontWeight.W600, letterSpacing = (-0.03).em)
    val displayWide = TextStyle(fontFamily = family, fontSize = 72.sp, lineHeight = 76.sp, fontWeight = FontWeight.W600, letterSpacing = (-0.03).em)
    /** Примерный балл пробника */
    val score = TextStyle(fontFamily = family, fontSize = 48.sp, lineHeight = 52.sp, fontWeight = FontWeight.W600, letterSpacing = (-0.025).em)
    /** Слово на карточке словаря */
    val headword = TextStyle(fontFamily = family, fontSize = 36.sp, lineHeight = 42.sp, fontWeight = FontWeight.W600, letterSpacing = (-0.025).em)
    val headwordWide = TextStyle(fontFamily = family, fontSize = 48.sp, lineHeight = 54.sp, fontWeight = FontWeight.W600, letterSpacing = (-0.025).em)
    /** Заголовок экрана-вкладки */
    val title1 = TextStyle(fontFamily = family, fontSize = 32.sp, lineHeight = 38.sp, fontWeight = FontWeight.W600, letterSpacing = (-0.025).em)
    val title1Wide = TextStyle(fontFamily = family, fontSize = 40.sp, lineHeight = 46.sp, fontWeight = FontWeight.W600, letterSpacing = (-0.025).em)
    /** Заголовок экрана сессии и итогов */
    val title2 = TextStyle(fontFamily = family, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.W600, letterSpacing = (-0.025).em)
    val title2Wide = TextStyle(fontFamily = family, fontSize = 36.sp, lineHeight = 42.sp, fontWeight = FontWeight.W600, letterSpacing = (-0.025).em)
    /** Заголовок карточки-шага */
    val title3 = TextStyle(fontFamily = family, fontSize = 19.sp, lineHeight = 24.sp, fontWeight = FontWeight.W600, letterSpacing = (0).em)
    val title3Wide = TextStyle(fontFamily = family, fontSize = 21.sp, lineHeight = 28.sp, fontWeight = FontWeight.W600, letterSpacing = (0).em)
    /** Таймер секции, tabular-nums */
    val timer = TextStyle(fontFamily = family, fontSize = 22.sp, lineHeight = 26.sp, fontWeight = FontWeight.W600, letterSpacing = (0).em)
    val timerWide = TextStyle(fontFamily = family, fontSize = 24.sp, lineHeight = 28.sp, fontWeight = FontWeight.W600, letterSpacing = (0).em)
    /** Текст задания на английском: длинное чтение, межстрочный 1.5 */
    val prompt = TextStyle(fontFamily = family, fontSize = 18.sp, lineHeight = 27.sp, fontWeight = FontWeight.W400, letterSpacing = (0).em)
    val promptWide = TextStyle(fontFamily = family, fontSize = 20.sp, lineHeight = 31.sp, fontWeight = FontWeight.W400, letterSpacing = (0).em)
    /** Название темы, карточка */
    val headline = TextStyle(fontFamily = family, fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.W600, letterSpacing = (0).em)
    /** Основной текст интерфейса, строки списков */
    val body = TextStyle(fontFamily = family, fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.W400, letterSpacing = (0).em)
    /** Абзацы: разбор, теория */
    val bodyLong = TextStyle(fontFamily = family, fontSize = 17.sp, lineHeight = 24.sp, fontWeight = FontWeight.W400, letterSpacing = (0).em)
    /** Значение в строке, кнопки-капсулы */
    val callout = TextStyle(fontFamily = family, fontSize = 16.sp, lineHeight = 21.sp, fontWeight = FontWeight.W500, letterSpacing = (0).em)
    /** Подзаголовок под заголовком, подписи разделов */
    val subhead = TextStyle(fontFamily = family, fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.W400, letterSpacing = (0).em)
    /** Ссылки-действия второго плана, мета вопроса */
    val footnote = TextStyle(fontFamily = family, fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.W500, letterSpacing = (0).em)
    /** Даты, примечания, юридический текст */
    val caption = TextStyle(fontFamily = family, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.W400, letterSpacing = (0).em)
    /** Подсказки клавиш на компьютере */
    val key = TextStyle(fontFamily = family, fontSize = 12.sp, lineHeight = 15.sp, fontWeight = FontWeight.W500, letterSpacing = (0).em)
    /** Подписи вкладок — меньше не бывает: это нижняя граница шкалы */
    val tabLabel = TextStyle(fontFamily = family, fontSize = 11.sp, lineHeight = 13.sp, fontWeight = FontWeight.W500, letterSpacing = (0).em)

    companion object {
        /** Настройка «Крупнее»: множитель поверх системного масштаба шрифта. */
        const val TEXT_SCALE_LARGE = 1.125f
    }
}

/** Движение. Длительности — миллисекунды. */
object GpMotion {
    const val PRESS = 160
    const val REVEAL = 240
    const val PULSE = 1600
    const val PRESS_SCALE = 0.98f
    val EaseOut = CubicBezierEasing(0.23f, 1f, 0.32f, 1f)
}
