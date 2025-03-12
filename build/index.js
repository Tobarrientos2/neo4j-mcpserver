#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import neo4j from 'neo4j-driver';
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });
// Parse connection string if provided
const connectionString = process.env.NEO4J_CONNECTION;
if (connectionString) {
    const [uri, user, password] = connectionString.split(',');
    process.env.NEO4J_URI = uri;
    process.env.NEO4J_USER = user;
    process.env.NEO4J_PASSWORD = password;
}
// Verify required environment variables
const requiredEnvVars = ['NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD'];
const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingVars.length > 0) {
    console.error(`
Error: Missing required environment variables: ${missingVars.join(', ')}

You can provide these variables in two ways:

1. Using separate environment variables:
   NEO4J_URI=<your-uri> NEO4J_USER=<your-user> NEO4J_PASSWORD=<your-password> npx neo4j-mcpserver

2. Using a single connection string:
   NEO4J_CONNECTION=<uri>,<user>,<password> npx neo4j-mcpserver

Example:
   NEO4J_CONNECTION=neo4j+s://example.databases.neo4j.io,neo4j,your-password npx neo4j-mcpserver
`);
    process.exit(1);
}
class Neo4jClient {
    server;
    driver;
    constructor() {
        this.server = new Server({
            name: "neo4j-mcp",
            version: "1.0.2",
        }, {
            capabilities: {
                resources: {},
                tools: {},
                prompts: {},
            },
        });
        // Initialize Neo4j driver
        this.driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD));
        this.setupHandlers();
        this.setupErrorHandling();
    }
    setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error("[MCP Error]", error);
        };
        process.on('SIGINT', async () => {
            await this.cleanup();
            process.exit(0);
        });
    }
    async cleanup() {
        await this.driver.close();
        await this.server.close();
    }
    setupHandlers() {
        this.setupToolHandlers();
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = [
                {
                    name: "create-pulse",
                    description: "Create a new pulse with its complete structure and file relationships",
                    inputSchema: {
                        type: "object",
                        properties: {
                            pulse: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    version: { type: "string" },
                                    description: { type: "string" },
                                    isAsync: { type: "boolean" },
                                    isMainPulse: { type: "boolean" },
                                    fileLocation: { type: "string" }
                                },
                                required: ["name", "fileLocation"]
                            },
                            entity: { type: "string" },
                            action: { type: "string" },
                            dataStructures: {
                                type: "object",
                                properties: {
                                    inputs: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                name: { type: "string" },
                                                structure: { type: "string" },
                                                source: { type: "string" }
                                            }
                                        }
                                    },
                                    outputs: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                name: { type: "string" },
                                                structure: { type: "string" },
                                                target: { type: "string" }
                                            }
                                        }
                                    }
                                }
                            },
                            relationships: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        type: { type: "string" },
                                        targetPulse: { type: "string" }
                                    }
                                }
                            }
                        },
                        required: ["pulse", "entity", "action"]
                    }
                },
                {
                    name: "get-pulse",
                    description: "Get complete information about a pulse including its context",
                    inputSchema: {
                        type: "object",
                        properties: {
                            pulseName: { type: "string" },
                            includeDataFlow: { type: "boolean", default: true },
                            includeRelatedFiles: { type: "boolean", default: true }
                        },
                        required: ["pulseName"]
                    }
                },
                {
                    name: "analyze-app-structure",
                    description: "Analyze complete application structure with data flow",
                    inputSchema: {
                        type: "object",
                        properties: {
                            mainFile: { type: "string" },
                            includeDataFlow: { type: "boolean", default: true },
                            depth: {
                                type: "string",
                                enum: ["shallow", "deep"],
                                default: "deep"
                            }
                        },
                        required: ["mainFile"]
                    }
                },
                {
                    name: "update-pulse",
                    description: "Update pulse structure and relationships",
                    inputSchema: {
                        type: "object",
                        properties: {
                            pulseName: { type: "string" },
                            updates: {
                                type: "object",
                                properties: {
                                    pulseProperties: { type: "object" },
                                    dataFlow: {
                                        type: "object",
                                        properties: {
                                            inputs: { type: "array" },
                                            outputs: { type: "array" }
                                        }
                                    },
                                    relationships: { type: "array" }
                                }
                            }
                        },
                        required: ["pulseName", "updates"]
                    }
                }
            ];
            return { tools };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                let response;
                const args = request.params.arguments ?? {};
                switch (request.params.name) {
                    case "create-pulse": {
                        if (!this.validateCreatePulseArgs(args)) {
                            throw new McpError(ErrorCode.InvalidRequest, "Invalid arguments for create-pulse");
                        }
                        response = await this.createPulse(args);
                        break;
                    }
                    case "get-pulse": {
                        if (!this.validateGetPulseArgs(args)) {
                            throw new McpError(ErrorCode.InvalidRequest, "Invalid arguments for get-pulse");
                        }
                        response = await this.getPulse(args.pulseName, args);
                        break;
                    }
                    case "analyze-app-structure": {
                        if (!this.validateAnalyzeAppStructureArgs(args)) {
                            throw new McpError(ErrorCode.InvalidRequest, "Invalid arguments for analyze-app-structure");
                        }
                        response = await this.analyzeAppStructure(args);
                        break;
                    }
                    case "update-pulse": {
                        if (!this.validateUpdatePulseArgs(args)) {
                            throw new McpError(ErrorCode.InvalidRequest, "Invalid arguments for update-pulse");
                        }
                        response = await this.updatePulse(args.pulseName, args.updates);
                        break;
                    }
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
                }
                return {
                    content: [{
                            type: "text",
                            text: formatResults(response)
                        }]
                };
            }
            catch (error) {
                if (error instanceof Error) {
                    return {
                        content: [{
                                type: "text",
                                text: `Neo4j error: ${error.message}`
                            }],
                        isError: true,
                    };
                }
                throw error;
            }
        });
    }
    validateCreatePulseArgs(args) {
        if (!args || typeof args !== 'object')
            return false;
        const obj = args;
        return ('pulse' in obj &&
            typeof obj.pulse === 'object' &&
            obj.pulse !== null &&
            'name' in obj.pulse &&
            typeof obj.pulse.name === 'string' &&
            'fileLocation' in obj.pulse &&
            typeof obj.pulse.fileLocation === 'string' &&
            'entity' in obj &&
            typeof obj.entity === 'string' &&
            'action' in obj &&
            typeof obj.action === 'string' &&
            'dataStructures' in obj &&
            typeof obj.dataStructures === 'object' &&
            obj.dataStructures !== null &&
            'relationships' in obj &&
            Array.isArray(obj.relationships));
    }
    validateGetPulseArgs(args) {
        if (!args || typeof args !== 'object')
            return false;
        const obj = args;
        return ('pulseName' in obj &&
            typeof obj.pulseName === 'string');
    }
    validateAnalyzeAppStructureArgs(args) {
        if (!args || typeof args !== 'object')
            return false;
        const obj = args;
        return ('mainFile' in obj &&
            typeof obj.mainFile === 'string');
    }
    validateUpdatePulseArgs(args) {
        if (!args || typeof args !== 'object')
            return false;
        const obj = args;
        return ('pulseName' in obj &&
            typeof obj.pulseName === 'string' &&
            'updates' in obj &&
            typeof obj.updates === 'object' &&
            obj.updates !== null);
    }
    async executeQuery(query, parameters = {}) {
        const session = this.driver.session();
        try {
            const result = await session.run(query, parameters);
            return result.records;
        }
        finally {
            await session.close();
        }
    }
    async createPulse(args) {
        const query = `
        MERGE (p:Pulse {name: $pulse.name})
        SET p += $pulse
        
        MERGE (f:File {path: $pulse.fileLocation})
        MERGE (p)-[:DEFINED_IN]->(f)
        
        MERGE (e:Entity {name: $entity})
        MERGE (a:Action {name: $action})
        MERGE (p)-[:OPERATES_ON]->(e)
        MERGE (p)-[:PERFORMS]->(a)
        
        WITH p
        UNWIND $dataStructures.inputs AS input
        MERGE (ds:DataStructure {
            name: input.name,
            structure: input.structure,
            type: 'input'
        })
        MERGE (p)-[:USES_DATA]->(ds)
        
        WITH p
        UNWIND $dataStructures.outputs AS output
        MERGE (ds:DataStructure {
            name: output.name,
            structure: output.structure,
            type: 'output'
        })
        MERGE (p)-[:PRODUCES_DATA]->(ds)
        
        WITH p
        UNWIND $relationships AS rel
        MATCH (targetP:Pulse {name: rel.targetPulse})
        MERGE (p)-[r:TRIGGERS]->(targetP)
        
        RETURN p
        `;
        return this.executeQuery(query, args);
    }
    async getPulse(pulseName, options = {}) {
        const query = `
        MATCH (p:Pulse {name: $pulseName})
        
        OPTIONAL MATCH (p)-[:DEFINED_IN]->(f:File)
        
        OPTIONAL MATCH (p)-[:USES_DATA]->(input:DataStructure)
        OPTIONAL MATCH (p)-[:PRODUCES_DATA]->(output:DataStructure)
        
        OPTIONAL MATCH (p)-[r:TRIGGERS]->(targetP:Pulse)
        
        OPTIONAL MATCH (p)-[:OPERATES_ON]->(e:Entity)
        OPTIONAL MATCH (p)-[:PERFORMS]->(a:Action)
        
        RETURN {
            pulse: p,
            file: f,
            inputs: collect(DISTINCT input),
            outputs: collect(DISTINCT output),
            relationships: collect(DISTINCT {
                type: type(r),
                target: targetP.name
            }),
            entity: e.name,
            action: a.name
        } as pulseInfo
        `;
        return this.executeQuery(query, { pulseName, ...options });
    }
    async analyzeAppStructure(args) {
        const query = `
        MATCH (f:File {path: $mainFile})
        
        MATCH (mainP:Pulse)-[:DEFINED_IN]->(f)
        WHERE mainP.isMainPulse = true
        
        OPTIONAL MATCH path = (mainP)-[r*]->(p:Pulse)
        
        WITH mainP, path, p,
             [(p)-[:USES_DATA]->(i:DataStructure) | i] as inputs,
              [(p)-[:PRODUCES_DATA]->(o:DataStructure) | o] as outputs,
              [(p)-[:DEFINED_IN]->(f:File) | f] as files
        
        RETURN {
            mainPulse: mainP,
            structure: collect(DISTINCT {
                pulse: p,
                inputs: inputs,
                outputs: outputs,
                file: files[0],
                path: path
            })
        } as appStructure
        `;
        return this.executeQuery(query, args);
    }
    async updatePulse(pulseName, updates) {
        const query = `
        MATCH (p:Pulse {name: $pulseName})
        
        SET p += $updates.pulseProperties
        
        WITH p
        OPTIONAL MATCH (p)-[oldData:USES_DATA|PRODUCES_DATA]->(:DataStructure)
        DELETE oldData
        
        WITH p
        UNWIND $updates.dataFlow.inputs AS input
        MERGE (ds:DataStructure {
            name: input.name,
            structure: input.structure,
            type: 'input'
        })
        MERGE (p)-[:USES_DATA]->(ds)
        
        WITH p
        UNWIND $updates.dataFlow.outputs AS output
        MERGE (ds:DataStructure {
            name: output.name,
            structure: output.structure,
            type: 'output'
        })
        MERGE (p)-[:PRODUCES_DATA]->(ds)
        
        WITH p
        OPTIONAL MATCH (p)-[oldRel:TRIGGERS]->(:Pulse)
        DELETE oldRel
        
        WITH p
        UNWIND $updates.relationships AS rel
        MATCH (targetP:Pulse {name: rel.targetPulse})
        MERGE (p)-[:TRIGGERS]->(targetP)
        
        RETURN p
        `;
        return this.executeQuery(query, { pulseName, updates });
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Neo4j MCP server running on stdio");
    }
}
function formatResults(records) {
    if (!records || records.length === 0) {
        return "No results found.";
    }
    const output = ["Results:"];
    records.forEach((record, index) => {
        output.push(`\nRecord ${index + 1}:`);
        record.keys.forEach(key => {
            const value = record.get(key);
            output.push(`${String(key)}: ${formatValue(value)}`);
        });
    });
    return output.join('\n');
}
function formatValue(value) {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (neo4j.isNode(value)) {
        return `Node(id=${value.identity}, labels=[${value.labels.join(', ')}], properties=${JSON.stringify(value.properties)})`;
    }
    if (neo4j.isRelationship(value)) {
        return `Relationship(id=${value.identity}, type=${value.type}, properties=${JSON.stringify(value.properties)})`;
    }
    if (neo4j.isPath(value)) {
        return `Path(length=${value.segments.length}, nodes=${value.segments.length + 1})`;
    }
    if (Array.isArray(value)) {
        return `[${value.map(formatValue).join(', ')}]`;
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}
const server = new Neo4jClient();
server.run().catch(console.error);
