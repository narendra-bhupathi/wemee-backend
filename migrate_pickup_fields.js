/*
 Migration: Rename current_location/current_country to pickup_location/pickup_country
 - Adds new columns if missing
 - Copies data from old columns
 - Drops old columns
 Usage: node backend/migrate_pickup_fields.js
*/

const pool = require('./db');

async function columnExists(table, column) {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return res.rowCount > 0;
}

async function run() {
  console.log('Starting migration for send_receive_entries pickup columns...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasPickupLocation = await columnExists('send_receive_entries', 'pickup_location');
    const hasPickupCountry = await columnExists('send_receive_entries', 'pickup_country');
    const hasCurrentLocation = await columnExists('send_receive_entries', 'current_location');
    const hasCurrentCountry = await columnExists('send_receive_entries', 'current_country');

    if (!hasPickupLocation) {
      console.log('Adding column pickup_location...');
      await client.query(`ALTER TABLE send_receive_entries ADD COLUMN pickup_location VARCHAR(100)`);
    }
    if (!hasPickupCountry) {
      console.log('Adding column pickup_country...');
      await client.query(`ALTER TABLE send_receive_entries ADD COLUMN pickup_country VARCHAR(50)`);
    }

    if ((hasCurrentLocation || hasCurrentCountry)) {
      console.log('Copying data from current_* to pickup_* where needed...');
      if (hasCurrentLocation) {
        await client.query(
          `UPDATE send_receive_entries SET pickup_location = COALESCE(pickup_location, current_location)`
        );
      }
      if (hasCurrentCountry) {
        await client.query(
          `UPDATE send_receive_entries SET pickup_country = COALESCE(pickup_country, current_country)`
        );
      }
    }

    if (hasCurrentLocation) {
      console.log('Dropping column current_location...');
      await client.query(`ALTER TABLE send_receive_entries DROP COLUMN current_location`);
    }
    if (hasCurrentCountry) {
      console.log('Dropping column current_country...');
      await client.query(`ALTER TABLE send_receive_entries DROP COLUMN current_country`);
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    process.exit();
  }
}

run();


