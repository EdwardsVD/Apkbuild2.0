// sample.cpp — contoh game raylib sederhana yang kompatibel dengan Android.
// Pakai input sentuh (bukan keyboard/mouse) dan ukuran layar otomatis.
// Upload file ini ke Space untuk menguji build.

#include "raylib.h"

int main(void)
{
    // Di Android, InitWindow(0, 0, ...) memakai ukuran layar perangkat.
    InitWindow(0, 0, "Sample raylib APK");

    SetTargetFPS(60);

    Vector2 ball = { (float)GetScreenWidth() / 2.0f,
                     (float)GetScreenHeight() / 2.0f };

    while (!WindowShouldClose())
    {
        // Sentuh layar untuk memindahkan bola.
        if (GetTouchPointCount() > 0)
            ball = GetTouchPosition(0);

        BeginDrawing();
            ClearBackground(RAYWHITE);

            DrawCircleV(ball, 40.0f, MAROON);
            DrawText("Sentuh layar untuk memindahkan bola",
                     20, 20, 24, DARKGRAY);
            DrawText(TextFormat("Posisi: %d, %d",
                     (int)ball.x, (int)ball.y),
                     20, 50, 20, GRAY);
        EndDrawing();
    }

    CloseWindow();
    return 0;
}
