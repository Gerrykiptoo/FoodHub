const mongoose = require('mongoose');

const hoursSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    required: true
  },
  open: { type: String, required: true }, // Format: "09:00"
  close: { type: String, required: true }, // Format: "22:00"
  isClosed: { type: Boolean, default: false }
});

const restaurantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Restaurant name is required'],
    trim: true,
    maxlength: [100, 'Restaurant name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  email: {
    type: String,
    required: [true, 'Restaurant email is required'],
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
  },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, required: true, default: 'USA' },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    }
  },
  cuisine: [{
    type: String,
    required: true
  }],
  images: [{
    url: String,
    alt: String,
    isPrimary: { type: Boolean, default: false }
  }],
  logo: {
    type: String,
    default: null
  },
  coverImage: {
    type: String,
    default: null
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },
  priceRange: {
    type: String,
    enum: ['$', '$$', '$$$', '$$$$'],
    required: true
  },
  deliveryFee: {
    type: Number,
    required: true,
    min: 0
  },
  minimumOrder: {
    type: Number,
    required: true,
    min: 0
  },
  deliveryTime: {
    min: { type: Number, required: true }, // in minutes
    max: { type: Number, required: true }
  },
  deliveryRadius: {
    type: Number,
    required: true,
    min: 1 // in kilometers
  },
  operatingHours: [hoursSchema],
  features: [{
    type: String,
    enum: ['delivery', 'pickup', 'dine-in', 'outdoor-seating', 'wifi', 'parking', 'wheelchair-accessible']
  }],
  paymentMethods: [{
    type: String,
    enum: ['cash', 'card', 'digital-wallet'],
    default: ['card']
  }],
  stripeAccountId: String,
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isOpen: {
    type: Boolean,
    default: true
  },
  totalOrders: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  },
  tags: [String],
  specialOffers: [{
    title: String,
    description: String,
    discount: Number, // percentage
    validUntil: Date,
    isActive: { type: Boolean, default: true }
  }]
}, {
  timestamps: true
});

// Index for geospatial queries
restaurantSchema.index({ "address.coordinates": "2dsphere" });
restaurantSchema.index({ cuisine: 1 });
restaurantSchema.index({ rating: -1 });
restaurantSchema.index({ isActive: 1, isVerified: 1 });

// Check if restaurant is currently open
restaurantSchema.methods.isCurrentlyOpen = function() {
  if (!this.isOpen || !this.isActive) return false;
  
  const now = new Date();
  const currentDay = now.toLocaleLowerCase().substring(0, 3); // 'mon', 'tue', etc.
  const currentTime = now.toTimeString().substring(0, 5); // 'HH:MM'
  
  const todayHours = this.operatingHours.find(h => h.day.startsWith(currentDay));
  if (!todayHours || todayHours.isClosed) return false;
  
  return currentTime >= todayHours.open && currentTime <= todayHours.close;
};

// Calculate distance from a point
restaurantSchema.methods.distanceFrom = function(lat, lng) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat - this.address.coordinates.lat) * Math.PI / 180;
  const dLng = (lng - this.address.coordinates.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(this.address.coordinates.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Check if delivers to location
restaurantSchema.methods.deliversTo = function(lat, lng) {
  const distance = this.distanceFrom(lat, lng);
  return distance <= this.deliveryRadius;
};

module.exports = mongoose.model('Restaurant', restaurantSchema);