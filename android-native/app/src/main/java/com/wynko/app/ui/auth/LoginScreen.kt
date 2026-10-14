package com.wynko.app.ui.auth

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.wynko.app.R
import com.wynko.app.ui.components.WkText
import com.wynko.app.ui.theme.Jakarta
import com.wynko.app.ui.theme.Wk
import kotlin.random.Random

private enum class Mode { Options, SignIn, SignUp, Forgot }

/** Sign-in screen in the Wynko look (same flow as the web login: provider first, then email views). */
@Composable
fun LoginScreen(vm: AuthViewModel = viewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var mode by remember { mutableStateOf(Mode.Options) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }

    fun go(m: Mode) { mode = m; localError = null; vm.clearMessages() }

    Box(Modifier.fillMaxSize().background(Wk.Black950)) {
        Backdrop()
        Column(
            Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Image(painterResource(R.drawable.wynko_logo), "Wynko", Modifier.size(64.dp).clip(RoundedCornerShape(18.dp)))
            Spacer(Modifier.height(18.dp))
            WkText("WYNKO", 13, FontWeight.Bold, Wk.Orange400, letterSpacingEm = 0.3f)
            Spacer(Modifier.height(10.dp))
            AnimatedContent(mode, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "title") { m ->
                WkText(
                    when (m) {
                        Mode.Options -> "Lock in. Level up."
                        Mode.SignIn -> "Welcome back"
                        Mode.SignUp -> "Create your account"
                        Mode.Forgot -> "Reset your password"
                    },
                    26, FontWeight.ExtraBold, Wk.Ink100, align = TextAlign.Center,
                )
            }
            Spacer(Modifier.height(6.dp))
            WkText("Focus, study rooms and streaks in one place.", 13, color = Wk.Ink400, align = TextAlign.Center)
            Spacer(Modifier.height(30.dp))

            Column(Modifier.widthIn(max = 380.dp).fillMaxWidth()) {
                when (mode) {
                    Mode.Options -> {
                        GoogleButton(enabled = !state.loading) { vm.signInWithGoogle(context) }
                        Spacer(Modifier.height(18.dp))
                        OrDivider()
                        Spacer(Modifier.height(18.dp))
                        OutlineAction("Continue with email") { go(Mode.SignIn) }
                    }
                    Mode.SignIn -> {
                        Field("Email", email, { email = it }, KeyboardType.Email)
                        Spacer(Modifier.height(12.dp))
                        Field("Password", password, { password = it }, KeyboardType.Password, secret = true)
                        Spacer(Modifier.height(18.dp))
                        Action("Sign in", state.loading, email.isNotBlank() && password.isNotBlank()) { vm.signIn(email, password) }
                        Spacer(Modifier.height(14.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            LinkText("Forgot password?") { go(Mode.Forgot) }
                            LinkText("Create account") { go(Mode.SignUp) }
                        }
                    }
                    Mode.SignUp -> {
                        Field("Email", email, { email = it }, KeyboardType.Email)
                        Spacer(Modifier.height(12.dp))
                        Field("Password", password, { password = it }, KeyboardType.Password, secret = true)
                        Spacer(Modifier.height(12.dp))
                        Field("Confirm password", confirm, { confirm = it }, KeyboardType.Password, secret = true)
                        Spacer(Modifier.height(18.dp))
                        Action("Create account", state.loading, email.isNotBlank() && password.isNotBlank() && confirm.isNotBlank()) {
                            when {
                                password.length < 6 -> localError = "Password must be at least 6 characters."
                                password != confirm -> localError = "Passwords don't match."
                                else -> { localError = null; vm.signUp(email, password) }
                            }
                        }
                        Spacer(Modifier.height(14.dp))
                        LinkText("Already have an account? Sign in", Modifier.align(Alignment.CenterHorizontally)) { go(Mode.SignIn) }
                    }
                    Mode.Forgot -> {
                        Field("Email", email, { email = it }, KeyboardType.Email)
                        Spacer(Modifier.height(18.dp))
                        Action("Send reset link", state.loading, email.isNotBlank()) { vm.resetPassword(email) }
                    }
                }

                (localError ?: state.error)?.let {
                    Spacer(Modifier.height(14.dp))
                    WkText(it, 12, FontWeight.Medium, Wk.Red, Modifier.fillMaxWidth(), align = TextAlign.Center)
                }
                state.info?.let {
                    Spacer(Modifier.height(14.dp))
                    WkText(it, 12, FontWeight.Medium, Wk.Green, Modifier.fillMaxWidth(), align = TextAlign.Center)
                }
                if (mode != Mode.Options) {
                    Spacer(Modifier.height(18.dp))
                    LinkText("← Back", Modifier.align(Alignment.CenterHorizontally), Wk.Ink400) { go(Mode.Options) }
                }
            }
            Spacer(Modifier.height(32.dp))
            WkText("Free forever. No spam. Your data stays yours.", 11, color = Wk.Ink500, align = TextAlign.Center)
        }
    }
}

/** Orange glow behind the logo plus a faint twinkling starfield, like the web login. */
@Composable
private fun Backdrop() {
    val stars = remember {
        val r = Random(7)
        List(70) { Triple(r.nextFloat(), r.nextFloat(), r.nextFloat()) } // x, y, phase
    }
    val t by rememberInfiniteTransition(label = "stars").animateFloat(
        0f, 1f, infiniteRepeatable(tween(4200, easing = LinearEasing)), label = "t",
    )
    Canvas(Modifier.fillMaxSize()) {
        drawRect(
            Brush.radialGradient(
                listOf(Color(0x40FF8A3D), Color(0x14FF8A3D), Color.Transparent),
                center = Offset(size.width / 2f, size.height * 0.2f), radius = size.width * 1.1f,
            ),
        )
        stars.forEach { (x, y, p) ->
            val a = 0.15f + 0.45f * (0.5f + 0.5f * kotlin.math.sin((t + p) * 6.2831855f))
            drawCircle(Color(0xFFFFF7E6).copy(alpha = a), radius = 1.2f + p * 1.2f, center = Offset(x * size.width, y * size.height))
        }
    }
}

@Composable
private fun GoogleButton(enabled: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(14.dp))
            .background(if (enabled) Color.White else Color.White.copy(alpha = 0.5f))
            .clickable(enabled = enabled, onClick = onClick),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        GoogleG(Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        WkText("Continue with Google", 15, FontWeight.SemiBold, Color(0xFF111111))
    }
}

