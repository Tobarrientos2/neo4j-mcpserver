import neo4j from 'neo4j-driver';

const uri = 'neo4j://44.193.75.57:7687';
const user = 'neo4j';
const password = 'pyramids-needles-spans';

async function checkDatabase() {
    const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    
    try {
        console.log('Checking database access...');
        const session = driver.session();
        try {
            // Primero intentamos ver qué hay en la base de datos
            console.log('\nChecking existing nodes...');
            const existingNodes = await session.run('MATCH (n) RETURN labels(n) as labels, count(*) as count');
            existingNodes.records.forEach(record => {
                console.log(`${record.get('labels')}: ${record.get('count')} nodes`);
            });

            // Intentamos crear un nodo de prueba
            console.log('\nTrying to create a test node...');
            const createResult = await session.run(
                'CREATE (t:Test {name: "TestNode", timestamp: datetime()}) RETURN t'
            );
            console.log('Test node created:', createResult.records[0].get('t').properties);

        } finally {
            await session.close();
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await driver.close();
    }
}

checkDatabase(); 