import { Project, SyntaxKind, Node, ClassDeclaration, FunctionDeclaration, VariableDeclaration } from "ts-morph";
import * as path from "path";
import { ANNOTATIONS, InjectableInfo } from "./decorators";
import { StaticRegistry } from "./registry";

export class FiocGenerator {
  private registry = new StaticRegistry();
  private project: Project;

  constructor(tsConfigPath: string) {
    this.project = new Project({
      tsConfigFilePath: tsConfigPath,
    });
  }

  public async generate(outputFilePath: string) {
    console.log("🔍 Iniciando análisis estático con ts-morph...");
    
    const sourceFiles = this.project.getSourceFiles();

    // --- PASO 1: Recolectar todos los @Token ---
    // Necesitamos conocer todos los tokens antes de analizar dependencias
    for (const file of sourceFiles) {
      this.scanTokens(file);
    }

    // --- PASO 2: Recolectar Injectables y Validar Dependencias ---
    for (const file of sourceFiles) {
      this.scanInjectables(file);
    }

    // --- PASO 3: Generar el archivo de configuración ---
    await this.writeOutputFile(outputFilePath);
    console.log(`✅ Código de inyección generado exitosamente en: ${outputFilePath}`);
  }

  // Escanea comentarios buscando @Token
  private scanTokens(file: any) {
    file.forEachDescendant((node: Node) => {
      if (!Node.isExportable(node)) return; // Solo procesar exportados

      const docs = this.getComments(node);
      if (ANNOTATIONS.TOKEN.test(docs)) {
        let name = "";
        let isInterface = false;

        if (Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node)) {
          name = node.getName()!;
          isInterface = Node.isInterfaceDeclaration(node);
        } else if (Node.isVariableStatement(node)) {
            // Para variables, tomamos la primera declaración
            name = node.getDeclarations()[0].getName();
        } else if (Node.isFunctionDeclaration(node)) {
            name = node.getName()!;
        }

        if (name) {
          this.registry.addToken({
            id: name,
            nodeName: name,
            filePath: file.getFilePath(),
            isInterface
          });
        }
      }
    });
  }

  // Escanea @Injectable, @Reflect, @Depends
  private scanInjectables(file: any) {
    file.forEachDescendant((node: Node) => {
      if (!Node.isClassDeclaration(node) && !Node.isFunctionDeclaration(node) && !Node.isVariableStatement(node)) return;
      
      const docs = this.getComments(node);
      const isInjectable = ANNOTATIONS.INJECTABLE.test(docs);
      const isDepends = ANNOTATIONS.DEPENDS.test(docs);
      const hasReflect = ANNOTATIONS.REFLECT.test(docs);

      if (!isInjectable && !isDepends) return;

      let info: Partial<InjectableInfo> = {
        filePath: file.getFilePath(),
        scope: "transient", // Default
        dependencies: []
      };

      // Detectar Scope
      const scopeMatch = docs.match(ANNOTATIONS.SCOPE);
      if (scopeMatch) {
        info.scope = scopeMatch[1] as any;
      }

      // Proceso para CLASES
      if (Node.isClassDeclaration(node)) {
        const cls = node as ClassDeclaration;
        info.targetName = cls.getName()!;
        info.tokenName = info.targetName; // Asumimos que la clase se registra con su propio nombre como token por defecto
        info.type = "class";

        // Lógica @Reflect: Buscar interfaces implementadas
        if (hasReflect) {
          const implementsClause = cls.getImplements()[0]; // Tomamos la primera para simplificar
          if (implementsClause) {
            info.implements = implementsClause.getExpression().getText();
            // Si tiene @Reflect, el token principal suele ser la interfaz, no la clase
            info.tokenName = info.implements; 
          }
        }

        // Inferir dependencias del constructor
        const ctor = cls.getConstructors()[0];
        if (ctor) {
          info.dependencies = ctor.getParameters().map(param => {
            const typeNode = param.getTypeNode();
            if (!typeNode) throw new Error(`El parámetro ${param.getName()} en ${cls.getName()} no tiene tipo explícito.`);
            return typeNode.getText(); // Obtenemos el nombre del tipo (ej: "IUserService")
          });
        }
      } 
      // Proceso para FUNCIONES (@Depends o @Injectable)
      else if (Node.isFunctionDeclaration(node)) {
        const func = node as FunctionDeclaration;
        info.targetName = func.getName()!;
        info.tokenName = info.targetName;
        info.type = "factory"; // Funciones se tratan como factories

        // Inferir dependencias de argumentos
        info.dependencies = func.getParameters().map(param => {
           const typeNode = param.getTypeNode();
           return typeNode ? typeNode.getText() : "Unknown";
        });
      }

      this.registry.addInjectable(info as InjectableInfo);
    });
  }

  // Helper para obtener texto de comentarios (// o /** */)
  private getComments(node: Node): string {
    // Intentamos obtener JSDocs primero
    const jsDocs = (node as any).getJsDocs?.();
    if (jsDocs && jsDocs.length > 0) {
      return jsDocs.map((d: any) => d.getText()).join("\n");
    }
    // Fallback a comentarios simples //
    const ranges = node.getLeadingCommentRanges();
    return ranges.map(r => r.getText()).join("\n");
  }

  private async writeOutputFile(outputPath: string) {
    const file = this.project.createSourceFile(outputPath, "", { overwrite: true });

    // 1. Imports base
    file.addImportDeclaration({
      moduleSpecifier: "@fioc/core",
      namedImports: ["createDIToken", "buildDIContainer"]
    });

    // 2. Importar los archivos fuente analizados
    // (Simplificación: Importamos todo lo necesario. En prod, calcular rutas relativas)
    const processedFiles = new Set<string>();
    [...this.registry.getAllTokens(), ...this.registry.getAllInjectables()].forEach(item => {
        if(processedFiles.has(item.filePath)) return;
        
        // Calcular ruta relativa desde outputPath hacia item.filePath
        let relativePath = path.relative(path.dirname(outputPath), item.filePath);
        if (!relativePath.startsWith(".")) relativePath = "./" + relativePath;
        relativePath = relativePath.replace(/\.ts$/, ""); // Quitar extensión

        // Importamos el símbolo (Clase, Interfaz, Variable)
        // Nota: Las interfaces solo se importan si se usan como valor, pero aquí solo necesitamos
        // importar las Clases y Funciones reales para pasarlas al contenedor.
        // Las interfaces solo sirven para generar el token string.
        
        // En este paso simplificado, importamos todo lo que tenga 'nodeName' (si es clase/valor)
        // Si es interfaz pura, no necesitamos importarla en el JS generado, solo su nombre string.
        if (!(item as any).isInterface) {
             file.addImportDeclaration({
                defaultImport: "* as " + path.basename(item.filePath).replace(/\W/g, '_'), // Namespace import seguro
                moduleSpecifier: relativePath
            });
        }
        processedFiles.add(item.filePath);
    });
    
    // helper para obtener el acceso al import
    const getImportRef = (filePath: string, name: string) => {
        const namespace = path.basename(filePath).replace(/\W/g, '_');
        return `${namespace}.${name}`;
    }

    const writer = file.addFunction({
      name: "configureContainer",
      isExported: true,
      statements: []
    });

    writer.setBodyText(writer => {
      // 3. Crear Constantes de Tokens
      writer.writeLine("// --- TOKENS ---");
      this.registry.getAllTokens().forEach(token => {
        // const IUserServiceToken = createDIToken("IUserService");
        writer.writeLine(`const ${token.id}Token = createDIToken("${token.id}");`);
      });

      writer.writeLine("\n// --- CONTAINER SETUP ---");
      writer.writeLine("const builder = buildDIContainer();");

      // 4. Registrar dependencias
      this.registry.getAllInjectables().forEach(inj => {
        const tokenVar = `${inj.tokenName}Token`;
        
        // Generar array de dependencias (Tokens)
        const depsArray = `[${inj.dependencies.map(d => d + "Token").join(", ")}]`;

        if (inj.type === "class") {
            const classRef = getImportRef(inj.filePath, inj.targetName);
            
            // Factory Wrapper: (...args) => new Class(...args)
            // Fioc injectará los args basados en depsArray
            const factoryFn = `(...args) => new ${classRef}(...args)`;

            const method = inj.scope === "singleton" ? "registerSingletonFactory" 
                         : inj.scope === "scoped" ? "registerScopedFactory" 
                         : "registerFactory";

            writer.writeLine(`builder.${method}(${tokenVar}, {`);
            writer.writeLine(`  factory: ${factoryFn},`);
            writer.writeLine(`  dependencies: ${depsArray}`);
            writer.writeLine(`});`);

        } else if (inj.type === "factory") {
            const funcRef = getImportRef(inj.filePath, inj.targetName);
            
             const method = inj.scope === "singleton" ? "registerSingletonFactory" : "registerFactory";
             
             writer.writeLine(`builder.${method}(${tokenVar}, {`);
             writer.writeLine(`  factory: ${funcRef},`);
             writer.writeLine(`  dependencies: ${depsArray}`);
             writer.writeLine(`});`);
        }
      });

      writer.writeLine("\nreturn builder.getResult();");
    });

    await file.save(); 
  }
}