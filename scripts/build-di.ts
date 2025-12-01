import { generateDI } from "../src/index";
import * as path from "path";

(async () => {
  console.log("Generando configuración de Inyección de Dependencias...");
  
  await generateDI(
    path.join(__dirname, "../tsconfig.json"), // Ruta a tu tsconfig
    path.join(__dirname, "../src/di-setup.ts") // Archivo de salida deseado
  );
  
  console.log("¡Generación completada!");
})();