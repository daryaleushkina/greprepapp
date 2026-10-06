package dev.greprepapp.design

import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.scale
import greprep.design.GpColors

/** Раздел подготовки и его цвета: узел ленты, подпись, свет сверху экрана (DESIGN.md, «Цвета разделов»). */
enum class StudySection(
    @param:DrawableRes val icon: Int,
) {
    Verbal(R.drawable.ic_section_verbal),
    Quant(R.drawable.ic_section_quant),
    Words(R.drawable.ic_section_words),
    Essay(R.drawable.ic_section_essay),
    ;

    fun color(colors: GpColors): Color =
        when (this) {
            Verbal -> colors.verbal
            Quant -> colors.quant
            Words -> colors.words
            Essay -> colors.essay
        }

    fun tint(colors: GpColors): Color =
        when (this) {
            Verbal -> colors.verbalTint
            Quant -> colors.quantTint
            Words -> colors.wordsTint
            Essay -> colors.essayTint
        }

    fun glowStrong(colors: GpColors): Color =
        when (this) {
            Verbal -> colors.glowVerbalStrong
            Quant -> colors.glowQuantStrong
            Words -> colors.glowWordsStrong
            Essay -> colors.glowEssayStrong
        }

    fun glowSoft(colors: GpColors): Color =
        when (this) {
            Verbal -> colors.glowVerbalSoft
            Quant -> colors.glowQuantSoft
            Words -> colors.glowWordsSoft
            Essay -> colors.glowEssaySoft
        }
}

/** Доли эллипса света в макете: radial-gradient(120% 52% at 50% -10%), стопы 0 / 48 / 74 %. */
private const val GLOW_RADIUS_X = 1.2f
private const val GLOW_RADIUS_Y = 0.52f
private const val GLOW_CENTER_Y = -0.1f
private const val GLOW_MID = 0.48f
private const val GLOW_END = 0.74f

/**
 * Фон экрана: цвет bg и мягкий свет раздела сверху — цвет текущего шага (DESIGN.md, «Elevation & Depth»).
 * section = null — без света, только фон.
 */
@Composable
fun SectionBackground(
    section: StudySection?,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val colors = Gp.colors
    val strong = section?.glowStrong(colors)
    val soft = section?.glowSoft(colors)
    Box(
        modifier =
            modifier
                .fillMaxSize()
                .drawBehind {
                    drawRect(colors.bg)
                    if (strong == null || soft == null) return@drawBehind
                    val rx = size.width * GLOW_RADIUS_X
                    val ry = size.height * GLOW_RADIUS_Y
                    val center = Offset(size.width / 2, size.height * GLOW_CENTER_Y)
                    // Эллипс — круг радиуса rx, сжатый по вертикали до ry вокруг центра света.
                    scale(scaleX = 1f, scaleY = ry / rx, pivot = center) {
                        drawCircle(
                            brush =
                                Brush.radialGradient(
                                    0f to strong,
                                    GLOW_MID to soft,
                                    GLOW_END to Color.Transparent,
                                    center = center,
                                    radius = rx,
                                ),
                            radius = rx,
                            center = center,
                        )
                    }
                },
    ) {
        content()
    }
}
