package com.wynko.app.ui.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.google.firebase.auth.FirebaseUser
import com.wynko.app.data.AuthRepository
import com.wynko.app.ui.shell.AppShell

/** Shows the app while a Firebase user is signed in, the login screen otherwise. */
@Composable
fun AuthGate() {
    val user: FirebaseUser? by AuthRepository.user.collectAsState(initial = AuthRepository.currentUser)
    if (user != null) AppShell() else LoginScreen()
}
