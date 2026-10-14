package com.wynko.app.data

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.auth
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/** Firebase Authentication: email/password and Google. */
object AuthRepository {
    private val auth: FirebaseAuth get() = Firebase.auth

    /** Emits the signed-in user, or null when signed out. Fires immediately with the restored session. */
    val user: Flow<FirebaseUser?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { trySend(it.currentUser) }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }

    val currentUser: FirebaseUser? get() = auth.currentUser

    suspend fun signIn(email: String, password: String) {
        auth.signInWithEmailAndPassword(email, password).await()
        UserRepository.ensureProfile()
    }

    suspend fun signUp(email: String, password: String) {
        auth.createUserWithEmailAndPassword(email, password).await()
        UserRepository.ensureProfile()
    }

    suspend fun sendPasswordReset(email: String) {
        auth.sendPasswordResetEmail(email).await()
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
        auth.signInWithCredential(GoogleAuthProvider.getCredential(idToken, null)).await()
        UserRepository.ensureProfile()
    }

    fun signOut() = auth.signOut()
}
