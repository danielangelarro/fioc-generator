# @fioc/generator

[![npm version](https://img.shields.io/npm/v/@fioc/generator.svg)](https://www.npmjs.com/package/@fioc/generator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

**Inyección de Dependencias Estática para TypeScript.**

`@fioc/generator` es una herramienta de compilación que elimina la necesidad de `reflect-metadata` y la configuración manual de contenedores en `@fioc/core`. Utiliza **análisis estático (ts-morph)** para leer "Annotation Comments" en tu código y generar automáticamente el archivo de configuración de tu contenedor DI.

### 🚀 Características Principales

*   **Cero Runtime Overhead:** Sin reflexión en tiempo de ejecución. Todo se resuelve al compilar.
*   **Sin `reflect-metadata`:** Tus bundles son más ligeros y rápidos.
*   **Type-Safe:** Errores de inyección detectados durante el build, no en producción.
*   **Inyección de Interfaces:** Inyecta interfaces directamente (`constructor(svc: IService)`) sin hacks.
*   **Sintaxis Limpia:** Usa comentarios JSDoc estándar. Tu código de dominio permanece puro y desacoplado.

---

## 📦 Instalación

Necesitas instalar el core (dependencia de producción) y el generador (dependencia de desarrollo).

```bash
npm install @fioc/core
npm install -D @fioc/generator ts-morph ts-node
```

---

## 🛠️ Configuración del Generador

Dado que esta librería analiza tu código, necesitas crear un script simple para ejecutar el proceso de generación.

Crea un archivo `scripts/build-di.ts`:

```typescript
import { generateDI } from "@fioc/generator";
import * as path from "path";

(async () => {
  console.log("Generando configuración de Inyección de Dependencias...");
  
  await generateDI(
    path.join(__dirname, "../tsconfig.json"), // Ruta a tu tsconfig
    path.join(__dirname, "../src/di-setup.ts") // Archivo de salida deseado
  );
  
  console.log("¡Generación completada!");
})();
```

Agrega el script de generación a tu `package.json`:

```json
{
  "scripts": {
    "build-di": "ts-node scripts/build-di.ts",
    "build": "npm run build-di && npm run build",
    "dev": "npm run build-di && npm run dev"
  }
}
```

> [!NOTE]
> Puedes modificar los comandos de `build` y `dev` de acuerdo a tu proyecto.

Ejecútalo antes de iniciar tu aplicación:

```bash
npx ts-node scripts/build-di.ts
```

---

## 📖 Guía de Uso

El sistema se basa en **Comentarios de Anotación**. No necesitas importar decoradores reales en tus archivos de negocio.

### 1. Inyección de Clases Básica

Marca la clase con `@Token` (para darle identidad) e `@Injectable` (para registrarla). Las dependencias del constructor se infieren automáticamente.

```typescript
// src/services/UserService.ts

// @Token
// @Injectable
export class UserRepository {
  find() { return "User Data"; }
}

// @Token
// @Injectable
export class UserService {
  // El generador detecta 'UserRepository', busca su Token y lo inyecta.
  constructor(private repo: UserRepository) {}
}
```

### 2. Inyección de Interfaces 🌟

A diferencia de otras librerías, `@fioc/generator` permite inyectar interfaces porque conoce los tipos antes de que TypeScript los borre.

1.  Usa `@Token` en la interfaz.
2.  Usa `@Reflect` en la implementación para vincularla.

```typescript
// src/interfaces/Logger.ts

// @Token
export interface ILogger {
  log(msg: string): void;
}
```

```typescript
// src/services/ConsoleLogger.ts
import { ILogger } from "../interfaces/Logger";

// @Token
// @Reflect  <-- Importante: Vincula esta clase a la interfaz que implementa
// @Injectable
// @Scope("singleton")
export class ConsoleLogger implements ILogger {
  log(msg: string) { console.log(msg); }
}
```

```typescript
// src/app.ts
import { ILogger } from "./interfaces/Logger";

// @Token
// @Injectable
export class App {
  // ¡Funciona! Se inyectará ConsoleLogger
  constructor(private logger: ILogger) {}
}
```

### 3. Funciones Factory

Puedes inyectar funciones directamente. El generador analizará sus argumentos como dependencias.

```typescript
// src/database.ts

// @Token
export type DbConfig = { url: string };

// @Token
// @Injectable
export function createConnection(config: DbConfig) {
  return new DatabaseConnection(config.url);
}
```

### 4. Valores y Tipos Primitivos

Útil para configuraciones, API Keys, etc.

```typescript
// src/config.ts

// @Token
export type ApiKey = string;

// @Injectable
export function provideApiKey(): ApiKey {
  return process.env.API_KEY || "dev-secret";
}
```

### 5. Scopes (Ciclo de Vida)

Controla cómo se instancian tus servicios.

*   `@Scope("transient")`: (Por defecto) Nueva instancia cada vez.
*   `@Scope("singleton")`: Una única instancia compartida.
*   `@Scope("scoped")`: Una instancia por request/scope creado.

```typescript
// @Token
// @Injectable
// @Scope("singleton")
export class DatabaseService { ... }
```

---

## 🔌 Integración en la Aplicación

Una vez generado el archivo `di-setup.ts`, úsalo en tu punto de entrada:

```typescript
// src/index.ts
import { configureContainer } from "./di-setup"; // <-- Archivo generado
import { createDIToken } from "@fioc/core";
import { App } from "./app";

// 1. Obtener el contenedor configurado (súper rápido)
const container = configureContainer();

// 2. Resolver dependencia raíz
// Nota: Puedes recrear el token usando el nombre de la clase/interfaz
const AppToken = createDIToken<App>("App"); 
const app = container.resolve(AppToken);

app.run();
```

---

## 📚 Referencia de Anotaciones

Coloca estos comentarios justo encima de `class`, `interface`, `type`, `function` o `const`.

| Anotación | Descripción | Uso en |
| :--- | :--- | :--- |
| `// @Token` | Define que este elemento tiene un identificador único en el sistema DI. | Clase, Interfaz, Tipo, Función |
| `// @Injectable` | Registra el elemento en el contenedor para ser instanciado. | Clase, Función, Var |
| `// @Reflect` | Inspecciona qué interfaz implementa la clase y registra el servicio bajo el Token de dicha interfaz. | Clase |
| `// @Scope("...")` | Define el ciclo de vida: `"singleton"`, `"transient"`, `"scoped"`. | Clase, Función |
| `// @Depends` | (Opcional) Fuerza el registro como factory manual si la inferencia falla. | Funciones complejas |

---

## ⚠️ Solución de Problemas

**Error: "La dependencia X no tiene un @Token registrado"**
*   El generador valida que todo lo que pides en un constructor tenga un `@Token`. Asegúrate de añadir el comentario `// @Token` en la definición de la clase o interfaz de la dependencia.

**Error: "Interfaz X no tiene Token (usando @Reflect)"**
*   Si usas `@Reflect` en una clase `class A implements B`, la interfaz `B` **debe** tener el comentario `// @Token`.

**Los cambios no se reflejan**
*   Recuerda ejecutar el script de generación (`ts-node scripts/build-di.ts`) cada vez que añades nuevas dependencias o cambias constructores.

---

## 📄 Licencia

MIT © [Daniel Angel / Kherveiz]