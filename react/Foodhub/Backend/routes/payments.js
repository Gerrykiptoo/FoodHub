const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');

const router = express.Router();

// @desc    Create Stripe customer
// @route   POST /api/payments/create-customer
// @access  Private
router.post('/create-customer', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Check if user already has a Stripe customer ID
    if (user.stripeCustomerId) {
      return res.json({
        success: true,
        data: {
          customerId: user.stripeCustomerId
        }
      });
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.fullName,
      phone: user.phone,
      metadata: {
        userId: user._id.toString()
      }
    });

    // Save customer ID to user
    user.stripeCustomerId = customer.id;
    await user.save();

    res.json({
      success: true,
      message: 'Stripe customer created successfully',
      data: {
        customerId: customer.id
      }
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment customer'
    });
  }
});

// @desc    Add payment method
// @route   POST /api/payments/add-payment-method
// @access  Private
router.post('/add-payment-method', protect, [
  body('paymentMethodId').notEmpty().withMessage('Payment method ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { paymentMethodId, isDefault = false } = req.body;
    const user = await User.findById(req.user._id);

    // Ensure user has a Stripe customer ID
    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName,
        phone: user.phone,
        metadata: {
          userId: user._id.toString()
        }
      });
      user.stripeCustomerId = customer.id;
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId
    });

    // Get payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // If this is the default payment method, update others
    if (isDefault) {
      user.paymentMethods.forEach(pm => {
        pm.isDefault = false;
      });
    }

    // Add payment method to user
    const newPaymentMethod = {
      stripePaymentMethodId: paymentMethodId,
      type: paymentMethod.type,
      isDefault: isDefault || user.paymentMethods.length === 0
    };

    if (paymentMethod.type === 'card') {
      newPaymentMethod.last4 = paymentMethod.card.last4;
      newPaymentMethod.brand = paymentMethod.card.brand;
    }

    user.paymentMethods.push(newPaymentMethod);
    await user.save();

    res.json({
      success: true,
      message: 'Payment method added successfully',
      data: {
        paymentMethod: newPaymentMethod
      }
    });
  } catch (error) {
    console.error('Add payment method error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add payment method'
    });
  }
});

// @desc    Get payment methods
// @route   GET /api/payments/payment-methods
// @access  Private
router.get('/payment-methods', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.stripeCustomerId) {
      return res.json({
        success: true,
        data: {
          paymentMethods: []
        }
      });
    }

    // Get payment methods from Stripe
    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card'
    });

    res.json({
      success: true,
      data: {
        paymentMethods: user.paymentMethods,
        stripePaymentMethods: paymentMethods.data
      }
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment methods'
    });
  }
});

// @desc    Remove payment method
// @route   DELETE /api/payments/payment-methods/:paymentMethodId
// @access  Private
router.delete('/payment-methods/:paymentMethodId', protect, async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const user = await User.findById(req.user._id);

    // Detach from Stripe
    await stripe.paymentMethods.detach(paymentMethodId);

    // Remove from user
    user.paymentMethods = user.paymentMethods.filter(
      pm => pm.stripePaymentMethodId !== paymentMethodId
    );

    // If this was the default and there are other methods, make the first one default
    if (user.paymentMethods.length > 0 && !user.paymentMethods.some(pm => pm.isDefault)) {
      user.paymentMethods[0].isDefault = true;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Payment method removed successfully'
    });
  } catch (error) {
    console.error('Remove payment method error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove payment method'
    });
  }
});

// @desc    Create payment intent
// @route   POST /api/payments/create-intent
// @access  Private
router.post('/create-intent', protect, [
  body('amount').isNumeric().withMessage('Amount is required'),
  body('orderId').notEmpty().withMessage('Order ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { amount, orderId, paymentMethodId } = req.body;
    const user = await User.findById(req.user._id);
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Ensure user has a Stripe customer ID
    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName,
        phone: user.phone,
        metadata: {
          userId: user._id.toString()
        }
      });
      user.stripeCustomerId = customer.id;
      await user.save();
    }

    // Create payment intent
    const paymentIntentData = {
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      customer: user.stripeCustomerId,
      metadata: {
        orderId: orderId,
        userId: user._id.toString()
      },
      automatic_payment_methods: {
        enabled: true
      }
    };

    if (paymentMethodId) {
      paymentIntentData.payment_method = paymentMethodId;
      paymentIntentData.confirmation_method = 'manual';
      paymentIntentData.confirm = true;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    // Update order with payment intent ID
    order.payment.stripePaymentIntentId = paymentIntent.id;
    order.payment.status = 'processing';
    await order.save();

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status
      }
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent'
    });
  }
});

