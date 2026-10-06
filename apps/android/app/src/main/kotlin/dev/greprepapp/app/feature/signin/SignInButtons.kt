package dev.greprepapp.app.feature.signin

import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.greprepapp.app.R
import dev.greprepapp.design.Gp
import greprep.design.GpSize
import greprep.design.GpSpace

/*
 * Кнопки входа — официального вида по правилам каждой компании (решение Даши 05.10.2026, DESIGN.md,
 * «Правило официальных кнопок»): шрифт, размер и цвета у них свои, а не токены «Шагов». Значения ниже — из
 * гайдлайнов компаний, а не наш выбор: Telegram — системный шрифт 16/600; Apple — 17/500; Google — Roboto
 * Medium 14/20 с разрядкой 0,25 px.
 *
 * Системный шрифт Android — это Roboto, но не везде: у Samsung свой (SamsungOne), а Google требует именно
 * Roboto Medium. Поэтому Roboto (OFL) лежит в приложении — кнопки одинаковы на всех телефонах.
 */
private val Roboto =
    FontFamily(
        Font(R.font.roboto_medium, FontWeight.W500),
        Font(R.font.roboto_semibold, FontWeight.W600),
    )
private val TelegramText = TextStyle(fontFamily = Roboto, fontSize = 16.sp, lineHeight = 20.sp, fontWeight = FontWeight.W600)
private val AppleText = TextStyle(fontFamily = Roboto, fontSize = 17.sp, lineHeight = 20.sp, fontWeight = FontWeight.W500)
private val GoogleText =
    TextStyle(
        fontFamily = Roboto,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        fontWeight = FontWeight.W500,
        letterSpacing = 0.018.em,
    )

/** Новая кнопка Telegram: синяя капсула с самолётиком. */
@Composable
fun TelegramSignInButton(
    busy: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors = Gp.colors
    ProviderButton(
        text = stringResource(R.string.signin_telegram),
        textStyle = TelegramText,
        logo = R.drawable.ic_logo_telegram,
        logoTint = colors.signInTelegramText,
        container = colors.signInTelegramBg,
        content = colors.signInTelegramText,
        border = null,
        busy = busy,
        enabled = enabled,
        onClick = onClick,
        tag = "signin.telegram",
    )
}

/** «Вход с Apple»: только чёрная (светлая тема) или белая (тёмная). */
@Composable
fun AppleSignInButton(
    busy: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors = Gp.colors
    ProviderButton(
        text = stringResource(R.string.signin_apple),
        textStyle = AppleText,
        logo = R.drawable.ic_logo_apple,
        logoTint = colors.signInAppleText,
        container = colors.signInAppleBg,
        content = colors.signInAppleText,
        border = null,
        busy = busy,
        enabled = enabled,
        onClick = onClick,
        tag = "signin.apple",
    )
}

/** Google: белая с рамкой (светлая тема) или тёмная, «G» всегда цветная. */
@Composable
fun GoogleSignInButton(
    busy: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors = Gp.colors
    ProviderButton(
        text = stringResource(R.string.signin_google),
        textStyle = GoogleText,
        logo = R.drawable.ic_logo_google,
        logoTint = null,
        container = colors.signInGoogleBg,
        content = colors.signInGoogleText,
        border = BorderStroke(GpSize.hairline, colors.signInGoogleStroke),
        busy = busy,
        enabled = enabled,
        onClick = onClick,
        tag = "signin.google",
    )
}

@Composable
private fun ProviderButton(
    text: String,
    textStyle: TextStyle,
    @DrawableRes logo: Int,
    logoTint: Color?,
    container: Color,
    content: Color,
    border: BorderStroke?,
    busy: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    tag: String,
) {
    Button(
        onClick = onClick,
        // Пока идёт вход, кнопки не нажимаются, но не бледнеют: официальный вид не меняется.
        enabled = enabled,
        shape = CircleShape,
        border = border,
        colors =
            ButtonDefaults.buttonColors(
                containerColor = container,
                contentColor = content,
                disabledContainerColor = container,
                disabledContentColor = content,
            ),
        contentPadding = PaddingValues(horizontal = GpSpace.s12),
        modifier = Modifier.fillMaxWidth().height(GpSize.buttonCompact).testTag(tag),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(GpSpace.s8),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.alpha(if (busy) 0f else 1f),
            ) {
                if (logoTint == null) {
                    Image(painter = painterResource(logo), contentDescription = null)
                } else {
                    Icon(painter = painterResource(logo), contentDescription = null, tint = logoTint)
                }
                Text(text = text, style = textStyle)
            }
            if (busy) CircularProgressIndicator(color = content, modifier = Modifier.size(GpSpace.s20))
        }
    }
}
