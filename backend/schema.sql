CREATE TABLE reference_transactions (
    id SERIAL PRIMARY KEY,
    reference_id VARCHAR(255) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    transaction_hash VARCHAR(66),
    user_address VARCHAR(42) NOT NULL,
    is_gasless BOOLEAN DEFAULT true,
    is_paid BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_reference (reference_id),
    INDEX idx_user (user_address),
    INDEX idx_type (transaction_type)
);

CREATE TABLE paymaster_balance_log (
    id SERIAL PRIMARY KEY,
    balance_eth DECIMAL(18, 8) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);