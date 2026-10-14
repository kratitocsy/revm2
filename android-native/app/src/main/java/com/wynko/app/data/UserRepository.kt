package com.wynko.app.data

import com.google.firebase.Firebase
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.tasks.await

/** `users/{uid}` profile document in Firestore. */
object UserRepository {
    private val db get() = Firebase.firestore

    /** Creates the profile on first sign-in; later calls only refresh the display fields. */
    suspend fun ensureProfile() {
        val user = AuthRepository.currentUser ?: return
        val ref = db.collection("users").document(user.uid)
        val exists = ref.get().await().exists()
        val fields = mutableMapOf<String, Any?>(
            "displayName" to (user.displayName ?: user.email?.substringBefore('@') ?: ""),
            "email" to (user.email ?: ""),
            "photoUrl" to (user.photoUrl?.toString() ?: ""),
        )
        if (!exists) {
            fields["createdAt"] = FieldValue.serverTimestamp()
            fields["dailyFocusGoalMinutes"] = 120
        }
        ref.set(fields, SetOptions.merge()).await()
    }
}
