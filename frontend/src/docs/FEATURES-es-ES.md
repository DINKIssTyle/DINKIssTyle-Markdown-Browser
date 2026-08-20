# FUNCIONALIDADES

Este documento describe las funcionalidades de DKST Markdown Browser.
DKST Markdown Browser le permite leer, editar o crear nuevos documentos en formato Markdown.

## Común

- **Abrir Markdown**: Abre archivos Markdown.
- **Barra lateral - Árbol de archivos**: Navega por la estructura de directorios de los documentos abiertos.
- **Barra lateral - Búsqueda**: Busca palabras clave en documentos y subcarpetas abiertos.
- **Visor de imágenes**: Proporciona funciones básicas como navegar y hacer zoom en las imágenes abiertas a través del árbol de archivos.
- **Accesibilidad por teclado**: La mayoría de las funciones se pueden acceder o navegar usando el teclado.
- **Extensiones compatibles**: `.md`, `.markdown`

## Lector
#### DKST Markdown Browser sobresale en la navegación de documentos Markdown hipervinculados y ofrece las siguientes características:

- **Barra lateral - Esquema**: Muestra visualmente la estructura de un documento Markdown y lo organiza como una tabla de contenidos, permitiendo saltos rápidos a ubicaciones específicas.
- **Navegación por hipervínculos**: Navega por documentos Markdown hipervinculados como si estuviera en un navegador web.
- **Función Inicio**: El primer documento abierto sirve como inicio, y puedes volver fácilmente a él incluso cuando navegas a otros documentos mediante hipervínculos.
- **Ajuste del tamaño de fuente**: Ajusta fácilmente el tamaño de la fuente del documento usando botones o atajos de teclado.
- **Temas Claro y Oscuro**: Elige entre temas claro y oscuro según tu preferencia.
- **Función Imprimir**: Imprime el documento.
- **Motor de renderizado**: Selecciona entre `Marked` y `Remark`.
  - Elementos renderizados:
    - **Fórmulas**: Renderiza fórmulas LaTeX a HTML usando `katex*`.
    - **Diagramas**: Renderiza bloques de código Mermaid a SVG usando `Mermaid`.
    - **Resaltado de sintaxis**: Renderiza bloques de código usando `highlight.js`.

## Editor

#### DKST Markdown Browser proporciona un entorno moderno de edición de documentos Markdown incrustando `CodeMirror`.

- **Resaltado de sintaxis**: Admite el Resaltado de Sintaxis para mejorar la legibilidad durante la edición, permitiéndote seleccionar preajustes o configurar paletas de colores personalizadas en la configuración.
- **Atajo `/`**: Presionar `/` mientras editas te permite usar las herramientas de la barra de herramientas sin necesidad de hacer clic con el ratón.
- **Inserción de enlaces**: Inserta fácilmente `URLs` o `documentos locales`. La inserción de un `documento local` utiliza rutas relativas, lo que facilita la creación de documentos.
- **Inserción de imágenes**: Inserta fácilmente `URLs` o `imágenes locales`. La inserción de una `imagen local` utiliza rutas relativas, lo que facilita la creación de documentos.
- **Inserción mediante Barra lateral - Árbol de archivos**: Selecciona un documento, archivo o imagen del árbol de archivos y usa el menú clic derecho para insertar ese elemento directamente en la posición del cursor del editor.
- **Juicio inteligente de ruta para inserción**: Al insertar un documento o una imagen, si la ruta contiene espacios, se encierra en `<` y `>` para universalidad.
- **Documentos vinculados durante la edición**: Si haces clic en un hipervínculo en el documento que estás editando, ese documento se muestra en el visor. Se proporciona un botón flotante para volver al documento que se está editando o abrirlo en una nueva pestaña.
- **Sincronización de desplazamiento entre editor y visor**: Sincroniza la posición de desplazamiento entre la pantalla de edición y el visor renderizado. Esto se puede desactivar en las opciones.
- **Buscar y reemplazar**: Busca o reemplaza por lotes texto dentro del documento que se está editando.
- **Modo de compatibilidad CJK**: Disponible en un modo compatible con `CodeMirror` y el método de entrada "Marked Text" de los métodos de entrada asiáticos orientales, evitando líneas en blanco innecesarias.
- **Ajuste del tamaño de fuente del editor**: Ajusta fácilmente el tamaño de la fuente de la ventana de edición usando botones o atajos de teclado.

