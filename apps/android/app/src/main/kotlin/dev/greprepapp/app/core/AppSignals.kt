package dev.greprepapp.app.core

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

/** Есть ли сеть: «Сегодня» обновляется сам, когда она вернулась; шаг без сети не начать. */
interface NetworkStatus {
    val isOnline: StateFlow<Boolean>
}

/** Приложение вернулось на экран (из фона, после блокировки). */
interface AppForeground {
    val events: Flow<Unit>
}

/**
 * Сеть по системе: сеть по умолчанию с выходом в интернет. Проверенность (VALIDATED) не требуется: за
 * портальной сетью кафе запрос и так получит «нет сети», а лишний отказ запрещал бы начать шаг.
 */
class ConnectivityNetworkStatus(
    context: Context,
) : NetworkStatus {
    private val manager = context.getSystemService(ConnectivityManager::class.java)
    private val state = MutableStateFlow(currentlyOnline())
    override val isOnline: StateFlow<Boolean> = state.asStateFlow()

    init {
        manager.registerDefaultNetworkCallback(
            object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(
                    network: Network,
                    capabilities: NetworkCapabilities,
                ) {
                    state.value = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                }

                override fun onLost(network: Network) {
                    state.value = false
                }
            },
        )
    }

    private fun currentlyOnline(): Boolean {
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}

/** Возврат в приложение по жизненному циклу процесса: одно событие на выход из фона. */
class ProcessForeground : AppForeground {
    private val flow = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    override val events: Flow<Unit> = flow.asSharedFlow()

    init {
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    flow.tryEmit(Unit)
                }
            },
        )
    }
}
