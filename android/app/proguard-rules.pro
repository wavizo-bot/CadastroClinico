# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# --- Contexto: alerta "OTIMIZACAO DEX" do Google Play Console (exigencia) ---
# O Play Console emite um cartao vermelho "Requer atencao" quando a otimizacao
# de codigo DEX fica abaixo do limite (ex.: "Ofuscação (1%). Valores abaixo de
# 25%..."), o que afeta visibilidade/publicacao. Para satisfazer: build.gradle
# usa proguard-android-optimize.txt (otimizacao real de DEX, nao so ofuscacao) e
# minifyEnabled + shrinkResources = true. Este arquivo guarda as regras proprio
# do app. Detalhes em log.txt (secao 15/10/2026 - ALERTA "OTIMIZACAO DEX").

# --- Desofuscacao de stack traces no Play Console ---
# Necessario com R8 ativo: mantem arquivo/linha nos relatorios de falha para o
# Play Console desofuscar com o mapping.txt (proguard.map embutido no AAB).
-keepattributes SourceFile,LineNumberTable
