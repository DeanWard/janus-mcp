import SwaggerParser from 'swagger-parser';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { load } from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { Session, EndpointSummary, EndpointDetails, ParameterInfo, ResponseInfo, QueryOptions, OpenAPIDocument, PersistedSession } from './types.js';

export class OpenAPIManager {
  private sessions = new Map<string, Session>();
  private persistenceFile: string;

  constructor() {
    // Store sessions in user's home directory
    const configDir = join(homedir(), '.janus-mcp');
    this.persistenceFile = join(configDir, 'sessions.json');
    this.loadPersistedSessions();
  }

  async initializeSession(filePath: string): Promise<string> {
    try {
      const fileContent = await readFile(filePath, 'utf-8');
      let spec: any;

      // Parse YAML or JSON
      if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
        spec = load(fileContent);
      } else {
        spec = JSON.parse(fileContent);
      }

      // Try to validate and dereference the OpenAPI spec
      // If validation fails (e.g., for OpenAPI 3.1.0), fall back to using the raw spec
      let dereferencedSpec: OpenAPIDocument;
      try {
        dereferencedSpec = await (SwaggerParser as any).dereference(spec) as OpenAPIDocument;
      } catch (parseError) {
        console.error('Swagger validation failed, using raw spec:', parseError);
        dereferencedSpec = spec as OpenAPIDocument;
      }
      
      const sessionId = uuidv4();
      const session: Session = {
        id: sessionId,
        spec: dereferencedSpec,
        filePath,
        createdAt: new Date()
      };

      this.sessions.set(sessionId, session);
      await this.persistSession(session);
      return sessionId;
    } catch (error) {
      throw new Error(`Failed to parse OpenAPI spec: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      // Try to load session from persistence
      await this.loadSessionFromPersistence(sessionId);
      session = this.sessions.get(sessionId);
    }
    
    if (session) {
      // Update last accessed time
      await this.updateLastAccessed(sessionId);
    }
    
    return session;
  }

  async removeSession(sessionId: string): Promise<boolean> {
    const removed = this.sessions.delete(sessionId);
    if (removed) {
      await this.removePersistedSession(sessionId);
    }
    return removed;
  }

  async getSessionInfo(sessionId: string): Promise<{ title?: string; version?: string; description?: string; baseUrl?: string } | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const spec = session.spec;
    return {
      title: spec.info?.title,
      version: spec.info?.version,
      description: spec.info?.description,
      baseUrl: this.getBaseUrl(spec)
    };
  }

  private getBaseUrl(spec: any): string | undefined {
    if (spec.servers && spec.servers.length > 0) {
      return spec.servers[0].url;
    }
    if (spec.host) {
      const scheme = spec.schemes && spec.schemes.length > 0 ? spec.schemes[0] : 'https';
      const basePath = spec.basePath || '';
      return `${scheme}://${spec.host}${basePath}`;
    }
    return undefined;
  }

  async listEndpoints(sessionId: string, tags?: string[], methods?: string[]): Promise<EndpointSummary[]> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const endpoints: EndpointSummary[] = [];
    const spec = session.spec;

