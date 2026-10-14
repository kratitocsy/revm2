package com.wynko.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wynko.app.data.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class AuthUiState(val loading: Boolean = false, val error: String? = null, val info: String? = null)

class AuthViewModel : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state

    fun clearMessages() { _state.value = AuthUiState() }

    fun signIn(email: String, password: String) = run { AuthRepository.signIn(email.trim(), password) }

    fun signUp(email: String, password: String) = run(
        info = "Account created."
    ) { AuthRepository.signUp(email.trim(), password) }

    fun signInWithGoogle(activityContext: android.content.Context) = run { AuthRepository.signInWithGoogle(activityContext) }

    fun resetPassword(email: String) = run(info = "Password reset email sent.") { AuthRepository.sendPasswordReset(email.trim()) }

    private fun run(info: String? = null, block: suspend () -> Unit) {
        viewModelScope.launch {
            _state.value = AuthUiState(loading = true)
            _state.value = try {
                block()
                AuthUiState(info = info)
            } catch (e: Exception) {
                AuthUiState(error = e.message ?: "Something went wrong")
            }
        }
    }
}
