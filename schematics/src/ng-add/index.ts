import { Rule, SchematicContext, Tree, noop, chain, SchematicsException } from '@angular-devkit/schematics';
import {
  NodeDependency,
  addPackageJsonDependency,
  NodeDependencyType,
  getWorkspace,
  getProjectFromWorkspace,
  addModuleImportToRootModule,
  getAppModulePath,
  InsertChange,
  getSourceFile,
  addProviderToModule
} from 'schematics-utilities';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import { Schema } from './schema';
import * as ts from 'typescript';
import { isImported, insertImport } from './utils';

function addPackageJsonDependencies(options: Schema): Rule {
  return (host: Tree, context: SchematicContext) => {
    const dependencies: NodeDependency[] = [
      {
        type: NodeDependencyType.Default,
        version: '^4.0.0',
        name: '@datorama/akita'
      }
    ];

    if (options.withRouter || options.router) {
      dependencies.push({
        type: NodeDependencyType.Dev,
        version: '^3.1.3',
        name: '@datorama/akita-ng-router-store'
      });
    }

    if (options.devtools) {
      dependencies.push({
        type: NodeDependencyType.Dev,
        version: '^3.0.2',
        name: '@datorama/akita-ngdevtools'
      });
    }

    if (options.entityService) {
      dependencies.push({
        type: NodeDependencyType.Default,
        version: '^1.0.0',
        name: '@datorama/akita-ng-entity-service'
      });
    }

    dependencies.forEach(dependency => {
      addPackageJsonDependency(host, dependency);
      context.logger.log('info', `✅️ Added "${dependency.name}" into ${dependency.type}`);
    });

    return host;
  };
}

function installPackageJsonDependencies(): Rule {
  return (host: Tree, context: SchematicContext) => {
    context.addTask(new NodePackageInstallTask());
    context.logger.log('info', `🔍 Installing packages...`);

    return host;
  };
}

function getTsSourceFile(host: Tree, path: string): ts.SourceFile {
  const buffer = host.read(path);
  if (!buffer) {
    throw new SchematicsException(`Could not read file (${path}).`);
  }
  const content = buffer.toString();
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);

  return source;
}

function injectImports(options: Schema): Rule {
  return (host: Tree, context: SchematicContext) => {
    if (!options.router && !options.devtools && !options.entityService) {
      return;
    }
    const workspace = getWorkspace(host);
    const project = getProjectFromWorkspace(
      workspace,
      // Takes the first project in case it's not provided by CLI
      options.project ? options.project : Object.keys(workspace['projects'])[0]
    );
    const modulePath = getAppModulePath(host, (project as any).architect.build.options.main);

    let moduleSource = getTsSourceFile(host, modulePath);
    let importModule = 'environment';
    let importPath = '../environments/environment';

    if (!isImported(moduleSource, importModule, importPath)) {
      const change = insertImport(moduleSource, modulePath, importModule, importPath);

      if (change) {
        const recorder = host.beginUpdate(modulePath);
        recorder.insertLeft((change as InsertChange).pos, (change as InsertChange).toAdd);
        host.commitUpdate(recorder);
      }
    }

    if (options.withRouter || options.router) {
      const routerChange = insertImport(moduleSource, modulePath, 'AkitaNgRouterStoreModule', '@datorama/akita-ng-router-store');
      if (routerChange) {
        const recorder = host.beginUpdate(modulePath);
        recorder.insertLeft((routerChange as InsertChange).pos, (routerChange as InsertChange).toAdd);
        host.commitUpdate(recorder);
      }
    }

    if (options.devtools) {
      const devtoolsChange = insertImport(moduleSource, modulePath, 'AkitaNgDevtools', '@datorama/akita-ngdevtools');
      if (devtoolsChange) {
        const recorder = host.beginUpdate(modulePath);
        recorder.insertLeft((devtoolsChange as InsertChange).pos, (devtoolsChange as InsertChange).toAdd);
        host.commitUpdate(recorder);
      }
    }

    if (options.entityService) {
      const entityServiceChange = insertImport(moduleSource, modulePath, 'NG_ENTITY_SERVICE_CONFIG', '@datorama/akita-ng-entity-service');
      if (entityServiceChange) {
        const recorder = host.beginUpdate(modulePath);
        recorder.insertLeft((entityServiceChange as InsertChange).pos, (entityServiceChange as InsertChange).toAdd);
        host.commitUpdate(recorder);
      }
    }

    return host;
  };
}

function setSchematicsAsDefault(): Rule {
  return (host: Tree, context: SchematicContext) => {
    const exec = require('child_process').exec;

    exec('ng config cli.defaultCollection @datorama/akita', () => {
      context.logger.log('info', `✅️ Setting Akita schematics as default`);
    });
    return host;
  };
}

function addModuleToImports(options: Schema): Rule {
  return (host: Tree, context: SchematicContext) => {
    const workspace = getWorkspace(host);
    const project = getProjectFromWorkspace(
      workspace,
      // Takes the first project in case it's not provided by CLI
      options.project ? options.project : Object.keys(workspace['projects'])[0]
    );

    let importDevtools = '';
    let importRouter = '';
    let provideEntityServiceConfig = '';

    if ((options.withRouter || options.router) && options.devtools) {
      importRouter = `AkitaNgRouterStoreModule.forRoot()`;
    }

    if (options.devtools) {
      importDevtools = `environment.production ? [] : AkitaNgDevtools.forRoot()`;
    }

    if (options.entityService) {
      provideEntityServiceConfig = `{ provide: NG_ENTITY_SERVICE_CONFIG, useValue: { baseUrl: 'https://jsonplaceholder.typicode.com' }}`;
    }

    if (importDevtools) {
      addModuleImportToRootModule(host, importDevtools, null as any, project);
    }

    if (importRouter) {
      addModuleImportToRootModule(host, importRouter, null as any, project);
    }

    if (provideEntityServiceConfig) {
      const modulePath = getAppModulePath(host, project.architect.build.options.main);
      const moduleSource = getSourceFile(host, modulePath);

      if (!moduleSource) {
        throw new SchematicsException(`Module not found: ${modulePath}`);
      }
      const changes = addProviderToModule(moduleSource, modulePath, provideEntityServiceConfig, null);
      const recorder = host.beginUpdate(modulePath);

      changes.forEach(change => {
        if (change instanceof InsertChange) {
          recorder.insertLeft(change.pos, change.toAdd);
        }
      });

      host.commitUpdate(recorder);
    }

    if (options.devtools) {
      context.logger.log('info', `🔥 AkitaNgDevtools is imported`);
    }

    if (options.withRouter || options.router) {
      context.logger.log('info', `🦄 AkitaNgRouterStoreModule is imported`);
    }

    if (options.entityService) {
      context.logger.log('info', `🌈 NgEntityService is imported`);
    }

    return host;
  };
}

function log(): Rule {
  return (host: Tree, context: SchematicContext) => {
    context.logger.log('info', `👏 Create your first entity store by running: ng g af todos/todos`);

    return host;
  };
}

export function akitaNgAdd(options: Schema): Rule {
  return chain([
    options && options.skipPackageJson ? noop() : addPackageJsonDependencies(options),
    options && options.skipPackageJson ? noop() : installPackageJsonDependencies(),
    addModuleToImports(options),
    injectImports(options),
    setSchematicsAsDefault(),
    log()
  ]);
}
