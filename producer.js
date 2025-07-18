// producer.js
const amqp = require('amqplib');
const crypto = require('crypto'); // For generating random IDs

// IMPORTANT: Replace with your CloudAMQP AMQP URL
// Example: amqps://user:password@host:port/vhost
// It's highly recommended to store this in an environment variable for production
const AMQP_URL = "YOUR_AMQP_URL"; // <<< REPLACE THIS!

async function publishOrder(orderData, channel, exchangeName, routingKey) {
    try {
        const messageBody = JSON.stringify(orderData);
        const published = channel.publish(
            exchangeName,
            routingKey,
            Buffer.from(messageBody),
            { persistent: true }
        );

        if (published) {
            console.log(` [x] Sent '${messageBody}' to exchange '${exchangeName}' with routing key '${routingKey}'`);
        } else {
            console.warn(` [!] Channel buffer full. Message '${messageBody}' queued internally, but not sent immediately.`);
            // This case indicates backpressure, but messages are still sent eventually.
        }
    } catch (error) {
        console.error(` [!] Error publishing message: ${error.message}`);
    }
}

async function startProducer() {
    console.log("Order Service (Producer) Started.");
    let connection;
    let channel;

    try {
        console.log(`Attempting to connect to RabbitMQ at ${AMQP_URL.split('@').pop()}...`);
        connection = await amqp.connect(AMQP_URL);
        console.log("SUCCESS: Connection established successfully.");

        // Add listeners for connection errors to catch unexpected disconnects
        connection.on('error', (err) => {
            console.error(`Connection error: ${err.message}`);
            // You might want to implement a reconnection strategy here
        });
        connection.on('close', () => {
            console.warn("Connection closed unexpectedly. Attempting to restart producer...");
            // This means the connection broke. A full restart might be needed.
            setTimeout(startProducer, 5000); // Simple retry
        });

        channel = await connection.createChannel();
        console.log("SUCCESS: Channel created successfully.");

        // Declare a 'direct' exchange.
        const exchangeName = 'order_exchange';
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        console.log(`SUCCESS: Exchange '${exchangeName}' asserted (declared).`);

        const routingKey = 'new_order';
        let orderIdCounter = 1;

        // Loop to publish messages
        while (true) {
            const order = {
                "order_id": `ORD-${String(orderIdCounter).padStart(4, '0')}`,
                "customer_id": `CUST-${Math.floor(Math.random() * 900) + 100}`,
                "amount": parseFloat((Math.random() * 490 + 10).toFixed(2)),
                "currency": "USD",
                "status": "pending_payment",
                "timestamp": Date.now() / 1000
            };
            await publishOrder(order, channel, exchangeName, routingKey);
            orderIdCounter++;
            await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000)); // Send a new order every 1-3 seconds
        }

    } catch (error) {
        console.error(`CRITICAL ERROR in Producer startup or main loop: ${error.message}`);
        console.error("Please double-check your CloudAMQP URL, network connectivity, and firewall settings.");
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'EADDRNOTAVAIL') {
            console.error("This often indicates an incorrect hostname in the AMQP URL or a network block.");
        }
        if (connection) {
            try {
                await connection.close();
                console.log("Connection closed due to error.");
            } catch (e) {
                console.error("Error closing connection after failure:", e.message);
            }
        }
        // Attempt to restart the producer after a delay
        console.log("Attempting to restart producer in 10 seconds...");
        setTimeout(startProducer, 10000);
    }
}

startProducer();

