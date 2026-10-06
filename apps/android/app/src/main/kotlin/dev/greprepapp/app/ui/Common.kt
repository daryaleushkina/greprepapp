package dev.greprepapp.app.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import dev.greprepapp.app.R
import dev.greprepapp.design.Gp
import dev.greprepapp.design.GpPrimaryButton
import dev.greprepapp.design.StudySection
import greprep.design.GpLayout
import greprep.design.GpSpace

/** Названия разделов GRE остаются английскими и в русском интерфейсе — как на экзамене. */
@Composable
@ReadOnlyComposable
fun StudySection.label(): String =
    stringResource(
        when (this) {
            StudySection.Verbal -> R.string.section_verbal
            StudySection.Quant -> R.string.section_quant
            StudySection.Words -> R.string.section_words
            StudySection.Essay -> R.string.section_essay
        },
    )

/** Тихая строка со значком: «Нет сети — план обновится сам…», «Чтобы начать, нужна сеть…». */
@Composable
fun StatusLine(
    @DrawableRes icon: Int,
    text: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(GpSpace.s8),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            painter = painterResource(icon),
            contentDescription = null,
            tint = Gp.colors.textSecondary,
            modifier = Modifier.size(GpSpace.s20),
        )
        Text(text = text, style = Gp.type.subhead, color = Gp.colors.textSecondary)
    }
}

/**
 * Экран без содержимого: загрузка не удалась, раздела ещё нет, тренировок не было. Один заголовок, одна
 * фраза и не больше одного действия (DESIGN.md, «Правило одной задачи»).
 */
@Composable
fun EmptyState(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    @DrawableRes icon: Int? = null,
    action: String? = null,
    actionBusy: Boolean = false,
    onAction: () -> Unit = {},
) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(GpSpace.s8),
            modifier = Modifier.widthIn(max = GpLayout.taglineMax).padding(GpSpace.s24),
        ) {
            if (icon != null) {
                Icon(
                    painter = painterResource(icon),
                    contentDescription = null,
                    tint = Gp.colors.textSecondary,
                    modifier = Modifier.size(GpSpace.s40).padding(bottom = GpSpace.s4),
                )
            }
            Text(
                text = title,
                style = Gp.type.title3,
                color = Gp.colors.text,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = message,
                style = Gp.type.subhead,
                color = Gp.colors.textSecondary,
                textAlign = TextAlign.Center,
            )
            if (action != null) {
                GpPrimaryButton(
                    text = action,
                    onClick = onAction,
                    busy = actionBusy,
                    modifier = Modifier.padding(top = GpSpace.s12),
                )
            }
        }
    }
}

/** Загрузка: крутилка и одна фраза о том, что грузится. */
@Composable
fun LoadingState(
    text: String,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(GpSpace.s12),
        ) {
            CircularProgressIndicator(color = Gp.colors.textSecondary)
            Text(text = text, style = Gp.type.subhead, color = Gp.colors.textSecondary)
        }
    }
}