// @desc    Confirm payment
// @route   POST /api/payments/confirm/:paymentIntentId
// @access  Private
router.post('/confirm/:paymentIntentId', protect, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    // Retrieve payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent) {
      return res.status(404).json({
        success: false,
        message: 'Payment intent not found'
      });
    }

    // Find the order
    const order = await Order.findOne({
      'payment.stripePaymentIntentId': paymentIntentId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update order based on payment status
    if (paymentIntent.status === 'succeeded') {
      order.payment.status = 'completed';
      order.payment.paidAt = new Date();
      order.status = 'confirmed';
      
      // Add to timeline
      order.timeline.push({
        status: 'payment_completed',
        message: 'Payment completed successfully',
        timestamp: new Date()
      });
    } else if (paymentIntent.status === 'requires_action') {
      order.payment.status = 'processing';
    } else {
      order.payment.status = 'failed';
    }

    await order.save();

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.to(`user_${order.customer}`).emit('order_updated', {
        orderId: order._id,
        status: order.status,
        paymentStatus: order.payment.status
      });

      req.io.to(`restaurant_${order.restaurant}`).emit('new_order', {
        orderId: order._id,
        orderNumber: order.orderNumber
      });
    }

    res.json({
      success: true,
      data: {
        paymentStatus: paymentIntent.status,
        orderStatus: order.status
      }
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm payment'
    });
  }
});

// @desc    Process refund
// @route   POST /api/payments/refund
// @access  Private
router.post('/refund', protect, [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('amount').optional().isNumeric().withMessage('Amount must be numeric'),
  body('reason').optional().isString().withMessage('Reason must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { orderId, amount, reason } = req.body;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user can refund this order
    const canRefund = order.customer.toString() === req.user._id.toString() || 
                     req.user.role === 'admin';

    if (!canRefund) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (order.payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot refund unpaid order'
      });
    }

    // Create refund
    const refundAmount = amount ? Math.round(amount * 100) : undefined;
    const refund = await stripe.refunds.create({
      payment_intent: order.payment.stripePaymentIntentId,
      amount: refundAmount,
      reason: 'requested_by_customer',
      metadata: {
        orderId: orderId,
        reason: reason || 'Customer requested refund'
      }
    });

    // Update order
    order.payment.status = 'refunded';
    order.payment.refundedAt = new Date();
    order.payment.refundAmount = refund.amount / 100;
    order.status = 'refunded';
    order.refundReason = reason;
    order.refundedBy = req.user._id;

    order.timeline.push({
      status: 'refunded',
      message: `Refund processed: $${refund.amount / 100}`,
      timestamp: new Date(),
      updatedBy: req.user._id
    });

    await order.save();

    // Emit socket event
    if (req.io) {
      req.io.to(`user_${order.customer}`).emit('order_updated', {
        orderId: order._id,
        status: order.status,
        paymentStatus: order.payment.status
      });

      req.io.to(`restaurant_${order.restaurant}`).emit('order_refunded', {
        orderId: order._id,
        refundAmount: refund.amount / 100
      });
    }

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status
      }
    });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund'
    });
  }
});

// @desc    Stripe webhook
// @route   POST /api/payments/webhook
// @access  Public
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        await handlePaymentSuccess(paymentIntent);
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        await handlePaymentFailure(failedPayment);
        break;

      case 'refund.created':
        const refund = event.data.object;
        await handleRefundCreated(refund);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Helper functions for webhook handlers
async function handlePaymentSuccess(paymentIntent) {
  const order = await Order.findOne({
    'payment.stripePaymentIntentId': paymentIntent.id
  });

  if (order) {
    order.payment.status = 'completed';
    order.payment.paidAt = new Date();
    order.payment.stripeChargeId = paymentIntent.charges.data[0]?.id;
    
    if (order.status === 'pending') {
      order.status = 'confirmed';
    }

    await order.save();
  }
}

async function handlePaymentFailure(paymentIntent) {
  const order = await Order.findOne({
    'payment.stripePaymentIntentId': paymentIntent.id
  });

  if (order) {
    order.payment.status = 'failed';
    order.status = 'cancelled';
    order.cancellationReason = 'Payment failed';
    await order.save();
  }
}

async function handleRefundCreated(refund) {
  const order = await Order.findOne({
    'payment.stripePaymentIntentId': refund.payment_intent
  });

  if (order) {
    order.payment.status = 'refunded';
    order.payment.refundedAt = new Date();
    order.payment.refundAmount = refund.amount / 100;
    order.status = 'refunded';
    await order.save();
  }
}

module.exports = router;