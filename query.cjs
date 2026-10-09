const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:GrupoNavarro01!@localhost:5432/Modulo_1' });
client.connect();
client.query('SELECT "IdPlantilla", "Nombre", "Activo" FROM "ppto_Plantillas"', (err, res) => {
  if (err) throw err;
  console.log(res.rows);
  client.end();
});
