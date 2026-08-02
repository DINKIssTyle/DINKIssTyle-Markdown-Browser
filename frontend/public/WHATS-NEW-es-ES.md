
<div align="left"><img src="img/textflow.png" width="32"/></div>

Si estás satisfecho con el DKST Markdown Browser, prueba **DKST Text Flow**. Ayuda en la creación de documentos utilizando atajos. Con soporte de IA, OCR, capturas de pantalla flotantes y varias otras características, mejora la eficiencia de tu flujo de trabajo. [Más información](https://github.com/DINKIssTyle/DINKIssTyle-Text-Flow)

# Nuevas características en la versión 2.2

<div align="center"><img src="icon-512.png" width="128"/></div>

<div align="center" style="font-size: 1.2rem; font-weight: 700;">¡Un visor y editor de Markdown multiplataforma, ligero y elegante!</div>

<div align="center">DKST Markdown Browser se ha vuelto más potente. ¡Echa un vistazo a las principales características añadidas en esta versión!</div>

# Cambios

## 2.2.3

#### Nuevas Funcionalidades
- **Comprobación de actualizaciones**: Puedes comprobar y descargar actualizaciones dentro de la aplicación sin pasar por la web.
  - Disponible en Configuración → pestaña Actualización.
  - Limitación: Actualmente, solo se admite la descarga sin actualizaciones automáticas.

#### Mejoras
- **Compatibilidad CJK mejorada**: Se corrigieron problemas en los que presionar Enter al crear una lista causaba compromisos de caracteres no deseados o terminación de la lista. También se corrigió el problema por el cual los caracteres se comprometían y pasaban a la siguiente acción incluso al presionar Enter o las teclas de flecha mientras se usaban comandos (/).
- **Respuesta mejorada al navegar por el historial**: Se mejoró la fluidez de la animación mostrada al deslizar con una tableta táctil.

## 2.2.2

#### Nuevas Funcionalidades

- **Soporte para Front Matter**: Al abrir un documento Markdown con Front Matter, aparece un botón de admiración en la barra de direcciones y la pestaña muestra el título definido en los metadatos.
- **Inserción de Front Matter**: En modo edición, presionar el botón de admiración inserta una plantilla básica que incluye título, autor, fecha, etiquetas, estado borrador, etc. Una vez insertado el Front Matter, el título se establece por defecto en la primera línea del documento Markdown, el autor utiliza el valor de Configuración → Pestaña Editor → Nombre del autor y la fecha se ingresa al crear.
- **Personalización de la Visualización del Botón de la Barra Principal**: Puedes configurar qué botones (Nuevo Documento, Modo Edición, Traducir, Tamaño de Fuente, Tema) se muestran en la barra principal en Configuración → Apariencia. Cada función tiene una tecla de acceso rápido única.
- **Navegación Historial Mejorada**: Se resolvió un problema por el cual la navegación del historial (avanzar/retroceder) no respondía al usar la almohadilla táctil o el ratón en macOS. Se agregó retroalimentación visual para los gestos de la almohadilla táctil en Windows, macOS y Linux.

#### Mejoras

- **Solucionado el Problema de Selección de Texto Durante el Movimiento del Cursor del Editor**: Se resolvió un problema por el cual se seleccionaba texto desde la última ubicación de edición hasta una nueva ubicación al desplazarse después de acciones como la navegación por pestañas o la apertura de ventanas de configuración, especialmente cuando el cursor se movía a un área no visible.
- **Soporte Mejorado para Baja Resolución**: Se abordó un problema por el cual la barra de título no se mostraba en espacios de trabajo de baja resolución como 1280x720, ejecutándose automáticamente en modo maximizado cuando la resolución del dispositivo es baja.

## 2.2.1

#### Funcionalidades añadidas (Nuevas características)
- **Alternar Horizontal/Vertical en Modo Edición**: Ahora puedes establecer la dirección de vista previa y división en modo edición.
- **Ajustar Posición del Editor/Vista Previa en Modo Edición**: Puedes cambiar la posición de diseño del editor y la vista previa en modo edición.
- **Ajustar Proporción de División en Modo Edición**: Arrastra la barra divisora para ajustar la proporción entre el editor y la vista previa. Consejo: Hacer doble clic en la barra divisora restablece la proporción a 1:1.
- **Deshabilitar Vista Previa en Modo Edición**: Activa o desactiva fácilmente la vista previa desde la barra de herramientas del editor. Consejo: Atajo Ctrl+G / CMD+G

#### Mejoras
- **Rediseño Completo de la Pantalla de Preferencias**: Totalmente renovada con un diseño moderno y sofisticado.
- **Botón de Limpiar Lista Reciente**: El comportamiento ha cambiado para limpiar la lista sin incluir archivos fijados.


## 2.2.0
#### Mejoras
- **Mejora de Salto de Línea para CJK IME Enter Fix**: Cuando la opción `CJK IME Enter Fix` está activada en Configuración → Editor, presionar Enter una vez permite saltos de línea mientras se ingresan caracteres CJK. (Plataformas afectadas: macOS, Linux)

#### Otros
- **Eliminación de Etiqueta Beta**: Se eliminó la etiqueta beta ya que es suficientemente estable.



## Cambios durante la Versión 2.1

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

---
© 2026 DINKI'ssTyle.
