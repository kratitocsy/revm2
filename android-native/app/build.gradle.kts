plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.wynko.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.wynko.app"
        minSdk = 26
        targetSdk = 36
        // CI passes -PappVersionCode / -PappVersionName, same as mobile/.
        versionCode = (project.findProperty("appVersionCode") as String?)?.toInt() ?: 1
        versionName = (project.findProperty("appVersionName") as String?) ?: "1.0-local"

        // Same project + public anon key the web app ships (src/lib/supabase.js).
        // Override with -PsupabaseUrl / -PsupabaseAnon if needed.
        // Digital-goods screens (WYNKOINS shop, Earn payouts) stay off in the Play build until Play Billing is
        // integrated; build with -PpaymentsEnabled=true to see them.
        buildConfigField("boolean", "PAYMENTS_ENABLED", "${project.findProperty("paymentsEnabled") ?: "false"}")
        // The dashboard (same web app as desktop, phone layout) that the app hosts. -PwebUi=false brings back the old native screens.
        buildConfigField("boolean", "WEB_UI", "${project.findProperty("webUi") ?: "true"}")
        buildConfigField("String", "WEB_BASE_URL", "\"${project.findProperty("webBaseUrl") ?: "https://wynko.in"}\"")
        buildConfigField("String", "SUPABASE_URL",
            "\"${project.findProperty("supabaseUrl") ?: "https://dhzjtjekbvxxsauzhadl.supabase.co"}\"")
        buildConfigField("String", "SUPABASE_ANON",
            "\"${project.findProperty("supabaseAnon") ?: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoemp0amVrYnZ4eHNhdXpoYWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjQ2NjUsImV4cCI6MjA5Nzk0MDY2NX0.2Uo36DtE7NpwW5wxOEwnmWjbXhHWXV-wf6qc7kXDtYE"}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint {
        // Print every finding in the CI log (not just the first failure).
        textReport = true
        textOutput = file("stdout")
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

// Kotlin 2.2 removed the old `kotlinOptions` block.
kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.09.00")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.navigation:navigation-compose:2.9.5")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")

    // Supabase (same backend as the web app)
    implementation(platform("io.github.jan-tennert.supabase:bom:3.2.4"))
    implementation("io.github.jan-tennert.supabase:auth-kt")
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:realtime-kt")
    implementation("io.github.jan-tennert.supabase:functions-kt")
    implementation("io.ktor:ktor-client-okhttp:3.3.0")

    // Firebase: Authentication (email/password + Google) and Firestore. The BoM pins matching versions.
    implementation(platform("com.google.firebase:firebase-bom:34.3.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
    // Google Sign-In through Credential Manager.
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    testImplementation("junit:junit:4.13.2")
}

// The Google Services plugin (Firebase) fails the build when google-services.json has no client for this
// applicationId, so only apply it once the JSON has been regenerated for com.wynko.app (Firebase console ->
// add an Android app with that package -> download google-services.json).
if (file("google-services.json").let { it.exists() && it.readText().contains("\"package_name\": \"com.wynko.app\"") }) {
    apply(plugin = "com.google.gms.google-services")
}
