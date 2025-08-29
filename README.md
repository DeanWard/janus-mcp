# Janus - OpenAPI MCP Server

An intelligent Model Context Protocol (MCP) server for exploring OpenAPI specifications. Janus provides LLMs with token-optimized access to API documentation through session-based querying and selective data retrieval.

## Features

- **Session Management**: Initialize sessions with OpenAPI JSON/YAML files
- **Session Persistence**: Sessions are automatically saved and restored across server restarts
- **Token Optimization**: Selective data retrieval - only fetch what you need
- **Comprehensive Querying**: Access endpoints, parameters, request/response schemas, and components
- **Filtering Support**: Filter by tags, status codes, and component types
- **Multiple Format Support**: Supports both OpenAPI 2.0 (Swagger) and OpenAPI 3.x specifications
- **Automatic Cleanup**: Sessions older than 7 days are automatically removed

## Quick Setup

### Step 1: Add to Cursor

Add Janus to your MCP configuration in `~/.cursor/mcp.json`:

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

### Step 2: Restart Cursor

Restart Cursor to load Janus.

### Step 3: Start Exploring

Ask Cursor to:
- "Initialize a Janus session with my OpenAPI file"
- "Show me all GET endpoints from my API"
- "Get details for the /users endpoint"

That's it! 🎉

### Available Tools

#### 1. `initialize_session`
Initialize a new session with an OpenAPI specification file.

**Parameters:**
- `filePath` (string, required): Path to the OpenAPI JSON or YAML file

**Returns:**
- `sessionId`: Unique identifier for the session
- `success`: Boolean indicating success
- `message`: Status message

**Example:**
```json
{
  "filePath": "/path/to/api-spec.yaml"
}
```

#### 2. `get_session_info`
Get basic information about an OpenAPI specification.

**Parameters:**
- `sessionId` (string, required): The session ID

**Returns:**
- `title`: API title
- `version`: API version
- `description`: API description
- `baseUrl`: Base URL of the API

#### 3. `list_endpoints`
List all available endpoints in the OpenAPI specification.

**Parameters:**
- `sessionId` (string, required): The session ID
- `tags` (array, optional): Filter endpoints by tags
- `methods` (array, optional): Filter endpoints by HTTP methods (GET, POST, PUT, DELETE, etc.)

**Returns:**
- `count`: Number of endpoints found
- `endpoints`: Array of endpoint summaries with path, method, operationId, summary, description, and tags

#### 4. `get_endpoint_details`
Get detailed information about a specific endpoint with token optimization options.

**Parameters:**
- `sessionId` (string, required): The session ID
- `path` (string, required): The endpoint path (e.g., '/users/{id}')
- `method` (string, required): The HTTP method (GET, POST, PUT, DELETE, etc.)
- `includeParameters` (boolean, default: true): Include parameter information
- `includeRequestBody` (boolean, default: true): Include request body schema
- `includeResponses` (boolean, default: true): Include response information
- `includeSecurity` (boolean, default: false): Include security requirements
- `includeExamples` (boolean, default: false): Include examples in schemas
- `includeSchemas` (boolean, default: true): Include detailed schema information
- `responseStatusCodes` (array, optional): Filter responses by status codes

**Returns:**
Detailed endpoint information based on the included options.

#### 5. `get_tags`
Get all available tags in the OpenAPI specification.

**Parameters:**
- `sessionId` (string, required): The session ID

**Returns:**
- `count`: Number of tags
- `tags`: Array of tag names

#### 6. `get_components`
Get reusable components from the OpenAPI specification.

**Parameters:**
- `sessionId` (string, required): The session ID
- `componentType` (string, optional): Specific component type (schemas, responses, parameters, etc.)

**Returns:**
Component definitions based on the specified type or all components if no type is specified.

#### 7. `remove_session`
Remove a session and free up memory.

**Parameters:**
- `sessionId` (string, required): The session ID to remove

**Returns:**
- `success`: Boolean indicating if the session was removed
- `message`: Status message

## Token Optimization Strategies

