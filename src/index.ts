import { FiocGenerator } from "./generator";
import * as path from "path";

/**
 * Función principal para invocar la generación
 * @param tsConfigPath Ruta al tsconfig.json del proyecto
 * @param outputPath Ruta donde se escribirá el archivo DI generado
 */
export async function generateDI(tsConfigPath: string, outputPath: string) {
  const absoluteTsConfig = path.resolve(tsConfigPath);
  const absoluteOutput = path.resolve(outputPath);

  const generator = new FiocGenerator(absoluteTsConfig);
  await generator.generate(absoluteOutput);
}

// Exportar utilidades si se necesitan
export * from "./decorators";