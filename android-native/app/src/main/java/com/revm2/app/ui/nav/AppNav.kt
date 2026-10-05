package com.revm2.app.ui.nav

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.revm2.app.data.AuthRepository
import com.revm2.app.ui.auth.LoginScreen
import com.revm2.app.ui.blocks.BlocksScreen
import com.revm2.app.ui.community.CommunityScreen
import com.revm2.app.ui.home.HomeScreen
import com.revm2.app.ui.profile.ProfileScreen
import com.revm2.app.ui.study.StudyScreen
import io.github.jan.supabase.auth.status.SessionStatus

private enum class Tab(val route: String, val label: String, val icon: ImageVector) {
    Home("home", "Home", Icons.Filled.Home),
    Blocks("blocks", "Blocks", Icons.Filled.Lock),
    Study("study", "Study", Icons.Filled.Timer),
    Community("community", "Community", Icons.Filled.Groups),
    Profile("profile", "Me", Icons.Filled.Person),
}

@Composable
fun AppNav() {
    val status by AuthRepository.status.collectAsState(initial = SessionStatus.Initializing)
    when (status) {
        is SessionStatus.Authenticated -> MainScaffold()
        is SessionStatus.Initializing -> Unit // brief splash while the stored session loads
        else -> LoginScreen()
    }
}

@Composable
private fun MainScaffold() {
    val nav = rememberNavController()
    val current = nav.currentBackStackEntryAsState().value?.destination?.route
    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = current == tab.route,
                        onClick = {
                            nav.navigate(tab.route) {
                                popUpTo(Tab.Home.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        }
    ) { pad ->
        NavHost(nav, startDestination = Tab.Home.route, modifier = Modifier.padding(pad)) {
            composable(Tab.Home.route) { HomeScreen() }
            composable(Tab.Blocks.route) { BlocksScreen() }
            composable(Tab.Study.route) { StudyScreen() }
            composable(Tab.Community.route) { CommunityScreen() }
            composable(Tab.Profile.route) { ProfileScreen() }
        }
    }
}
