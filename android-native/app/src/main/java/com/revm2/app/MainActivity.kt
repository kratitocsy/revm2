package com.revm2.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.razorpay.PaymentData
import com.razorpay.PaymentResultWithDataListener
import com.revm2.app.data.PaymentsRepository
import com.revm2.app.ui.auth.AuthGate
import com.revm2.app.ui.theme.WynkoTheme

class MainActivity : ComponentActivity(), PaymentResultWithDataListener {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent { WynkoTheme { AuthGate() } }
    }

    // Razorpay checkout results (opened from PaymentsRepository.buy); the server verifies the payment.
    override fun onPaymentSuccess(paymentId: String?, data: PaymentData?) {
        PaymentsRepository.pending?.complete(
            if (paymentId != null && data?.orderId != null && data.signature != null)
                PaymentsRepository.CheckoutResult.Paid(data.orderId, paymentId, data.signature)
            else PaymentsRepository.CheckoutResult.Failed("Payment response was incomplete")
        )
    }

    override fun onPaymentError(code: Int, description: String?, data: PaymentData?) {
        PaymentsRepository.pending?.complete(
            PaymentsRepository.CheckoutResult.Failed(if (code == com.razorpay.Checkout.PAYMENT_CANCELED) "cancelled" else description ?: "Payment failed")
        )
    }
}