>[!TIP] Conoce los [Atajos Predeterminados](SHORTCUTS.md). Usar atajos es muy conveniente.

## Editor con Asistencia de IA
DKST Markdown Browser ofrece asistencia de IA utilizando un LLM Local; consulta la sección de IA en la configuración del editor para configurar y activar esta función.

- **Barra de herramientas de función de IA**: Cuando está activada, aparece un botón flotante `AI` en la esquina inferior izquierda del editor.
  - Haz clic en el botón de IA para pausar la función.
  - Haz clic en el botón expandir para mostrar u ocultar toda la barra de herramientas de función de IA.
     - **Temperatura**: Ajusta la temperatura para controlar la creatividad de la respuesta de la IA. Las temperaturas más altas dan como resultado respuestas de IA más creativas.
     - **Autocompletar**: Alterna Rellenar el medio (FIM). Seleccionar un modelo LLM apropiado es necesario para un funcionamiento correcto.
     - **Contexto+**: Utiliza parte del texto precedente y siguiente como contexto para ayudar al usuario. Esto puede requerir más presupuesto de contexto y tiempo de procesamiento.
     - **Compatible con Github**: Si estás escribiendo documentos para GitHub, la IA intenta asistencia compatible con la especificación Markdown Flavored de GitHub (GFM).
     - **Háblame**: La IA procesa la respuesta del usuario e informa sobre el contenido procesado brevemente **cada vez**.

### Probando las funciones de IA

#### Obtener asistencia de IA con selección de texto
1. Selecciona la oración que estás editando. La ventana del prompt de IA aparece al seleccionar una oración.
1. Presiona `/` para ingresar directamente el prompt en la ventana del prompt.
1. Intenta empezar ligeramente así: `Mejorar oración`, `Traducir al inglés`
1. La oración seleccionada habrá sido mejorada o traducida.

Ejemplos de prompts: "Organizar en una tabla", "Encerrar en div y alinear centrado con ancho de 128px", "Cambiar a minúsculas", "Reescribir la oración en términos más sencillos", "Comprobar ortografía", "Dibujar como un diagrama"

#### Obtener asistencia de IA sin selección de texto
1. Presiona `/` y selecciona `Preguntar a la IA` (Enter) para abrir la ventana del prompt de IA.
1. También puedes llamar al prompt de IA usando un atajo: `CTRL+/` o `⌘+/`
1. Intenta empezar ligeramente así: `Escribe 10 frutas y verduras en una tabla`, `Escribe brevemente sobre los beneficios de las manzanas en formato Markdown`
1. Verás frutas y verduras organizadas en una tabla, o los beneficios de las manzanas en una respuesta tipo LLM.

Ejemplos de prompts: "Dibuja un gato dentro de un bloque de código", "Escribe un ejemplo de Hola Mundo en Python"

>[!Nota] El LLM que opera en DKST Markdown Browser no guarda el contexto de la conversación. Esto es para ser fiel a su papel como herramienta, y no recuerda conversaciones anteriores. Además, no puede hacer referencia a ninguna información externa como internet, la hora actual o la ubicación.

- **Modelos de LLM recomendados**
   - Utiliza un modelo LLM en el rango de `3B~4B` que tenga una `Razonamiento` limitada o cambiable.
   - **La calidad de la asistencia de IA** puede variar mucho dependiendo del modelo LLM que utilices.
