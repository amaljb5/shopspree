import sqlite3
import os

DB_NAME = "database.db"

def get_db_connection():
    conn = sqlite3.connect(DB_NAME, timeout=15)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create the transactions table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL UNIQUE,
        amount REAL NOT NULL,
        customer_name TEXT,
        customer_email TEXT,
        card_number_last_four TEXT,
        status TEXT DEFAULT 'pending',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Add Razorpay fields seamlessly
    try:
        cursor.execute("ALTER TABLE transactions ADD COLUMN razorpay_order_id TEXT")
    except sqlite3.OperationalError:
        pass
        
    try:
        cursor.execute("ALTER TABLE transactions ADD COLUMN razorpay_payment_id TEXT")
    except sqlite3.OperationalError:
        pass
        
    try:
        cursor.execute("ALTER TABLE transactions ADD COLUMN razorpay_signature TEXT")
    except sqlite3.OperationalError:
        pass
        
    try:
        cursor.execute("ALTER TABLE transactions ADD COLUMN item_description TEXT")
    except sqlite3.OperationalError:
        pass
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully!")
