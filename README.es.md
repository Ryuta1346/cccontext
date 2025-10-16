# CCContext - Monitor de Contexto para Claude Code

> 📖 **Leer en otros idiomas**: [日本語](./README.ja.md) | [English](./README.md) | [中文](./README.zh.md) | [한국어](./README.ko.md)

Una herramienta de monitoreo en tiempo real del uso de contexto para Claude Code. Opera independientemente de Claude Code y muestra el uso de tokens y costos para cada sesión monitoreando archivos de log JSONL.

## Propósito

CCContext empodera a los usuarios de Claude Code para maximizar el potencial de su asistente de IA proporcionando visibilidad en tiempo real del consumo de contexto. Al operar independientemente de Claude Code, ofrece una forma no intrusiva de prevenir el agotamiento inesperado del contexto y mantener interacciones de IA continuas y de alta calidad.

**Propuestas de Valor Principales:**
- 🚀 **Prevenir Interrupciones de Trabajo**: Monitorear proactivamente el uso del contexto para evitar activaciones inesperadas del Auto-Compact que podrían interrumpir su flujo de trabajo
- 💡 **Optimizar el Rendimiento de IA**: Mantener la calidad de respuesta de Claude gestionando el contexto de manera efectiva y sabiendo cuándo iniciar nuevas sesiones
- 💰 **Control de Costos**: Rastrear el consumo de tokens y costos en tiempo real, incluyendo la utilización de tokens de caché para optimización de costos
- 🎯 **Perspectivas Predictivas**: Pronosticar con precisión el momento de activación del Auto-Compact mediante análisis sofisticado de patrones de uso
- 🔄 **Inteligencia de Sesión**: Gestionar múltiples sesiones concurrentes de manera eficiente con seguimiento individual y monitoreo en vivo

## Notas Importantes

- **Acerca de los Cálculos**: El uso de tokens, costos, momento de activación del Auto-Compact y otros resultados de cálculo mostrados por esta herramienta son valores de referencia calculados independientemente por cccontext. Pueden no coincidir necesariamente con los resultados de cálculo de Claude Code.
- **Acerca de la Implementación**: Casi todo el código de esta herramienta fue implementado por Claude Code.

## Características

- 🔍 **Monitoreo en Tiempo Real**: Seguimiento en vivo del uso de contexto durante la ejecución de Claude Code
- 📊 **Gestión por Sesión**: Visualización individual del uso de tokens, costos y capacidad restante para cada sesión
- ⚠️ **Sistema de Alertas**: Alertas cuando el uso de contexto alcanza ciertos umbrales
- 💰 **Cálculo de Costos**: Cálculo de costos en tiempo real basado en precios específicos del modelo
- 🎯 **No Intrusivo**: No afecta a Claude Code en sí mismo, solo lee los logs JSONL
- 🤖 **Seguimiento de Auto-Compact**: Muestra la capacidad restante hasta la activación del Auto-Compact de Claude Code

## Instalación

### Ejecución directa con npx (Recomendado)

Ejecutar directamente sin instalación:

```bash
npx cccontext
npx cccontext sessions
npx cccontext monitor --live
```

### Instalación Global

```bash
# Usando pnpm
pnpm add -g cccontext

# Usando npm
npm install -g cccontext

# Ejecutar
cccontext sessions
```

## Uso

### Monitoreo en Tiempo Real

Detectar automáticamente y monitorear la última sesión activa:

```bash
npx cccontext
```

### Selección de Sesión

Seleccionar de la lista de sesiones por número para monitoreo:

```bash
# Mostrar lista de sesiones para selección
npx cccontext --list

# Especificación directa por número (ej: 2da sesión)
npx cccontext --session 2
```

### Lista de Sesiones

Mostrar sesiones recientes:

```bash
npx cccontext sessions
npx cccontext sessions --limit 20  # Mostrar 20 sesiones
npx cccontext sessions --live      # Modo vista en vivo
```

### Comando Monitor

