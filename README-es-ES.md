# Introducción al Navegador Markdown DKST

<p align="center">
  <img src="frontend/public/icon-192.png" width="128">
</p>

<p align="center">
  <strong>¡Un visor y editor de Markdown multiplataforma, ligero y elegante!</strong>
</p>

<div align="center"><b>iOS/iPadOS</b><br><a href="https://apps.apple.com/kr/app/dkst-markdown-browser/id6799445013" target="blank"><img src="doc/appstore2.png" alt="" width="120"></a><br><br></div>


## NOTICIAS

### ✨ ¡Nuevo! Versión 2.0
- **Soporte IA**: Funcionalidad de asistente de IA para escribir y editar documentos Markdown.
- **Estado de Flujo (Flow State)**: Editor de Markdown continuo que no interrumpe tu flujo de trabajo.
<p align="center">
  <img src="frontend/public/img/200_ai_01.gif" width="90%">
</p>
<p align="center">
  <img src="frontend/public/img/200_ai_02.gif" width="90%">
</p>
<p align="center">
  <img src="frontend/public/img/200_ai_03.gif" width="90%">
</p>

---
# FUNCIONES

Este documento describe las funcionalidades del Navegador Markdown DKST.
El Navegador Markdown DKST permite leer, editar y crear nuevos documentos Markdown.

## Común

- **Abrir Markdown**: Puede abrir documentos Markdown.
- **Barra Lateral - Árbol de Archivos**: Navegue por la estructura de directorios del documento abierto.
- **Barra Lateral - Búsqueda**: Busque palabras clave en el documento y subcarpetas abiertas.
- **Visor de Imágenes**: Proporciona funciones básicas como navegar y hacer zoom en imágenes abiertas a través del árbol de archivos.
- **Accesibilidad por Teclado**: La mayoría de las funciones son accesibles y navegables mediante teclado.
- **Extensiones Soportadas**: `.md`, `.markdown`

## Lector
#### El Navegador Markdown DKST es excelente para navegar por documentos Markdown hipervinculados y ofrece las siguientes características:

- **Barra Lateral - Esquema**: Muestra visualmente la estructura del documento Markdown y permite navegar rápidamente a esa ubicación como un índice.
- **Navegación por Hipervínculos**: Navegue por documentos Markdown hipervinculados como si fuera un navegador web.
- **Función de Inicio**: El primer documento abierto sirve como página de inicio, y puede volver fácilmente a él incluso si navega a otros documentos mediante hipervínculos.
- **Ajuste del Tamaño de Fuente**: Ajuste fácilmente el tamaño de la fuente del documento mediante botones o atajos de teclado.
- **Temas Claro/Oscuro**: Elija entre un tema claro y uno oscuro según su preferencia.
- **Función de Impresión**: Imprima el documento.
- **Motor de Renderizado**: Puede elegir entre `Marked` y `Remark`.
  - Elementos renderizados:
    - **Fórmulas**: Renderiza fórmulas LaTeX a HTML usando `katex*`.
    - **Diagramas**: Renderiza bloques de código Mermaid a SVG usando `Mermaid`.
    - **Resaltado Sintáctico**: Renderiza bloques de código usando `highlight.js`.

## Editor

#### El Navegador Markdown DKST proporciona un entorno de edición moderno para documentos Markdown al integrar `CodeMirror`.

- **Resaltado Sintáctico**: Soporta Resaltado Sintáctico para mejorar la legibilidad de la edición, y puede seleccionar perfiles preestablecidos o configurar paletas de colores personalizadas en la configuración.
- **Atajo `/`**: Ingrese la tecla `/` mientras edita para acceder a las herramientas de la barra sin hacer clic con el ratón.
- **Inserción de Enlaces**: Inserte fácilmente `URLs` o `documentos locales`. Al insertar un `documento local`, se ingresa una ruta relativa, lo que facilita la redacción del documento.
- **Inserción de Imágenes**: Inserte fácilmente `URLs` o `imágenes locales`. Al insertar una `imagen local`, se ingresa una ruta relativa, lo que facilita la redacción del documento.
- **Inserción mediante el Árbol de Archivos de la Barra Lateral**: Seleccione un documento, archivo o imagen en el árbol de archivos y utilice el menú contextual del clic derecho para insertar ese elemento directamente en la posición del cursor del editor.
- **Determinación Inteligente de Rutas de Inserción**: Cuando se inserta un documento o imagen, si la ruta contiene espacios, se encierra entre `<` y `>` para garantizar la compatibilidad.
- **Documentos Visitados mediante Hipervínculo mientras se Edita**: Si hace clic en un hipervínculo en el documento que está editando, ese documento se muestra en el visor, y se proporciona un botón flotante para volver al documento que está editando o abrirlo en una nueva pestaña.
- **Sincronización de Desplazamiento entre Editor y Visor**: Sincroniza la posición de desplazamiento entre la pantalla del editor y el visor renderizado. Se puede desactivar en las opciones.
- **Buscar y Reemplazar**: Busque o reemplace texto en el documento que está editando.
- **Modo Compatible con CJK**: Proporcionado en un modo compatible con el método de entrada `Marked Text` de los teclados chinos, japoneses y coreanos, previniendo la generación innecesaria de líneas en blanco.
- **Ajuste del Tamaño de Fuente del Editor**: Ajuste fácilmente el tamaño de la fuente del área de edición mediante botones o atajos de teclado.

>[!TIP] Conozca los [atajos básicos](frontend/public/SHORTCUTS.md). Los atajos hacen que sea muy conveniente.

