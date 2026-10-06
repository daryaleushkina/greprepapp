package dev.greprepapp.app.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import dev.greprepapp.app.R
import dev.greprepapp.design.Gp
import dev.greprepapp.design.SectionBackground
import dev.greprepapp.design.StudySection
import greprep.design.GpLayout

/** Отступ заголовка верхней панели Material 3 (спецификация TopAppBar), не наш токен. */
private val MaterialTitleInset = 16.dp

/**
 * Экран-раздел (вкладка): крупный заголовок Material, который сворачивается при прокрутке, и свет раздела
 * сверху (DESIGN.md, «Elevation & Depth»). Фон панели прозрачный, пока содержимое не уехало под неё.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TabScreen(
    title: String,
    modifier: Modifier = Modifier,
    glow: StudySection? = null,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    SectionBackground(section = glow, modifier = modifier) {
        Scaffold(
            modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
            containerColor = Color.Transparent,
            topBar = {
                LargeTopAppBar(
                    // Material ставит заголовок в 16 dp от края, а лента идёт по полю gutter (20):
                    // заголовок сдвинут, чтобы стоять над лентой, как в макете.
                    title = { Text(title, modifier = Modifier.padding(start = GpLayout.gutter - MaterialTitleInset)) },
                    actions = actions,
                    scrollBehavior = scroll,
                    colors =
                        TopAppBarDefaults.topAppBarColors(
                            containerColor = Color.Transparent,
                            scrolledContainerColor = Gp.colors.bg,
                            titleContentColor = Gp.colors.text,
                            actionIconContentColor = Gp.colors.text,
                        ),
                )
            },
            content = content,
        )
    }
}

/** Вложенный экран: заголовок в одну строку и «Назад» — системный жест и кнопка в панели делают одно и то же. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NestedScreen(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    glow: StudySection? = null,
    content: @Composable (PaddingValues) -> Unit,
) {
    SectionBackground(section = glow, modifier = modifier) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text(title) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                painter = painterResource(R.drawable.ic_arrow_back),
                                contentDescription = stringResource(R.string.navigate_back),
                            )
                        }
                    },
                    colors =
                        TopAppBarDefaults.topAppBarColors(
                            containerColor = Color.Transparent,
                            scrolledContainerColor = Gp.colors.bg,
                            titleContentColor = Gp.colors.text,
                            navigationIconContentColor = Gp.colors.text,
                        ),
                )
            },
            content = content,
        )
    }
}
