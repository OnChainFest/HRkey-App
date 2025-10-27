// server.js - Backend para procesar pagos de Stripe
// Ejecutar con: node server.js

const express = require('express');
const stripe = require('stripe')('sk_test_YOUR_SECRET_KEY_HERE'); // ⚠️ REEMPLAZAR con tu Secret Key
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint para crear Payment Intent
app.post('/create-payment-intent', async (req, res) => {
    try {
        const { amount, email, promoCode } = req.body;

        // Crear Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount, // Amount en centavos (ej: 1000 = $10.00)
            currency: 'usd',
            receipt_email: email,
            metadata: {
                promoCode: promoCode || 'none',
                plan: 'pro-lifetime'
            },
            description: 'HRKey PRO - Lifetime Access',
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

        console.log('✅ Payment Intent created:', paymentIntent.id);

    } catch (error) {
        console.error('❌ Error creating payment intent:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook para recibir eventos de Stripe
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = 'whsec_YOUR_WEBHOOK_SECRET'; // ⚠️ REEMPLAZAR

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('⚠️ Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle payment success
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        
        console.log('✅ Payment succeeded:', paymentIntent.id);
        console.log('   Email:', paymentIntent.receipt_email);
        console.log('   Amount:', paymentIntent.amount / 100);
        
        // AQUÍ: Actualizar tu base de datos con el usuario PRO
        // Por ejemplo:
        // await db.upgradeToPro(paymentIntent.receipt_email, paymentIntent.id);
    }

    res.json({received: true});
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'HRKey Payment Server Running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});