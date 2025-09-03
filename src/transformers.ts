import { ResponseTransformer, EndpointSummary, EndpointDetails, OutputFormat } from './types.js';

// Helper function to format schema type
function formatSchemaType(schema: any): string {
  if (!schema) return 'unknown';
  
  if (schema.type) {
    if (schema.type === 'array' && schema.items) {
      return `${formatSchemaType(schema.items)}[]`;
    }
    return schema.type;
  }
  
  if (schema.$ref) {
    return schema.$ref.split('/').pop() || 'ref';
  }
  
  return 'object';
}

// JSON Transformer (current behavior)
export class JsonTransformer implements ResponseTransformer {
  transformEndpointsList(data: { count: number; endpoints: EndpointSummary[] }): string {
    return JSON.stringify(data, null, 2);
  }

  transformEndpointDetails(data: EndpointDetails): string {
    return JSON.stringify(data, null, 2);
  }

  transformSessionInfo(data: { title?: string; version?: string; description?: string; baseUrl?: string }): string {
    return JSON.stringify(data, null, 2);
  }

  transformTags(data: { count: number; tags: string[] }): string {
    return JSON.stringify(data, null, 2);
  }

  transformComponents(data: any): string {
    return JSON.stringify(data, null, 2);
  }

  transformSuccess(data: { success: boolean; sessionId?: string; message: string }): string {
    return JSON.stringify(data, null, 2);
  }

  transformError(data: { error: boolean; message: string }): string {
    return JSON.stringify(data, null, 2);
  }
}

// Compact Text Transformer (most token efficient)
export class CompactTransformer implements ResponseTransformer {
  transformEndpointsList(data: { count: number; endpoints: EndpointSummary[] }): string {
    if (data.endpoints.length === 0) {
      return 'No endpoints found';
    }
    
    const lines = data.endpoints.map(ep => {
      const tags = ep.tags?.length ? `[${ep.tags.join(',')}]` : '';
      const summary = ep.summary || '';
      return `${ep.method} ${ep.path} - ${summary} ${tags}`.trim();
    });
    
    return `Found ${data.count} endpoints:\n${lines.join('\n')}`;
  }

  transformEndpointDetails(data: EndpointDetails): string {
    let result = `${data.method} ${data.path}`;
    
    if (data.summary) result += ` - ${data.summary}`;
    if (data.tags?.length) result += ` [${data.tags.join(',')}]`;
    
    if (data.parameters?.length) {
      result += '\nParams:';
      for (const param of data.parameters) {
        const req = param.required ? '*' : '';
        const type = param.type || formatSchemaType(param.schema);
        result += `\n  ${param.name}${req} (${param.in}): ${type}`;
        if (param.description) result += ` - ${param.description}`;
      }
    }
    
    if (data.requestBody) {
      result += '\nBody:';
      const req = data.requestBody.required ? ' (required)' : '';
      const type = data.requestBody.contentType || 'application/json';
      result += `\n  ${type}${req}`;
      if (data.requestBody.schema) {
        result += ` - ${formatSchemaType(data.requestBody.schema)}`;
      }
    }
    
    if (data.responses?.length) {
      result += '\nResponses:';
      for (const resp of data.responses) {
        result += `\n  ${resp.statusCode}: ${resp.description || 'No description'}`;
        if (resp.contentType && resp.schema) {
          result += ` (${formatSchemaType(resp.schema)})`;
        }
      }
    }
    
    return result;
  }

  transformSessionInfo(data: { title?: string; version?: string; description?: string; baseUrl?: string }): string {
    let result = '';
    if (data.title) result += `API: ${data.title}`;
    if (data.version) result += ` v${data.version}`;
    if (data.baseUrl) result += `\nBase URL: ${data.baseUrl}`;
    if (data.description) result += `\nDescription: ${data.description}`;
    return result || 'No session info available';
  }

  transformTags(data: { count: number; tags: string[] }): string {
    if (data.tags.length === 0) return 'No tags found';
    return `Found ${data.count} tags: ${data.tags.join(', ')}`;
  }

  transformComponents(data: any): string {
    if (!data || Object.keys(data).length === 0) {
      return 'No components found';
    }
    
    const sections = [];
    for (const [type, items] of Object.entries(data)) {
      if (items && typeof items === 'object') {
        const count = Object.keys(items).length;
        sections.push(`${type}: ${count} items`);
      }
    }
    
    return sections.length > 0 ? sections.join(', ') : 'No components found';
  }

  transformSuccess(data: { success: boolean; sessionId?: string; message: string }): string {
    let result = data.message;
    if (data.sessionId) result += `\nSession ID: ${data.sessionId}`;
    return result;
  }

