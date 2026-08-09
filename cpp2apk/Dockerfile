# ---- CPP to APK Builder : Docker image ----
# Base image berisi: JDK 17, Android SDK + NDK + CMake, template raymob (raylib)
# sudah di-clone sekali saat build image supaya build APK per-request lebih cepat.

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Versi terverifikasi: AGP 8.6.1 (raymob) butuh JDK 17, Gradle 8.11.1,
# CMake 3.30.3, compileSdk 34, dan NDK (kita pin 26.3.11579264 / r26d).
ENV ANDROID_SDK_ROOT=/opt/android-sdk \
    ANDROID_NDK_HOME=/opt/android-sdk/ndk/26.3.11579264 \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    GRADLE_USER_HOME=/opt/gradle-home \
    RAYMOB_ROOT=/opt/raymob

ENV PATH="${PATH}:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/build-tools/34.0.0"

# --- Dependensi dasar ---
RUN apt-get update && apt-get install -y --no-install-recommends \
        openjdk-17-jdk \
        wget unzip git ca-certificates curl \
        build-essential \
        python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# --- Android SDK cmdline-tools ---
RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && \
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdtools.zip && \
    unzip -q /tmp/cmdtools.zip -d ${ANDROID_SDK_ROOT}/cmdline-tools && \
    mv ${ANDROID_SDK_ROOT}/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest && \
    rm /tmp/cmdtools.zip

# --- Terima lisensi & install platform, build-tools, NDK, CMake ---
RUN yes | sdkmanager --licenses > /dev/null && \
    sdkmanager \
        "platform-tools" \
        "platforms;android-34" \
        "build-tools;34.0.0" \
        "ndk;26.3.11579264" \
        "cmake;3.30.3"

# --- Clone template raymob + submodule raylib (sekali saat build image) ---
RUN git clone --recurse-submodules --depth 1 https://github.com/Bigfoot71/raymob.git ${RAYMOB_ROOT}

# Patok NDK di build.gradle template supaya memakai persis NDK yang kita install.
RUN sed -i '/compileSdk 34/a\    ndkVersion "26.3.11579264"' ${RAYMOB_ROOT}/app/build.gradle

# Direktori cache gradle harus writable oleh user runtime (HF Space jalan non-root).
RUN mkdir -p ${GRADLE_USER_HOME} && chmod -R 777 ${GRADLE_USER_HOME}

# --- Warmup gradle: download distribusi + compile template sekali di image ---
# (best-effort; jika gagal, image tetap ter-build dan request pertama akan
#  meng-compile penuh.)
RUN cd ${RAYMOB_ROOT} && chmod +x gradlew && \
    (./gradlew assembleDebug --no-daemon || echo "WARN: warmup build gagal, akan compile saat request pertama")

# --- Aplikasi Gradio ---
WORKDIR /app
COPY requirements.txt ./
RUN python3 -m pip install --upgrade pip && \
    python3 -m pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x build_scripts/build_apk.sh deploy.sh 2>/dev/null || true

EXPOSE 7860

CMD ["python3", "app.py"]
