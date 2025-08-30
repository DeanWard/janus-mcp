# Janus MCP

Janus MCP is a Model Context Protocol server that enables AI assistants to understand and interact with OpenAPI specifications. It provides your AI with deep insight into API structures, making API integration projects faster and more accurate.

## What It Does

Janus MCP transforms how you and your AI assistant work together on projects involving APIs. Instead of manually parsing OpenAPI specifications or struggling to understand complex API structures, your AI can directly query and explore API documentation to provide precise, context-aware assistance.

When working on API integration projects, your AI assistant can:

- Instantly understand the complete structure of any OpenAPI-compliant API
- Provide accurate endpoint information including parameters, request bodies, and response schemas
- Help generate correct API calls with proper data structures
- Explain API relationships and data flows
- Assist with error handling by understanding expected error responses

## Installation

Add Janus MCP to your AI assistant's configuration:

```json
{
  "mcpServers": {
    "janus": {
      "command": "npx",
      "args": ["janus-mcp"]
    }
  }
}
```

## How It Works

Janus MCP creates sessions from OpenAPI specification files (JSON or YAML) or URLs and provides your AI with tools to explore them systematically. Each session maintains the API context, allowing for efficient querying without repeatedly parsing large specification files.

Your AI assistant can initialize a session with any OpenAPI specification and then:

- List all available endpoints with filtering by tags, HTTP methods, or other criteria
- Get detailed information about specific endpoints including parameters, request schemas, and response formats
- Explore reusable components like data models, security schemes, and error schemas
- Navigate complex APIs with dozens or hundreds of endpoints organized by functional areas
- Understand relationships between endpoints, data models, and business workflows

## Example Workflow

When you're building an application that needs to integrate with a REST API:

1. You provide the OpenAPI specification file or URL to your AI assistant
2. The AI initializes a Janus session and explores the API structure, understanding its scope and organization
3. As you describe what you want to build, the AI can reference exact endpoint details, parameter requirements, and response formats
4. The AI understands complex data relationships and can suggest optimal integration patterns
5. The AI generates accurate integration code with proper error handling, data validation, and security considerations
6. Throughout development, the AI maintains context about the API structure for ongoing assistance

For example, when working with an enterprise compliance API with 88 endpoints across 24 functional areas, your AI can:

- Filter endpoints by tags like "Documents", "Users", or "Audit Logs" to focus on relevant functionality
- Understand that document creation requires specific audit notes and sensitivity levels
- Navigate complex workflows like document approval processes with proper status transitions
- Generate code that handles OAuth2 authentication and encrypted data properly
- Suggest appropriate error handling for different endpoint response patterns

## Capabilities

The tools available to your AI assistant include:

- Session management for multiple OpenAPI specifications
- Advanced endpoint filtering by tags, HTTP methods, and operational characteristics
- Detailed endpoint inspection with selective data retrieval for optimal performance
- Comprehensive component and schema exploration including security schemes
- Tag-based organization understanding for large, complex APIs
- Support for APIs with sophisticated authentication, workflow, and data sensitivity requirements

This enables your AI to provide contextually accurate assistance whether you're exploring a new API, implementing complex business workflows, debugging integration issues, or extending existing functionality. The tool scales from simple APIs with a few endpoints to enterprise systems with hundreds of endpoints and complex data relationships.

## Repository

Source code and issues: https://github.com/DeanWard/janus-mcp