/** The four-colour Google "G", drawn from arcs so no image asset is needed. */
@Composable
private fun GoogleG(modifier: Modifier) {
    Canvas(modifier) {
        val w = size.minDimension * 0.2f
        val inset = w / 2f
        val arcSize = Size(size.width - w, size.height - w)
        val tl = Offset(inset, inset)
        fun arc(color: Long, start: Float, sweep: Float) =
            drawArc(Color(color), start, sweep, false, tl, arcSize, style = Stroke(w, cap = StrokeCap.Butt))
        arc(0xFFEA4335, 200f, 85f)   // top (red)
        arc(0xFFFBBC05, 140f, 62f)   // left (yellow)
        arc(0xFF34A853, 85f, 58f)    // bottom (green)
        arc(0xFF4285F4, -5f, 92f)    // right (blue)
        drawLine(Color(0xFF4285F4), Offset(size.width / 2f, size.height / 2f), Offset(size.width - inset, size.height / 2f), w)
    }
}

@Composable
private fun OrDivider() {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f).height(1.dp).background(Wk.Black600))
        WkText("OR", 10, FontWeight.Medium, Wk.Ink500, Modifier.padding(horizontal = 14.dp), letterSpacingEm = 0.15f)
        Box(Modifier.weight(1f).height(1.dp).background(Wk.Black600))
    }
}

@Composable
private fun OutlineAction(text: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(14.dp))
            .border(BorderStroke(1.dp, Wk.Black500), RoundedCornerShape(14.dp)).clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) { WkText(text, 15, FontWeight.SemiBold, Wk.Ink100) }
}

@Composable
private fun Action(text: String, loading: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val on = enabled && !loading
    Row(
        Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(14.dp))
            .background(Brush.linearGradient(listOf(Wk.Orange500, Wk.Orange600)), alpha = if (on) 1f else 0.4f)
            .clickable(enabled = on, onClick = onClick),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(18.dp), color = Wk.Black950, strokeWidth = 2.dp)
        else WkText(text, 15, FontWeight.Bold, Wk.Black950)
    }
}

@Composable
private fun Field(label: String, value: String, onChange: (String) -> Unit, type: KeyboardType, secret: Boolean = false) {
    OutlinedTextField(
        value, onChange, Modifier.fillMaxWidth(), singleLine = true,
        label = { WkText(label, 13, color = Wk.Ink400) },
        textStyle = androidx.compose.ui.text.TextStyle(fontFamily = Jakarta, fontSize = 15.sp),
        visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = type),
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Wk.Black800, unfocusedContainerColor = Wk.Black800,
            focusedBorderColor = Wk.Orange500, unfocusedBorderColor = Wk.Black600,
            focusedTextColor = Wk.Ink100, unfocusedTextColor = Wk.Ink100, cursorColor = Wk.Orange500,
        ),
    )
}

@Composable
private fun LinkText(text: String, modifier: Modifier = Modifier, color: Color = Wk.Orange400, onClick: () -> Unit) {
    WkText(text, 12, FontWeight.Medium, color, modifier.clickable(onClick = onClick).padding(vertical = 4.dp))
}