Monitorear sesiones específicas:

```bash
npx cccontext monitor
npx cccontext monitor --session 2  # Monitorear 2da sesión
```

### Otras Opciones

```bash
# Limpiar caché de sesiones
npx cccontext sessions --clear-cache

# Modo debug
npx cccontext sessions --debug
```

## Opciones de Línea de Comandos

### `cccontext` (Por defecto)
Monitorea la última sesión activa en tiempo real.

| Opción | Descripción | Por defecto |
|--------|-------------|-------------|
| `--list` | Mostrar lista de sesiones para selección | false |
| `--session <number>` | Especificación directa por número de sesión | - |
| `--version` | Mostrar información de versión | - |
| `--help` | Mostrar ayuda | - |

### `cccontext monitor`
Monitorear el uso de contexto de Claude Code.

| Opción | Descripción | Por defecto |
|--------|-------------|-------------|
| `--live` | Modo de monitoreo en vivo | true |
| `--session <number>` | Especificar sesión específica por número | - |

### `cccontext sessions`
Listar sesiones recientes de Claude Code.

| Opción | Descripción | Por defecto |
|--------|-------------|-------------|
| `--limit <number>` | Número de sesiones a mostrar | 10 |
| `--live` | Modo vista en vivo (auto-actualización) | false |
| `--clear-cache` | Limpiar caché de sesiones | false |
| `--debug` | Modo debug | false |

Visualización del Auto-Compact:
- `until 65.0%`: Normal - Margen del 65% hasta la activación del Auto-Compact
- `until 45.0%`: Normal - Margen del 45% hasta la activación del Auto-Compact
- `⚠until 15.0%`: Advertencia - 15% hasta la activación del Auto-Compact
- `!until 5.0%`: Peligro - Activación del Auto-Compact inminente
- `ACTIVE`: Auto-Compact activo

## Acerca del Monitoreo del Auto-Compact

Claude Code ejecuta automáticamente el Auto-Compact cuando el uso de la ventana de contexto alcanza cierto umbral, comprimiendo la conversación. CCContext utiliza métodos de cálculo alineados con el comportamiento real de Claude Code para predecir con precisión el momento de activación del Auto-Compact.

### Método de Cálculo
CCContext calcula el uso de contexto basándose en el conteo total de mensajes, igual que Claude Code. Esto permite la predicción precisa del momento real de activación del Auto-Compact.

### Niveles de Advertencia
- **Normal** (Gris): Margen del 30% o más hasta el Auto-Compact
- **Aviso** (Azul): 15-30% hasta el Auto-Compact
- **Advertencia** (Amarillo): 5-15% hasta el Auto-Compact
- **Peligro** (Rojo): Menos del 5% hasta el Auto-Compact
- **Activo** (Rojo/Enfatizado): Auto-Compact activado

### Ejemplos de Visualización
```
# Cuando hay margen suficiente
Auto-compact: at 92% (until 65.0%)

# Nivel de advertencia
Auto-compact: at 92% (⚠until 8.5%)

# Nivel de peligro
Auto-compact: at 92% (!until 2.5%)

# Activo
AUTO-COMPACT ACTIVE
```

## Modelos Compatibles

- Claude Opus 4.1
- Claude Opus 4
- Claude Sonnet 4.5
- Claude Sonnet 4
- Claude 3.5 Sonnet
- Claude Haiku 4.5
- Claude 3.5 Haiku

## Información Adicional

### Verificación de Versión

```bash
cccontext --version
```

### Ayuda

```bash
cccontext --help
cccontext sessions --help
```

### Permisos Requeridos

- Acceso de lectura al directorio `~/.claude/projects/`
- Permisos de lectura de archivos JSONL

### Requisitos del Sistema

- Node.js 18.0.0 o superior
- Soporte para macOS, Linux, Windows

## Licencia

MIT

## Reconocimientos

Este proyecto está fuertemente influenciado por el concepto de [ccusage](https://github.com/ryoppippi/ccusage).