package com.revm2.app

import android.app.Application
import com.revm2.app.data.Supabase

class RevM2App : Application() {
    override fun onCreate() {
        super.onCreate()
        Supabase.init()
    }
}
