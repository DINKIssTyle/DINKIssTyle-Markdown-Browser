<div align="left"><img src="img/textflow.png" width="32"/></div>

Si estás satisfecho con DKST Markdown Browser, prueba **DKST Text Flow**. Ayuda en la creación de documentos utilizando atajos de fragmentos de código. Con soporte de IA, OCR, capturas de pantalla flotantes y varias otras características, mejora la eficiencia de tu flujo de trabajo. [Más información](https://github.com/DINKIssTyle/DINKIssTyle-Text-Flow)


# 3.0 Expansión a Todas las Plataformas
<div align="center"><img src="icon-512.png" width="128"/></div>

<div align="center" style="font-size: 1.2rem; font-weight: 700;"> ¡Un visor y editor de Markdown multiplataforma, ligero y elegante!<br><br>Ahora disponible en Windows, macOS, Linux, iOS, iPadOS y Android.<br><br></div>

## 3.0.4


### 🎛️ Común

* **Asociación de Archivos del SO No Intrusiva**: Puedes abrir varios archivos de texto plano y código fuente como .txt, .py, .c, .m utilizando la función de Asociación de Archivos No Intrusiva. Este es un método de asociación de archivos con mínima intervención.

### 🖥️ Windows, macOS, Linux
* **Aún no disponible**: 

### 📱 Android, iPadOS/iOS
* **Tamaño del Navegador Flotante Ajustable**: El área táctil del botón flotante utilizado para buscar o verificar ortografía se ha ampliado para mejorar la usabilidad en pantallas táctiles.

### 📱 Android
* **Aún no disponible**: 

### 📱 iPadOS
* **Corrección de error de la barra de desplazamiento**: Cuando el panel lateral está abierto, la barra de desplazamiento siempre debería ser visible, pero había desaparecido.

## 3.0.3

### 🎛️ Común
* **Corrección de error del botón de inicio**: Se corrigió un problema por el cual la ubicación de inicio en el árbol de archivos se establecía en la página inicial para los documentos Markdown abiertos.
* **Protección contra errores de Mermaid**: Se añadió lógica defensiva para evitar daños en el shell de la aplicación cuando ocurren errores de renderizado de Mermaid, y se corrigieron problemas de renderizado predecibles mediante pruebas de regresión.

### 🖥️ Windows, macOS, Linux
* **Detalles ejecutables**: Se resolvió un problema por el cual la versión actual no se insertaba correctamente durante las compilaciones.

### 📱 Android
* **Vinculación de documentos**: Se ha añadido la función de vinculación de documentos.
* **Carpeta de documentos**: Actualizado para coincidir con los últimos estándares de Android y se especificó la carpeta de documentos utilizada por la aplicación. Esto puede solicitar permisos de acceso a archivos.

### 📱 iPadOS/iOS
* **Cambio en el método de apertura de documentos de iCloud**: Al abrir archivos de iCloud desde Finder, ahora se abren directamente sin pasar por el sandbox de la aplicación.

## 3.0.2

### 🎛️ Común

* **Panel de esquema (Outline)**: Se eliminó la sintaxis Markdown en la visualización de la lista y se mejoró para permitir el plegado en niveles superiores.
* **Panel del Árbol de Archivos**: Puedes renombrar archivos a través del menú contextual.


### 🖥️ Windows, macOS, Linux
* **Navegación en la barra de herramientas del modo de edición**: Se añadieron botones de desplazamiento a la barra de herramientas del modo de edición para facilitar la navegación cuando queda oculta en anchos reducidos.

### 📱 iOS/iPadOS y Android
* **Mejoras en el panel del árbol de archivos**: El menú contextual de la lista del árbol de archivos en tabletas y móviles ahora se puede abrir manteniendo presionado o usando el botón de menú contextual.
* **Creación de nuevos documentos**: Ahora es posible crear y guardar archivos en la ubicación correcta.
* **Menú contextual**: Se eliminó el menú contextual personalizado de escritorio en móviles y tabletas para evitar conflictos con el menú nativo de cada sistema operativo.



## 3.0.1

### 🖥️ Común
* **Renderizado de etiquetas details y summary**: Se corrigió un error de renderizado en el resumen/despliegue de contenido.

### 📱 iOS/iPadOS y Android
* **UI de iOS y Android**: Los tamaños de fuente de todos los elementos de la interfaz de usuario en entornos móviles (smartphones) y tabletas (iPad / tabletas Android) se han optimizado para cumplir con los estándares de Apple Human Interface Guidelines (iOS/iPadOS Typography).





## Registro de Cambios Anterior

<details>
<summary><b>Cambios durante la Versión 2.2</b></summary>
  
### Aspectos Destacados (Highlights)
* **Soporte Completo para Front Matter**
  * **Detección y Visualización:** Al abrir un documento que contiene Front Matter, aparece un botón con signo de exclamación en la barra de direcciones y la pestaña del documento muestra el título definido en los metadatos.
  * **Inserción de Plantilla:** En el modo de edición, al presionar el botón de exclamación se inserta fácilmente una plantilla básica que incluye título (primera línea del documento), autor (vinculado a la configuración), fecha (momento de creación), etiquetas, estado de borrador, etc.
* **Modos de Edición y Vista Previa Avanzados**
  * **Control de Pantalla Dividida:** Alterna libremente la orientación de división horizontal/vertical y cambia la posición del editor y la vista previa.
  * **Ajuste de Proporción:** Arrastra la barra divisoria para ajustar la proporción, y haz doble clic para restablecer la proporción a 1:1.
  * **Activar/Desactivar Vista Previa:** Controla fácilmente la vista previa mediante el botón de la barra de herramientas o el atajo (`Ctrl+G` / `CMD+G`).
* **Soporte de Actualización en la Aplicación** (Versión de escritorio)
  * Comprueba y descarga nuevas versiones directamente dentro de la aplicación (Configuración → Actualización) sin visitar el sitio web. (Actualmente admite descarga manual en lugar de actualización automática)
#### Mejoras (Improvements)
* **Rediseño Completo de la Interfaz de Configuración:** La pantalla de configuración se ha renovado con un diseño más moderno y sofisticado.
* **Personalización de la Interfaz:**
  * **Barra de Herramientas Principal:** Activa o desactiva en la configuración la visualización de los botones Nuevo documento, Modo edición, Traducir, Tamaño de fuente y Tema.
  * **Barra de Desplazamiento:** Se aplica un color de acento personalizado para comprobar intuitivamente la posición actual de desplazamiento, con opciones de visualización (Siempre o Al desplazarse).
* **Respuesta en la Navegación del Historial:** Se mejoró significativamente la retroalimentación visual y la fluidez de la animación al navegar por el historial (adelante/atrás) mediante gestos del trackpad en Windows, macOS y Linux.
* **Mejora en la Limpieza de la Lista Reciente:** Al hacer clic en 'Limpiar lista reciente', ahora se vacía la lista conservando los archivos fijados por el usuario.
* **Mayor Compatibilidad con Idiomas CJK (Chino, Japonés, Coreano)**
  * **Mejora en Salto de Línea y Confirmación:** Al activar la opción `CJK IME Enter Fix` (macOS, Linux), presionar la tecla Enter una sola vez permite realizar saltos de línea suaves durante la entrada de caracteres CJK.
* **Resolución de Conflictos de Entrada:** Se corrigieron problemas donde presionar Enter o las teclas de flecha al crear listas o usar comandos (`/`) provocaba la confirmación incorrecta de caracteres o no avanzaba a la siguiente acción.
#### Correcciones de Errores (Bug Fixes)
* **Corrección de Error en Selección de Texto:** Se solucionó un problema por el cual, al desplazarse por la pantalla después de cambiar de pestaña o abrir la ventana de configuración, se seleccionaba texto involuntariamente desde la última posición de edición hasta la nueva posición.
* **Soporte para Entornos de Baja Resolución:** Para evitar que la barra de título desaparezca en entornos de baja resolución como 1280x720, la aplicación ahora se abre automáticamente en modo maximizado al iniciarse.
* **Corrección de Navegación en macOS:** Se solucionó un problema por el cual la navegación adelante/atrás en el historial usando el trackpad y el ratón no funcionaba en macOS.
</details>


<details>
<summary><b>Cambios durante la Versión 2.1</b></summary>
  
### Aspectos Destacados (Highlights)
- **Introducción de la barra lateral integrada**: Se ha añadido una barra lateral integrada que incluye Árbol de archivos, Esquema (Outline) y Búsqueda (CTRL+ALT+S / macOS: CMD+OPT+S)
- **Resaltado de sintaxis en Markdown (Syntax Highlight)**: Se añadió el resaltado de sintaxis para bloques de código como Python, Bash, etc.
#### Nuevas Funcionalidades (New Features)
- **Atajos dedicados a la barra lateral**: Se añadieron atajos para el Árbol de archivos (ALT+1), Esquema (ALT+2) y Búsqueda (ALT+3)
- **Inserción mejorada en el editor**: Se añadió la función para insertar hipervínculos e imágenes directamente desde el árbol de archivos al documento en edición
- **Visualización de inserción de tablas**: Se añadió la función para insertar tablas de forma intuitiva usando las teclas de dirección del teclado tras introducir el comando `/table`
- **Inserción avanzada de emojis**: Se añadió una ventana modal de inserción de emojis con navegación por teclado y clasificada por categorías
- **Traducción multilingüe y revisión ortográfica con IA**: Se añadió la función para traducir por lotes el documento en edición al idioma deseado o revisar y corregir la ortografía
- **Traducción exclusiva para el visor**: Se añadió la función para traducir temporalmente el documento actual sin editarlo o guardar la versión traducida
- **Opciones de lista y formato**: Se añadió la opción de selección del método de incremento numérico en listas ordenadas (1. 1. 1. o 1. 2. 3.) y la selección de color personalizado para el resaltador
- **Barras de herramientas por niveles**: Se añadió la opción de elegir entre 3 conjuntos de barras de herramientas del editor (Principiante, Novato, Pro) según el nivel de experiencia del usuario en Markdown
- **Configuración de visualización del visor**: Se añadió la función para cambiar la fuente predeterminada del visor de Markdown y ajustar el margen en 3 niveles
- **Gestión de pestañas y archivos**: Se añadió la reapertura de pestañas cerradas (CTRL+SHIFT+T), Guardar como y la función de fijar (marcador) en la lista de archivos recientes
#### Mejoras (Improvements)
- **Mejoras en tooltip emergente y UI**: Muestra la dirección de destino al pasar el cursor sobre un hipervínculo con soporte multilingüe, y cambia las notificaciones emergentes de emojis por Google Material Symbols
- **Usabilidad mejorada de la barra lateral**: Soporte para navegación con la tecla Tab y flechas del teclado, y mejora del formato del Esquema (Outline) para diferenciar negrita y tamaño según el nivel del encabezado
- **Mayor comodidad en el árbol de archivos**: Muestra solo los archivos compatibles al hacer clic en el filtro, cierra automáticamente la pestaña si se elimina el archivo abierto, y añade 'Abrir en nueva pestaña' al menú contextual del clic derecho en modo lectura
- **Mejor experiencia de edición y pestañas**: Muestra un icono de advertencia para el estado no guardado, abre en una nueva pestaña al abrir otro archivo, añade animación al cerrar pestañas y recuerda la posición anterior del cursor y desplazamiento al volver a una pestaña editada
- **IA y procesamiento de tareas avanzados**: Recuerda el último idioma seleccionado al traducir y muestra respuestas de transmisión en tiempo real (Delta) del LLM en los modos OpenAI y LM Studio
- **Estabilidad multitarea**: Aislamiento completo del historial de trabajo entre pestañas al editar múltiples pestañas simultáneamente; mantiene operaciones de traducción/revisión ortográfica al cambiar de pestaña con estado continuo mediante una barra de progreso universal
- **Programación de tareas**: Si llega una nueva solicitud mientras una operación de LLM está en curso, se procesa secuencialmente tras completar la tarea anterior
- **Configuración de la página de inicio**: Se mejoró para que los usuarios puedan ajustar manualmente la cantidad de elementos recientes mostrados
- **Integración de funciones y estabilización visual**: Agrupación e integración de funciones similares, y eliminación del parpadeo de pantalla al alternar entre modos de lectura y edición
- **Consistencia de diseño**: Ajuste fino del diseño del icono del documento para mantener la coherencia con los documentos de la serie DKST
#### Correcciones de Errores (Bug Fixes)
- **Optimización del rendimiento**: Se corrigió el problema de ralentización en el inicio causado por la recarga de fuentes en cada ejecución en entornos con muchas fuentes instaladas
- **Error en cuadro de diálogo de IA**: Se corrigió el problema de visibilidad donde el cuadro de diálogo de IA permanecía en pantalla tras cerrarlo en el editor
- **Error en revisión ortográfica con IA**: Se mejoró la lógica de análisis de respuestas del LLM para resolver fallos intermitentes en la revisión ortográfica (SpellCheck)
- **Error de renderizado**: Se corrigió el problema por el cual se mostraba un símbolo '•' innecesario al renderizar el formato TASK
- **Legibilidad de diagramas**: Se corrigió un problema de renderizado en diagramas de clases donde la falta de contraste entre el fondo y el texto dificultaba la lectura
- **Resolución de conflictos de atajos**: Se resolvieron los conflictos de atajos causados por la expansión de funciones y se reajustaron los atajos relacionados de forma integral (reflejado en el documento al final de la página de inicio)
</details>
---
© 2026 DINKI'ssTyle.