  transformError(data: { error: boolean; message: string }): string {
    return `Error: ${data.message}`;
  }
}

// Structured Text Transformer (readable but efficient)
export class StructuredTransformer implements ResponseTransformer {
  transformEndpointsList(data: { count: number; endpoints: EndpointSummary[] }): string {
    if (data.endpoints.length === 0) {
      return 'No endpoints found';
    }
    
    let result = `Endpoints (${data.count} total):\n\n`;
    
    for (const ep of data.endpoints) {
      result += `${ep.method} ${ep.path}\n`;
      if (ep.summary) result += `  Summary: ${ep.summary}\n`;
      if (ep.operationId) result += `  Operation ID: ${ep.operationId}\n`;
      if (ep.tags?.length) result += `  Tags: ${ep.tags.join(', ')}\n`;
      if (ep.description) result += `  Description: ${ep.description}\n`;
      result += '\n';
    }
    
    return result.trim();
  }

  transformEndpointDetails(data: EndpointDetails): string {
    let result = `Endpoint: ${data.method} ${data.path}\n`;
    
    if (data.summary) result += `Summary: ${data.summary}\n`;
    if (data.operationId) result += `Operation ID: ${data.operationId}\n`;
    if (data.tags?.length) result += `Tags: ${data.tags.join(', ')}\n`;
    if (data.description) result += `Description: ${data.description}\n`;
    
    if (data.parameters?.length) {
      result += '\nParameters:\n';
      for (const param of data.parameters) {
        const req = param.required ? ' (required)' : '';
        const type = param.type || formatSchemaType(param.schema);
        result += `  - ${param.name}${req}: ${type} (${param.in})`;
        if (param.description) result += ` - ${param.description}`;
        result += '\n';
      }
    }
    
    if (data.requestBody) {
      result += '\nRequest Body:\n';
      const req = data.requestBody.required ? ' (required)' : '';
      const type = data.requestBody.contentType || 'application/json';
      result += `  Content Type: ${type}${req}\n`;
      if (data.requestBody.schema) {
        result += `  Schema: ${formatSchemaType(data.requestBody.schema)}\n`;
      }
    }
    
    if (data.responses?.length) {
      result += '\nResponses:\n';
      for (const resp of data.responses) {
        result += `  ${resp.statusCode}: ${resp.description || 'No description'}\n`;
        if (resp.contentType) result += `    Content Type: ${resp.contentType}\n`;
        if (resp.schema) result += `    Schema: ${formatSchemaType(resp.schema)}\n`;
      }
    }
    
    if (data.security?.length) {
      result += '\nSecurity:\n';
      result += `  ${JSON.stringify(data.security)}\n`;
    }
    
    return result.trim();
  }

  transformSessionInfo(data: { title?: string; version?: string; description?: string; baseUrl?: string }): string {
    let result = 'Session Information:\n';
    if (data.title) result += `  Title: ${data.title}\n`;
    if (data.version) result += `  Version: ${data.version}\n`;
    if (data.baseUrl) result += `  Base URL: ${data.baseUrl}\n`;
    if (data.description) result += `  Description: ${data.description}\n`;
    return result.trim();
  }

  transformTags(data: { count: number; tags: string[] }): string {
    if (data.tags.length === 0) return 'No tags found';
    
    let result = `Tags (${data.count} total):\n`;
    result += data.tags.map(tag => `  - ${tag}`).join('\n');
    return result;
  }

  transformComponents(data: any): string {
    if (!data || Object.keys(data).length === 0) {
      return 'No components found';
    }
    
    let result = 'Components:\n';
    for (const [type, items] of Object.entries(data)) {
      if (items && typeof items === 'object') {
        const itemNames = Object.keys(items);
        result += `  ${type} (${itemNames.length}):\n`;
        for (const name of itemNames.slice(0, 10)) { // Limit to first 10
          result += `    - ${name}\n`;
        }
        if (itemNames.length > 10) {
          result += `    ... and ${itemNames.length - 10} more\n`;
        }
      }
    }
    
    return result.trim();
  }

  transformSuccess(data: { success: boolean; sessionId?: string; message: string }): string {
    let result = `Success: ${data.message}\n`;
    if (data.sessionId) result += `Session ID: ${data.sessionId}\n`;
    return result.trim();
  }

  transformError(data: { error: boolean; message: string }): string {
    return `Error: ${data.message}`;
  }
}

