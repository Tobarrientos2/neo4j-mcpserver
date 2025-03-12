import neo4j from 'neo4j-driver';
import fs from 'fs';
import { spawn } from 'child_process';

// Leer la configuración del test-tool.json
const toolConfig = JSON.parse(fs.readFileSync('./test-tool.json', 'utf8'));
const connectionConfig = toolConfig.params.arguments.connection;

async function testConnection() {
    const driver = neo4j.driver(
        connectionConfig.uri, 
        neo4j.auth.basic(connectionConfig.user, connectionConfig.password)
    );
    
    try {
        console.log('Testing connection with tool configuration...');
        const serverInfo = await driver.verifyConnectivity();
        console.log('Connection successful!');
        console.log('Server info:', serverInfo);

        // Si la conexión es exitosa y no estamos en modo debug, iniciamos el servidor MCP
        if (!process.env.DEBUG) {
            console.log('\nStarting MCP server with test configuration...');
            
            // Configurar las variables de entorno para el servidor MCP
            process.env.NEO4J_URI = connectionConfig.uri;
            process.env.NEO4J_USER = connectionConfig.user;
            process.env.NEO4J_PASSWORD = connectionConfig.password;

            // Iniciar el servidor MCP
            const mcpServer = spawn('node', ['build/index.js'], {
                stdio: 'inherit',
                env: process.env
            });

            mcpServer.on('error', (err) => {
                console.error('Failed to start MCP server:', err);
                process.exit(1);
            });

            // Manejar la señal de interrupción
            process.on('SIGINT', () => {
                mcpServer.kill('SIGINT');
                process.exit();
            });
        }

        // Probar la herramienta
        const session = driver.session();
        try {
            // Primero, veamos qué pulses existen
            console.log('\nChecking existing pulses...');
            const existingPulses = await session.run('MATCH (p:Pulse) RETURN p');
            console.log('Found pulses:', existingPulses.records.map(record => record.get('p').properties));

            // Establecer la relación entre GamePlay y SnakeMove
            console.log('\nCreating relationship between GamePlay and SnakeMove...');
            const relationshipResult = await session.run(
                `
                MATCH (main:Pulse {name: "GamePlay"})
                MATCH (snake:Pulse {name: "SnakeMove"})
                MERGE (main)-[r:TRIGGERS]->(snake)
                RETURN main, snake, r
                `
            );
            console.log('Relationship created');

            // Intentar la consulta de analyze-app-structure
            console.log('\nTesting analyze-app-structure query...');
            const analyzeResult = await session.run(
                `
                MATCH (f:File {path: $mainFile})
                MATCH (mainP:Pulse)-[:DEFINED_IN]->(f)
                WHERE mainP.isMainPulse = true
                
                OPTIONAL MATCH path = (mainP)-[r*]->(p:Pulse)
                
                WITH mainP, collect(DISTINCT {
                    pulse: p,
                    path: path
                }) as structure
                
                RETURN {
                    mainPulse: mainP.name,
                    structure: structure
                } as appStructure
                `,
                { mainFile: "main.ts" }
            );
            console.log('Analysis result:', JSON.stringify(analyzeResult.records, null, 2));

        } finally {
            await session.close();
        }
    } catch (error) {
        console.error('Error during connection test:');
        console.error('Error:', error);
        process.exit(1);
    } finally {
        if (process.env.DEBUG) {
            await driver.close();
            process.exit(0);
        }
    }
}

testConnection();