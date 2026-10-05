package com.revm2.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.revm2.app.data.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class AuthUiState(val loading: Boolean = false, val error: String? = null, val info: String? = null)

class AuthViewModel : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state

    fun signIn(email: String, password: String) = run { AuthRepository.signIn(email.trim(), password) }

    fun signUp(email: String, password: String) = run(
        info = "Account created. Check your email if confirmation is required."
    ) { AuthRepository.signUp(email.trim(), password) }

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
