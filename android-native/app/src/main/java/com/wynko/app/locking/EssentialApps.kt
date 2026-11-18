package com.wynko.app.locking

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Apps a focus block must never break by accident: payments (any UPI app, found by who can open a `upi://pay`
 * link, plus known wallets and bank apps). They are left out of the DNS filter, and "allow only these apps" or a
 * Sleep slot never covers them. A block list that names one explicitly still blocks it - that was a choice.
 */
object EssentialApps {
    /** Wallets and bank apps that may not register for upi:// links. Uninstalled ones are simply skipped. */
    val KNOWN_PAYMENTS = setOf(
        "com.google.android.apps.nbu.paisa.user", // Google Pay
        "com.phonepe.app", "net.one97.paytm", "in.org.npci.upiapp", // PhonePe, Paytm, BHIM
        "com.dreamplug.androidapp", "com.mobikwik_new", "com.freecharge.android", "money.super.payments",
        "com.sbi.lotusintouch", "com.sbi.upi", // SBI YONO, BHIM SBI Pay
        "com.csam.icici.bank.imobile", "com.snapwork.hdfc", "com.hdfcbank.payzapp", "com.axis.mobile",
        "com.msf.kbank.mobile", "com.bankofbaroda.mconnect", "com.infrasofttech.indianBank", "com.pnb.pnbone",
        "com.canarabank.mobility", "com.unionbank.ecommerce.mobile.android", "com.idbibank.abhay_card",
        "com.fss.indus", "com.yesbank", "com.kotak811mobilebankingapp.instantsavingsupiscanandpayrecharge",
    )

    @Volatile private var cached: Pair<Long, Set<String>>? = null

    /** Installed payment/UPI/bank apps (cached for a minute: the block screen asks on every app switch). */
    fun payments(ctx: Context): Set<String> {
        val now = System.currentTimeMillis()
        cached?.let { (at, set) -> if (now - at < 60_000) return set }
        val pm = ctx.packageManager
        val upi = runCatching {
            pm.queryIntentActivities(Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay")), 0).map { it.activityInfo.packageName }
        }.getOrDefault(emptyList())
        val known = KNOWN_PAYMENTS.filter { p -> runCatching { pm.getPackageInfo(p, 0) }.isSuccess }
        val out = (upi + known).toSet() - ctx.packageName
        cached = now to out
        return out
    }

    /** Installed web browsers: apps that open https links, plus the ones whose address bar we know. */
    fun browsers(ctx: Context): Set<String> {
        val pm = ctx.packageManager
        val viaLink = runCatching {
            pm.queryIntentActivities(
                Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")).addCategory(Intent.CATEGORY_BROWSABLE),
                android.content.pm.PackageManager.MATCH_ALL,
            ).map { it.activityInfo.packageName }
        }.getOrDefault(emptyList())
        val known = YoutubeChannels.BROWSER_URL_BARS.keys.filter { p -> runCatching { pm.getPackageInfo(p, 0) }.isSuccess }
        // Apps that only claim a few https links (YouTube, Instagram, shopping apps) are not browsers.
        val linkOnly = setOf(YoutubeChannels.YOUTUBE_APP, "com.instagram.android", "com.facebook.katana", "com.twitter.android")
        return (viaLink + known).toSet() - linkOnly - ctx.packageName
    }
}
