package dev.greprepapp.app.feature.signin

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.greprepapp.app.R
import dev.greprepapp.app.core.session.SignOutReason
import dev.greprepapp.app.feature.signin.SignInViewModel.Message
import dev.greprepapp.app.feature.signin.SignInViewModel.Method
import dev.greprepapp.design.Gp
import dev.greprepapp.design.SectionBackground
import dev.greprepapp.design.StudySection
import greprep.design.GpLayout
import greprep.design.GpRadius
import greprep.design.GpSize
import greprep.design.GpSpace
import dev.greprepapp.design.R as DesignR

/**
 * Экран входа вне Telegram (макет T4-SignIn): знак, имя, одна фраза о продукте и три равноценных способа
 * входа — Telegram первым (решение Даши 06.10.2026). Дисклеймер ETS — на стартовом экране каждого
 * приложения (PRODUCT.md, «Brand Commitments»).
 */
@Composable
fun SignInScreen(
    reason: SignOutReason?,
    showsDevelopmentSignIn: Boolean,
    modifier: Modifier = Modifier,
    viewModel: SignInViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    SignInContent(
        state = state,
        reason = reason,
        showsDevelopmentSignIn = showsDevelopmentSignIn,
        onProvider = viewModel::signInWith,
        onDevelopment = viewModel::signInForDevelopment,
        modifier = modifier,
    )
}

/** Форма входа подменой: есть только в отладочной сборке (src/debug), в релизе — null. */
typealias DevSignInFormContent = @Composable (
    busy: Boolean,
    enabled: Boolean,
    onSubmit: (String) -> Unit,
    modifier: Modifier,
) -> Unit

@Composable
fun SignInContent(
    state: SignInViewModel.UiState,
    reason: SignOutReason?,
    showsDevelopmentSignIn: Boolean,
    onProvider: (Method) -> Unit,
    onDevelopment: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    SectionBackground(section = StudySection.Verbal, modifier = modifier) {
        // Колонка не ниже экрана: Box передаёт ей свою высоту минимумом, прокрутка этот минимум сохраняет, и
        // на высоком экране распорки делят свободное место (знак — выше, кнопки — у низа, как в макете), а на
        // низком или с крупным текстом всё просто прокручивается. Без BoxWithConstraints — тот рисовал первый
        // кадр не сразу, и снимки экрана ловили пустоту.
        Box(
            modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
            contentAlignment = Alignment.TopCenter,
            propagateMinConstraints = true,
        ) {
            Column(
                modifier =
                    Modifier
                        .widthIn(max = GpLayout.authColumnMax)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = GpSpace.s24)
                        .padding(bottom = GpSpace.s28),
            ) {
                Spacer(Modifier.heightIn(min = GpSpace.s48).weight(1f))
                Header()
                Spacer(Modifier.heightIn(min = GpSpace.s40).weight(1f))
                if (reason == SignOutReason.SessionExpired) {
                    Text(
                        text = stringResource(R.string.signin_expired),
                        style = Gp.type.subhead,
                        color = Gp.colors.textSecondary,
                        modifier = Modifier.padding(bottom = GpSpace.s16).testTag("signin.expired"),
                    )
                }
                val enabled = state.busy == null
                Column(verticalArrangement = Arrangement.spacedBy(GpSpace.s10)) {
                    TelegramSignInButton(busy = state.busy == Method.Telegram, enabled = enabled) {
                        onProvider(Method.Telegram)
                    }
                    AppleSignInButton(busy = state.busy == Method.Apple, enabled = enabled) {
                        onProvider(Method.Apple)
                    }
                    GoogleSignInButton(busy = state.busy == Method.Google, enabled = enabled) {
                        onProvider(Method.Google)
                    }
                }
                state.message?.let { message ->
                    MessageText(message, Modifier.padding(top = GpSpace.s12))
                }
                Legal(Modifier.padding(top = GpSpace.s20))
                val devForm = devSignInForm
                if (showsDevelopmentSignIn && devForm != null) {
                    devForm(
                        state.busy == Method.Development,
                        enabled,
                        onDevelopment,
                        Modifier.padding(top = GpSpace.s24),
                    )
                }
            }
        }
    }
}

@Composable
private fun Header() {
    Column(verticalArrangement = Arrangement.spacedBy(GpSpace.s20)) {
        Surface(
            color = Gp.colors.surface,
            shape = RoundedCornerShape(GpRadius.xl),
            border = BorderStroke(GpSize.hairline, Gp.colors.line),
            modifier = Modifier.size(GpSize.brandMark),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    painter = painterResource(DesignR.drawable.ic_brand_mark),
                    contentDescription = null,
                    tint = Gp.colors.verbal,
                    modifier = Modifier.size(GpSize.brandGlyph),
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(GpSpace.s10)) {
            Text(
                text = stringResource(R.string.app_name),
                style = Gp.type.title1,
                color = Gp.colors.text,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.signin_tagline),
                style = Gp.type.bodyLong,
                color = Gp.colors.textSecondary,
                modifier = Modifier.widthIn(max = GpLayout.taglineMax),
            )
        }
    }
}

@Composable
private fun MessageText(
    message: Message,
    modifier: Modifier = Modifier,
) {
    val text =
        when (message) {
            is Message.NotConnectedYet -> {
                when (message.method) {
                    Method.Telegram -> R.string.signin_not_connected_telegram
                    Method.Apple -> R.string.signin_not_connected_apple
                    Method.Google, Method.Development -> R.string.signin_not_connected_google
                }
            }

            Message.Offline -> {
                R.string.signin_offline
            }

            Message.TooManyAttempts -> {
                R.string.signin_too_many
            }

            Message.Failed -> {
                R.string.signin_failed
            }
        }
    // «Ещё не подключён» — сведение, а не сбой: без цвета ошибки.
    val color = if (message is Message.NotConnectedYet) Gp.colors.textSecondary else Gp.colors.wrong
    Text(
        text = stringResource(text),
        style = Gp.type.subhead,
        color = color,
        modifier = modifier.fillMaxWidth().testTag("signin.message"),
    )
}

@Composable
private fun Legal(modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(GpSpace.s10)) {
        Text(
            text = stringResource(R.string.signin_legal),
            style = Gp.type.caption,
            color = Gp.colors.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = stringResource(R.string.signin_disclaimer),
            style = Gp.type.caption.copy(localeList = LocaleList("en")),
            color = Gp.colors.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
