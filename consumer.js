// consumer.js
const amqp = require('amqplib');

// IMPORTANT: Replace with your CloudAMQP AMQP URL
// Example: amqps://user:password@host:port/vhost
// It's highly recommended to store this in an environment variable for production
const AMQP_URL = "amqps://svucreax:wjdCWtvdibc8noirs3A14DCKoT8IcFkl@cow.rmq2.cloudamqp.com/svucreax"; // <<< REPLACE THIS!

async function startConsumer() {
    let connection;
    try {
        console.log(`Connecting to RabbitMQ at ${AMQP_URL.split('@').pop()}...`);
        connection = await amqp.connect(AMQP_URL);
        const channel = await connection.createChannel();
        console.log("Connection established successfully.");

        // Declare the same exchange as the producer
        const exchangeName = 'order_exchange';
        await channel.assertExchange(exchangeName, 'direct', { durable: true });
        console.log(`Exchange '${exchangeName}' declared.`);

        // Declare a queue.
        // { durable: true } means the queue will survive a RabbitMQ restart.
        const queueName = 'payment_queue';
        const q = await channel.assertQueue(queueName, { durable: true });
        console.log(`Queue '${queueName}' declared. Contains ${q.messageCount} messages.`);

        // Bind the queue to the exchange with the routing key.
        // This tells the exchange to send messages with 'new_order' routing key to 'payment_queue'.
        const routingKey = 'new_order';
        await channel.bindQueue(queueName, exchangeName, routingKey);
        console.log(`Queue '${queueName}' bound to exchange '${exchangeName}' with routing key '${routingKey}'.`);

        // Set prefetch count. This limits the number of unacknowledged messages
        // a consumer can have at a time. Useful for fair dispatch among multiple consumers.
        await channel.prefetch(1);

        console.log(' [*] Waiting for messages. To exit press CTRL+C');

        // Start consuming messages.
        // noAck: false means we will manually acknowledge messages after processing.
        // This is CRUCIAL for reliable message processing.
        channel.consume(queueName, async (msg) => {
            if (msg.content) {
                try {
                    const order = JSON.parse(msg.content.toString());
                    console.log(` [x] Received order: ${order.order_id}`);

                    // Simulate payment processing
                    console.log(`     Processing payment for ${order.amount} ${order.currency}...`);
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 500)); // Simulate work (0.5 to 2 seconds)

                    // Mark payment as successful (in a real app, this would update a database)
                    order.status = 'payment_successful';
                    console.log(` [x] Payment successful for order ${order.order_id} (Customer: ${order.customer_id})`);

                    // Acknowledge the message. This tells RabbitMQ that the message has been processed
                    // and can be removed from the queue. If not acknowledged, RabbitMQ will eventually
                    // redeliver the message if the consumer disconnects or crashes.
                    channel.ack(msg);
                    console.log(` [x] Message acknowledged for order ${order.order_id}`);

                } catch (error) {
                    console.error(` [!] Error processing message for delivery tag ${msg.fields.deliveryTag}: ${error.message}`);
                    // If an error occurs during processing, you might want to NACK the message
                    // and either requeue it (requeue: true) or send it to a dead-letter queue (requeue: false)
                    // For now, we'll NACK and requeue so it gets retried.
                    channel.nack(msg, false, true); // (msg, allUpTo, requeue)
                    console.log(` [!] Message nacked and requeued for order delivery tag ${msg.fields.deliveryTag}`);
                }
            }
        }, { noAck: false });

    } catch (error) {
        console.error(`Error connecting to RabbitMQ or consuming messages: ${error.message}`);
        console.error("Please check your CloudAMQP URL and network connectivity.");
        // Attempt to reconnect after a delay if connection fails
        console.log("Attempting to reconnect in 5 seconds...");
        setTimeout(startConsumer, 5000);
    }
}

startConsumer();
