from flask import Flask, render_template, request, jsonify, redirect, url_for
import uuid
import time
from database import init_db, get_db_connection

app = Flask(__name__)
# Initialize database on startup
init_db()

@app.route('/')
def home():
    """Simple integration page to simulate a merchant checkout."""
    # Generate a dummy order ID
    dummy_order_id = "ORD-" + str(uuid.uuid4())[:8].upper()
    return render_template('index.html', order_id=dummy_order_id)

@app.route('/checkout', methods=['POST'])
def checkout():
    """Merchant endpoint to initiate payment."""
    order_id = request.form.get('order_id')
    amount = float(request.form.get('amount'))
    customer_name = request.form.get('customer_name')
    customer_email = request.form.get('customer_email')
    item_description = request.form.get('item_description', 'Custom Order')
    
    # Save the pending transaction
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO transactions (order_id, amount, customer_name, customer_email, item_description, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
    ''', (order_id, amount, customer_name, customer_email, item_description))
    conn.commit()
    conn.close()
    
    # Redirect to the safe payment gateway terminal
    return redirect(url_for('payment_terminal', order_id=order_id))

@app.route('/payment-terminal/<order_id>')
def payment_terminal(order_id):
    """The Mock Payment Gateway UI where the user enters card details."""
    conn = get_db_connection()
    transaction = conn.execute('SELECT * FROM transactions WHERE order_id = ?', (order_id,)).fetchone()
    conn.close()
    
    if not transaction:
        return "Transaction not found", 404
        
    return render_template('payment_terminal.html', transaction=transaction)

@app.route('/process-payment', methods=['POST'])
def process_payment():
    """Process the mock payment."""
    order_id = request.form.get('order_id')
    payment_method = request.form.get('payment_method', 'card')
    
    # Simulate processing delay
    time.sleep(1.5)
    
    # Mock validation logic
    status = 'success'
    card_last_four = 'XXXX'
    
    if payment_method == 'card':
        card_number = request.form.get('card_number')
        cvv = request.form.get('cvv')
        card_last_four = card_number[-4:] if card_number else 'XXXX'
        
        if card_last_four == '0000' or cvv == '000':
            status = 'failed'
    elif payment_method == 'upi':
        upi_id = request.form.get('upi_id', '')
        if upi_id == 'fail@upi':
            status = 'failed'
        
    # Update the database
    conn = get_db_connection()
    conn.execute('''
        UPDATE transactions 
        SET status = ?, card_number_last_four = ?
        WHERE order_id = ?
    ''', (status, card_last_four, order_id))
    conn.commit()
    conn.close()
    
    if status == 'success':
        return redirect(url_for('success_page', order_id=order_id))
    else:
        return redirect(url_for('error_page', order_id=order_id))


@app.route('/success/<order_id>')
def success_page(order_id):
    """Payment success receipt."""
    conn = get_db_connection()
    transaction = conn.execute('SELECT * FROM transactions WHERE order_id = ?', (order_id,)).fetchone()
    conn.close()
    return render_template('success.html', transaction=transaction)

@app.route('/error/<order_id>')
def error_page(order_id):
    """Payment failure notification."""
    conn = get_db_connection()
    transaction = conn.execute('SELECT * FROM transactions WHERE order_id = ?', (order_id,)).fetchone()
    conn.close()
    return render_template('error.html', transaction=transaction)
    
@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """API endpoint to view all transactions (for testing/debugging)."""
    conn = get_db_connection()
    transactions = conn.execute('SELECT * FROM transactions ORDER BY timestamp DESC').fetchall()
    conn.close()
    return jsonify([dict(tx) for tx in transactions])

if __name__ == '__main__':
    app.run(debug=True, port=5000)
