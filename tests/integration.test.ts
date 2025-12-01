import "reflect-metadata";
import { Token, Injectable, Depends } from "./decorators";
import { createDecoratedContainer } from "./generator";
import { createDIToken } from "@fioc/core";
import { Registry } from "./registry";

// Helper to wait for microtasks (decorators are async)
async function waitForMicrotasks() {
  await new Promise(resolve => setTimeout(resolve, 10));
}

describe("Integration Tests", () => {
  beforeEach(() => {
    // Clear registry
    (Registry as any).tokenMap.clear();
    (Registry as any).metadataMap.clear();
    (Registry as any).registrations.clear();
  });

  it("should run a simple test", () => {
    expect(true).toBe(true);
  });

  it("should create a container and resolve dependencies", async () => {
    @Token("Logger")
    @Injectable()
    class Logger {
      log(message: string) {
        return `[LOG] ${message}`;
      }
    }

    @Token("UserService")
    @Injectable()
    class UserService {
      constructor(private logger: Logger) {}

      getUser() {
        this.logger.log("Getting user");
        return { id: 1, name: "Test User" };
      }
    }

    // Wait for decorators to process
    await waitForMicrotasks();

    const container = createDecoratedContainer();
    const userServiceToken = Registry.getToken(UserService);

    expect(userServiceToken).toBeDefined();
    const userService = container.resolve(userServiceToken!);
    
    expect(userService).toBeInstanceOf(UserService);
    expect(userService.getUser()).toEqual({ id: 1, name: "Test User" });
  });

  it("should handle complex dependency chains", async () => {
    @Token("Database")
    @Injectable()
    class Database {
      query(sql: string) {
        return `Query: ${sql}`;
      }
    }

    @Token("Repository")
    @Injectable()
    class Repository {
      constructor(private db: Database) {}

      findAll() {
        return this.db.query("SELECT * FROM users");
      }
    }

    @Token("Service")
    @Injectable()
    class Service {
      constructor(private repo: Repository) {}

      getAllUsers() {
        return this.repo.findAll();
      }
    }

    // Wait for decorators
    await waitForMicrotasks();

    const container = createDecoratedContainer();
    const serviceToken = Registry.getToken(Service);

    expect(serviceToken).toBeDefined();
    const service = container.resolve(serviceToken!);
    
    expect(service).toBeInstanceOf(Service);
    expect(service.getAllUsers()).toBe("Query: SELECT * FROM users");
  });

  it("should support manual dependencies with @Depends", async () => {
    interface ILogger {
      log(msg: string): void;
    }

    const ILoggerToken = createDIToken<ILogger>().as("ILogger");

    @Token("ConsoleLogger")
    @Injectable()
    class ConsoleLogger implements ILogger {
      log(msg: string) {
        return `Console: ${msg}`;
      }
    }

    Registry.setToken(ConsoleLogger, ILoggerToken);
    Registry.registerInjectable(ConsoleLogger, []);

    @Token("App")
    @Depends(ILoggerToken)
    @Injectable()
    class App {
      constructor(private logger: ILogger) {}

      run() {
        return this.logger.log("App started");
      }
    }

    // Wait for decorators
    await waitForMicrotasks();

    const container = createDecoratedContainer();
    const appToken = Registry.getToken(App);

    expect(appToken).toBeDefined();
    const app = container.resolve(appToken!);
    expect(app.run()).toBe("Console: App started");
  });

  it("should support singleton scope", async () => {
    let instanceCount = 0;

    @Token("SingletonService")
    @Injectable("singleton")
    class SingletonService {
      id: number;
      
      constructor() {
        instanceCount++;
        this.id = instanceCount;
      }
    }

    // Wait for decorators
    await waitForMicrotasks();

    const container = createDecoratedContainer();
    const token = Registry.getToken(SingletonService);

    expect(token).toBeDefined();
    const instance1 = container.resolve(token!);
    const instance2 = container.resolve(token!);

    expect(instance1).toBe(instance2);
    expect(instance1.id).toBe(1);
    expect(instanceCount).toBe(1);
  });

  it("should support transient scope (default)", async () => {
    let instanceCount = 0;

    @Token("TransientService")
    @Injectable()
    class TransientService {
      id: number;
      
      constructor() {
        instanceCount++;
        this.id = instanceCount;
      }
    }

    // Wait for decorators
    await waitForMicrotasks();

    const container = createDecoratedContainer();
    const token = Registry.getToken(TransientService);

    expect(token).toBeDefined();
    const instance1 = container.resolve(token!);
    const instance2 = container.resolve(token!);

    expect(instance1).not.toBe(instance2);
    expect(instance1.id).toBe(1);
    expect(instance2.id).toBe(2);
    expect(instanceCount).toBe(2);
  });

  it("should support scoped dependencies", async () => {
    let instanceCount = 0;

    @Token("ScopedService")
    @Injectable("scoped")
    class ScopedService {
      id: number;
      
      constructor() {
        instanceCount++;
        this.id = instanceCount;
      }
    }

    // Wait for decorators
    await waitForMicrotasks();

    const container = createDecoratedContainer();
    const token = Registry.getToken(ScopedService);

    expect(token).toBeDefined();

    // Within same scope, should be same instance
    const result1 = container.createScope((scopedContainer) => {
      const instance1 = scopedContainer.resolve(token!);
      const instance2 = scopedContainer.resolve(token!);
      return { instance1, instance2, same: instance1 === instance2 };
    });

    expect(result1.same).toBe(true);
    expect(result1.instance1.id).toBe(1);

    // Different scope, should be different instance
    const result2 = container.createScope((scopedContainer) => {
      const instance3 = scopedContainer.resolve(token!);
      return { instance3 };
    });

    expect(result2.instance3.id).toBe(2);
    expect(instanceCount).toBe(2);
  });
});
