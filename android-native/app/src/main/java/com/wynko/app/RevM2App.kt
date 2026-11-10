package com.wynko.app

import android.app.Application
import com.wynko.app.data.Supabase

class RevM2App : Application() {
    override fun onCreate() {
        super.onCreate()
        Supabase.init()
        com.wynko.app.sync.SyncJobService.schedule(this)
    }
}