The server provides several ways to optimize token usage:

### 1. Selective Data Retrieval
Use the boolean flags in `get_endpoint_details` to only fetch the data you need:

```json
{
  "sessionId": "session-id",
  "path": "/users/{id}",
  "method": "GET",
  "includeParameters": true,
  "includeRequestBody": false,
  "includeResponses": true,
  "includeSecurity": false,
  "includeExamples": false,
  "includeSchemas": false,
  "responseStatusCodes": ["200", "404"]
}
```

### 2. Progressive Discovery
Start with high-level information and drill down as needed:

1. First, get session info and list endpoints
2. Then, get basic endpoint details without schemas
3. Finally, get specific schemas or examples only when needed

### 3. Filtering Support
Use tags and HTTP methods to focus on specific API sections:

**Filter by tags:**
```json
{
  "sessionId": "session-id",
  "tags": ["users", "authentication"]
}
```

**Filter by HTTP methods:**
```json
{
  "sessionId": "session-id",
  "methods": ["GET", "POST"]
}
```

**Combine filters:**
```json
{
  "sessionId": "session-id",
  "tags": ["pets"],
  "methods": ["GET"]
}
```

## Example Conversations

### Getting Started
```
You: "Initialize a Janus session with my API spec at ./api-docs.yaml"
Janus: "✅ Session initialized! Your API 'Pet Store API v1.0.0' is ready to explore."

You: "Show me all the GET endpoints"
Janus: "Found 15 GET endpoints: /pets, /pets/{id}, /users, /orders..."

You: "Get details for the /pets endpoint but only include parameters and responses, skip schemas"
Janus: "The GET /pets endpoint accepts 'limit' and 'offset' query parameters..."
```

### Token-Optimized Queries
```
You: "List only POST and PUT endpoints tagged with 'admin'"  
Janus: "Found 3 admin endpoints for data modification: POST /users, PUT /users/{id}..."

You: "Show me the /auth/login endpoint details, but only the 200 and 401 responses"
Janus: "POST /auth/login returns 200 with JWT token or 401 for invalid credentials..."
```

### Progressive Discovery
```
You: "What tags are available in this API?"
Janus: "Found 8 tags: users, pets, orders, auth, admin, billing, reports, webhooks"

You: "Show me all endpoints tagged with 'billing'"
Janus: "Billing endpoints: GET /billing/invoices, POST /billing/payments..."
```

## Error Handling

All tools return structured responses. On error, the response will include:

```json
{
  "error": true,
  "message": "Description of the error"
}
```

Common errors:
- "Session not found" - Invalid or expired session ID
- "Failed to parse OpenAPI spec" - Invalid OpenAPI file
- "Endpoint not found" - Invalid path/method combination

## Advanced Usage

### Multiple MCP Clients

Janus works with any MCP-compatible client:

**Cursor**:
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

**Claude Desktop**:
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

### Supported OpenAPI Features

✅ **Specifications**: OpenAPI 2.0 (Swagger), 3.0.x, and 3.1.0  
✅ **Formats**: JSON and YAML files  
✅ **Methods**: All HTTP methods (GET, POST, PUT, DELETE, etc.)  
✅ **Parameters**: Path, query, header, and cookie parameters  
✅ **Schemas**: Request/response body schemas and examples  
✅ **Security**: Authentication and authorization definitions  
✅ **Organization**: Tags, components, and reusable definitions  

### Session Management

- **Automatic Persistence**: Sessions survive Cursor restarts
- **Smart Cleanup**: Old sessions (7+ days) are automatically removed  
- **File Validation**: Checks if OpenAPI files still exist before loading
- **Storage Location**: `~/.janus-mcp/sessions.json`

### Token Optimization Tips

🎯 **Start Broad**: Get session info and list endpoints first  
🔍 **Filter Smart**: Use method and tag filters to reduce noise  
📊 **Selective Details**: Only request the data you need  
🚀 **Progressive Discovery**: Explore incrementally rather than all-at-once

## License

MIT License - see the [LICENSE](LICENSE) file for details.
