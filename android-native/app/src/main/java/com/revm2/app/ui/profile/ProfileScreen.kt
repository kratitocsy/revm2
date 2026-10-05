package com.revm2.app.ui.profile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.revm2.app.data.AuthRepository
import kotlinx.coroutines.launch

// Phase 2+: profile, username/UPI/DOB rpcs, wallet, shop
@Composable
fun ProfileScreen() {
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("Profile", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = { scope.launch { AuthRepository.signOut() } }) { Text("Sign out") }
    }
}
