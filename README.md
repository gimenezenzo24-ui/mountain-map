# 🏔️ Ascenso a la Cumbre del Titán — Mapa y Plataformas en Canvas

Juego interactivo retro desarrollado al 100% en **HTML5 Canvas** y **Web Audio API** procedimental (sin librerías externas ni descargas pesadas). El jugador controla a un niño explorador que recorre un mapa de montaña (*overworld*) con 7 niveles conectados, desafiando niveles de plataformas laterales de gran escala.

---

## 🌟 Características Principales

1. **🗺️ Mapa de la Montaña con 7 Niveles Conectados**:
   - Gráficos procedimentales en Canvas con cielo alpino degradado, cordilleras nevadas, bosques y partículas ambientales (nieve en las cumbres y hojas en el valle).
   - Los 7 niveles están unidos por senderos de curvas Bezier orgánicas:
     1. **Campamento Base** (Falda de la montaña)
     2. **Bosque de los Susurros** (Laderas bajas)
     3. **Cañón Rocoso** (Pared escarpada)
     4. **Cueva de Cristal** (Caverna oculta)
     5. **Puente del Viento** (Desfiladero abisal)
     6. **Glaciar Helado** (Alta montaña)
     7. **Cumbre del Titán** (Santuario final sobre las nubes)
   - Desbloqueo progresivo: completar un nivel abre el camino hacia los siguientes con animación de haz de luz dorado, chispas y ondas expansivas.

2. **🏃 Nivel de Plataformas 4x con Cámara Horizontal**:
   - Escenario lateral 4 veces más ancho que la pantalla (`WORLD_WIDTH = 3840px`).
   - Plataformas de tierra elevadas con césped procedural, acantilados y vegetación alpina.
   - Cámara horizontal fluida con seguimiento suave (*lerp*) que sitúa al avatar por delante para visualizar el terreno.
   - Fondo Parallax con 4 capas de profundidad a diferentes velocidades.

3. **💎 Gemas Flotantes Secretas y Rutas Alternas**:
   - 5 gemas secretas resplandecientes ocultas en rutas alternas elevadas y riscos desafiantes.
   - Recompensan la exploración completa otorgando la máxima calificación de 3 estrellas ⭐.

4. **📱 Adaptación Móvil y Pantalla Completa (Cero Lag)**:
   - Modo de pantalla completa inmersiva (`100vw` / `100dvh`, `viewport-fit=cover`) activable con botón flotante o menú superior.
   - Controles táctiles virtuales superpuestos ergonómicos:
     - **Cruceta Digital (D-Pad)** en la esquina izquierda para movimiento y navegación.
     - **Botones de Salto y Acción** en la esquina derecha.
   - Configurados con `{ passive: false }` y `touch-action: none` para eliminar cualquier retraso o lag táctil.

5. **🎵 Sonido Retro 8-Bit y Melodía Chiptune con Web Audio API**:
   - Efectos sonoros sintetizados en tiempo real:
     - Salto con barrido de frecuencia ascendente (onda cuadrada).
     - Recolección de monedas/gemas con doble tono brillante (<kbd>B5</kbd> y <kbd>E6</kbd>).
     - Descenso cromático al caer o ser derrotado.
     - Acorde arpegiado para gemas secretas y desbloqueos.
   - Melodía chiptune alegre y polifónica a 136 BPM con opción de silenciar o apagar la música.

6. **💀 HUD con Contador de Muertes**:
   - Indicador en tiempo real de caídas y derrotas tanto en el encabezado web como en el HUD integrado en el Canvas.

7. **🏆 Pantalla de Fin de Nivel y Desbloqueo Animado**:
   - Al cruzar la meta, se despliega una pantalla de celebración con el título **¡NIVEL COMPLETADO!**, el recuento de gemas, estrellas y muertes.
   - Al volver al mapa, un rayo de energía luminosa recorre el sendero recién abierto y una onda expansiva desbloquea el nuevo nodo.

8. **🛡️ Almacenamiento Seguro en LocalStorage con Validación Anti-Manipulación**:
   - Firma criptográfica dual de alta dispersión (FNV-1a 32-bit + mezclador Murmur3) con sal secreta.
   - Validación estricta de invariantes de negocio: topología del grafo de niveles, relaciones de conectividad y rangos de datos válidos.
   - Si se detecta cualquier intento de alteración manual, los datos son rechazados, el progreso se restaura a un estado seguro y se notifica en pantalla.

---

## 🎮 Controles

| Acción | Teclado / Ratón | Controles Táctiles (Móvil) |
|---|---|---|
| **Mover avatar** | <kbd>▲</kbd> <kbd>▼</kbd> <kbd>◄</kbd> <kbd>►</kbd> o <kbd>WASD</kbd> | Cruceta D-Pad (Izquierda) |
| **Saltar** | <kbd>ESPACIO</kbd> o <kbd>▲</kbd> | Botón SALTO (Derecha) |
| **Entrar al nivel / Acción** | <kbd>ESPACIO</kbd> o <kbd>ENTER</kbd> | Botón ACC (Derecha) |
| **Viajar a un nodo del mapa** | Clic directo sobre el nodo | Toque sobre el nodo |
| **Volver al mapa** | <kbd>ESC</kbd> o botón en pantalla | Toque en el botón del Canvas |
| **Pantalla completa** | Botón superior o flotante | Botón flotante `⛶` |

---

## 🚀 Cómo Ejecutar Localmente

No requiere instalación de dependencias externas. Puedes abrir `index.html` directamente en tu navegador o usar cualquier servidor estático:

```bash
# Con Python 3:
python3 -m http.server 8090

# O con npx:
npx serve .
```

Abre en tu navegador: `http://localhost:8090`
