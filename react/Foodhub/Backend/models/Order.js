const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem',
    required: true
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  customizations: [{
    name: String,
    selectedOptions: [String],
    additionalPrice: { type: Number, default: 0 }
  }],
  specialInstructions: String,
  subtotal: { type: Number, required: true }
});

const deliveryTrackingSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['assigned', 'picked_up', 'on_the_way', 'delivered'],
    default: 'assigned'
  },
  deliveryPerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  estimatedDeliveryTime: Date,
  actualDeliveryTime: Date,
  currentLocation: {
    lat: Number,
    lng: Number,
    timestamp: { type: Date, default: Date.now }
  },
  deliveryNotes: String,
  deliveryPhoto: String, // URL to delivery confirmation photo
  contactAttempts: [{
    timestamp: { type: Date, default: Date.now },
    method: { type: String, enum: ['call', 'text', 'app'] },
    successful: Boolean,
    notes: String
  }]
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  items: [orderItemSchema],
  status: {
    type: String,
    enum: [
      'pending',           // Order placed, waiting for restaurant confirmation
      'confirmed',         // Restaurant confirmed the order
      'preparing',         // Restaurant is preparing the food
      'ready_for_pickup',  // Food is ready for pickup
      'picked_up',         // Delivery person picked up the order
      'on_the_way',        // Order is being delivered
      'delivered',         // Order delivered successfully
      'cancelled',         // Order was cancelled
      'refunded'           // Order was refunded
    ],
    default: 'pending'
  },
  orderType: {
    type: String,
    enum: ['delivery', 'pickup'],
    required: true
  },
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    deliveryInstructions: String
  },
  pickupTime: Date,
  pricing: {
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    serviceFee: { type: Number, default: 0 },
    tip: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true }
  },
  payment: {
    method: {
      type: String,
      enum: ['card', 'cash', 'digital_wallet'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    stripePaymentIntentId: String,
    stripeChargeId: String,
    transactionId: String,
    paidAt: Date,
    refundedAt: Date,
    refundAmount: Number
  },
  deliveryTracking: deliveryTrackingSchema,
  timeline: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    message: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  estimatedPreparationTime: {
    type: Number, // in minutes
    required: true
  },
  estimatedDeliveryTime: Date,
  actualDeliveryTime: Date,
  customerNotes: String,
  restaurantNotes: String,
  rating: {
    food: { type: Number, min: 1, max: 5 },
    delivery: { type: Number, min: 1, max: 5 },
    overall: { type: Number, min: 1, max: 5 },
    comment: String,
    ratedAt: Date
  },
  promoCode: {
    code: String,
    discount: Number,
    type: { type: String, enum: ['percentage', 'fixed'] }
  },
  isScheduled: {
    type: Boolean,
    default: false
  },
  scheduledFor: Date,
  cancellationReason: String,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: Date,
  refundReason: String,
  refundedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ restaurant: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'deliveryTracking.deliveryPerson': 1 });
orderSchema.index({ createdAt: -1 });

// Generate order number
orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `FH${Date.now().toString().slice(-6)}${(count + 1).toString().padStart(3, '0')}`;
  }
  next();
});

// Add timeline entry when status changes
orderSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    this.timeline.push({
      status: this.status,
      message: `Order status changed to ${this.status}`,
      timestamp: new Date()
    });
  }
  next();
});

// Calculate estimated delivery time
orderSchema.methods.calculateEstimatedDeliveryTime = function() {
  const now = new Date();
  const preparationTime = this.estimatedPreparationTime || 30;
  const deliveryTime = this.orderType === 'delivery' ? 20 : 0; // 20 minutes for delivery
  
  return new Date(now.getTime() + (preparationTime + deliveryTime) * 60000);
};

// Check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  const nonCancellableStatuses = ['picked_up', 'on_the_way', 'delivered', 'cancelled', 'refunded'];
  return !nonCancellableStatuses.includes(this.status);
};

// Get order progress percentage
orderSchema.methods.getProgressPercentage = function() {
  const statusProgress = {
    'pending': 10,
    'confirmed': 25,
    'preparing': 50,
    'ready_for_pickup': 75,
    'picked_up': 85,
    'on_the_way': 95,
    'delivered': 100,
    'cancelled': 0,
    'refunded': 0
  };
  
  return statusProgress[this.status] || 0;
};

module.exports = mongoose.model('Order', orderSchema);