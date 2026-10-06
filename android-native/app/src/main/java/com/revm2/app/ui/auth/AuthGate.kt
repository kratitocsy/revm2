package com.revm2.app.ui.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.revm2.app.data.AuthRepository
import com.revm2.app.ui.shell.AppShell
import io.github.jan.supabase.auth.status.SessionStatus

/** Shows the app once a Supabase session exists, the login screen otherwise. */
@Composable
fun AuthGate() {
    val status by AuthRepository.status.collectAsState(initial = SessionStatus.Initializing)
    when (status) {
        is SessionStatus.Authenticated -> AppShell()
        is SessionStatus.Initializing -> Unit // brief blank while the stored session loads
        else -> LoginScreen()
    }
}
