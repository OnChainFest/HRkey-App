const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // PostgreSQL
const app = express();

app.use(cors());
app.use(express.json());

// Conexión a base de datos
const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: 5432
});

// Verificar elegibilidad
app.post('/api/check-gasless', async (req, res) => {
  const { referenceId, txType, userAddress } = req.body;
  
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM reference_transactions 
       WHERE reference_id = $1 AND transaction_type = $2`,
      [referenceId, txType]
    );
    
    const used = parseInt(result.rows[0].count);
    const freeTypes = ['REQUEST', 'REFERENCE', 'CLARIFICATION', 'COMPLEMENT'];
    const eligible = used === 0 && freeTypes.includes(txType);
    
    res.json({ 
      eligible,
      reason: eligible ? 'First time free' : `${txType} already used`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar uso
app.post('/api/record-gasless', async (req, res) => {
  const { referenceId, txType, txHash, userAddress } = req.body;
  
  try {
    await pool.query(
      `INSERT INTO reference_transactions 
       (reference_id, transaction_type, transaction_hash, user_address, is_gasless, created_at)
       VALUES ($1, $2, $3, $4, true, NOW())`,
      [referenceId, txType, txHash, userAddress]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener estadísticas
app.get('/api/stats/:referenceId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT transaction_type, COUNT(*) as count 
       FROM reference_transactions 
       WHERE reference_id = $1 
       GROUP BY transaction_type`,
      [req.params.referenceId]
    );
    
    const stats = {
      REQUEST: 0,
      REFERENCE: 0,
      CLARIFICATION: 0,
      COMPLEMENT: 0
    };
    
    result.rows.forEach(row => {
      stats[row.transaction_type] = parseInt(row.count);
    });
    
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Backend running on :3000'));