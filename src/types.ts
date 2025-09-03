// Define OpenAPI types since swagger-parser doesn't export them properly
export interface OpenAPIDocument {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths?: Record<string, any>;
  components?: Record<string, any>;
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  security?: any[];
  host?: string;
  basePath?: string;
  schemes?: string[];
}

export interface Session {
  id: string;
  spec: OpenAPIDocument;
  source: string; // Can be either a file path or URL
  sourceType: 'file' | 'url';
  createdAt: Date;
  outputFormat: OutputFormat; // Add output format to session
}

export interface PersistedSession {
  id: string;
  source: string; // Can be either a file path or URL
  sourceType: 'file' | 'url';
  createdAt: string; // ISO string
  lastAccessed: string; // ISO string
  outputFormat: OutputFormat; // Add output format to persistence
}

export interface EndpointSummary {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
}

export interface ParameterInfo {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  type?: string;
  description?: string;
  example?: any;
  schema?: any;
}

export interface ResponseInfo {
  statusCode: string;
  description?: string;
  contentType?: string;
  schema?: any;
  examples?: any;
}

export interface EndpointDetails {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterInfo[];
  requestBody?: {
    required?: boolean;
    contentType?: string;
    schema?: any;
    examples?: any;
  };
  responses?: ResponseInfo[];
  security?: any[];
}

export interface QueryOptions {
  includeHeaders?: boolean;
  includeParameters?: boolean;
  includeRequestBody?: boolean;
  includeResponses?: boolean;
  includeSecurity?: boolean;
  includeExamples?: boolean;
  includeSchemas?: boolean;
  responseStatusCodes?: string[];
  tags?: string[];
}

// Output format types
export type OutputFormat = 'json' | 'compact' | 'structured' | 'markdown';

// Transformer interface
export interface ResponseTransformer {
  transformEndpointsList(data: { count: number; endpoints: EndpointSummary[] }): string;
  transformEndpointDetails(data: EndpointDetails): string;
  transformSessionInfo(data: { title?: string; version?: string; description?: string; baseUrl?: string }): string;
  transformTags(data: { count: number; tags: string[] }): string;
  transformComponents(data: any): string;
  transformSuccess(data: { success: boolean; sessionId?: string; message: string }): string;
  transformError(data: { error: boolean; message: string }): string;
}
