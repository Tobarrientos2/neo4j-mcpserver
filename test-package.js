import neo4j from 'neo4j-driver';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Leer la configuración del test-tool.json
const toolConfig = JSON.parse(fs.readFileSync('./test-tool.json', 'utf8'));
const connectionConfig = toolConfig.params.arguments.connection;
const testPulse = toolConfig.params.arguments.pulse;

// Función para enviar comandos al servidor MCP
async function sendMcpCommand(mcpServer, command) {
    return new Promise((resolve, reject) => {
        const commandStr = JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: command
        }) + "\n";

        mcpServer.stdin.write(commandStr);

        const responseHandler = (data) => {
            try {
                const response = JSON.parse(data.toString());
                if (response.id === command.id) {
                    mcpServer.stdout.removeListener('data', responseHandler);
                    resolve(response);
                }
            } catch (error) {
                // Ignorar datos que no son JSON válido
            }
        };

        mcpServer.stdout.on('data', responseHandler);
    });
}

async function testPackage() {
    console.log('🚀 Starting package test...');
    
    try {
        // 1. Primero probar la conexión directa
        console.log('\n📡 Testing direct database connection...');
        const driver = neo4j.driver(
            connectionConfig.uri,
            neo4j.auth.basic(connectionConfig.user, connectionConfig.password)
        );

        await driver.verifyConnectivity();
        console.log('✅ Database connection successful!');
        await driver.close();

        // 2. Probar el paquete vía npx real
        console.log('\n📦 Testing package via npx...');
        
        // Configurar el comando npx con las variables de entorno
        const npxCommand = `npx`;
        const npxArgs = [
            '-y',  // Responder "yes" a cualquier prompt
            '--no-install', // No instalar si ya existe
            'neo4j-mcpserver'
        ];
        
        // Configurar el entorno
        const env = {
            ...process.env,
            NEO4J_URI: connectionConfig.uri,
            NEO4J_USER: connectionConfig.user,
            NEO4J_PASSWORD: connectionConfig.password,
            NODE_ENV: 'test'
        };

        // Primero, instalar el paquete localmente
        console.log('📥 Installing package locally...');
        const npmInstall = spawn('npm', ['install', '.'], {
            stdio: 'inherit'
        });

        await new Promise((resolve, reject) => {
            npmInstall.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`npm install failed with code ${code}`));
            });
        });

        // Iniciar el servidor MCP vía npx
        console.log('🔧 Starting MCP server via npx...');
        const mcpServer = spawn(npxCommand, npxArgs, {
            env,
            stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
        });

        // Manejar la salida del servidor
        mcpServer.stderr.on('data', (data) => {
            const output = data.toString();
            console.log('🖥️ Server output:', output);
            
            // Si el servidor está listo, ejecutar las pruebas de tools
            if (output.includes('Neo4j MCP server running')) {
                console.log('\n🔍 Server is ready, testing MCP tools...');
                runToolTests(mcpServer);
            }
        });

        // Manejar errores
        mcpServer.on('error', (err) => {
            console.error('❌ Failed to start MCP server:', err);
            process.exit(1);
        });

        // Manejar la señal de interrupción
        process.on('SIGINT', () => {
            console.log('\n👋 Shutting down...');
            mcpServer.kill('SIGINT');
            process.exit();
        });

    } catch (error) {
        console.error('❌ Error during package test:', error);
        process.exit(1);
    }
}

async function runToolTests(mcpServer) {
    try {
        // Test 1: Crear un pulse de prueba
        console.log('\n📝 Testing create-pulse tool...');
        const createPulseResponse = await sendMcpCommand(mcpServer, {
            name: "create-pulse",
            arguments: {
                pulse: testPulse,
                entity: "Test",
                action: "Verify",
                dataStructures: {
                    inputs: [{ name: "testInput", structure: "string", source: "test" }],
                    outputs: [{ name: "testOutput", structure: "boolean", target: "test" }]
                },
                relationships: []
            }
        });
        console.log('✅ Create pulse response:', createPulseResponse);

        // Test 2: Verificar la estructura de la aplicación
        console.log('\n🔍 Testing analyze-app-structure tool...');
        const analyzeResponse = await sendMcpCommand(mcpServer, {
            name: "analyze-app-structure",
            arguments: {
                mainFile: testPulse.fileLocation,
                includeDataFlow: true,
                depth: "deep"
            }
        });
        console.log('✅ Analyze structure response:', analyzeResponse);

        // Test 3: Obtener información del pulse
        console.log('\n📖 Testing get-pulse tool...');
        const getPulseResponse = await sendMcpCommand(mcpServer, {
            name: "get-pulse",
            arguments: {
                pulseName: testPulse.name,
                includeDataFlow: true,
                includeRelatedFiles: true
            }
        });
        console.log('✅ Get pulse response:', getPulseResponse);

        console.log('\n✨ All tools tested successfully!');
        
        // Limpiar y cerrar
        mcpServer.kill('SIGINT');

        // Desinstalar el paquete local
        console.log('\n🧹 Cleaning up...');
        const npmUninstall = spawn('npm', ['uninstall', 'neo4j-mcpserver'], {
            stdio: 'inherit'
        });

        await new Promise((resolve) => {
            npmUninstall.on('close', () => {
                console.log('✨ Cleanup completed');
                resolve();
            });
        });

        process.exit(0);

    } catch (error) {
        console.error('❌ Error during tool tests:', error);
        mcpServer.kill('SIGINT');
        process.exit(1);
    }
}

testPackage(); 