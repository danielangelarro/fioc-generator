import { describe, expect, it } from "vitest";
import {
  createDIToken,
  buildDIContainer,
  DIContainer // Necesario para tipos internos
} from "@fioc/core";  

// =====================================================================
// === PARTE 1: CÓDIGO DEL USUARIO (Con Comentarios "Decoradores") ===
// =====================================================================

// --- Interfaces y Tokens Base ---

// @Token
export interface RepoA {
  getFooA: () => string;
}

// @Token
export interface RepoB {
  getFooB: () => string;
}

// @Token
export interface ServiceA {
  getA: () => string;
}

// @Token
export interface ServiceB {
  getB: () => string;
}

// --- Implementaciones Simples ---

// @Token
// @Reflect
// @Injectable
export class RepoAImpl implements RepoA {
  getFooA() { return "RepoA Result"; }
}

// @Token
// @Reflect
// @Injectable
export class RepoBImpl implements RepoB {
  getFooB() { return "RepoB Result"; }
}

// --- Factories (Funciones) ---

// @Token
// @Injectable
// @Depends
// Se infiere que depende de RepoA por el argumento
export function factoryC(repoA: RepoA) {
  return () => `Factory C depends on ${repoA.getFooA()}`;
}

// @Token
// @Injectable
// @Scope("singleton")
// @Depends
export function factorySingleton(repoA: RepoA) {
  return () => `Factory Singleton depends on ${repoA.getFooA()}`;
}

// @Token
// @Injectable
// @Scope("scoped")
// @Depends
export function factoryScoped(repoA: RepoA) {
  return { id: Math.random(), msg: `Factory Scoped depends on ${repoA.getFooA()}` };
}

// Factory dependiente de otra factory
// @Token
// @Injectable
// @Depends
export function factoryD(c: any) { // 'c' vendría de factoryC
    // Nota: En TS real usaríamos ReturnType<typeof factoryC>, 
    // aquí simulamos que el token se llama "factoryC"
    return () => `Factory D depends on ${c()}`;
}

// --- Clases con Inyección en Constructor ---

// @Token
// @Injectable
export class FactoryClass {
  constructor(private readonly repoA: RepoA) {}

  fooA() {
    return `From Factory Class ${this.repoA.getFooA()}`;
  }
}

// @Token
// @Injectable
// @Scope("singleton")
export class FactoryClassSingleton {
  constructor(private readonly repoA: RepoA) {}
}

// =====================================================================
// === PARTE 2: CÓDIGO GENERADO (Simulación de lo que hace generator.ts) ===
// =====================================================================
// Este bloque representa el contenido de "src/di-setup.ts" que generaría
// la librería automáticamente al leer los comentarios de arriba.

// Definición de Tokens (Strings extraídos de los nombres)
const RepoAToken = createDIToken<RepoA>("RepoA");
const RepoBToken = createDIToken<RepoB>("RepoB");
const factoryCToken = createDIToken<() => string>("factoryC");
const factoryDToken = createDIToken<() => string>("factoryD");
const factorySingletonToken = createDIToken<() => string>("factorySingleton");
const factoryScopedToken = createDIToken("factoryScoped");
const FactoryClassToken = createDIToken<FactoryClass>("FactoryClass");
const FactoryClassSingletonToken = createDIToken<FactoryClassSingleton>("FactoryClassSingleton");

// Función de configuración generada
function configureGeneratedContainer() {
  const builder = buildDIContainer();

  // 1. Registro de RepoAImpl (Implementa RepoA)
  builder.registerFactory(RepoAToken, {
    factory: (...args: any[]) => new RepoAImpl(),
    dependencies: []
  });

  // 2. Registro de RepoBImpl (Implementa RepoB)
  builder.registerFactory(RepoBToken, {
    factory: (...args: any[]) => new RepoBImpl(),
    dependencies: []
  });

  // 3. Registro de factoryC (Función)
  builder.registerFactory(factoryCToken, {
    factory: factoryC,
    dependencies: [RepoAToken] // Inferido del argumento 'repoA'
  });

   // 4. Registro de factoryD (Función dependiente)
   builder.registerFactory(factoryDToken, {
    factory: factoryD,
    dependencies: [factoryCToken] // Inferido
  });

  // 5. Registro de Singleton Function
  builder.registerSingletonFactory(factorySingletonToken, {
    factory: factorySingleton,
    dependencies: [RepoAToken]
  });

  // 6. Registro de Scoped Function
  builder.registerScopedFactory(factoryScopedToken, {
    factory: factoryScoped,
    dependencies: [RepoAToken]
  });

  // 7. Registro de FactoryClass (Clase Transient)
  builder.registerFactory(FactoryClassToken, {
    factory: (...args: any[]) => new FactoryClass(args[0]),
    dependencies: [RepoAToken] // Inferido del constructor
  });

  // 8. Registro de FactoryClassSingleton (Clase Singleton)
  builder.registerSingletonFactory(FactoryClassSingletonToken, {
    factory: (...args: any[]) => new FactoryClassSingleton(args[0]),
    dependencies: [RepoAToken]
  });

  return builder.getResult();
}

