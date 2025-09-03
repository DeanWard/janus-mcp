import { writeFile, mkdir } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { marked } from 'marked';
import { OpenAPIManager } from './openapi-manager.js';
import { DocumentationOptions, EndpointSummary, EndpointDetails, QueryOptions } from './types.js';

export class DocumentationGenerator {
  constructor(private manager: OpenAPIManager) {}

  async generateDocumentation(sessionId: string, options: DocumentationOptions = {}): Promise<string> {
    // Set default options
    const opts: Required<DocumentationOptions> = {
      outputDirectory: options.outputDirectory || process.cwd(),
      filename: options.filename || '',
      format: options.format || 'markdown',
      includeTableOfContents: options.includeTableOfContents ?? true,
      includeEndpoints: options.includeEndpoints ?? true,
      includeComponents: options.includeComponents ?? true,
      includeSecurity: options.includeSecurity ?? true,
      includeExamples: options.includeExamples ?? false,
      groupByTags: options.groupByTags ?? true
    };

    // Get session info to determine filename if not provided
    const sessionInfo = await this.manager.getSessionInfo(sessionId);
    if (!sessionInfo) {
      throw new Error('Session not found');
    }

    // Generate filename if not provided
    if (!opts.filename) {
      const title = sessionInfo.title?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'api';
      const extension = opts.format === 'html' ? '.html' : '.md';
      opts.filename = `${title}-documentation${extension}`;
    }

    // Ensure filename has correct extension
    const expectedExt = opts.format === 'html' ? '.html' : '.md';
    if (!opts.filename.endsWith(expectedExt)) {
      // Remove any existing extension and add the correct one
      const baseName = opts.filename.replace(/\.(md|html)$/, '');
      opts.filename = `${baseName}${expectedExt}`;
    }

    // Generate the documentation content
    const content = opts.format === 'html' 
      ? await this.generateHtmlContent(sessionId, opts)
      : await this.generateMarkdownContent(sessionId, opts);

    // Ensure output directory exists
    const outputPath = resolve(opts.outputDirectory);
    await mkdir(outputPath, { recursive: true });

    // Write the file
    const filePath = join(outputPath, opts.filename);
    await writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  private async generateMarkdownContent(sessionId: string, options: Required<DocumentationOptions>): Promise<string> {
    let content = '';

    // Get session info
    const sessionInfo = await this.manager.getSessionInfo(sessionId);
    if (!sessionInfo) {
      throw new Error('Session not found');
    }

    // Title and basic info
    content += `# ${sessionInfo.title || 'API Documentation'}\n\n`;
    
    if (sessionInfo.version) {
      content += `**Version:** ${sessionInfo.version}\n\n`;
    }
    
    if (sessionInfo.description) {
      content += `${sessionInfo.description}\n\n`;
    }
    
    if (sessionInfo.baseUrl) {
      content += `**Base URL:** \`${sessionInfo.baseUrl}\`\n\n`;
    }

    // Table of Contents
    if (options.includeTableOfContents) {
      content += await this.generateTableOfContents(sessionId, options);
    }

    // Endpoints section
    if (options.includeEndpoints) {
      content += await this.generateEndpointsSection(sessionId, options);
    }

    // Components section
    if (options.includeComponents) {
      content += await this.generateComponentsSection(sessionId, options);
    }

    return content;
  }

  private async generateTableOfContents(sessionId: string, options: Required<DocumentationOptions>): Promise<string> {
    let toc = '## Table of Contents\n\n';

    if (options.includeEndpoints) {
      if (options.groupByTags) {
        const tags = await this.manager.getTags(sessionId);
        if (tags.length > 0) {
          toc += '### Endpoints\n\n';
          for (const tag of tags) {
            toc += `- [${tag}](#${this.createAnchor(tag)})\n`;
          }
          
          // Add untagged endpoints if they exist
          const endpoints = await this.manager.listEndpoints(sessionId);
          const untaggedEndpoints = endpoints.filter(ep => !ep.tags || ep.tags.length === 0);
          if (untaggedEndpoints.length > 0) {
            toc += '- [Other Endpoints](#other-endpoints)\n';
          }
          toc += '\n';
        }
      } else {
        toc += '- [Endpoints](#endpoints)\n';
      }
    }

    if (options.includeComponents) {
      toc += '- [Components](#components)\n';
    }

    toc += '\n';
    return toc;
  }

  private async generateEndpointsSection(sessionId: string, options: Required<DocumentationOptions>): Promise<string> {
    let content = '## Endpoints\n\n';

    const endpoints = await this.manager.listEndpoints(sessionId);
    if (endpoints.length === 0) {
      content += 'No endpoints found.\n\n';
      return content;
    }

    if (options.groupByTags) {
      content += await this.generateEndpointsByTags(sessionId, endpoints, options);
    } else {
      content += await this.generateEndpointsList(sessionId, endpoints, options);
    }

    return content;
  }

  private async generateEndpointsByTags(sessionId: string, endpoints: EndpointSummary[], options: Required<DocumentationOptions>): Promise<string> {
    let content = '';
    const tags = await this.manager.getTags(sessionId);
    
    // Group endpoints by tags
    for (const tag of tags) {
      const taggedEndpoints = endpoints.filter(ep => ep.tags?.includes(tag));
      if (taggedEndpoints.length === 0) continue;

      content += `### ${tag}\n\n`;
      content += await this.generateEndpointsList(sessionId, taggedEndpoints, options, false);
    }

    // Handle untagged endpoints
    const untaggedEndpoints = endpoints.filter(ep => !ep.tags || ep.tags.length === 0);
    if (untaggedEndpoints.length > 0) {
      content += '### Other Endpoints\n\n';
      content += await this.generateEndpointsList(sessionId, untaggedEndpoints, options, false);
    }

    return content;
  }

  private async generateEndpointsList(sessionId: string, endpoints: EndpointSummary[], options: Required<DocumentationOptions>, includeHeader: boolean = true): Promise<string> {
    let content = '';
    
    if (includeHeader) {
      content += `Found ${endpoints.length} endpoints:\n\n`;
    }

    for (const endpoint of endpoints) {
      content += `#### ${endpoint.method} \`${endpoint.path}\`\n\n`;
      
      if (endpoint.summary) {
        content += `${endpoint.summary}\n\n`;
      }
      
      if (endpoint.description) {
        content += `${endpoint.description}\n\n`;
      }

      // Get detailed information for this endpoint
      const queryOptions: QueryOptions = {
        includeParameters: true,
        includeRequestBody: true,
        includeResponses: true,
        includeSecurity: options.includeSecurity,
        includeExamples: options.includeExamples,
        includeSchemas: true
      };

      const details = await this.manager.getEndpointDetails(sessionId, endpoint.path, endpoint.method.toLowerCase(), queryOptions);
      
      if (details) {
        // Parameters
        if (details.parameters && details.parameters.length > 0) {
          content += '**Parameters:**\n\n';
          content += '| Name | Type | In | Required | Description |\n';
          content += '|------|------|----|---------|--------------|\n';
          
          for (const param of details.parameters) {
            const required = param.required ? 'Yes' : 'No';
            const type = param.type || this.formatSchemaType(param.schema);
            const description = param.description || '';
            content += `| ${param.name} | \`${type}\` | ${param.in} | ${required} | ${description} |\n`;
          }
          content += '\n';
        }

        // Request Body
        if (details.requestBody) {
          content += '**Request Body:**\n\n';
          const required = details.requestBody.required ? ' (required)' : '';
          const contentType = details.requestBody.contentType || 'application/json';
          content += `Content Type: \`${contentType}\`${required}\n\n`;
          
                      if (details.requestBody.schema) {
              content += await this.formatInlineSchema(sessionId, details.requestBody.schema, 0);
            }
        }

        // Responses
        if (details.responses && details.responses.length > 0) {
          content += '**Responses:**\n\n';
          
          for (const response of details.responses) {
            content += `**${response.statusCode}**: ${response.description || 'No description'}\n\n`;
            
            if (response.contentType) {
              content += `Content Type: \`${response.contentType}\`\n\n`;
            }
            
            if (response.schema) {
              content += await this.formatInlineSchema(sessionId, response.schema, 0);
            }
          }
        }
      }

      content += '---\n\n';
    }

    return content;
  }

  private async generateComponentsSection(sessionId: string, options: Required<DocumentationOptions>): Promise<string> {
    let content = '## Components\n\n';

    const components = await this.manager.getComponents(sessionId);
    if (!components || Object.keys(components).length === 0) {
      content += 'No components found.\n\n';
      return content;
    }

    for (const [componentType, items] of Object.entries(components)) {
      if (!items || typeof items !== 'object') continue;
      
      const itemNames = Object.keys(items);
      if (itemNames.length === 0) continue;

      content += `### ${this.capitalizeFirst(componentType)}\n\n`;
      
      for (const [itemName, itemDef] of Object.entries(items)) {
        content += `#### ${itemName}\n\n`;
        
        if (typeof itemDef === 'object' && itemDef !== null) {
          if (itemDef.description) {
            content += `${itemDef.description}\n\n`;
          }
          
          // For schemas, show a simplified structure
          if (componentType === 'schemas' && itemDef.properties) {
            content += '**Properties:**\n\n';
            content += '| Name | Type | Required | Description |\n';
            content += '|------|------|----------|-------------|\n';
            
            const required = itemDef.required || [];
            for (const [propName, propDef] of Object.entries(itemDef.properties)) {
              const isRequired = required.includes(propName) ? 'Yes' : 'No';
              const propType = this.formatSchemaType(propDef);
              const propDesc = (propDef as any)?.description || '';
              content += `| ${propName} | \`${propType}\` | ${isRequired} | ${propDesc} |\n`;
            }
            content += '\n';
          }
        }
        
        content += '---\n\n';
      }
    }

    return content;
  }

  private formatSchemaType(schema: any): string {
    if (!schema) return 'unknown';
    
    if (schema.type) {
      if (schema.type === 'array' && schema.items) {
        return `${this.formatSchemaType(schema.items)}[]`;
      }
      return schema.type;
    }
    
    if (schema.$ref) {
      return schema.$ref.split('/').pop() || 'ref';
    }
    
    return 'object';
  }

  private async formatInlineSchema(sessionId: string, schema: any, depth: number = 0): Promise<string> {
    if (!schema) return '';
    
    // Prevent infinite recursion by limiting depth
    if (depth > 3) {
      return `**Schema:** \`${this.formatSchemaType(schema)}\` (max depth reached)\n\n`;
    }
    
    const indent = '  '.repeat(depth);
    let content = '';
    
    // Handle array types
    if (schema.type === 'array' && schema.items) {
      content += `**Array of:**\n\n`;
      content += await this.formatInlineSchema(sessionId, schema.items, depth + 1);
      return content;
    }
    
    // Handle $ref - resolve the reference
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop();
      if (refName) {
        try {
          const components = await this.manager.getComponents(sessionId, 'schemas');
          const referencedSchema = components[refName];
          if (referencedSchema) {
            content += `**${refName}:**\n\n`;
            content += await this.formatInlineSchema(sessionId, referencedSchema, depth);
            return content;
          }
        } catch (error) {
          // If we can't resolve the reference, just show the name
          return `**Schema:** \`${refName}\`\n\n`;
        }
      }
    }
    
    // Handle object with properties
    if (schema.properties) {
      const required = schema.required || [];
      content += '| Property | Type | Required | Description |\n';
      content += '|----------|------|----------|-------------|\n';
      
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const isRequired = required.includes(propName) ? 'Yes' : 'No';
        const propType = this.getSimpleType(propSchema);
        const propDescription = (propSchema as any)?.description || '';
        content += `| ${propName} | \`${propType}\` | ${isRequired} | ${propDescription} |\n`;
      }
      content += '\n';
      
      // For properties that are arrays of references or references themselves, expand them (only at depth 0)
      if (depth === 0) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          if ((propSchema as any)?.type === 'array' && (propSchema as any)?.items?.$ref) {
            const refName = (propSchema as any).items.$ref.split('/').pop();
            content += `**${propName} items (${refName}):**\n\n`;
            content += await this.formatInlineSchema(sessionId, (propSchema as any).items, depth + 1);
          } else if ((propSchema as any)?.$ref) {
            const refName = (propSchema as any).$ref.split('/').pop();
            content += `**${propName} (${refName}):**\n\n`;
            content += await this.formatInlineSchema(sessionId, propSchema, depth + 1);
          }
        }
      }
      
      return content;
    }
    
    // Handle simple types
    if (schema.type) {
      content += `**Type:** \`${schema.type}\`\n\n`;
      if (schema.description) {
        content += `**Description:** ${schema.description}\n\n`;
      }
      return content;
    }
    
    return `**Schema:** \`${this.formatSchemaType(schema)}\`\n\n`;
  }
  
  private getSimpleType(schema: any): string {
    if (!schema) return 'unknown';
    
    if (schema.type === 'array' && schema.items) {
      return `${this.getSimpleType(schema.items)}[]`;
    }
    
    if (schema.type) {
      return schema.type;
    }
    
    if (schema.$ref) {
      return schema.$ref.split('/').pop() || 'ref';
    }
    
    return 'object';
  }

  private createAnchor(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  private capitalizeFirst(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private async generateHtmlContent(sessionId: string, options: Required<DocumentationOptions>): Promise<string> {
    // Get session info
    const sessionInfo = await this.manager.getSessionInfo(sessionId);
    if (!sessionInfo) {
      throw new Error('Session not found');
    }

    const title = sessionInfo.title || 'API Documentation';
    const version = sessionInfo.version || '';
    const description = sessionInfo.description || '';
    const baseUrl = sessionInfo.baseUrl || '';

    // Generate navigation
    const navigation = await this.generateHtmlNavigation(sessionId, options);
    
    // Generate main content
    const mainContent = await this.generateHtmlMainContent(sessionId, options);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #fafafa;
        }
        
        .container {
            display: flex;
            min-height: 100vh;
        }
        
        .sidebar {
            width: 300px;
            background: #fff;
            border-right: 1px solid #e1e5e9;
            position: fixed;
            height: 100vh;
            overflow-y: auto;
            z-index: 100;
        }
        
        .sidebar-header {
            padding: 20px;
            border-bottom: 1px solid #e1e5e9;
            background: #f8f9fa;
        }
        
        .sidebar-header h1 {
            font-size: 1.5rem;
            color: #2c3e50;
            margin-bottom: 5px;
        }
        
        .sidebar-header .version {
            color: #7f8c8d;
            font-size: 0.9rem;
        }
        
        .nav-menu {
            padding: 20px 0;
        }
        
        .nav-section {
            margin-bottom: 20px;
        }
        
        .nav-section h3 {
            padding: 0 20px 10px;
            font-size: 0.9rem;
            text-transform: uppercase;
            color: #7f8c8d;
            letter-spacing: 0.5px;
        }
        
        .nav-item {
            display: block;
            padding: 8px 20px;
            color: #2c3e50;
            text-decoration: none;
            border-left: 3px solid transparent;
            transition: all 0.2s ease;
        }
        
        .nav-item:hover {
            background: #f8f9fa;
            border-left-color: #3498db;
        }
        
        .nav-item.active {
            background: #e3f2fd;
            border-left-color: #2196f3;
            color: #1976d2;
        }
        
        .nav-subitem {
            padding-left: 40px;
            font-size: 0.9rem;
        }
        
        .main-content {
            flex: 1;
            margin-left: 300px;
            padding: 40px;
            max-width: calc(100vw - 300px);
        }
        
        .content-section {
            background: #fff;
            border-radius: 8px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        h1, h2, h3, h4 {
            color: #2c3e50;
            margin-bottom: 20px;
        }
        
        h1 { font-size: 2.5rem; }
        h2 { font-size: 2rem; margin-top: 40px; }
        h3 { font-size: 1.5rem; margin-top: 30px; }
        h4 { font-size: 1.2rem; margin-top: 20px; }
        
        p {
            margin-bottom: 15px;
            color: #555;
        }
        
        .endpoint {
            border: 1px solid #e1e5e9;
            border-radius: 8px;
            margin-bottom: 30px;
            overflow: hidden;
        }
        
        .endpoint-header {
            background: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #e1e5e9;
        }
        
        .endpoint-title {
            font-size: 1.3rem;
            margin-bottom: 10px;
        }
        
        .method-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: bold;
            text-transform: uppercase;
            margin-right: 10px;
        }
        
        .method-get { background: #e8f5e8; color: #2e7d32; }
        .method-post { background: #fff3e0; color: #f57c00; }
        .method-put { background: #e3f2fd; color: #1976d2; }
        .method-delete { background: #ffebee; color: #d32f2f; }
        .method-patch { background: #f3e5f5; color: #7b1fa2; }
        
        .endpoint-path {
            font-family: 'Monaco', 'Menlo', monospace;
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 4px;
        }
        
        .endpoint-body {
            padding: 20px;
        }
        
        .endpoint-description {
            margin-bottom: 20px;
            color: #666;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: #fff;
        }
        
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e1e5e9;
        }
        
        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #2c3e50;
        }
        
        tr:hover {
            background: #f8f9fa;
        }
        
        code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9rem;
        }
        
        pre {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 20px 0;
        }
        
        .example-section {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .example-title {
            font-weight: 600;
            margin-bottom: 10px;
            color: #2c3e50;
        }
        
        .required-badge {
            background: #ffebee;
            color: #d32f2f;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        
        .base-url {
            background: #e8f5e8;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            font-family: 'Monaco', 'Menlo', monospace;
        }
        
        @media (max-width: 768px) {
            .sidebar {
                transform: translateX(-100%);
                transition: transform 0.3s ease;
            }
            
            .main-content {
                margin-left: 0;
                max-width: 100vw;
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <nav class="sidebar">
            <div class="sidebar-header">
                <h1>${this.escapeHtml(title)}</h1>
                ${version ? `<div class="version">v${this.escapeHtml(version)}</div>` : ''}
            </div>
            ${navigation}
        </nav>
        
        <main class="main-content">
            <div class="content-section">
                <h1>${this.escapeHtml(title)}</h1>
                ${version ? `<p><strong>Version:</strong> ${this.escapeHtml(version)}</p>` : ''}
                ${description ? `<div class="endpoint-description">${this.parseMarkdown(description)}</div>` : ''}
                ${baseUrl ? `<div class="base-url"><strong>Base URL:</strong> ${this.escapeHtml(baseUrl)}</div>` : ''}
            </div>
            
            ${mainContent}
        </main>
    </div>
    
    <script>
        // Smooth scrolling for navigation links
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    
                    // Update active state
                    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
                    this.classList.add('active');
                }
            });
        });
        
        // Update active nav item on scroll
        window.addEventListener('scroll', function() {
            const sections = document.querySelectorAll('[id]');
            let current = '';
            
            sections.forEach(section => {
                const sectionTop = section.offsetTop - 100;
                if (window.pageYOffset >= sectionTop) {
                    current = section.getAttribute('id');
                }
            });
            
            document.querySelectorAll('.nav-item').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === '#' + current) {
                    link.classList.add('active');
                }
            });
        });
    </script>
