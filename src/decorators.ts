/**
 * decorators.ts
 * Define los patrones de análisis para los comentarios mágicos.
 * No contiene lógica de ejecución, solo constantes de análisis.
 */

export const ANNOTATIONS = {
  // @Token -> Detecta tokens
  TOKEN: /@Token/i,
  
  // @Reflect -> Valida implementaciones de interfaces
  REFLECT: /@Reflect/i,
  
  // @Injectable -> Registra la clase/var/func
  INJECTABLE: /@Injectable/i,
  
  // @Depends -> Fuerza el registro como Factory (útil para funciones complejas)
  DEPENDS: /@Depends/i,
  
  // Scope opcional: @Scope("singleton")
  SCOPE: /@Scope\s*\(\s*["'](singleton|transient|scoped)["']\s*\)/i
};

export interface TokenInfo {
  id: string;          // Nombre del token (ej: "IUserService")
  nodeName: string;    // Nombre de la clase/interfaz (ej: "UserService")
  filePath: string;    // Ruta del archivo para importar
  isInterface: boolean;
}

export interface InjectableInfo {
  tokenName: string;      // Token asociado a este inyectable
  targetName: string;     // Nombre de la clase/función
  filePath: string;
  dependencies: string[]; // Lista de nombres de tokens de los que depende
  scope: "transient" | "singleton" | "scoped";
  type: "class" | "factory" | "value";
  implements?: string;    // Interfaz que dice implementar (para @Reflect)
}