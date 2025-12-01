import { TokenInfo, InjectableInfo } from "./decorators";

/**
 * Registry (Build-Time)
 * Almacena el estado del análisis estático antes de generar el código.
 */
export class StaticRegistry {
  private tokens = new Map<string, TokenInfo>();
  private injectables: InjectableInfo[] = [];

  // Registra un token encontrado (@Token)
  addToken(info: TokenInfo) {
    if (this.tokens.has(info.id)) {
      throw new Error(`[FiocGenerator] Token duplicado encontrado: ${info.id}`);
    }
    this.tokens.set(info.id, info);
  }

  // Verifica si un token existe
  hasToken(id: string): boolean {
    return this.tokens.has(id);
  }

  getToken(id: string): TokenInfo | undefined {
    return this.tokens.get(id);
  }

  // Registra un elemento inyectable (@Injectable / @Depends)
  addInjectable(info: InjectableInfo) {
    // Validación @Reflect: Si implementa una interfaz, verificamos que tenga token
    if (info.implements) {
      if (!this.tokens.has(info.implements)) {
        throw new Error(
          `[FiocGenerator] Error en '${info.targetName}': Usa @Reflect pero la interfaz '${info.implements}' no tiene un @Token definido.`
        );
      }
    }

    // Validación de Dependencias: Verificamos que cada dependencia tenga un token
    info.dependencies.forEach((depName, index) => {
      // Intentamos resolver por nombre exacto o convención
      if (!this.tokens.has(depName)) {
        throw new Error(
          `[FiocGenerator] Error en '${info.targetName}': La dependencia #${index + 1} de tipo '${depName}' no tiene un @Token registrado.`
        );
      }
    });

    this.injectables.push(info);
  }

  getAllTokens() {
    return Array.from(this.tokens.values());
  }

  getAllInjectables() {
    return this.injectables;
  }
}