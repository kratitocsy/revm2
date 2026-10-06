package com.revm2.app.ui.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.revm2.app.data.AuthRepository
import androidx.lifecycle.viewmodel.compose.viewModel
import com.revm2.app.ui.shell.AppShell
import io.github.jan.supabase.auth.status.SessionStatus

/** Shows the app once a Supabase session exists, the login screen otherwise. */
@Composable
fun AuthGate() {
    val status by AuthRepository.status.collectAsState(initial = SessionStatus.Initializing)
    when (status) {
        // Keyed by user so signing in as someone else never shows the previous account's data.
        is SessionStatus.Authenticated -> AppShell(viewModel(key = (status as SessionStatus.Authenticated).session.user?.id ?: "me"))
        is SessionStatus.Initializing -> Unit // brief blank while the stored session loads
        else -> LoginScreen()
    }
}