## Editor con Asistencia IA
El Navegador Markdown DKST ofrece asistencia de IA utilizando LLMs locales; consulte la sección de IA en la configuración del editor para configurar y activar/desactivar esta función.

- **Barra de Herramientas de Funciones IA**: Cuando la función está activada, aparece un botón flotante `AI` en la esquina inferior izquierda del editor.
  - Al hacer clic en el botón de IA, puede pausar la función.
  - Al hacer clic en el botón desplegable, puede mostrar u ocultar toda la barra de herramientas de funciones IA.
     - **Temperatura**: Ajuste la temperatura para controlar la creatividad de las respuestas de la IA. Cuanto mayor sea la temperatura, más creativo será el contenido generado por la IA.
     - **Autocompletar**: Activa o desactiva la función Fill-in-the-Middle (FIM). Para que funcione correctamente, debe seleccionar un modelo LLM adecuado.
     - **Contexto+**: Utiliza parte del contenido anterior y posterior al texto seleccionado para asistir al usuario. Esto puede requerir más presupuesto de contexto y tiempo de procesamiento.
     - **Compatible con GitHub**: Si está escribiendo documentación para GitHub, la IA intentará asistir según la especificación de Markdown Flavored por GitHub (GFM).
     - **Háblame**: La IA procesa la respuesta del usuario e informa brevemente sobre el procesamiento **cada vez**.

### Práctica de Uso de Funciones IA

#### Recibir Asistencia IA con Selección de Texto
1. Seleccione la oración que está editando. La aparición del cuadro de indicaciones de IA también ocurre al seleccionar una oración.
1. Presione la tecla `/` para ingresar el prompt directamente en el cuadro de indicaciones.
1. Empiece fácilmente como: `Mejorar la oración`, `Traducir al inglés`.
1. La oración seleccionada habrá sido mejorada o traducida.

Ejemplos de Prompts: "Organizar en una tabla", "Encerrar en un div y centrar con ancho de 128px", "Cambiar a minúsculas", "Reescribir la oración de forma sencilla", "Comprobación ortográfica", "Dibujar como diagrama".

#### Recibir Asistencia IA sin Selección de Texto
1. Ingrese `/` y seleccione `Ask AI` (Enter) para que aparezca el cuadro de indicaciones de IA.
1. También puede llamar al prompt de IA usando un atajo: `CTRL+/` o `⌘+/`.
1. Empiece fácilmente como: "Ingresar 10 frutas y verduras en una tabla", "Escribir brevemente los beneficios de la manzana en formato Markdown".
1. Habrá obtenido una tabla de frutas y verduras, o los beneficios de la manzana según la respuesta del LLM.

Ejemplos de Prompts: "Dibuja un gato en un bloque de código", "Escribe un ejemplo de hola mundo en Python".

>[!Note] Los LLMs que funcionan en el Navegador Markdown DKST no guardan el contexto de la conversación. Esto es para cumplir con su función como herramienta, y tampoco recuerdan conversaciones anteriores. Además, no pueden consultar ninguna información externa como internet, la hora actual o la ubicación.

- **Modelo LLM Recomendado**
   - Utilice un modelo LLM de tamaño `3B~4B` que no requiera o permita la función de Razonamiento.
   - **La calidad de la asistencia IA** puede variar mucho dependiendo del modelo LLM que utilice.

## Descarga
Puede descargar el ejecutable de la última versión [haciendo clic aquí](https://github.com/DINKIssTyle/DINKIssTyle-Markdown-Browser/releases).

## Instalación

### Windows
Mueva el ejecutable a la ubicación deseada y úselo.

### macOS
Monte el archivo DMG y muévalo a la carpeta de Aplicaciones para usarlo.

### Linux (Ubuntu, CentOS, etc.)
Ejecute el ejecutable y luego haga clic en el enlace de instalación en la parte inferior de la página de inicio para completar la instalación.

## Patrocinio
<div >
<a href="https://github.com/sponsors/DINKIssTyle">
    <img src="https://img.shields.io/badge/Sponsor-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white" alt="Sponsor">
  </a>
  <br> Su patrocinio me ayuda a seguir mejorando este proyecto. — Y también obtengo una excusa perfectamente válida para trabajar hasta tarde sin causar problemas en casa y desde la cama.
</p><br></div>

## Usuarios Avanzados

### Prerrequisitos

- **Go**: Versión 1.23 o superior
- **Wails**: Versión v3.0.0-beta.3 (Wails 3 está actualmente en prelanzamiento)
- **Node.js**: Versión 18 o superior (incluido npm)
- **Herramientas CGO**: Necesarias para la compilación nativa (ej. GCC o Clang)

### Compilar desde el Código Fuente

#### macOS
El script de compilación de macOS genera binarios universales (si se selecciona) y maneja el paquete de la aplicación (`.app`).
```bash
chmod +x build-macOS.sh
./build-macOS.sh [arm64 | amd64 | universal]
```

#### Windows
El script de compilación de Windows genera un ejecutable (`.exe`) con icono.
```cmd
build-Windows.bat [amd64 | arm64 | 386]
```

#### Linux
El script de compilación de Linux genera binarios para arquitecturas específicas.
```bash
chmod +x build-Linux.sh
./build-Linux.sh [amd64 | arm64 | arm]
```

## Licencia

**Creado por DINKIssTyle.**
Copyright (c) 2026 DINKI'ssTyle. Todos los derechos reservados.
Consulte `THIRD-PARTY-NOTICES.md` para la licencia de librerías de código abierto.
