package dev.greprepapp.app.feature.training

import android.content.res.Configuration
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import dev.greprepapp.design.Gp
import greprep.design.GpLayout
import greprep.design.GpRadius
import greprep.design.GpSize
import greprep.design.GpSpace

@Composable
internal fun hasHardwareKeyboard(): Boolean =
    with(LocalConfiguration.current) {
        keyboard == Configuration.KEYBOARD_QWERTY && hardKeyboardHidden != Configuration.HARDKEYBOARDHIDDEN_YES
    }

/** Событие обрабатывается один раз, без модификаторов: системные сочетания остаются системе. */
@Composable
internal fun TrainingKeyboard(
    onKey: (Key) -> Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val enabled = hasHardwareKeyboard()
    val focus = remember { FocusRequester() }
    LaunchedEffect(enabled) { if (enabled) focus.requestFocus() }
    Box(
        modifier =
            modifier
                .fillMaxSize()
                .focusRequester(focus)
                .onPreviewKeyEvent { event: KeyEvent ->
                    enabled && event.type == KeyEventType.KeyUp && !event.isCtrlPressed && !event.isAltPressed && !event.isMetaPressed &&
                        onKey(event.key)
                }.focusable(enabled),
    ) { content() }
}

/** Каждая половина листается независимо; общая ширина ограничивает длину строк на большом окне. */
@Composable
internal fun TrainingSplit(
    padding: PaddingValues,
    tag: String,
    left: @Composable () -> Unit,
    right: @Composable () -> Unit,
    leftScrollable: Boolean = true,
) {
    Box(Modifier.fillMaxSize().padding(padding).testTag(tag), contentAlignment = Alignment.TopCenter) {
        Row(
            modifier =
                Modifier
                    .widthIn(max = GpLayout.contentMax * 2 + GpLayout.gutter * 2)
                    .fillMaxSize()
                    .padding(horizontal = GpLayout.gutter, vertical = GpSpace.s8)
                    .testTag("$tag.split"),
            horizontalArrangement = Arrangement.spacedBy(GpSpace.s32),
        ) {
            Column(
                modifier =
                    Modifier
                        .weight(
                            1f,
                        ).fillMaxHeight()
                        .then(
                            if (leftScrollable) Modifier.verticalScroll(rememberScrollState()) else Modifier,
                        ).testTag("$tag.left"),
                verticalArrangement = Arrangement.spacedBy(GpSpace.s20),
            ) { left() }
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .verticalScroll(rememberScrollState())
                        .testTag("$tag.right"),
                verticalArrangement = Arrangement.spacedBy(GpSpace.s20),
            ) { right() }
        }
    }
}

/** Подсказки не занимают место на сенсорном устройстве; роль Key берётся из общей типографики. */
@Composable
internal fun KeyHint(
    key: String,
    label: String,
) {
    if (!hasHardwareKeyboard()) return
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(GpSpace.s8)) {
        Surface(
            color = Gp.colors.surface,
            shape = RoundedCornerShape(GpRadius.xs),
            border = BorderStroke(GpSize.hairline, Gp.colors.line),
        ) {
            Text(
                key,
                style = Gp.type.key,
                color = Gp.colors.textSecondary,
                modifier = Modifier.padding(horizontal = GpSpace.s6, vertical = GpSpace.s4),
            )
        }
        Text(label, style = Gp.type.caption, color = Gp.colors.textSecondary)
    }
}

internal val AnswerKeys =
    listOf(
        Key.A,
        Key.B,
        Key.C,
        Key.D,
        Key.E,
        Key.F,
        Key.G,
        Key.H,
        Key.I,
        Key.J,
        Key.K,
        Key.L,
        Key.M,
        Key.N,
        Key.O,
        Key.P,
        Key.Q,
        Key.R,
        Key.S,
        Key.T,
        Key.U,
        Key.V,
        Key.W,
        Key.X,
        Key.Y,
        Key.Z,
    )
