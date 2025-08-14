-- Create tariff table for configurable settings
CREATE TABLE IF NOT EXISTS tariff (
    id SERIAL PRIMARY KEY,
    tariff_type VARCHAR(100) UNIQUE NOT NULL,
    value INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default tariff settings
INSERT INTO tariff (tariff_type, value, description) VALUES 
    ('min_connects_for_trip', 20, 'Minimum connects required to create a trip')
ON CONFLICT (tariff_type) DO NOTHING;

-- Add new columns to travels table for enhanced trip management
ALTER TABLE travels ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE travels ADD COLUMN IF NOT EXISTS connects_deducted INTEGER DEFAULT 0;
ALTER TABLE travels ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE travels ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE travels ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_travels_status ON travels(status);
CREATE INDEX IF NOT EXISTS idx_travels_kyc_verified ON travels(kyc_verified);
CREATE INDEX IF NOT EXISTS idx_travels_flight_departure_datetime ON travels(flight_departure_datetime);
CREATE INDEX IF NOT EXISTS idx_travels_flight_arrival_datetime ON travels(flight_arrival_datetime);
