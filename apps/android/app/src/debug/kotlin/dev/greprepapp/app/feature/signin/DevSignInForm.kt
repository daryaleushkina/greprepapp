package dev.greprepapp.app.feature.signin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import dev.greprepapp.app.R
import dev.greprepapp.design.Gp
import greprep.design.GpRadius
import greprep.design.GpSpace

/**
 * Вход подменой (`/api/auth/dev`): локально, в сценариях и на стенде. Этот файл — только в отладочной
 * сборке (src/debug); в релизной формы нет вовсе (null), и строки «для разработки» туда не попадают.
 */
internal val devSignInForm: DevSignInFormContent? = { busy, enabled, onSubmit, modifier ->
    DevSignInForm(busy = busy, enabled = enabled, onSubmit = onSubmit, modifier = modifier)
}

@Composable
private fun DevSignInForm(
    busy: Boolean,
    enabled: Boolean,
    onSubmit: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var name by rememberSaveable { mutableStateOf("") }
    val submit = { if (name.isNotBlank()) onSubmit(name) }
    Surface(
        color = Gp.colors.fill,
        shape = RoundedCornerShape(GpRadius.md),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(GpSpace.s12),
            verticalArrangement = Arrangement.spacedBy(GpSpace.s8),
        ) {
            Text(
                text = stringResource(R.string.dev_signin_title),
                style = Gp.type.footnote,
                color = Gp.colors.textSecondary,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(GpSpace.s8),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    singleLine = true,
                    label = { Text(stringResource(R.string.dev_signin_name)) },
                    keyboardOptions =
                        KeyboardOptions(
                            capitalization = KeyboardCapitalization.None,
                            autoCorrectEnabled = false,
                            imeAction = ImeAction.Go,
                        ),
                    keyboardActions = KeyboardActions(onGo = { submit() }),
                    modifier = Modifier.weight(1f).testTag("signin.dev.name"),
                )
                OutlinedButton(
                    onClick = submit,
                    enabled = enabled && !busy && name.isNotBlank(),
                    modifier = Modifier.testTag("signin.dev.submit"),
                ) {
                    Text(stringResource(R.string.dev_signin_submit))
                }
            }
        }
    }
}
