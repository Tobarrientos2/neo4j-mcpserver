# Neo4j MCP Server
[![smithery badge](https://smithery.ai/badge/@Tobarrientos2/neo4j-mcpserver)](https://smithery.ai/server/@Tobarrientos2/neo4j-mcpserver)

A Neo4j MCP server implementation for managing graph database operations through the Model Context Protocol.

🔌 Compatible with both Cursor and Claude Desktop!

## Quick Start

You can run the server directly using npx:

```bash
# Using a single connection string
NEO4J_CONNECTION=neo4j+s://your-instance.databases.neo4j.io,neo4j,your-password npx neo4j-mcpserver

# Or using separate environment variables
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io NEO4J_USER=neo4j NEO4J_PASSWORD=your-password npx neo4j-mcpserver
```

## Installation

### Installing via Smithery

To install Neo4j Graph Database Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@Tobarrientos2/neo4j-mcpserver):

```bash
npx -y @smithery/cli install @Tobarrientos2/neo4j-mcpserver --client claude
```

If you prefer to install the package globally:

```bash
npm install -g neo4j-mcpserver
```

Then run it:

```bash
NEO4J_CONNECTION=neo4j+s://your-instance.databases.neo4j.io,neo4j,your-password neo4j-mcpserver
```

## Environment Variables

You can provide the Neo4j connection details in two ways:

1. Using a single connection string:
   ```bash
   NEO4J_CONNECTION=<uri>,<user>,<password>
   ```

2. Using separate environment variables:
   ```bash
   NEO4J_URI=<your-uri>
   NEO4J_USER=<your-user>
   NEO4J_PASSWORD=<your-password>
   ```

You can also use a `.env` file in your project root:

```env
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

## Configuration ⚙️

### Configuring Cursor 🖥️

To set up the Neo4j MCP server in Cursor:

1. Open Cursor Settings
2. Navigate to Features > MCP Servers
3. Click on the "+ Add New MCP Server" button
4. Fill out the following information:
   - Name: Enter a nickname for the server (e.g., "neo4j-mcp")
   - Type: Select "command" as the type
   - Command: Enter the command to run the server:
   ```bash
   env=NEO4J_URI=your-neo4j-uri,NEO4J_USER=your-neo4j-user,NEO4J_PASSWORD=your-neo4j-password npx -y @neobarrientos/neo4j_mcpserver
   ```
   Important: Replace the credentials with your actual Neo4j database credentials.

## Available Tools 🛠️

### neo4j-query
Execute Cypher queries against your Neo4j database.

Example usage in Cursor:
```cypher
MATCH (n) RETURN n LIMIT 5
```

## Troubleshooting 🔧

If you encounter issues:

1. Verify Neo4j Credentials
   - Check that your Neo4j URI, username, and password are correct
   - Ensure your Neo4j database is accessible

2. Path Issues
   - Ensure there are no spaces in the installation path
   - Use forward slashes (/) in paths

3. Tool Detection Issues
   - Try restarting Cursor
   - Verify the server is running (check Cursor's MCP server list)
   - Check that environment variables are properly set

## Development 👩‍💻

To run locally:
```bash
git clone <repository-url>
cd neo4j-mcpserver
npm install
npm run build
npm start
```

## License

ISC
