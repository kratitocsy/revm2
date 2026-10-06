package com.revm2.app.data

import android.app.Activity
import com.razorpay.Checkout
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CompletableDeferred
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.json.JSONObject

@Serializable
data class ShopItemRow(val id: String, val name: String, @SerialName("item_type") val itemType: String = "", @SerialName("coin_cost") val coinCost: Int = 0, @SerialName("duration_days") val durationDays: Int? = null)

/**
 * WYNKOINS purchases and spending, through the same server paths as the web
 * (lib/payments.ts): create-razorpay-order -> Razorpay checkout -> verify-razorpay-payment,
 * which grants the coins server-side; shop redemptions via redeem_shop_item.
 */
object PaymentsRepository {
    private val sb get() = Supabase.client
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class RzpOrder(
        @SerialName("order_id") val orderId: String, val amount: Long, val currency: String = "INR",
        @SerialName("key_id") val keyId: String, val coins: Int = 0, val email: String? = null,
    )
    @Serializable private data class Verified(val ok: Boolean = false, @SerialName("coins_added") val coinsAdded: Int = 0)

    /** Result of the Razorpay checkout, delivered by MainActivity's PaymentResultWithDataListener. */
    sealed class CheckoutResult {
        data class Paid(val orderId: String, val paymentId: String, val signature: String) : CheckoutResult()
        data class Failed(val message: String) : CheckoutResult()
    }
    @Volatile var pending: CompletableDeferred<CheckoutResult>? = null

    suspend fun shopItems(): List<ShopItemRow> =
        sb.from("shop_items").select(Columns.list("id", "name", "item_type", "coin_cost", "duration_days")) { order("coin_cost", Order.ASCENDING) }.decodeList()

    /** Spends coins server-side; the server checks the balance. */
    suspend fun redeem(itemId: String) { sb.postgrest.rpc("redeem_shop_item", buildJsonObject { put("p_item_id", itemId) }) }

    /** Opens Razorpay for a coin pack. Returns coins added, or null when the buyer closed checkout. */
    suspend fun buy(activity: Activity, packageId: String): Int? {
        val order = json.decodeFromString<RzpOrder>(sb.functions.invoke("create-razorpay-order", buildJsonObject { put("package_id", packageId) }).bodyAsText())
        val wait = CompletableDeferred<CheckoutResult>().also { pending = it }
        activity.runOnUiThread {
            Checkout.preload(activity.applicationContext)
            val co = Checkout().apply { setKeyID(order.keyId) }
            co.open(activity, JSONObject().apply {
                put("name", "Wynko"); put("description", "%,d WYNKOINS".format(order.coins))
                put("order_id", order.orderId); put("amount", order.amount); put("currency", order.currency)
                put("theme.color", "#7C4DFF")
                put("prefill", JSONObject().apply { put("email", order.email ?: "") })
            })
        }
        return when (val r = wait.await()) {
            is CheckoutResult.Failed -> if (r.message.contains("cancel", true)) null else throw IllegalStateException(r.message)
            is CheckoutResult.Paid -> json.decodeFromString<Verified>(
                sb.functions.invoke("verify-razorpay-payment", buildJsonObject {
                    put("razorpay_order_id", r.orderId); put("razorpay_payment_id", r.paymentId); put("razorpay_signature", r.signature)
                }).bodyAsText()
            ).coinsAdded
        }
    }
}

