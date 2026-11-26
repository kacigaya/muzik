plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.room)
}

val releaseKeystore = providers.environmentVariable("MUZIK_KEYSTORE")
    .orElse(providers.gradleProperty("muzik.keystore"))
val releaseStorePassword = providers.environmentVariable("MUZIK_KEYSTORE_PASSWORD")
    .orElse(providers.gradleProperty("muzik.keystorePassword"))
val releaseKeyAlias = providers.environmentVariable("MUZIK_KEY_ALIAS")
    .orElse(providers.gradleProperty("muzik.keyAlias"))
val releaseKeyPassword = providers.environmentVariable("MUZIK_KEY_PASSWORD")
    .orElse(providers.gradleProperty("muzik.keyPassword"))

android {
    namespace = "app.muzik"
    compileSdk {
        version = release(37) {
            minorApiLevel = 2
        }
    }

    defaultConfig {
        applicationId = "app.muzik"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0-alpha.1"
    }

    signingConfigs {
        if (listOf(releaseKeystore, releaseStorePassword, releaseKeyAlias, releaseKeyPassword)
                .all { it.isPresent }) {
            create("release") {
                storeFile = file(releaseKeystore.get())
                storePassword = releaseStorePassword.get()
                keyAlias = releaseKeyAlias.get()
                keyPassword = releaseKeyPassword.get()
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
            all {
                it.systemProperty("robolectric.graphicsMode", "NATIVE")
                // Recording is explicit. Normal test runs compare against the committed reference images.
                val record = providers.gradleProperty("roborazzi.test.record").getOrElse("false")
                it.systemProperty("roborazzi.test.record", record)
                it.systemProperty("roborazzi.test.verify", (record != "true").toString())
            }
        }
    }
}

room {
    schemaDirectory("$projectDir/schemas")
}

dependencies {
    coreLibraryDesugaring(libs.desugar.jdk.libs.nio)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material3.navigation.suite)
    implementation(libs.androidx.compose.material3.adaptive.navigation3)
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.navigation3.ui)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.guava)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.session)
    implementation(libs.androidx.room.runtime)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.work.runtime)

    implementation(libs.okhttp)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.newpipe.extractor)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
