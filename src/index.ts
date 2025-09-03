#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { OpenAPIManager } from "./openapi-manager.js";
import { QueryOptions } from "./types.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));

class OpenAPIServer {
  private server: Server;
  private manager: OpenAPIManager;

  constructor() {
    this.server = new Server(
      {
        name: "janus-mcp",
        version: packageJson.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.manager = new OpenAPIManager();
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "initialize_session",
            description: "Initialize a new session with an OpenAPI specification file or URL",
            inputSchema: {
              type: "object",
              properties: {
                source: {
                  type: "string",
                  description: "Path to the OpenAPI JSON or YAML file, or URL to fetch the specification from"
                }
              },
              required: ["source"]
            }
          },
          {
            name: "get_session_info",
            description: "Get basic information about an OpenAPI specification session",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "The session ID returned from initialize_session"
                }
              },
              required: ["sessionId"]
            }
          },
          {
            name: "list_endpoints",
            description: "List all available endpoints in the OpenAPI specification",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "The session ID"
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Optional: Filter endpoints by tags"
                },
                methods: {
                  type: "array",
                  items: { type: "string" },
                  description: "Optional: Filter endpoints by HTTP methods (GET, POST, PUT, DELETE, etc.)"
                }
              },
              required: ["sessionId"]
            }
          },
          {
            name: "get_endpoint_details",
            description: "Get detailed information about a specific endpoint with selective data retrieval for token optimization",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "The session ID"
                },
                path: {
                  type: "string",
                  description: "The endpoint path (e.g., '/users/{id}')"
                },
                method: {
                  type: "string",
                  description: "The HTTP method (GET, POST, PUT, DELETE, etc.)"
                },
                includeParameters: {
                  type: "boolean",
                  description: "Include parameter information",
                  default: true
                },
                includeRequestBody: {
                  type: "boolean",
                  description: "Include request body schema",
                  default: true
                },
                includeResponses: {
                  type: "boolean",
                  description: "Include response information",
                  default: true
                },
                includeSecurity: {
                  type: "boolean",
                  description: "Include security requirements",
                  default: false
                },
                includeExamples: {
                  type: "boolean",
                  description: "Include examples in schemas",
                  default: false
                },
                includeSchemas: {
                  type: "boolean",
                  description: "Include detailed schema information",
                  default: true
                },
                responseStatusCodes: {
                  type: "array",
                  items: { type: "string" },
                  description: "Filter responses by status codes (e.g., ['200', '400'])"
                }
              },
              required: ["sessionId", "path", "method"]
            }
          },
          {
            name: "get_tags",
            description: "Get all available tags in the OpenAPI specification",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "The session ID"
                }
              },
              required: ["sessionId"]
            }
          },
          {
            name: "get_components",
            description: "Get reusable components from the OpenAPI specification (schemas, responses, parameters, etc.)",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "The session ID"
                },
                componentType: {
                  type: "string",
                  description: "Optional: Specific component type (schemas, responses, parameters, examples, requestBodies, headers, securitySchemes, links, callbacks)"
                }
              },
              required: ["sessionId"]
            }
          },
          {
            name: "remove_session",
            description: "Remove a session and free up memory",
            inputSchema: {
              type: "object",
              properties: {
                sessionId: {
                  type: "string",
                  description: "The session ID to remove"
                }
              },
              required: ["sessionId"]
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "initialize_session": {
            const { source } = args as { source: string };
            const sessionId = await this.manager.initializeSession(source);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    sessionId,
                    message: `Session initialized successfully for ${source}`
                  }, null, 2)
                }
              ]
            };
          }

          case "get_session_info": {
            const { sessionId } = args as { sessionId: string };
            const info = await this.manager.getSessionInfo(sessionId);
            if (!info) {
              throw new Error("Session not found");
            }
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(info, null, 2)
                }
              ]
            };
          }

          case "list_endpoints": {
            const { sessionId, tags, methods } = args as { sessionId: string; tags?: string[]; methods?: string[] };
            const endpoints = await this.manager.listEndpoints(sessionId, tags, methods);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    count: endpoints.length,
                    endpoints
                  }, null, 2)
                }
              ]
            };
          }

          case "get_endpoint_details": {
            const {
              sessionId,
              path,
              method,
              includeParameters = true,
              includeRequestBody = true,
              includeResponses = true,
              includeSecurity = false,
              includeExamples = false,
              includeSchemas = true,
              responseStatusCodes
            } = args as {
              sessionId: string;
              path: string;
              method: string;
              includeParameters?: boolean;
              includeRequestBody?: boolean;
              includeResponses?: boolean;
              includeSecurity?: boolean;
              includeExamples?: boolean;
              includeSchemas?: boolean;
              responseStatusCodes?: string[];
            };

            const options: QueryOptions = {
              includeParameters,
              includeRequestBody,
              includeResponses,
              includeSecurity,
              includeExamples,
              includeSchemas,
              responseStatusCodes
            };

            const details = await this.manager.getEndpointDetails(sessionId, path, method, options);
            if (!details) {
              throw new Error(`Endpoint not found: ${method.toUpperCase()} ${path}`);
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(details, null, 2)
                }
              ]
            };
          }

          case "get_tags": {
            const { sessionId } = args as { sessionId: string };
            const tags = await this.manager.getTags(sessionId);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    count: tags.length,
                    tags
                  }, null, 2)
                }
              ]
            };
          }

          case "get_components": {
            const { sessionId, componentType } = args as { sessionId: string; componentType?: string };
            const components = await this.manager.getComponents(sessionId, componentType);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(components, null, 2)
                }
              ]
            };
          }

          case "remove_session": {
            const { sessionId } = args as { sessionId: string };
            const removed = await this.manager.removeSession(sessionId);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: removed,
                    message: removed ? "Session removed successfully" : "Session not found"
                  }, null, 2)
                }
              ]
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: error instanceof Error ? error.message : "Unknown error occurred"
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new OpenAPIServer();
server.run().catch((error) => {
  process.exit(1);
});
