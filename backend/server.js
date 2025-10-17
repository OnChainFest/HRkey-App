require('dotenv').config({ path: '../.env' });

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

// Verificar conexión a base de datos
pool.connect()
  .then(() => console.log('Database connected'))
  .catch(err => console.log('Database connection error:', err.message));

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

// Obtener estadísticas de referencias por referenceId
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

// 🆕 NUEVO: Obtener estadísticas del usuario para el dashboard
app.get('/api/user/stats/:address', async (req, res) => {
  try {
    const { address } = req.params;
    console.log('📊 Getting stats for user:', address);

    // Consultar estadísticas de la base de datos
    let stats = {
      totalReferences: 0,
      verifiedOnChain: 0,
      pendingValidations: 0,
      profileViews: 0
    };

    try {
      // Contar referencias totales del usuario
      const totalResult = await pool.query(
        `SELECT COUNT(DISTINCT reference_id) as count 
         FROM reference_transactions 
         WHERE user_address = $1`,
        [address]
      );
      stats.totalReferences = parseInt(totalResult.rows[0].count) || 0;

      // Contar referencias verificadas on-chain (con transaction_hash)
      const verifiedResult = await pool.query(
        `SELECT COUNT(DISTINCT reference_id) as count 
         FROM reference_transactions 
         WHERE user_address = $1 AND transaction_hash IS NOT NULL`,
        [address]
      );
      stats.verifiedOnChain = parseInt(verifiedResult.rows[0].count) || 0;

      // Contar validaciones pendientes
      const pendingResult = await pool.query(
        `SELECT COUNT(*) as count 
         FROM reference_transactions 
         WHERE user_address = $1 AND transaction_type = 'REQUEST' 
         AND reference_id NOT IN (
           SELECT reference_id FROM reference_transactions 
           WHERE transaction_type = 'REFERENCE'
         )`,
        [address]
      );
      stats.pendingValidations = parseInt(pendingResult.rows[0].count) || 0;

      // Profile views (por ahora un valor por defecto, puedes agregar tabla de views después)
      stats.profileViews = 0;

    } catch (dbError) {
      console.log('⚠️ Database query error, using defaults:', dbError.message);
      // Si hay error de BD, devolver valores por defecto
    }

    console.log('✅ Stats:', stats);
    res.json(stats);

  } catch (error) {
    console.error('❌ Error getting user stats:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      totalReferences: 0,
      verifiedOnChain: 0,
      pendingValidations: 0,
      profileViews: 0
    });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on :${PORT}`);
});