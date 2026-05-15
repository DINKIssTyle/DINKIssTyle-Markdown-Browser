# Novedades en la Versión 2.1 Beta6

<div align="center"><img src="icon-512.png" width="128"/></div>

<div align="center" style="font-size: 1.2rem; font-weight: 700;"> ¡Visor y editor de Markdown multiplataforma, ligero y elegante!</div>

<div align="center">¡DKST Markdown Browser se ha vuelto aún más potente! Echa un vistazo a las principales características añadidas en esta versión.</div>

## 🚀 Cambios Clave de la Versión 2.1

### Introducción de la Barra Lateral

Ha aparecido un botón para abrir la barra lateral en el lado izquierdo de la barra de pestañas. `Atajo: CTRL+ALT+S (macOS: CMD+OPT+S)`
* **Composición de la Barra Lateral**:
  * **Árbol de Archivos**: Muestra la carpeta principal de los archivos abiertos como una estructura de directorio. Puedes ver archivos markdown e imagen directamente seleccionándolos.
  * **Esquema**: Visualiza el esquema de tu documento markdown.
  * **Búsqueda**: La función de búsqueda, anteriormente ubicada en la barra de herramientas principal hasta la versión 2.0, se ha fusionado aquí.

### Cosas Pequeñas pero Cambiadas

* **Información emergente (Popup Tooltip)**: Al pasar el cursor sobre un hipervínculo, se muestra la dirección de destino.

---

## Plan de Nuevas Funcionalidades y Mejoras

- [ ] Usar el árbol de archivos para hipervínculos e inserción de imágenes

Continuará.

# Cambios Recientes

## 2.1 Beta2
### Añadidos, Correcciones de Errores y Pulido

* **Añadido: Resaltado de Sintaxis para Renderizado de Markdown**

### Python
```python
# Secuencia de Fibonacci
def fibonacci(n: int) -> list[int]:
    result = []
    a, b = 0, 1

    while len(result) < n:
        result.append(a)
        a, b = b, a + b

    return result


if __name__ == "__main__":
    print("Fibonacci:", fibonacci(10))
```

### Bash

```bash
#!/usr/bin/env bash

set -euo pipefail

NAME="${1:-World}"

if [[ "$NAME" == "admin" ]]; then
  echo "Welcome, administrator."
else
  echo "Hello, $NAME!"
fi

for file in *.txt; do
  [[ -e "$file" ]] || continue
  echo "Found text file: $file"
done
```

## 2.1 Beta3
### Añadidos

- **Insertar enlaces e imágenes** directamente en el documento editado desde el árbol de archivos.
- **Visualización de Inserción de Tablas**: Intenta insertar una tabla con `/table`. Puedes insertarla intuitivamente usando las teclas de flecha del teclado.
- **Inserción Avanzada de Emojis**: Una ventana modal categorizada te permite navegar y seleccionar elementos usando solo el teclado para insertar.

### Correcciones de Errores y Pulido

- **Corregido el tooltip emergente;** añadido soporte multilingüe.
- **Eliminar notificación de emoji**: Ahora cambia los emojis en los mensajes emergentes por Símbolos Material de Google.
- **Filtro del árbol de archivos**: Al hacer clic en el icono de filtro, solo se muestran los archivos compatibles.

## 2.1 Beta4

### Correcciones de Errores y Pulido

- **Añadir Atajos de Barra Lateral**: Árbol de Archivos es ALT+1, Esquema es ALT+2, Búsqueda es ALT+3.
- **Navegación por Teclado en la Barra Lateral**: La tecla Tab mueve a los elementos hijos; las teclas de flecha recorren toda la barra lateral.
- **Mejorar Barra Lateral - Formato del Esquema**: El texto en negrita y el tamaño de fuente se diferencian según los encabezados, que se pueden activar o desactivar usando botones de formato.
- **Renderizado del formato TASK**: Se adjuntó el • innecesario. Ahora ha sido eliminado y se renderiza como estaba previsto.

## 2.1 Beta5

### Añadidos

- **Generar Traducción de Documento Multilingüe**: Al presionar el botón `Translate Document` en el editor y seleccionar tu idioma deseado, puedes generar una traducción del documento actualmente editado de una vez.
- **Opción de Lista Ordenada**: Ahora hay una opción de Continuación de Lista Ordenada en Configuración > Editor > General, y el predeterminado es 1. 1. 1. Estándar Markdown. Si cambias la opción a 1. 2. 3., los números incrementales, puedes usar números incrementales como antes.
- **Tres Barras de Herramientas del Editor**: Puedes seleccionar entre los conjuntos de barras de herramientas Principiante, Novato o Profesional según tu nivel de dominio de la edición en Markdown en las opciones.
- **Reabrir Pestaña Cerrada**: Puedes reabrir una pestaña cerrada con `CTRL+SHIFT+T`.

### Correcciones y Pulido

- **Cambios de Atajos**: Debido a la funcionalidad ampliada, ha habido cambios en los atajos. Por favor, consulte la documentación de atajos al final de la página de inicio.
- **Indicador de Estado de Edición**: Muestra un icono de advertencia en la pestaña del documento cuando el documento ha sido editado pero aún no se ha guardado.
- **Guardar como**: Puede guardar el documento con un nombre diferente.
- **Menú Contextual del Árbol de Archivos**: Se ha añadido la opción "Abrir en Nueva Pestaña". Esto solo funciona en modo lectura.
- **Menú Contextual del Árbol de Archivos**: Se ha añadido la opción "Abrir en Nueva Pestaña". Esto solo funciona en modo lectura.
- **Animación de Cierre de Pestaña**: Se ha añadido una animación a la barra de pestañas al cerrar una pestaña.



## 2.1 Beta 6

### Correcciones y mejoras de errores
- **Al eliminar un archivo en el árbol de archivos**: Si hay un archivo abierto, esa pestaña también debe cerrarse.
- **Comportamiento al abrir un archivo desde el árbol mientras se edita**: Debe abrirse en una nueva pestaña en estado de edición.
- **Función de documentos traducidos**: Debe recordar los idiomas seleccionados por el usuario por última vez.

---
(C) 2026 DINKI'ssTyle. Todos los derechos reservados.
