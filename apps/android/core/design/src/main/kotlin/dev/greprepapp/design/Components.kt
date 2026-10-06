package dev.greprepapp.design

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import greprep.design.GpMotion
import greprep.design.GpSize
import greprep.design.GpSpace

/**
 * Нажатие — лёгкое уменьшение до GpMotion.PRESS_SCALE за GpMotion.PRESS (DESIGN.md, «Движение»), поверх ripple
 * Material. «Убрать анимацию» в системе Compose учитывает сам: длительность становится нулевой.
 */
@Composable
fun Modifier.pressScale(interactionSource: MutableInteractionSource): Modifier {
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) GpMotion.PRESS_SCALE else 1f,
        animationSpec = tween(GpMotion.PRESS, easing = GpMotion.EaseOut),
        label = "pressScale",
    )
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/**
 * Второстепенная кнопка (компонент button-secondary): капсула на плотной поверхности — «Не знаю», «Пропустить»,
 * «Готово» рядом с главной.
 */
@Composable
fun GpSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val colors = Gp.colors
    Button(
        onClick = onClick,
        enabled = enabled,
        interactionSource = interaction,
        shape = CircleShape,
        colors =
            ButtonDefaults.buttonColors(
                containerColor = colors.surface,
                contentColor = colors.text,
                disabledContainerColor = colors.fill,
                disabledContentColor = colors.textSecondary,
            ),
        border = BorderStroke(GpSize.hairline, colors.line),
        contentPadding = PaddingValues(horizontal = GpSpace.s24),
        modifier =
            modifier
                .defaultMinSize(minHeight = GpSize.button)
                .pressScale(interaction),
    ) {
        Text(text = text, style = Gp.type.callout.copy(fontWeight = FontWeight.W600))
    }
}

/**
 * Главная кнопка экрана (компонент button-main): графитовая капсула 48 dp, одна на экран. busy — запрос ушёл:
 * текст остаётся на месте прозрачным, чтобы кнопка не меняла ширину.
 */
@Composable
fun GpPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    val interaction = remember { MutableInteractionSource() }
    val colors = Gp.colors
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        interactionSource = interaction,
        shape = CircleShape,
        colors =
            ButtonDefaults.buttonColors(
                containerColor = colors.accent,
                contentColor = colors.onAccent,
                disabledContainerColor = if (busy) colors.accent else colors.fill,
                disabledContentColor = if (busy) colors.onAccent else colors.textSecondary,
            ),
        contentPadding = PaddingValues(horizontal = GpSpace.s24),
        modifier =
            modifier
                .defaultMinSize(minHeight = GpSize.button)
                .pressScale(interaction),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = text,
                style = Gp.type.callout.copy(fontWeight = FontWeight.W600),
                modifier = Modifier.alpha(if (busy) 0f else 1f),
            )
            if (busy) {
                CircularProgressIndicator(
                    color = colors.onAccent,
                    modifier = Modifier.size(GpSpace.s20),
                )
            }
        }
    }
}