    if (!spec.paths) return endpoints;

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      const allMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];
      
      // Filter methods if specified
      const methodsToCheck = methods && methods.length > 0 
        ? allMethods.filter(method => methods.some(m => m.toLowerCase() === method.toLowerCase()))
        : allMethods;
      
      for (const method of methodsToCheck) {
        const operation = (pathItem as any)[method];
        if (!operation) continue;

        // Filter by tags if specified
        if (tags && tags.length > 0) {
          const operationTags = operation.tags || [];
          if (!tags.some(tag => operationTags.includes(tag))) {
            continue;
          }
        }

        endpoints.push({
          path,
          method: method.toUpperCase(),
          operationId: operation.operationId,
          summary: operation.summary,
          description: operation.description,
          tags: operation.tags
        });
      }
    }

    return endpoints;
  }

  async getEndpointDetails(sessionId: string, path: string, method: string, options: QueryOptions = {}): Promise<EndpointDetails | null> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const spec = session.spec;
    const pathItem = spec.paths?.[path];
    if (!pathItem) return null;

    const operation = (pathItem as any)[method.toLowerCase()];
    if (!operation) return null;

    const details: EndpointDetails = {
      path,
      method: method.toUpperCase(),
      operationId: operation.operationId,
      summary: operation.summary,
      description: operation.description,
      tags: operation.tags
    };

    // Include parameters if requested
    if (options.includeParameters) {
      details.parameters = this.extractParameters(operation, pathItem);
    }

    // Include request body if requested
    if (options.includeRequestBody && operation.requestBody) {
      details.requestBody = this.extractRequestBody(operation.requestBody, options);
    }

    // Include responses if requested
    if (options.includeResponses && operation.responses) {
      details.responses = this.extractResponses(operation.responses, options);
    }

    // Include security if requested
    if (options.includeSecurity) {
      details.security = operation.security || spec.security;
    }

    return details;
  }

  private extractParameters(operation: any, pathItem: any): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    
    // Combine path-level and operation-level parameters
    const allParams = [...(pathItem.parameters || []), ...(operation.parameters || [])];
    
    for (const param of allParams) {
      const paramInfo: ParameterInfo = {
        name: param.name,
        in: param.in,
        required: param.required,
        description: param.description
      };

      if (param.schema) {
        paramInfo.type = param.schema.type;
        paramInfo.schema = param.schema;
        paramInfo.example = param.schema.example || param.example;
      } else if (param.type) {
        // OpenAPI 2.0 style
        paramInfo.type = param.type;
        paramInfo.example = param.example;
      }

      parameters.push(paramInfo);
    }

    return parameters;
  }

  private extractRequestBody(requestBody: any, options: QueryOptions): any {
    const result: any = {
      required: requestBody.required
    };

    if (requestBody.content) {
      // Get the first content type or a specific one
      const contentTypes = Object.keys(requestBody.content);
      const contentType = contentTypes[0]; // Default to first content type
      
      result.contentType = contentType;
      
      const content = requestBody.content[contentType];
      if (options.includeSchemas && content.schema) {
        result.schema = content.schema;
      }
      
      if (options.includeExamples && content.examples) {
        result.examples = content.examples;
      }
    }

    return result;
  }

  private extractResponses(responses: any, options: QueryOptions): ResponseInfo[] {
    const responseList: ResponseInfo[] = [];
    
    for (const [statusCode, response] of Object.entries(responses)) {
      // Filter by status codes if specified
      if (options.responseStatusCodes && !options.responseStatusCodes.includes(statusCode)) {
        continue;
      }

      const responseInfo: ResponseInfo = {
        statusCode,
        description: (response as any).description
      };

      if ((response as any).content) {
        const contentTypes = Object.keys((response as any).content);
        const contentType = contentTypes[0]; // Default to first content type
        
        responseInfo.contentType = contentType;
        
        const content = (response as any).content[contentType];
        if (options.includeSchemas && content.schema) {
          responseInfo.schema = content.schema;
        }
        
        if (options.includeExamples && content.examples) {
          responseInfo.examples = content.examples;
        }
      }

      responseList.push(responseInfo);
    }

    return responseList;
  }

  async getTags(sessionId: string): Promise<string[]> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const spec = session.spec;
    const tags = new Set<string>();

    // Get tags from the global tags definition
    if (spec.tags) {
      for (const tag of spec.tags) {
        tags.add(tag.name);
      }
    }

    // Get tags from operations
    if (spec.paths) {
      for (const pathItem of Object.values(spec.paths)) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        
        const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];
        for (const method of methods) {
          const operation = (pathItem as any)[method];
          if (operation && operation.tags) {
            for (const tag of operation.tags) {
              tags.add(tag);
            }
          }
        }
      }
    }

    return Array.from(tags);
  }

  async getComponents(sessionId: string, componentType?: string): Promise<any> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const components = session.spec.components || {};
    
    if (componentType) {
      return components[componentType] || {};
    }
    
    return components;
  }

  private async loadPersistedSessions(): Promise<void> {
    try {
      // Ensure config directory exists
      await mkdir(dirname(this.persistenceFile), { recursive: true });
      
      // Check if persistence file exists
      await access(this.persistenceFile);
      
      const data = await readFile(this.persistenceFile, 'utf-8');
      const persistedSessions: PersistedSession[] = JSON.parse(data);
      
      // Clean up old sessions (older than 7 days)
      const now = new Date();
      const validSessions = persistedSessions.filter(session => {
        const lastAccessed = new Date(session.lastAccessed);
        const daysDiff = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff < 7;
      });
      
      // Save cleaned up sessions
      if (validSessions.length !== persistedSessions.length) {
        await this.savePersistedSessions(validSessions);
      }
      
    } catch (error) {
      // If file doesn't exist or other error, just start with empty sessions
      // This is expected on first run
    }
  }

  private async loadSessionFromPersistence(sessionId: string): Promise<void> {
    try {
      const data = await readFile(this.persistenceFile, 'utf-8');
      const persistedSessions: PersistedSession[] = JSON.parse(data);
      
      const persistedSession = persistedSessions.find(s => s.id === sessionId);
      if (!persistedSession) return;
      
      // Check if file still exists
      try {
        await access(persistedSession.filePath);
      } catch {
        // File no longer exists, remove from persistence
        await this.removePersistedSession(sessionId);
        return;
      }
      
      // Reload the OpenAPI spec
      const fileContent = await readFile(persistedSession.filePath, 'utf-8');
      let spec: any;
      
      if (persistedSession.filePath.endsWith('.yml') || persistedSession.filePath.endsWith('.yaml')) {
        spec = load(fileContent);
      } else {
        spec = JSON.parse(fileContent);
      }
      
      // Try to validate and dereference the OpenAPI spec
      // If validation fails (e.g., for OpenAPI 3.1.0), fall back to using the raw spec
      let dereferencedSpec: OpenAPIDocument;
      try {
        dereferencedSpec = await (SwaggerParser as any).dereference(spec) as OpenAPIDocument;
      } catch (parseError) {
        console.error('Swagger validation failed, using raw spec:', parseError);
        dereferencedSpec = spec as OpenAPIDocument;
      }
      
      const session: Session = {
        id: sessionId,
        spec: dereferencedSpec,
        filePath: persistedSession.filePath,
        createdAt: new Date(persistedSession.createdAt)
      };
      
      this.sessions.set(sessionId, session);
      
    } catch (error) {
      // If can't load, remove from persistence
      await this.removePersistedSession(sessionId);
    }
  }

  private async persistSession(session: Session): Promise<void> {
    try {
      // Load existing sessions
      let persistedSessions: PersistedSession[] = [];
      try {
        const data = await readFile(this.persistenceFile, 'utf-8');
        persistedSessions = JSON.parse(data);
      } catch {
        // File doesn't exist yet, start with empty array
      }
      
      // Add or update session
      const sessionIndex = persistedSessions.findIndex(s => s.id === session.id);
      const persistedSession: PersistedSession = {
        id: session.id,
        filePath: session.filePath,
        createdAt: session.createdAt.toISOString(),
        lastAccessed: new Date().toISOString()
      };
      
      if (sessionIndex >= 0) {
        persistedSessions[sessionIndex] = persistedSession;
      } else {
        persistedSessions.push(persistedSession);
      }
      
      await this.savePersistedSessions(persistedSessions);
      
    } catch (error) {
      // Persistence failure shouldn't break the main functionality
    }
  }

  private async updateLastAccessed(sessionId: string): Promise<void> {
    try {
      const data = await readFile(this.persistenceFile, 'utf-8');
      const persistedSessions: PersistedSession[] = JSON.parse(data);
      
      const sessionIndex = persistedSessions.findIndex(s => s.id === sessionId);
      if (sessionIndex >= 0) {
        persistedSessions[sessionIndex].lastAccessed = new Date().toISOString();
        await this.savePersistedSessions(persistedSessions);
      }
      
    } catch (error) {
      // Ignore persistence errors
    }
  }

  private async removePersistedSession(sessionId: string): Promise<void> {
    try {
      const data = await readFile(this.persistenceFile, 'utf-8');
      const persistedSessions: PersistedSession[] = JSON.parse(data);
      
      const filteredSessions = persistedSessions.filter(s => s.id !== sessionId);
      await this.savePersistedSessions(filteredSessions);
      
    } catch (error) {
      // Ignore persistence errors
    }
  }

  private async savePersistedSessions(sessions: PersistedSession[]): Promise<void> {
    await mkdir(dirname(this.persistenceFile), { recursive: true });
    await writeFile(this.persistenceFile, JSON.stringify(sessions, null, 2), 'utf-8');
  }


}