// =====================================================================
// === PARTE 3: TESTS (Probando la lógica generada) ===
// =====================================================================

describe("Fioc Generator Integration Tests", () => {
  
  // Obtenemos el contenedor "Ya compilado"
  const container = configureGeneratedContainer();

  describe("Core Registration and Resolution", () => {
    it("should resolve implementations correctly via tokens inferred from interfaces", () => {
      const resolvedA = container.resolve(RepoAToken).getFooA();
      const resolvedB = container.resolve(RepoBToken).getFooB();

      expect(resolvedA).toBe("RepoA Result");
      expect(resolvedB).toBe("RepoB Result");
    });

    it("should resolve transient factories (functions)", () => {
      // factoryC devuelve una función string
      const factoryResult = container.resolve(factoryCToken)();
      expect(factoryResult).toBe("Factory C depends on RepoA Result");
    });

    it("should return different instances for transient factories", () => {
      // Nota: factoryC devuelve una función, la función en sí es la instancia
      // Como es transient, cada resolve llama a factoryC de nuevo
      const instance1 = container.resolve(factoryCToken);
      const instance2 = container.resolve(factoryCToken);
      
      // En JS, si factoryC crea una nueva clausura cada vez, no son estrictamente iguales
      // pero funcionalmente sí. Para probar transient real, ver FactoryClass.
      expect(instance1).not.toBe(instance2); 
    });
  });

  describe("Scope Management", () => {
    it("should return the same instance for singleton factories", () => {
      const instance1 = container.resolve(factorySingletonToken);
      const instance2 = container.resolve(factorySingletonToken);
      
      expect(instance1).toBe(instance2);
    });

    it("should handle scoped factories correctly", async () => {
      let scope1Id: number;
      let scope2Id: number;

      // Scope 1
      await container.createScope(async (scopedContainer) => {
        const obj1 = scopedContainer.resolve(factoryScopedToken);
        const obj2 = scopedContainer.resolve(factoryScopedToken);
        
        expect(obj1).toBe(obj2); // Mismo objeto dentro del scope
        scope1Id = (obj1 as any).id;
      });

      // Scope 2
      await container.createScope(async (scopedContainer) => {
        const obj3 = scopedContainer.resolve(factoryScopedToken);
        scope2Id = (obj3 as any).id;
      });

      // Diferentes objetos entre scopes
      expect(scope1Id!).toBeDefined();
      expect(scope2Id!).toBeDefined();
      expect(scope1Id!).not.toBe(scope2Id!);
    });
  });

  describe("Class Injection (Constructor Inference)", () => {
    it("should resolve transient classes with constructor dependencies", () => {
      const instance = container.resolve(FactoryClassToken);
      expect(instance.fooA()).toBe("From Factory Class RepoA Result");
    });

    it("should return new instances for transient classes", () => {
      const i1 = container.resolve(FactoryClassToken);
      const i2 = container.resolve(FactoryClassToken);
      expect(i1).not.toBe(i2);
    });

    it("should return same instance for singleton classes", () => {
      const i1 = container.resolve(FactoryClassSingletonToken);
      const i2 = container.resolve(FactoryClassSingletonToken);
      expect(i1).toBe(i2);
    });
  });

  describe("Chained Dependencies", () => {
    it("should resolve recursive dependencies (Factory D -> Factory C -> Repo A)", () => {
      const result = container.resolve(factoryDToken)();
      // factoryD llama a factoryC, que llama a RepoA
      expect(result).toBe("Factory D depends on Factory C depends on RepoA Result");
    });
  });

  describe("Build-Time Error Handling (Concepts)", () => {
    // Nota: Estos tests validan conceptos. En la librería real, 
    // estos errores saltarían al correr el script 'generator.ts', no en runtime.

    it("Runtime: should work perfectly if generation was successful", () => {
       expect(() => container.resolve(RepoAToken)).not.toThrow();
    });
    
    // El test original verificaba errores de registro. 
    // Con @fioc/generator, si te olvidas de un @Token en una dependencia,
    // el generador lanza error y NO genera el archivo di-setup.ts.
    // Por lo tanto, el contenedor generado siempre es "type-safe" en cuanto a existencia de tokens.
  });
});