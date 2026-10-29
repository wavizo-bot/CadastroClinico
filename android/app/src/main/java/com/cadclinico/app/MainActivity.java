package com.cadclinico.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Host Android do Cadastro Clínico.
 *
 * targetSdk 36 (Android 15+) exige edge-to-edge. O Capacitor já desenha a
 * WebView de ponta a ponta, mas o conteúdo precisa respeitar as barras de
 * status, navegação e o teclado (IME). Aplicamos WindowInsets no container
 * nativo para que nenhum botão/campo fique atrás das barras — regra A7.
 *
 * Em Android 14 ou anterior o sistema ainda encaixa a janela normalmente;
 * nesses aparelhos não forçamos o modo edge-to-edge para não duplicar margens.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            controller.setAppearanceLightStatusBars(true);
            controller.setAppearanceLightNavigationBars(true);

            final View content = findViewById(android.R.id.content);
            ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(content);
        }
    }
}
