plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The web app (built by build.py at the repository root) is bundled into the APK, so it works offline.
val webRoot: File = rootProject.projectDir.parentFile
val copyWebApp by tasks.registering(Sync::class) {
    from(webRoot) {
        include("index.html", "version.json", "manifest.webmanifest", "icon-192.png", "icon-512.png", "fonts/**", "sounds/**", "img/**")
    }
    into(layout.buildDirectory.dir("generated/webapp/assets/web"))
}

android {
    namespace = "com.fretopia.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.fretopia.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 19
        versionName = "1.0 (web 19)"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        testInstrumentationRunnerArguments["useTestStorageService"] = "true"
    }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webapp/assets"))
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}

tasks.named("preBuild") { dependsOn(copyWebApp) }

dependencies {
    implementation(project(":input-check")) // brings :audio-input and the Microphone check screen
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.13.1")

    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    androidTestImplementation("androidx.test.services:storage:1.5.0")
    androidTestUtil("androidx.test.services:test-services:1.5.0")
}
