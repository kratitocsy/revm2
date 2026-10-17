package com.wynko.app.data

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.Flow

/**
 * Authentication against the same Supabase project as the desktop app, so one account (and all its
 * schedules, communities and sessions) works on both. Google sign-in uses Credential Manager and
 * hands the Google ID token to Supabase; the web client ID must be listed under
 * Supabase -> Authentication -> Providers -> Google -> Authorized Client IDs.
 */
object AuthRepository {
    private val auth get() = Supabase.client.auth

    val status: Flow<SessionStatus> get() = auth.sessionStatus

    val currentUserId: String? get() = auth.currentUserOrNull()?.id
    val currentEmail: String? get() = auth.currentUserOrNull()?.email

    suspend fun signIn(email: String, password: String) {
        auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun signUp(email: String, password: String) {
        auth.signUpWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun sendPasswordReset(email: String) {
        auth.resetPasswordForEmail(email)
    }

    /** Needs an Activity context for the account picker. The web client ID is generated from google-services.json. */
    suspend fun signInWithGoogle(activityContext: Context) {
        val resId = activityContext.resources.getIdentifier("default_web_client_id", "string", activityContext.packageName)
        require(resId != 0) { "Google sign-in is not configured: add google-services.json for com.wynko.app." }
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(activityContext.getString(resId))
            .setFilterByAuthorizedAccounts(false)
            .build()
        val result = CredentialManager.create(activityContext)
            .getCredential(activityContext, GetCredentialRequest.Builder().addCredentialOption(option).build())
        val cred = result.credential
        require(cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            "Unexpected credential type"
        }
        val idToken = GoogleIdTokenCredential.createFrom(cred.data).idToken
        auth.signInWith(IDToken) {
            this.idToken = idToken
            provider = Google
        }
    }

    suspend fun signOut() = auth.signOut()
}