</body>
</html>`;
  }

  private async generateHtmlNavigation(sessionId: string, options: Required<DocumentationOptions>): Promise<string> {
    let nav = '<div class="nav-menu">';
    
    if (options.includeEndpoints) {
      nav += '<div class="nav-section">';
      nav += '<h3>Endpoints</h3>';
      
      if (options.groupByTags) {
        const tags = await this.manager.getTags(sessionId);
        const endpoints = await this.manager.listEndpoints(sessionId);
        
        for (const tag of tags) {
          nav += `<a href="#${this.createAnchor(tag)}" class="nav-item">${this.escapeHtml(tag)}</a>`;
        }
        
        // Add untagged endpoints if they exist
        const untaggedEndpoints = endpoints.filter(ep => !ep.tags || ep.tags.length === 0);
        if (untaggedEndpoints.length > 0) {
          nav += '<a href="#other-endpoints" class="nav-item">Other Endpoints</a>';
        }
      } else {
        nav += '<a href="#endpoints" class="nav-item">All Endpoints</a>';
      }
      
      nav += '</div>';
    }
    
    if (options.includeComponents) {
      nav += '<div class="nav-section">';
      nav += '<h3>Components</h3>';
      nav += '<a href="#components" class="nav-item">Schemas</a>';
      nav += '</div>';
    }
    
    nav += '</div>';
    return nav;
  }

  private async generateHtmlMainContent(sessionId: string, options: Required<DocumentationOptions>): Promise<string> {
    let content = '';
    
    // Endpoints section
    if (options.includeEndpoints) {
      content += await this.generateHtmlEndpointsSection(sessionId, options);
    }
    
    // Components section
    if (options.includeComponents) {
      content += await this.generateHtmlComponentsSection(sessionId, options);
    }
    
    return content;
  }

  private async generateHtmlEndpointsSection(sessionId: string, options: Required<DocumentationOptions>): Promise<string> {
    let content = '<div class="content-section">';
    content += '<h2 id="endpoints">Endpoints</h2>';
    
    const endpoints = await this.manager.listEndpoints(sessionId);
    if (endpoints.length === 0) {
      content += '<p>No endpoints found.</p>';
      content += '</div>';
      return content;
    }
    
    content += '</div>';
    
    if (options.groupByTags) {
      content += await this.generateHtmlEndpointsByTags(sessionId, endpoints, options);
    } else {
      content += await this.generateHtmlEndpointsList(sessionId, endpoints, options);
    }
    
    return content;
  }

  private async generateHtmlEndpointsByTags(sessionId: string, endpoints: any[], options: Required<DocumentationOptions>): Promise<string> {
    let content = '';
    const tags = await this.manager.getTags(sessionId);
    
    // Group endpoints by tags
    for (const tag of tags) {
      const taggedEndpoints = endpoints.filter(ep => ep.tags?.includes(tag));
      if (taggedEndpoints.length === 0) continue;
      
      content += '<div class="content-section">';
      content += `<h2 id="${this.createAnchor(tag)}">${this.escapeHtml(tag)}</h2>`;
      content += '</div>';
      
      content += await this.generateHtmlEndpointsList(sessionId, taggedEndpoints, options, false);
    }
    
    // Handle untagged endpoints
    const untaggedEndpoints = endpoints.filter(ep => !ep.tags || ep.tags.length === 0);
    if (untaggedEndpoints.length > 0) {
      content += '<div class="content-section">';
      content += '<h2 id="other-endpoints">Other Endpoints</h2>';
      content += '</div>';
      
      content += await this.generateHtmlEndpointsList(sessionId, untaggedEndpoints, options, false);
    }
    
    return content;
  }

  private async generateHtmlEndpointsList(sessionId: string, endpoints: any[], options: Required<DocumentationOptions>, includeHeader: boolean = true): Promise<string> {
    let content = '';
    
    for (const endpoint of endpoints) {
      const methodClass = `method-${endpoint.method.toLowerCase()}`;
      const endpointId = this.createAnchor(`${endpoint.method}-${endpoint.path}`);
      
      content += '<div class="endpoint">';
      content += '<div class="endpoint-header">';
      content += '<div class="endpoint-title">';
      content += `<span class="method-badge ${methodClass}">${endpoint.method}</span>`;
      content += `<code class="endpoint-path">${this.escapeHtml(endpoint.path)}</code>`;
      content += '</div>';
      
      if (endpoint.summary) {
        content += `<p><strong>${this.escapeHtml(endpoint.summary)}</strong></p>`;
      }
      
      content += '</div>';
      
      content += '<div class="endpoint-body">';
      
      if (endpoint.description) {
        content += `<div class="endpoint-description">${this.parseMarkdown(endpoint.description)}</div>`;
      }
      
      // Get detailed information for this endpoint
      const details = await this.manager.getEndpointDetails(sessionId, endpoint.path, endpoint.method.toLowerCase(), {
        includeParameters: true,
        includeRequestBody: true,
        includeResponses: true,
        includeSecurity: options.includeSecurity,
        includeExamples: options.includeExamples,
        includeSchemas: true
      });
      
      if (details) {
        content += await this.generateHtmlEndpointDetails(sessionId, details);
      }
      
      content += '</div>';
      content += '</div>';
    }
    
    return content;
  }

  private async generateHtmlEndpointDetails(sessionId: string, details: any): Promise<string> {
    let content = '';
    
    // Parameters
    if (details.parameters && details.parameters.length > 0) {
      content += '<h4>Parameters</h4>';
      content += '<table>';
      content += '<thead><tr><th>Name</th><th>Type</th><th>In</th><th>Required</th><th>Description</th></tr></thead>';
      content += '<tbody>';
      
      for (const param of details.parameters) {
        const required = param.required ? '<span class="required-badge">Required</span>' : '';
        const type = param.type || this.formatSchemaType(param.schema);
        const description = param.description || '';
        content += `<tr>`;
        content += `<td><code>${this.escapeHtml(param.name)}</code></td>`;
        content += `<td><code>${this.escapeHtml(type)}</code></td>`;
        content += `<td><code>${this.escapeHtml(param.in)}</code></td>`;
        content += `<td>${required}</td>`;
        content += `<td>${description ? this.parseMarkdown(description) : ''}</td>`;
        content += `</tr>`;
      }
      
      content += '</tbody></table>';
    }
    
    // Request Body
    if (details.requestBody) {
      content += '<h4>Request Body</h4>';
      const required = details.requestBody.required ? ' <span class="required-badge">Required</span>' : '';
      const contentType = details.requestBody.contentType || 'application/json';
      content += `<p><strong>Content Type:</strong> <code>${this.escapeHtml(contentType)}</code>${required}</p>`;
      
      if (details.requestBody.schema) {
        content += await this.generateHtmlInlineSchema(sessionId, details.requestBody.schema, 0);
      }
    }
    
    // Responses
    if (details.responses && details.responses.length > 0) {
      content += '<h4>Responses</h4>';
      
      for (const response of details.responses) {
        content += `<h5>Status ${response.statusCode}</h5>`;
        content += `<p>${this.escapeHtml(response.description || 'No description')}</p>`;
        
        if (response.contentType) {
          content += `<p><strong>Content Type:</strong> <code>${this.escapeHtml(response.contentType)}</code></p>`;
        }
        
        if (response.schema) {
          content += await this.generateHtmlInlineSchema(sessionId, response.schema, 0);
        }
      }
    }
    
    return content;
  }

  private async generateHtmlInlineSchema(sessionId: string, schema: any, depth: number = 0): Promise<string> {
    if (!schema) return '';
    
    // Prevent infinite recursion by limiting depth
    if (depth > 3) {
      return `<p><strong>Schema:</strong> <code>${this.escapeHtml(this.formatSchemaType(schema))}</code> (max depth reached)</p>`;
    }
    
    let content = '';
    
    // Handle array types
    if (schema.type === 'array' && schema.items) {
      content += '<div class="example-section">';
      content += '<div class="example-title">Array of:</div>';
      content += await this.generateHtmlInlineSchema(sessionId, schema.items, depth + 1);
      content += '</div>';
      return content;
    }
    
    // Handle $ref - resolve the reference
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop();
      if (refName) {
        try {
          const components = await this.manager.getComponents(sessionId, 'schemas');
          const referencedSchema = components[refName];
          if (referencedSchema) {
            content += `<div class="example-section">`;
            content += `<div class="example-title">${this.escapeHtml(refName)}:</div>`;
            content += await this.generateHtmlInlineSchema(sessionId, referencedSchema, depth + 1);
            content += `</div>`;
            return content;
          }
        } catch (error) {
          return `<p><strong>Schema:</strong> <code>${this.escapeHtml(refName)}</code></p>`;
        }
      }
    }
    
    // Handle object with properties
    if (schema.properties) {
      const required = schema.required || [];
      content += '<table>';
      content += '<thead><tr><th>Property</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>';
      content += '<tbody>';
      
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const isRequired = required.includes(propName) ? '<span class="required-badge">Required</span>' : '';
        const propType = this.getSimpleType(propSchema);
        const propDescription = (propSchema as any)?.description || '';
        content += `<tr>`;
        content += `<td><code>${this.escapeHtml(propName)}</code></td>`;
        content += `<td><code>${this.escapeHtml(propType)}</code></td>`;
        content += `<td>${isRequired}</td>`;
        content += `<td>${propDescription ? this.parseMarkdown(propDescription) : ''}</td>`;
        content += `</tr>`;
      }
      
      content += '</tbody></table>';
      
      // For properties that are arrays of references or references themselves, expand them (only at depth 0)
      if (depth === 0) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          if ((propSchema as any)?.type === 'array' && (propSchema as any)?.items?.$ref) {
            const refName = (propSchema as any).items.$ref.split('/').pop();
            content += `<div class="example-section">`;
            content += `<div class="example-title">${this.escapeHtml(propName)} items (${this.escapeHtml(refName)}):</div>`;
            content += await this.generateHtmlInlineSchema(sessionId, (propSchema as any).items, depth + 1);
            content += `</div>`;
          } else if ((propSchema as any)?.$ref) {
            const refName = (propSchema as any).$ref.split('/').pop();
            content += `<div class="example-section">`;
            content += `<div class="example-title">${this.escapeHtml(propName)} (${this.escapeHtml(refName)}):</div>`;
            content += await this.generateHtmlInlineSchema(sessionId, propSchema, depth + 1);
            content += `</div>`;
          }
        }
      }
      
      return content;
    }
    
    // Handle simple types
    if (schema.type) {
      content += `<p><strong>Type:</strong> <code>${this.escapeHtml(schema.type)}</code></p>`;
      if (schema.description) {
        content += `<div><strong>Description:</strong> ${this.parseMarkdown(schema.description)}</div>`;
      }
      return content;
    }
    
    return `<p><strong>Schema:</strong> <code>${this.escapeHtml(this.formatSchemaType(schema))}</code></p>`;
  }

  private async generateHtmlComponentsSection(sessionId: string, options: Required<DocumentationOptions>): Promise<string> {
    let content = '<div class="content-section">';
    content += '<h2 id="components">Components</h2>';
    
    const components = await this.manager.getComponents(sessionId);
    if (!components || Object.keys(components).length === 0) {
      content += '<p>No components found.</p>';
      content += '</div>';
      return content;
    }
    
    content += '</div>';
    
    for (const [componentType, items] of Object.entries(components)) {
      if (!items || typeof items !== 'object') continue;
      
      const itemNames = Object.keys(items);
      if (itemNames.length === 0) continue;
      
      content += '<div class="content-section">';
      content += `<h3>${this.capitalizeFirst(componentType)}</h3>`;
      content += '</div>';
      
      for (const [itemName, itemDef] of Object.entries(items)) {
        content += '<div class="endpoint">';
        content += '<div class="endpoint-header">';
        content += `<h4>${this.escapeHtml(itemName)}</h4>`;
        content += '</div>';
        content += '<div class="endpoint-body">';
        
        if (typeof itemDef === 'object' && itemDef !== null) {
          if ((itemDef as any).description) {
            content += `<div>${this.parseMarkdown((itemDef as any).description)}</div>`;
          }
          
          // For schemas, show a simplified structure
          if (componentType === 'schemas' && (itemDef as any).properties) {
            content += '<h5>Properties</h5>';
            content += await this.generateHtmlInlineSchema(sessionId, itemDef, 0);
          }
        }
        
        content += '</div>';
        content += '</div>';
      }
    }
    
    return content;
  }

  private escapeHtml(text: string): string {
    if (typeof text !== 'string') {
      return String(text);
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private parseMarkdown(text: string): string {
    if (typeof text !== 'string') {
      return String(text);
    }
    
    // Check if the text contains markdown syntax
    const hasMarkdown = /[#*_`\[\]()]/g.test(text) || text.includes('\n\n');
    
    if (hasMarkdown) {
      try {
        const result = marked.parse(text, { async: false });
        return typeof result === 'string' ? result : String(result);
      } catch (error) {
        // If markdown parsing fails, fall back to escaped HTML
        return this.escapeHtml(text).replace(/\n/g, '<br>');
      }
    }
    
    // If no markdown detected, just escape and convert line breaks
    return this.escapeHtml(text).replace(/\n/g, '<br>');
  }
}
