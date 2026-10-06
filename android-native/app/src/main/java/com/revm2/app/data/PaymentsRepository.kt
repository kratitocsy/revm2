package com.revm2.app.data

import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class ShopItemRow(val id: String, val name: String, @SerialName("item_type") val itemType: String = "", @SerialName("coin_cost") val coinCost: Int = 0, @SerialName("duration_days") val durationDays: Int? = null)

/** Spending WYNKOINS, same server path as the web (redeem_shop_item). The app does not sell coins. */
object PaymentsRepository {
    private val sb get() = Supabase.client

    suspend fun shopItems(): List<ShopItemRow> =
        sb.from("shop_items").select(Columns.list("id", "name", "item_type", "coin_cost", "duration_days")) { order("coin_cost", Order.ASCENDING) }.decodeList()

    /** Spends coins server-side; the server checks the balance. */
    suspend fun redeem(itemId: String) { sb.postgrest.rpc("redeem_shop_item", buildJsonObject { put("p_item_id", itemId) }) }
}