// Markdown Transformer (good for documentation)
export class MarkdownTransformer implements ResponseTransformer {
  transformEndpointsList(data: { count: number; endpoints: EndpointSummary[] }): string {
    if (data.endpoints.length === 0) {
      return 'No endpoints found';
    }
    
    let result = `# Endpoints (${data.count} total)\n\n`;
    
    for (const ep of data.endpoints) {
      result += `## ${ep.method} \`${ep.path}\`\n`;
      if (ep.summary) result += `**Summary:** ${ep.summary}\n\n`;
      if (ep.operationId) result += `**Operation ID:** ${ep.operationId}\n\n`;
      if (ep.tags?.length) result += `**Tags:** ${ep.tags.join(', ')}\n\n`;
      if (ep.description) result += `${ep.description}\n\n`;
      result += '---\n\n';
    }
    
    return result.trim();
  }

  transformEndpointDetails(data: EndpointDetails): string {
    let result = `# ${data.method} \`${data.path}\`\n\n`;
    
    if (data.summary) result += `**Summary:** ${data.summary}\n\n`;
    if (data.operationId) result += `**Operation ID:** ${data.operationId}\n\n`;
    if (data.tags?.length) result += `**Tags:** ${data.tags.join(', ')}\n\n`;
    if (data.description) result += `${data.description}\n\n`;
    
    if (data.parameters?.length) {
      result += '## Parameters\n\n';
      for (const param of data.parameters) {
        const req = param.required ? ' *(required)*' : '';
        const type = param.type || formatSchemaType(param.schema);
        result += `- **${param.name}**${req}: \`${type}\` (${param.in})`;
        if (param.description) result += ` - ${param.description}`;
        result += '\n';
      }
      result += '\n';
    }
    
    if (data.requestBody) {
      result += '## Request Body\n\n';
      const req = data.requestBody.required ? ' *(required)*' : '';
      const type = data.requestBody.contentType || 'application/json';
      result += `**Content Type:** \`${type}\`${req}\n\n`;
      if (data.requestBody.schema) {
        result += `**Schema:** \`${formatSchemaType(data.requestBody.schema)}\`\n\n`;
      }
    }
    
    if (data.responses?.length) {
      result += '## Responses\n\n';
      for (const resp of data.responses) {
        result += `### ${resp.statusCode}\n`;
        result += `${resp.description || 'No description'}\n\n`;
        if (resp.contentType) result += `**Content Type:** \`${resp.contentType}\`\n\n`;
        if (resp.schema) result += `**Schema:** \`${formatSchemaType(resp.schema)}\`\n\n`;
      }
    }
    
    return result.trim();
  }

  transformSessionInfo(data: { title?: string; version?: string; description?: string; baseUrl?: string }): string {
    let result = '# Session Information\n\n';
    if (data.title) result += `**Title:** ${data.title}\n\n`;
    if (data.version) result += `**Version:** ${data.version}\n\n`;
    if (data.baseUrl) result += `**Base URL:** \`${data.baseUrl}\`\n\n`;
    if (data.description) result += `**Description:** ${data.description}\n\n`;
    return result.trim();
  }

  transformTags(data: { count: number; tags: string[] }): string {
    if (data.tags.length === 0) return 'No tags found';
    
    let result = `# Tags (${data.count} total)\n\n`;
    result += data.tags.map(tag => `- ${tag}`).join('\n');
    return result;
  }

  transformComponents(data: any): string {
    if (!data || Object.keys(data).length === 0) {
      return 'No components found';
    }
    
    let result = '# Components\n\n';
    for (const [type, items] of Object.entries(data)) {
      if (items && typeof items === 'object') {
        const itemNames = Object.keys(items);
        result += `## ${type} (${itemNames.length})\n\n`;
        for (const name of itemNames.slice(0, 10)) {
          result += `- \`${name}\`\n`;
        }
        if (itemNames.length > 10) {
          result += `- *... and ${itemNames.length - 10} more*\n`;
        }
        result += '\n';
      }
    }
    
    return result.trim();
  }

  transformSuccess(data: { success: boolean; sessionId?: string; message: string }): string {
    let result = `**Success:** ${data.message}`;
    if (data.sessionId) result += `\n\n**Session ID:** \`${data.sessionId}\``;
    return result;
  }

  transformError(data: { error: boolean; message: string }): string {
    return `**Error:** ${data.message}`;
  }
}

// Transformer factory
export function createTransformer(format: OutputFormat): ResponseTransformer {
  switch (format) {
    case 'compact':
      return new CompactTransformer();
    case 'structured':
      return new StructuredTransformer();
    case 'markdown':
      return new MarkdownTransformer();
    case 'json':
    default:
      return new JsonTransformer();
  }
}

// Get default format from environment
export function getDefaultOutputFormat(): OutputFormat {
  const envFormat = process.env.JANUS_OUTPUT_FORMAT?.toLowerCase();
  if (envFormat && ['json', 'compact', 'structured', 'markdown'].includes(envFormat)) {
    return envFormat as OutputFormat;
  }
  return 'compact'; // Default to compact mode as requested
}
